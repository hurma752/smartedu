# app/routers/admin.py
"""
All Admin-only operations: course creation, teacher assignment,
student enrollment, user management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database.db import get_db
from app.models.models import User, Course, TeacherCourseAssignment, Enrollment
from app.schemas.admin import (
    CourseCreate, CourseResponse, CourseDetailResponse,
    AssignTeacherRequest, EnrollStudentRequest, UserSummary,
)
from app.schemas.auth import AdminCreateUser, TokenResponse
from app.utils.auth import require_role, hash_password, create_access_token

router = APIRouter()


# ---------- User management ----------

@router.post("/users", response_model=TokenResponse)
def create_user(
    payload: AdminCreateUser,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    if payload.role not in ("teacher", "student"):
        raise HTTPException(400, "Admin can only create 'teacher' or 'student' accounts here")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, full_name=user.full_name, user_id=user.id)


@router.get("/users", response_model=List[UserSummary])
def list_users(
    role: str | None = None,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    return query.all()


@router.patch("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Soft-disable rather than delete — preserves history (submissions, chat logs, etc.)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = False
    db.commit()
    return {"message": f"{user.email} deactivated"}

@router.patch("/users/{user_id}/activate")
def activate_user(
    user_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Re-enable a previously deactivated account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = True
    db.commit()
    return {"message": f"{user.email} reactivated"}


# ---------- Course management ----------

@router.post("/courses", response_model=CourseResponse)
def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    existing = db.query(Course).filter(Course.code == payload.code).first()
    if existing:
        raise HTTPException(400, "A course with this code already exists")

    course = Course(
        name=payload.name, code=payload.code,
        description=payload.description, created_by=current_user.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/courses", response_model=List[CourseDetailResponse])
def list_all_courses(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    courses = db.query(Course).all()
    result = []
    for course in courses:
        teacher_ids = [a.teacher_id for a in course.teacher_assignments]
        teachers = db.query(User).filter(User.id.in_(teacher_ids)).all() if teacher_ids else []
        student_count = db.query(Enrollment).filter(Enrollment.course_id == course.id).count()

        item = CourseDetailResponse.model_validate(course)
        item.teachers = teachers
        item.student_count = student_count
        result.append(item)
    return result


@router.post("/courses/{course_id}/assign-teacher")
def assign_teacher(
    course_id: int,
    payload: AssignTeacherRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    teacher = db.query(User).filter(
        User.email == payload.teacher_email, User.role == "teacher"
    ).first()
    if not teacher:
        raise HTTPException(404, "No teacher found with that email")

    existing = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id,
        TeacherCourseAssignment.teacher_id == teacher.id,
    ).first()
    if existing:
        raise HTTPException(400, "This teacher is already assigned to this course")

    assignment = TeacherCourseAssignment(
        teacher_id=teacher.id, course_id=course_id, assigned_by=current_user.id,
    )
    db.add(assignment)
    db.commit()
    return {"message": f"{teacher.full_name} assigned to {course.name}"}


@router.delete("/courses/{course_id}/assign-teacher/{teacher_id}")
def unassign_teacher(
    course_id: int,
    teacher_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    assignment = db.query(TeacherCourseAssignment).filter(
        TeacherCourseAssignment.course_id == course_id,
        TeacherCourseAssignment.teacher_id == teacher_id,
    ).first()
    if not assignment:
        raise HTTPException(404, "Assignment not found")
    db.delete(assignment)
    db.commit()
    return {"message": "Teacher unassigned"}


@router.post("/courses/{course_id}/enroll")
def enroll_student(
    course_id: int,
    payload: EnrollStudentRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")

    student = db.query(User).filter(
        User.email == payload.student_email, User.role == "student"
    ).first()
    if not student:
        raise HTTPException(404, "No student found with that email")

    existing = db.query(Enrollment).filter(
        Enrollment.course_id == course_id, Enrollment.student_id == student.id,
    ).first()
    if existing:
        raise HTTPException(400, "Student already enrolled")

    enrollment = Enrollment(
        student_id=student.id, course_id=course_id, enrolled_by=current_user.id,
    )
    db.add(enrollment)
    db.commit()
    return {"message": f"{student.full_name} enrolled in {course.name}"}


@router.delete("/courses/{course_id}/enroll/{student_id}")
def unenroll_student(
    course_id: int,
    student_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id, Enrollment.student_id == student_id,
    ).first()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    db.delete(enrollment)
    db.commit()
    return {"message": "Student unenrolled"}