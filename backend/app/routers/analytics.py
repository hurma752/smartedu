# app/routers/analytics.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User
from app.schemas.analytics import CourseRiskSummary
from app.utils.auth import require_role
from app.routers.courses import get_course_for_access
from app.services import analytics_service

router = APIRouter()


@router.get("/{course_id}/risk", response_model=CourseRiskSummary)
def get_course_risk(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    Returns the current at-risk assessment for this course.
    Always computes live to ensure passed deadlines and recent grades are reflected immediately.
    """
    get_course_for_access(course_id, current_user, db)
    return analytics_service.compute_course_risk(course_id, db)


@router.post("/{course_id}/risk/recompute", response_model=CourseRiskSummary)
def recompute_course_risk(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """Forces a fresh recompute — call after new grades/attendance are entered."""
    get_course_for_access(course_id, current_user, db)
    return analytics_service.compute_course_risk(course_id, db)
