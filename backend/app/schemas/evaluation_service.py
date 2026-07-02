# app/services/evaluation_service.py
"""
Orchestrates: submission PDF -> extracted text -> LLM scoring against rubric.
Reuses the existing OCR pipeline from the RAG module (Module 1) rather
than duplicating extraction logic.
"""

import json
import re
import ollama
from sqlalchemy.orm import Session

from app.services.ocr_service import extract_text_from_pdf
from app.models.models import Submission, AIEvaluation, Rubric, RubricCriterion
from app.config import settings


def clean_extracted_text(text: str) -> str:
    """Collapse excess whitespace/newlines left over from PDF/OCR extraction."""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def evaluate_submission_task(submission_id: int, file_path: str, db_session_factory):
    """
    Runs as a FastAPI BackgroundTask, same pattern as ingest_document_task
    from Module 1 — opens its own DB session since the request-scoped one
    will already be closed by the time this runs.
    """
    db: Session = db_session_factory()
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return

        # --- Extraction (reusing Module 1's OCR pipeline) ---
        raw_text = extract_text_from_pdf(file_path)
        if not raw_text.strip():
            submission.status = "failed"
            submission.error_message = "No text could be extracted from this PDF"
            db.commit()
            return

        cleaned_text = clean_extracted_text(raw_text)
        submission.extracted_text = cleaned_text
        submission.status = "extracted"
        db.commit()

        # --- Load rubric for this assignment ---
        rubric = db.query(Rubric).filter(Rubric.id == submission.assignment.rubric_id).first()
        criteria = db.query(RubricCriterion).filter(RubricCriterion.rubric_id == rubric.id).all()

        # --- Build the scoring prompt ---
        criteria_description = "\n".join([
            f'- "{c.key}" — {c.label} (max {c.max_marks} marks): {c.description or "no further description"}'
            for c in criteria
        ])

        prompt = f"""You are an academic grading assistant. Score the student's submission
against the rubric below. Be fair and consistent. Base every score strictly on
evidence in the submission text — do not assume content that isn't present.

RUBRIC CRITERIA:
{criteria_description}

STUDENT SUBMISSION:
{cleaned_text[:4000]}

Respond with ONLY a JSON object in exactly this format, no other text:
{{
  "criteria_scores": {{ {", ".join([f'"{c.key}": 0' for c in criteria])} }},
  "feedback": "2-3 sentences of constructive feedback covering strengths and areas to improve"
}}
"""

        response = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            options={"num_predict": 500, "num_ctx": 3072, "temperature": 0.2},
        )
        raw_output = response["message"]["content"]

        # --- Parse JSON out of the model's response ---
        # LLMs sometimes wrap JSON in prose or markdown fences despite instructions —
        # extract the {...} block defensively rather than assuming a clean response
        json_start = raw_output.find("{")
        json_end = raw_output.rfind("}") + 1
        parsed = json.loads(raw_output[json_start:json_end])

        criteria_scores = parsed["criteria_scores"]
        # Clamp each score to the criterion's max — never trust the LLM's
        # arithmetic blindly, it can produce out-of-range values
        max_by_key = {c.key: c.max_marks for c in criteria}
        clamped_scores = {
            k: max(0, min(int(v), max_by_key.get(k, v)))
            for k, v in criteria_scores.items()
        }
        total_score = sum(clamped_scores.values())

        ai_eval = AIEvaluation(
            submission_id=submission.id,
            criteria_scores=clamped_scores,
            total_score=total_score,
            feedback=parsed.get("feedback", ""),
            raw_model_output=raw_output,
        )
        db.add(ai_eval)
        submission.status = "ai_evaluated"
        db.commit()

    except Exception as e:
        submission.status = "failed"
        submission.error_message = f"Evaluation failed: {str(e)}"
        db.commit()
    finally:
        db.close()