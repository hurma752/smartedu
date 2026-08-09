# app/routers/analytics.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database.db import get_db
from app.models.models import User, Enrollment
from app.schemas.analytics import CourseRiskSummary, StudentProgressResponse, CourseProgressOverviewResponse
from app.utils.auth import require_role, get_current_user
from app.routers.courses import get_course_for_access
from app.services import analytics_service, progress_service

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


@router.get("/{course_id}/students/{student_id}/progress", response_model=StudentProgressResponse)
def get_student_progress_endpoint(
    course_id: int,
    student_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns granular progress timeline, trend analysis, dimensional breakdown,
    replayed risk trajectory, and natural language actionable insights for a student.
    Teachers and admins can view any student enrolled in the course; students can view their own.
    """
    if current_user.role == "student":
        if current_user.id != student_id:
            raise HTTPException(403, "You can only view your own progress analytics")
        # Validate enrollment
        get_course_for_access(course_id, current_user, db)
        audience = "student"
    else:
        # Teacher or Admin
        get_course_for_access(course_id, current_user, db)
        # Check that the target student is actually enrolled
        enrolled = db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
        ).first()
        if not enrolled:
            raise HTTPException(404, "Student is not enrolled in this course")
        audience = "teacher"

    return progress_service.get_student_progress(
        student_id=student_id,
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
        audience=audience,
    )


@router.get("/{course_id}/my-progress", response_model=StudentProgressResponse)
def get_my_progress_endpoint(
    course_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convenience endpoint for the logged-in student to retrieve their own progress analytics.
    """
    get_course_for_access(course_id, current_user, db)
    return progress_service.get_student_progress(
        student_id=current_user.id,
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
        audience="student",
    )


@router.get("/{course_id}/progress-overview", response_model=CourseProgressOverviewResponse)
def get_course_progress_overview_endpoint(
    course_id: int,
    granularity: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
    periods: Optional[int] = Query(None, ge=2, le=60),
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
):
    """
    Teacher course progress overview: aggregated cohort trajectories, risk & trend breakdowns,
    student list with trends, and prioritized intervention shortlist.
    """
    get_course_for_access(course_id, current_user, db)
    return progress_service.get_course_progress_overview(
        course_id=course_id,
        db=db,
        granularity=granularity,
        periods=periods,
    )
