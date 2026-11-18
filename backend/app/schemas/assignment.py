# app/schemas/assignment.py
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, Dict, List, Any


class RubricCriterionInline(BaseModel):
    """Criterion defined inline during assignment creation."""
    label: str
    max_marks: int
    description: Optional[str] = None


class AssignmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    criteria: List[RubricCriterionInline]  # rubric is now part of assignment
    due_date: Optional[datetime] = None


class CriterionResponse(BaseModel):
    id: int
    key: str
    label: str
    max_marks: int
    description: Optional[str]

    class Config:
        from_attributes = True


class AssignmentResponse(BaseModel):
    id: int
    course_id: int
    title: str
    description: Optional[str]
    rubric_id: int
    due_date: Optional[datetime]
    created_at: datetime
    criteria: List[CriterionResponse] = []
    total_marks: int = 0

    class Config:
        from_attributes = True


class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    student_name: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    extracted_text: Optional[str] = None
    extraction_method: Optional[str] = None
    extraction_confidence: Optional[int] = None
    ocr_engine_used: Optional[str] = None
    extraction_status: Optional[str] = None
    ocr_processing_time: Optional[float] = None
    ocr_details: Optional[str] = None
    needs_review: Optional[bool] = False
    ai_score: Optional[float] = None          # None until detection runs
    plagiarism_score: Optional[float] = None  # None until detection runs
    detection_status: Optional[str] = None    # None until detection runs
    submitted_at: datetime

    class Config:
        from_attributes = True


class CriterionFeedback(BaseModel):
    criterion: str
    key: str
    score: int
    max_score: int
    feedback: str


class AIEvaluationResponse(BaseModel):
    criteria_scores: Dict[str, int]
    total_score: int
    feedback: Any  # structured JSON or plain string for backwards compatibility

    class Config:
        from_attributes = True


class TeacherReviewRequest(BaseModel):
    criteria_scores: Dict[str, int]
    teacher_comments: Optional[str] = None
    reason: Optional[str] = None

    @field_validator("criteria_scores")
    @classmethod
    def validate_scores_non_negative(cls, v: Dict[str, int]) -> Dict[str, int]:
        if not v:
            raise ValueError("Criteria scores cannot be empty")
        for key, score in v.items():
            if score < 0:
                raise ValueError(f"Marks for '{key}' cannot be negative")
        return v


class GradeUpdateRequest(BaseModel):
    criteria_scores: Dict[str, int]
    teacher_comments: Optional[str] = None
    reason: Optional[str] = None

    @field_validator("criteria_scores")
    @classmethod
    def validate_scores_non_negative(cls, v: Dict[str, int]) -> Dict[str, int]:
        if not v:
            raise ValueError("Criteria scores cannot be empty")
        for key, score in v.items():
            if score < 0:
                raise ValueError(f"Marks for '{key}' cannot be negative")
        return v


class FinalGradeResponse(BaseModel):
    criteria_scores: Dict[str, int]
    total_score: int
    teacher_comments: Optional[str]
    was_ai_overridden: bool
    reviewed_at: datetime
    updated_at: Optional[datetime] = None
    ai_feedback: Optional[Any] = None  # pass through rich feedback to student

    class Config:
        from_attributes = True


class GradeHistoryItem(BaseModel):
    id: int
    submission_id: int
    previous_total_score: int
    new_total_score: int
    previous_criteria_scores: Dict[str, Any]
    new_criteria_scores: Dict[str, Any]
    previous_comments: Optional[str] = None
    new_comments: Optional[str] = None
    reason: Optional[str] = None
    updated_by: int
    updated_by_name: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True