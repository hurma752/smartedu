import os
import sys
from unittest.mock import MagicMock

# Mock sentence_transformers and other heavy external dependencies before importing app
sys.modules["sentence_transformers"] = MagicMock()
mock_chromadb = MagicMock()
sys.modules["chromadb"] = mock_chromadb
sys.modules["chromadb.config"] = MagicMock()

# Ensure in-memory database for testing
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import unittest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker
from app.database.db import engine, Base
from app.models.models import User, Course, Rubric, RubricCriterion, Assignment, Submission, AIEvaluation, FinalGrade
from app.routers.assignments import _validate_rubric_scores
from app.schemas.assignment import TeacherReviewRequest, GradeUpdateRequest


class TestRubricGradingValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.Session = sessionmaker(bind=engine)

    def setUp(self):
        self.db = self.Session()
        
        # Seed teacher, student, course, rubric, assignment, submission, ai_evaluation
        self.teacher = User(id=101, email="teacher@test.com", password_hash="hash", role="teacher", full_name="Prof Test")
        self.student = User(id=102, email="student@test.com", password_hash="hash", role="student", full_name="Student Test")
        self.course = Course(id=101, name="Test Course", code="TC101", created_by=101)
        
        # Rubric with 2 criteria: max 10 each, total 20
        self.rubric = Rubric(id=101, course_id=101, created_by=101, title="Assignment Rubric", total_marks=20)
        self.crit1 = RubricCriterion(id=101, rubric_id=101, key="content_relevance", label="Content Relevance", max_marks=10)
        self.crit2 = RubricCriterion(id=102, rubric_id=101, key="structure_clarity", label="Structure and Clarity", max_marks=10)
        
        self.assignment = Assignment(id=101, course_id=101, created_by=101, rubric_id=101, title="Essay 1")
        self.submission = Submission(id=101, assignment_id=101, student_id=102, status="ai_evaluated")
        self.ai_eval = AIEvaluation(
            id=101,
            submission_id=101,
            criteria_scores={"content_relevance": 8, "structure_clarity": 7},
            total_score=15,
            feedback="Good effort"
        )
        
        self.db.add_all([self.teacher, self.student, self.course, self.rubric, self.crit1, self.crit2, self.assignment, self.submission, self.ai_eval])
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def test_valid_scores_within_limits(self):
        scores = {"content_relevance": 9, "structure_clarity": 8}
        total = _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(total, 17)

    def test_exact_maximum_scores(self):
        scores = {"content_relevance": 10, "structure_clarity": 10}
        total = _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(total, 20)

    def test_criterion_exceeding_max_marks(self):
        # Criterion 1 is worth 10 marks; teacher tries to give 11
        scores = {"content_relevance": 11, "structure_clarity": 5}
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceed the maximum allowed marks (10)", ctx.exception.detail)

    def test_second_criterion_exceeding_max_marks(self):
        # Criterion 2 is worth 10 marks; teacher tries to give 15
        scores = {"content_relevance": 5, "structure_clarity": 15}
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceed the maximum allowed marks (10)", ctx.exception.detail)

    def test_total_exceeding_rubric_total(self):
        # Update rubric total to 15 while each criterion is 10
        self.rubric.total_marks = 15
        self.db.commit()
        scores = {"content_relevance": 10, "structure_clarity": 8} # 18 > 15
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceed the maximum total marks (15)", ctx.exception.detail)

    def test_negative_marks_rejected(self):
        scores = {"content_relevance": -2, "structure_clarity": 5}
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("cannot be negative", ctx.exception.detail)

    def test_empty_criteria_scores_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, {}, self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_unknown_criterion_rejected(self):
        scores = {"content_relevance": 8, "non_existent_key": 5}
        with self.assertRaises(HTTPException) as ctx:
            _validate_rubric_scores(self.submission, scores, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not defined in the assignment rubric", ctx.exception.detail)

    def test_schema_validator_rejects_negative_score(self):
        with self.assertRaises(ValueError):
            TeacherReviewRequest(criteria_scores={"content_relevance": -1})

        with self.assertRaises(ValueError):
            GradeUpdateRequest(criteria_scores={"content_relevance": -5})

    def test_update_grade_enforces_rubric_limits(self):
        from app.routers.assignments import _update_submission_grade
        
        # Create an initial final grade
        initial_grade = FinalGrade(
            submission_id=self.submission.id,
            reviewed_by=self.teacher.id,
            criteria_scores={"content_relevance": 7, "structure_clarity": 6},
            total_score=13,
            teacher_comments="Initial grade"
        )
        self.db.add(initial_grade)
        self.db.commit()

        # Attempt to update with criterion score > max (10)
        invalid_payload = GradeUpdateRequest(
            criteria_scores={"content_relevance": 12, "structure_clarity": 8},
            teacher_comments="Updating marks",
            reason="Re-evaluation"
        )
        with self.assertRaises(HTTPException) as ctx:
            _update_submission_grade(self.submission, invalid_payload, self.teacher, self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceed the maximum allowed marks", ctx.exception.detail)

        # Successful update within limits
        valid_payload = GradeUpdateRequest(
            criteria_scores={"content_relevance": 10, "structure_clarity": 9},
            teacher_comments="Updated marks",
            reason="Good improvements"
        )
        updated = _update_submission_grade(self.submission, valid_payload, self.teacher, self.db)
        self.assertEqual(updated.total_score, 19)
        self.assertEqual(updated.criteria_scores["content_relevance"], 10)
        self.assertEqual(updated.criteria_scores["structure_clarity"], 9)


if __name__ == "__main__":
    unittest.main()
