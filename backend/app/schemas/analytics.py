# app/schemas/analytics.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any, List


class StudentRiskResponse(BaseModel):
    student_id: int
    student_name: str
    risk_level: str            # "low" | "medium" | "high"
    risk_score: float
    contributing_factors: Optional[Dict[str, Any]] = None
    badges: List[Dict[str, Any]] = []
    model_version: str
    computed_at: datetime

    class Config:
        from_attributes = True


class CourseRiskSummary(BaseModel):
    course_id: int
    total_students: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    model_version: str
    feature_importance: Optional[Dict[str, float]] = None  # None on heuristic fallback
    students: List[StudentRiskResponse]