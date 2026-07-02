# app/models/models.py — UPDATED

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, JSON
)

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.db import Base
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float, func
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True) 
    full_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    registration_number = Column(String(50), unique=True, nullable=True)
    has_set_password = Column(Boolean, default=False, nullable=False)

    # FIX: explicitly tell each relationship which FK column to use,
    # since TeacherCourseAssignment/Enrollment/Course each have MORE
    # THAN ONE foreign key pointing back at users.id
    teaching_assignments = relationship(
        "TeacherCourseAssignment",
        back_populates="teacher",
        foreign_keys="TeacherCourseAssignment.teacher_id",
    )
    enrollments = relationship(
        "Enrollment",
        back_populates="student",
        foreign_keys="Enrollment.student_id",
    )
    courses_created = relationship(
        "Course",
        back_populates="created_by_admin",
        foreign_keys="Course.created_by",
    )


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    created_by_admin = relationship(
        "User",
        back_populates="courses_created",
        foreign_keys=[created_by],
    )
    teacher_assignments = relationship("TeacherCourseAssignment", back_populates="course", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="course", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")


class TeacherCourseAssignment(Base):
    __tablename__ = "teacher_course_assignments"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, server_default=func.now())

    teacher = relationship(
        "User",
        back_populates="teaching_assignments",
        foreign_keys=[teacher_id],
    )
    course = relationship("Course", back_populates="teacher_assignments")

    __table_args__ = (UniqueConstraint("teacher_id", "course_id", name="unique_teacher_assignment"),)


class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    enrolled_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    enrolled_at = Column(DateTime, server_default=func.now())

    student = relationship(
        "User",
        back_populates="enrollments",
        foreign_keys=[student_id],
    )
    course = relationship("Course", back_populates="enrollments")

    __table_args__ = (UniqueConstraint("student_id", "course_id", name="unique_enrollment"),)

class Document(Base):
    """Unchanged from Stage 4 — teachers still upload, just gated by assignment now instead of ownership."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    status = Column(String(30), default="processing")
    chunk_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    course = relationship("Course", back_populates="documents")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    message = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class Rubric(Base):
    __tablename__ = "rubrics"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # teacher
    title = Column(String(255), nullable=False)
    total_marks = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    criteria = relationship("RubricCriterion", back_populates="rubric", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="rubric")


class RubricCriterion(Base):
    """One rubric has several weighted criteria — e.g. Understanding=5, Clarity=4."""
    __tablename__ = "rubric_criteria"

    id = Column(Integer, primary_key=True, index=True)
    rubric_id = Column(Integer, ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(50), nullable=False)          # short machine key, e.g. "understanding"
    label = Column(String(255), nullable=False)        # display name, e.g. "Understanding of Concept"
    max_marks = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)

    rubric = relationship("Rubric", back_populates="criteria")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    rubric_id = Column(Integer, ForeignKey("rubrics.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    rubric = relationship("Rubric", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"))
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    file_path = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    extraction_method = Column(String(20), nullable=True)
    extraction_confidence = Column(Integer, nullable=True)
    status = Column(String(30), default="processing")
    error_message = Column(Text, nullable=True)
    submitted_at = Column(DateTime, server_default=func.now())

    # ADD THESE THREE — must match what the migration added to PostgreSQL
    ai_score = Column(Float, nullable=True)
    plagiarism_score = Column(Float, nullable=True)
    detection_status = Column(String(30), default="not_checked", nullable=True)

    # relationships
    assignment = relationship("Assignment", back_populates="submissions")
    ai_evaluation = relationship("AIEvaluation", back_populates="submission", uselist=False, cascade="all, delete-orphan")
    final_grade = relationship("FinalGrade", back_populates="submission", uselist=False, cascade="all, delete-orphan")
class AIEvaluation(Base):
    """The LLM's PRELIMINARY scoring — never shown to students directly."""
    __tablename__ = "ai_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True)
    criteria_scores = Column(JSON, nullable=False)   # {"understanding": 5, "clarity": 4, ...}
    total_score = Column(Integer, nullable=False)
    feedback = Column(Text, nullable=False)
    raw_model_output = Column(Text, nullable=True)   # kept for debugging/viva evidence
    evaluated_at = Column(DateTime, server_default=func.now())

    submission = relationship("Submission", back_populates="ai_evaluation")


class FinalGrade(Base):
    """The teacher's DECISION — this is the only grade a student ever sees."""
    __tablename__ = "final_grades"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # teacher
    criteria_scores = Column(JSON, nullable=False)   # teacher's final per-criterion marks (may equal or override AI's)
    total_score = Column(Integer, nullable=False)
    teacher_comments = Column(Text, nullable=True)
    was_ai_overridden = Column(Boolean, default=False)  # true if teacher changed any AI score
    reviewed_at = Column(DateTime, server_default=func.now())

    submission = relationship("Submission", back_populates="final_grade")

class PasswordResetToken(Base):
    """
    Used for both first-time account setup AND forgot-password reset.
    Same mechanism, two different email templates, one code path.
    """
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())