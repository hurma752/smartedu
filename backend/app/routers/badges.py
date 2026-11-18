# app/routers/badges.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.database.db import get_db
from app.models.models import User
from app.utils.auth import get_current_user
from app.services.badge_service import (
    get_student_badges,
    get_assignment_badges,
    get_student_badges_for_course,
    evaluate_course_badges,
)

router = APIRouter()


@router.get("/my-badges")
def get_my_badges(
    course_id: Optional[int] = Query(None, description="Optional course ID to scope badges to a course"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all badges earned by the current student, optionally scoped to a course."""
    if course_id is not None:
        evaluate_course_badges(course_id, db)
        return get_student_badges_for_course(current_user.id, course_id, db)
    return get_student_badges(current_user.id, db)


@router.get("/course/{course_id}")
def get_badges_for_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all badges earned by the current student in a specific course."""
    evaluate_course_badges(course_id, db)
    return get_student_badges_for_course(current_user.id, course_id, db)


@router.get("/assignment/{assignment_id}")
def get_badges_for_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all badges awarded for an assignment."""
    return get_assignment_badges(assignment_id, db)
