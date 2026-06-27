# app/models/models.py — UPDATED

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

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