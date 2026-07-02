# app/services/lms_context_service.py
"""
Builds a comprehensive text summary of all LMS data for a course/student.
Covers: course info, teacher, enrollment, lectures, assignments,
student submissions, grades, rubric scores, and teacher analytics.
"""

from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import (
    Document, Assignment, Submission, FinalGrade, AIEvaluation,
    Enrollment, Course, TeacherCourseAssignment, User,
    Rubric, RubricCriterion
)


def build_lms_context(course_id: int, student_id: int, db: Session) -> str:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        return "ERROR: Course not found."

    # Detect whether the requester is a student or teacher
    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student_id
    ).first()
    is_student = enrollment is not None

    sections = []
    now = datetime.utcnow()

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1: Course Information
    # ══════════════════════════════════════════════════════════════════════
    sections.append("═══ COURSE INFORMATION ═══")
    sections.append(f"Course Name: {course.name}")
    sections.append(f"Course Code: {course.code}")
    if course.description:
        sections.append(f"Description: {course.description}")
    sections.append(f"Created: {course.created_at.strftime('%d %b %Y')}")

    # Teacher(s)
    teacher_assignments = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id
    ).all()
    if teacher_assignments:
        teacher_ids = [ta.teacher_id for ta in teacher_assignments]
        teachers = db.query(User).filter(User.id.in_(teacher_ids)).all()
        teacher_str = ", ".join(f"{t.full_name} ({t.email})" for t in teachers)
        sections.append(f"Instructor(s): {teacher_str}")
    else:
        sections.append("Instructor(s): Not yet assigned")

    # Enrollment
    enrollment_count = db.query(Enrollment).filter(
        Enrollment.course_id == course_id
    ).count()
    sections.append(f"Total Students Enrolled: {enrollment_count}")

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 2: Lecture Materials
    # ══════════════════════════════════════════════════════════════════════
    sections.append("\n═══ LECTURE MATERIALS ═══")
    documents = db.query(Document).filter(
        Document.course_id == course_id,
        Document.status == "indexed"
    ).order_by(Document.created_at).all()

    if not documents:
        sections.append("Total Lectures Uploaded: 0")
        sections.append("No lecture materials have been uploaded yet.")
    else:
        sections.append(f"Total Lectures Uploaded: {len(documents)}")
        for i, doc in enumerate(documents, 1):
            sections.append(
                f"  Lecture {i}: {doc.filename} "
                f"| Uploaded: {doc.created_at.strftime('%d %b %Y')}"
                f"| Chunks indexed: {doc.chunk_count or 0}"
            )
        sections.append(f"First Uploaded: {documents[0].filename} on {documents[0].created_at.strftime('%d %b %Y')}")
        sections.append(f"Most Recently Uploaded: {documents[-1].filename} on {documents[-1].created_at.strftime('%d %b %Y')}")

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3: Assignments
    # ══════════════════════════════════════════════════════════════════════
    sections.append("\n═══ ASSIGNMENTS ═══")
    assignments = db.query(Assignment).filter(
        Assignment.course_id == course_id
    ).order_by(Assignment.created_at).all()

    if not assignments:
        sections.append("Total Assignments: 0")
        sections.append("No assignments have been posted yet.")
    else:
        sections.append(f"Total Assignments: {len(assignments)}")

        overdue = []
        active = []
        no_deadline = []

        for i, asgn in enumerate(assignments, 1):
            # Get rubric info
            rubric = db.query(Rubric).filter(Rubric.id == asgn.rubric_id).first()
            total_marks = rubric.total_marks if rubric else "N/A"

            # Deadline classification
            if asgn.due_date:
                if now > asgn.due_date:
                    deadline_str = f"{asgn.due_date.strftime('%d %b %Y %I:%M %p')} [CLOSED/OVERDUE]"
                    overdue.append(asgn.title)
                else:
                    delta = asgn.due_date - now
                    days = delta.days
                    if days == 0:
                        deadline_str = f"{asgn.due_date.strftime('%d %b %Y %I:%M %p')} [DUE TODAY]"
                    elif days == 1:
                        deadline_str = f"{asgn.due_date.strftime('%d %b %Y %I:%M %p')} [DUE TOMORROW]"
                    else:
                        deadline_str = f"{asgn.due_date.strftime('%d %b %Y %I:%M %p')} [{days} days remaining]"
                    active.append(asgn.title)
            else:
                deadline_str = "No deadline set"
                no_deadline.append(asgn.title)

            # Submission count (for teacher analytics)
            sub_count = db.query(Submission).filter(
                Submission.assignment_id == asgn.id
            ).count()

            entry = f"\n  Assignment {i}: {asgn.title}"
            if asgn.description:
                desc = asgn.description[:400]
                if len(asgn.description) > 400:
                    desc += "..."
                entry += f"\n    Instructions: {desc}"
            entry += f"\n    Total Marks: {total_marks}"
            entry += f"\n    Deadline: {deadline_str}"
            entry += f"\n    Total Submissions Received: {sub_count}"
            sections.append(entry)

        # Summary
        sections.append(f"\nAssignment Summary:")
        sections.append(f"  Active (deadline not passed): {len(active)}")
        sections.append(f"  Overdue/Closed: {len(overdue)}")
        sections.append(f"  No deadline: {len(no_deadline)}")
        if overdue:
            sections.append(f"  Overdue list: {', '.join(overdue)}")
        if active:
            # Sort active assignments by deadline
            active_asgns = [a for a in assignments if a.due_date and a.due_date > now]
            if active_asgns:
                soonest = min(active_asgns, key=lambda a: a.due_date)
                sections.append(f"  Next deadline: {soonest.title} on {soonest.due_date.strftime('%d %b %Y')}")

        # Highest marks assignment
        if rubric:
            all_rubrics = []
            for asgn in assignments:
                r = db.query(Rubric).filter(Rubric.id == asgn.rubric_id).first()
                if r:
                    all_rubrics.append((asgn.title, r.total_marks))
            if all_rubrics:
                highest = max(all_rubrics, key=lambda x: x[1])
                sections.append(f"  Highest marks assignment: {highest[0]} ({highest[1]} marks)")

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4: Student's Personal Progress (only shown to the student)
    # ══════════════════════════════════════════════════════════════════════
    if assignments:
        sections.append("\n═══ YOUR PROGRESS ═══")
        submitted = []
        pending = []
        graded_results = []
        awaiting_review = []

        for i, asgn in enumerate(assignments, 1):
            submission = db.query(Submission).filter(
                Submission.assignment_id == asgn.id,
                Submission.student_id == student_id,
            ).first()

            if submission is None:
                if asgn.due_date and now > asgn.due_date:
                    pending.append(f"{asgn.title} [MISSED — deadline passed]")
                else:
                    pending.append(asgn.title)
            elif submission.status == "teacher_reviewed":
                grade = db.query(FinalGrade).filter(
                    FinalGrade.submission_id == submission.id
                ).first()
                if grade:
                    rubric = db.query(Rubric).filter(Rubric.id == asgn.rubric_id).first()
                    total_possible = rubric.total_marks if rubric else "?"
                    grade_info = f"{asgn.title}: {grade.total_score}/{total_possible}"
                    if grade.teacher_comments:
                        grade_info += f" — Feedback: {grade.teacher_comments[:150]}"
                    graded_results.append((asgn.title, grade.total_score, total_possible, grade))
                    submitted.append(grade_info)
                else:
                    submitted.append(f"{asgn.title}: Reviewed (grade not recorded)")
            elif submission.status in ("ai_evaluated",):
                awaiting_review.append(asgn.title)
                submitted.append(f"{asgn.title}: Submitted — awaiting teacher review")
            elif submission.status in ("processing", "extracted"):
                submitted.append(f"{asgn.title}: Submitted — being processed")
            elif submission.status == "failed":
                submitted.append(f"{asgn.title}: Submission failed — {submission.error_message or 'contact teacher'}")

        sections.append(f"Assignments Submitted: {len(submitted)}")
        sections.append(f"Assignments Pending/Not Submitted: {len(pending)}")
        sections.append(f"Assignments Graded: {len(graded_results)}")
        sections.append(f"Awaiting Teacher Review: {len(awaiting_review)}")

        if submitted:
            sections.append("\nSubmission Details:")
            for s in submitted:
                sections.append(f"  ✓ {s}")

        if pending:
            sections.append("\nPending (not yet submitted):")
            for p in pending:
                sections.append(f"  ✗ {p}")

        # Grade statistics
        if graded_results:
            scores = [g[1] for g in graded_results]
            sections.append(f"\nGrade Statistics:")
            sections.append(f"  Average Score: {sum(scores)/len(scores):.1f}")
            sections.append(f"  Highest Score: {max(scores)}")
            sections.append(f"  Lowest Score: {min(scores)}")
            best = max(graded_results, key=lambda x: x[1])
            sections.append(f"  Best Performance: {best[0]} ({best[1]}/{best[2]})")

            # Rubric breakdown for each graded assignment
            sections.append("\nDetailed Rubric Scores:")
            for title, score, total, grade in graded_results:
                sections.append(f"\n  {title} — Total: {score}/{total}")
                if grade.criteria_scores:
                    # Find rubric criteria for labels
                    asgn_obj = next((a for a in assignments if a.title == title), None)
                    if asgn_obj:
                        criteria = db.query(RubricCriterion).filter(
                            RubricCriterion.rubric_id == asgn_obj.rubric_id
                        ).all()
                        for c in criteria:
                            achieved = grade.criteria_scores.get(c.key, "N/A")
                            sections.append(f"    {c.label}: {achieved}/{c.max_marks}")
                if grade.teacher_comments:
                    sections.append(f"    Teacher feedback: {grade.teacher_comments}")
                if grade.was_ai_overridden:
                    sections.append(f"    Note: Teacher adjusted the AI-suggested grade")

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 5: Teacher Analytics
    # (only meaningful context for teachers, but included for completeness)
    # ══════════════════════════════════════════════════════════════════════
    if assignments:
        sections.append("\n═══ SUBMISSION ANALYTICS ═══")
        for i, asgn in enumerate(assignments, 1):
            total_subs = db.query(Submission).filter(
                Submission.assignment_id == asgn.id
            ).count()
            graded_subs = db.query(Submission).filter(
                Submission.assignment_id == asgn.id,
                Submission.status == "teacher_reviewed"
            ).count()
            pending_review = db.query(Submission).filter(
                Submission.assignment_id == asgn.id,
                Submission.status == "ai_evaluated"
            ).count()

            sections.append(f"\n  {asgn.title}:")
            sections.append(f"    Total enrolled: {enrollment_count}")
            sections.append(f"    Submissions received: {total_subs}")
            sections.append(f"    Not submitted: {enrollment_count - total_subs}")
            sections.append(f"    Graded: {graded_subs}")
            sections.append(f"    Awaiting teacher review: {pending_review}")

            # At-risk: enrolled but haven't submitted any assignment
            if total_subs < enrollment_count:
                sections.append(f"    ⚠ {enrollment_count - total_subs} student(s) have not submitted this assignment")

    return "\n".join(sections)