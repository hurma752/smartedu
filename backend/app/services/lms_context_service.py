# app/services/lms_context_service.py
"""
Builds a comprehensive text summary of all LMS data for a course/student.
Covers: course info, teacher, enrollment, lectures, assignments,
student submissions, grades, rubric scores, and teacher analytics.
"""

from datetime import datetime, timezone
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

    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student_id
    ).first()
    is_student = enrollment is not None

    sections = []
    now = datetime.now(timezone.utc)

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1: Course Information
    # ══════════════════════════════════════════════════════════════════════
    sections.append("═══ COURSE INFORMATION ═══")
    sections.append(f"Course Name: {course.name}")
    sections.append(f"Course Code: {course.code}")
    if course.description:
        sections.append(f"Description: {course.description}")
    sections.append(f"Created: {course.created_at.strftime('%d %b %Y')}")

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
        sections.append(
            f"First Uploaded: {documents[0].filename} on "
            f"{documents[0].created_at.strftime('%d %b %Y')}"
        )
        sections.append(
            f"Most Recently Uploaded: {documents[-1].filename} on "
            f"{documents[-1].created_at.strftime('%d %b %Y')}"
        )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3: Assignments
    # Status is determined by SUBMISSION RECORDS first, deadline second.
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

        # Pre-fetch this student's submissions for all assignments in one query
        student_submissions = (
            db.query(Submission)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .filter(
                Assignment.course_id == course_id,
                Submission.student_id == student_id,
            )
            .all()
        )
        student_sub_map = {s.assignment_id: s for s in student_submissions}

        for i, asgn in enumerate(assignments, 1):
            rubric = db.query(Rubric).filter(Rubric.id == asgn.rubric_id).first()
            total_marks = rubric.total_marks if rubric else "N/A"

            # Normalise deadline to UTC
            if asgn.due_date:
                due = asgn.due_date
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                past_deadline = now > due
                delta = due - now
                days_remaining = delta.days

                if past_deadline:
                    deadline_str = f"{due.strftime('%d %b %Y %I:%M %p')} [DEADLINE PASSED]"
                elif days_remaining == 0:
                    deadline_str = f"{due.strftime('%d %b %Y %I:%M %p')} [DUE TODAY]"
                elif days_remaining == 1:
                    deadline_str = f"{due.strftime('%d %b %Y %I:%M %p')} [DUE TOMORROW]"
                else:
                    deadline_str = (
                        f"{due.strftime('%d %b %Y %I:%M %p')} "
                        f"[{days_remaining} days remaining]"
                    )
            else:
                past_deadline = False
                deadline_str = "No deadline set"

            # Submission count for teacher analytics
            sub_count = db.query(Submission).filter(
                Submission.assignment_id == asgn.id
            ).count()

            # Student-specific status — drives the summary counts
            student_sub = student_sub_map.get(asgn.id)
            if student_sub is None:
                if past_deadline:
                    student_status = "YOUR STATUS: OVERDUE — you did not submit before the deadline"
                else:
                    student_status = "YOUR STATUS: PENDING — not yet submitted"
            elif student_sub.status == "teacher_reviewed":
                student_status = "YOUR STATUS: GRADED"
            elif student_sub.status in ("processing", "extracted", "ai_evaluated"):
                student_status = "YOUR STATUS: SUBMITTED — awaiting teacher review"
            elif student_sub.status == "failed":
                student_status = "YOUR STATUS: SUBMISSION FAILED — contact teacher"
            else:
                student_status = f"YOUR STATUS: SUBMITTED (status: {student_sub.status})"

            entry = f"\n  Assignment {i}: {asgn.title}"
            if asgn.description:
                desc = asgn.description[:400]
                if len(asgn.description) > 400:
                    desc += "..."
                entry += f"\n    Instructions: {desc}"
            entry += f"\n    Total Marks: {total_marks}"
            entry += f"\n    Deadline: {deadline_str}"
            entry += f"\n    Total Submissions Received: {sub_count}"
            entry += f"\n    {student_status}"
            sections.append(entry)

        # ── Assignment summary counts (submission-based, not deadline-based) ──
        count_pending = 0    # not submitted, deadline not passed
        count_submitted = 0  # submitted, any non-graded status
        count_graded = 0     # teacher_reviewed
        count_overdue = 0    # not submitted, deadline passed

        pending_titles = []
        overdue_titles = []
        next_deadline_asgn = None

        for asgn in assignments:
            due = asgn.due_date
            if due and due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            past = (due is not None) and (now > due)

            sub = student_sub_map.get(asgn.id)

            if sub is None:
                if past:
                    count_overdue += 1
                    overdue_titles.append(asgn.title)
                else:
                    count_pending += 1
                    pending_titles.append(asgn.title)
                    if due and (
                        next_deadline_asgn is None
                        or due < next_deadline_asgn.due_date
                    ):
                        next_deadline_asgn = asgn
            elif sub.status == "teacher_reviewed":
                count_graded += 1
            else:
                count_submitted += 1

        sections.append(f"\nAssignment Summary (your submission status):")
        sections.append(
            f"  PENDING (not submitted, deadline not passed): {count_pending}"
        )
        sections.append(
            f"  SUBMITTED (awaiting teacher review): {count_submitted}"
        )
        sections.append(f"  GRADED: {count_graded}")
        sections.append(
            f"  OVERDUE (deadline passed, no submission): {count_overdue}"
        )

        if pending_titles:
            sections.append(
                f"  Pending assignment(s): {', '.join(pending_titles)}"
            )
        if overdue_titles:
            sections.append(
                f"  Overdue assignment(s): {', '.join(overdue_titles)}"
            )
        if next_deadline_asgn:
            due = next_deadline_asgn.due_date
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            sections.append(
                f"  Next deadline: {next_deadline_asgn.title} on "
                f"{due.strftime('%d %b %Y')}"
            )

        # Highest marks assignment
        all_rubrics = []
        for asgn in assignments:
            r = db.query(Rubric).filter(Rubric.id == asgn.rubric_id).first()
            if r:
                all_rubrics.append((asgn.title, r.total_marks))
        if all_rubrics:
            highest = max(all_rubrics, key=lambda x: x[1])
            sections.append(
                f"  Highest marks assignment: {highest[0]} ({highest[1]} marks)"
            )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4: Student's Personal Progress
    # ══════════════════════════════════════════════════════════════════════
    if assignments:
        sections.append("\n═══ YOUR PROGRESS ═══")
        submitted_list = []
        pending_list = []
        graded_results = []
        awaiting_review_list = []

        for asgn in assignments:
            submission = student_sub_map.get(asgn.id)

            if submission is None:
                due = asgn.due_date
                if due and due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)
                if due and now > due:
                    pending_list.append(f"{asgn.title} [OVERDUE — deadline passed]")
                else:
                    pending_list.append(asgn.title)

            elif submission.status == "teacher_reviewed":
                grade = db.query(FinalGrade).filter(
                    FinalGrade.submission_id == submission.id
                ).first()
                if grade:
                    rubric = db.query(Rubric).filter(
                        Rubric.id == asgn.rubric_id
                    ).first()
                    total_possible = rubric.total_marks if rubric else "?"
                    grade_info = f"{asgn.title}: {grade.total_score}/{total_possible}"
                    if grade.teacher_comments:
                        grade_info += f" — Feedback: {grade.teacher_comments[:150]}"
                    graded_results.append(
                        (asgn.title, grade.total_score, total_possible, grade)
                    )
                    submitted_list.append(grade_info)
                else:
                    submitted_list.append(
                        f"{asgn.title}: Reviewed (grade not recorded)"
                    )

            elif submission.status == "ai_evaluated":
                awaiting_review_list.append(asgn.title)
                submitted_list.append(
                    f"{asgn.title}: Submitted — awaiting teacher review"
                )
            elif submission.status in ("processing", "extracted"):
                submitted_list.append(
                    f"{asgn.title}: Submitted — being processed"
                )
            elif submission.status == "failed":
                submitted_list.append(
                    f"{asgn.title}: Submission failed — "
                    f"{getattr(submission, 'error_message', None) or 'contact teacher'}"
                )
            else:
                submitted_list.append(
                    f"{asgn.title}: Submitted (status: {submission.status})"
                )

        sections.append(f"Assignments Submitted: {len(submitted_list)}")
        sections.append(
            f"Assignments Pending/Not Submitted: {len(pending_list)}"
        )
        sections.append(f"Assignments Graded: {len(graded_results)}")
        sections.append(f"Awaiting Teacher Review: {len(awaiting_review_list)}")

        if submitted_list:
            sections.append("\nSubmission Details:")
            for s in submitted_list:
                sections.append(f"  ✓ {s}")

        if pending_list:
            sections.append("\nPending (not yet submitted):")
            for p in pending_list:
                sections.append(f"  ✗ {p}")

        if graded_results:
            scores = [g[1] for g in graded_results]
            sections.append("\nGrade Statistics:")
            sections.append(f"  Average Score: {sum(scores)/len(scores):.1f}")
            sections.append(f"  Highest Score: {max(scores)}")
            sections.append(f"  Lowest Score: {min(scores)}")
            best = max(graded_results, key=lambda x: x[1])
            sections.append(
                f"  Best Performance: {best[0]} ({best[1]}/{best[2]})"
            )

            sections.append("\nDetailed Rubric Scores:")
            for title, score, total, grade in graded_results:
                sections.append(f"\n  {title} — Total: {score}/{total}")
                if grade.criteria_scores:
                    asgn_obj = next(
                        (a for a in assignments if a.title == title), None
                    )
                    if asgn_obj:
                        criteria = db.query(RubricCriterion).filter(
                            RubricCriterion.rubric_id == asgn_obj.rubric_id
                        ).all()
                        for c in criteria:
                            achieved = grade.criteria_scores.get(c.key, "N/A")
                            sections.append(
                                f"    {c.label}: {achieved}/{c.max_marks}"
                            )
                if grade.teacher_comments:
                    sections.append(
                        f"    Teacher feedback: {grade.teacher_comments}"
                    )
                if grade.was_ai_overridden:
                    sections.append(
                        "    Note: Teacher adjusted the AI-suggested grade"
                    )

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 5: Teacher Analytics
    # ══════════════════════════════════════════════════════════════════════
    if assignments:
        sections.append("\n═══ SUBMISSION ANALYTICS ═══")
        for asgn in assignments:
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

            if total_subs < enrollment_count:
                sections.append(
                    f"    ⚠ {enrollment_count - total_subs} student(s) "
                    f"have not submitted this assignment"
                )

    return "\n".join(sections)