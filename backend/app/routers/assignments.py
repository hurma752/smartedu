# app/routers/assignments.py
import os
import shutil
from typing import List
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from datetime import datetime

from app.database.db import get_db, SessionLocal
from app.schemas.assignment import (
    AssignmentCreate, AssignmentResponse, SubmissionResponse,
    AIEvaluationResponse, TeacherReviewRequest, FinalGradeResponse,
)
from app.utils.auth import require_role, get_current_user
from app.routers.courses import get_course_for_access
from app.services.evaluation_service import evaluate_submission_task
from app.config import settings
from app.models.models import (
    User, Assignment, Submission, AIEvaluation, FinalGrade, Enrollment,
    Rubric, RubricCriterion  # ADD THESE TWO
)

router = APIRouter()


# ---------- Teacher: create assignment ----------
@router.post("/{course_id}", response_model=AssignmentResponse)
def create_assignment(
    course_id: int,
    payload: AssignmentCreate,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)

    if not payload.criteria:
        raise HTTPException(400, "At least one rubric criterion is required")

    total_marks = sum(c.max_marks for c in payload.criteria)

    # Create the rubric automatically — teacher no longer does this separately
    rubric = Rubric(
        course_id=course_id,
        created_by=current_user.id,
        title=f"{payload.title} — Rubric",
        total_marks=total_marks,
    )
    db.add(rubric)
    db.commit()
    db.refresh(rubric)

    for c in payload.criteria:
        key = c.label.lower().replace(" ", "_").replace("/", "_")
        db.add(RubricCriterion(
            rubric_id=rubric.id,
            key=key,
            label=c.label,
            max_marks=c.max_marks,
            description=c.description,
        ))
    db.commit()

    assignment = Assignment(
        course_id=course_id,
        created_by=current_user.id,
        rubric_id=rubric.id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return _assignment_with_criteria(assignment, db)

def _assignment_with_criteria(assignment: Assignment, db: Session) -> dict:
    """Helper: attach criteria and total marks to assignment response."""
    criteria = db.query(RubricCriterion).filter(
        RubricCriterion.rubric_id == assignment.rubric_id
    ).all()
    rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()

    result = AssignmentResponse.model_validate(assignment)
    result.criteria = criteria
    result.total_marks = rubric.total_marks if rubric else 0
    return result

@router.get("/{course_id}", response_model=List[AssignmentResponse])
def list_assignments(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_course_for_access(course_id, current_user, db)
    assignments = db.query(Assignment).filter(
        Assignment.course_id == course_id
    ).all()
    return [_assignment_with_criteria(a, db) for a in assignments]


# New endpoint: student fetches rubric before submitting
@router.get("/{assignment_id}/rubric")
def get_assignment_rubric(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    criteria = db.query(RubricCriterion).filter(
        RubricCriterion.rubric_id == assignment.rubric_id
    ).all()
    rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()

    return {
        "assignment_title": assignment.title,
        "description": assignment.description,
        "total_marks": rubric.total_marks if rubric else 0,
        "criteria": [
            {"label": c.label, "max_marks": c.max_marks, "description": c.description}
            for c in criteria
        ],
    }

# ---------- Student: submit ----------

@router.post("/{assignment_id}/submit", response_model=SubmissionResponse)
async def submit_assignment(
    assignment_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    # ENFORCEMENT: reject the submission outright once the deadline has passed.
    # Checked before any file is saved or any DB row created, so a late
    # attempt leaves no partial state behind.
    if assignment.due_date and datetime.utcnow() > assignment.due_date:
        raise HTTPException(
            400,
            f"The deadline for this assignment passed on {assignment.due_date.strftime('%b %d, %Y at %I:%M %p')}. Late submissions are not accepted.",
        )

    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    submission = Submission(
        assignment_id=assignment_id, student_id=current_user.id,
        file_path="", status="processing",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, f"submission_{submission.id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    submission.file_path = file_path
    db.commit()

    background_tasks.add_task(
        evaluate_submission_task,
        submission_id=submission.id, file_path=file_path,
        db_session_factory=SessionLocal,
    )

    return submission

# ---------- Student: check own submission status ----------
@router.get("/submissions/{submission_id}", response_model=SubmissionResponse)
def get_submission_status(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    if current_user.role == "student" and submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")
    return submission


# ---------- Teacher: list submissions pending review ----------
@router.get("/{assignment_id}/submissions", response_model=List[SubmissionResponse])
def list_submissions(
    assignment_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    get_course_for_access(assignment.course_id, current_user, db)

    submissions = db.query(Submission).filter(Submission.assignment_id == assignment_id).all()

    # Attach student_name onto each ORM object before serialization —
    # response_model reads it as a plain attribute, same as any column
    student_ids = [s.student_id for s in submissions]
    students = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(student_ids)).all()}
    for s in submissions:
        s.student_name = students.get(s.student_id)

    return submissions


# ---------- Teacher: view AI's preliminary evaluation ----------
@router.get("/submissions/{submission_id}/ai-evaluation", response_model=AIEvaluationResponse)
def get_ai_evaluation(
    submission_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.ai_evaluation:
        raise HTTPException(404, "AI evaluation not ready yet")
    return submission.ai_evaluation


# ---------- Teacher: approve/override -> creates the FINAL grade ----------
@router.post("/submissions/{submission_id}/review", response_model=FinalGradeResponse)
def review_submission(
    submission_id: int,
    payload: TeacherReviewRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.ai_evaluation:
        raise HTTPException(400, "Cannot review before AI evaluation completes")
    if submission.final_grade:
        raise HTTPException(400, "This submission has already been reviewed")

    total_score = sum(payload.criteria_scores.values())
    was_overridden = payload.criteria_scores != submission.ai_evaluation.criteria_scores

    final_grade = FinalGrade(
        submission_id=submission.id, reviewed_by=current_user.id,
        criteria_scores=payload.criteria_scores, total_score=total_score,
        teacher_comments=payload.teacher_comments, was_ai_overridden=was_overridden,
    )
    db.add(final_grade)
    submission.status = "teacher_reviewed"
    db.commit()
    db.refresh(final_grade)

    return final_grade


# ---------- Student: view final grade (ONLY after teacher review) ----------
@router.get("/submissions/{submission_id}/grade")
def get_final_grade(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")
    if current_user.role == "student" and submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")

    if not submission.final_grade:
        raise HTTPException(404, "This submission has not been graded yet")

    grade = submission.final_grade

    # Include the AI feedback in the response so the student gets rich breakdown
    ai_feedback = None
    if submission.ai_evaluation:
        ai_feedback = submission.ai_evaluation.feedback

    return {
        "criteria_scores": grade.criteria_scores,
        "total_score": grade.total_score,
        "teacher_comments": grade.teacher_comments,
        "was_ai_overridden": grade.was_ai_overridden,
        "reviewed_at": grade.reviewed_at,
        "ai_feedback": ai_feedback,
    }

@router.get("/{assignment_id}/my-submission", response_model=SubmissionResponse)
def get_my_submission(
    assignment_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Lets a student check whether they've already submitted to this
    assignment, without needing to remember a submission_id from a
    previous session. This is what makes grades/status persist across
    page reloads instead of only existing right after upload.
    """
    submission = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == current_user.id,
    ).order_by(Submission.submitted_at.desc()).first()

    if not submission:
        raise HTTPException(404, "No submission found")
    return submission

@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    get_course_for_access(assignment.course_id, current_user, db)

    # Clean up submission files from disk before deleting DB rows —
    # cascade="all, delete-orphan" on Assignment.submissions handles the
    # DB side, but won't touch files sitting in uploads/
    for submission in assignment.submissions:
        if submission.file_path and os.path.exists(submission.file_path):
            os.remove(submission.file_path)

    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted"}


@router.get("/submissions/{submission_id}/file")
def download_submission_file(
    submission_id: int,
    current_user: User = Depends(get_current_user),  # was require_role("teacher")
    db: Session = Depends(get_db),
):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")

    # Students can only access their own submission
    # Teachers can access any submission in their assigned course
    if current_user.role == "student":
        if submission.student_id != current_user.id:
            raise HTTPException(403, "Not your submission")
    elif current_user.role == "teacher":
        get_course_for_access(submission.assignment.course_id, current_user, db)

    if not submission.file_path or not os.path.exists(submission.file_path):
        raise HTTPException(404, "File not found on server")

    original_filename = os.path.basename(submission.file_path).split("_", 2)[-1]
    return FileResponse(
        submission.file_path,
        filename=original_filename,
        media_type="application/pdf",
    )

@router.delete("/submissions/{submission_id}")
def delete_my_submission(
    submission_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Lets a student withdraw their own submission — but ONLY while the
    assignment's deadline hasn't passed yet. Once locked, this matches
    the same enforcement pattern as submit_assignment's late-rejection
    check, so a student can't bypass the lock by deleting and resubmitting
    after the deadline either.
    """
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(404, "Submission not found")

    if submission.student_id != current_user.id:
        raise HTTPException(403, "Not your submission")

    assignment = submission.assignment

    if assignment.due_date and datetime.utcnow() > assignment.due_date:
        raise HTTPException(
            400,
            "This assignment's deadline has passed. Submissions are locked and can no longer be deleted.",
        )

    if submission.status == "teacher_reviewed":
        raise HTTPException(400, "This submission has already been graded and cannot be deleted.")

    if submission.file_path and os.path.exists(submission.file_path):
        os.remove(submission.file_path)

    db.delete(submission)
    db.commit()
    return {"message": "Submission deleted. You may resubmit before the deadline."}