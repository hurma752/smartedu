# app/services/evaluation_service.py
"""
AI evaluation engine — uses assignment description, instructions,
rubric criteria, and extracted submission text to generate
rich, criterion-specific feedback.
"""

import json
import re
import os
import ollama
from sqlalchemy.orm import Session, joinedload

from app.services.ocr_service import extract_text_from_pdf
from app.services.plagiarism_service import compute_plagiarism_report
from app.models.models import Submission, AIEvaluation, Assignment, Rubric, RubricCriterion
from app.config import settings


def clean_extracted_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _prepare_submission_text(text: str, max_chars: int = 8000) -> str:
    """
    Instead of blindly truncating from the start (which loses most content
    for long documents), take content from the beginning, middle, and end.
    This ensures the LLM sees a representative sample of the full submission.
    """
    if len(text) <= max_chars:
        return text

    chunk = max_chars // 3
    start = text[:chunk]
    mid_start = len(text) // 2 - chunk // 2
    middle = text[mid_start:mid_start + chunk]
    end = text[-chunk:]

    return (
        f"{start}\n\n[... middle section ...]\n\n"
        f"{middle}\n\n[... final section ...]\n\n"
        f"{end}"
    )


def evaluate_submission_task(submission_id: int, file_path: str, db_session_factory):
    db: Session = db_session_factory()
    try:
        # Eager load assignment in a single joined query
        submission = db.query(Submission).options(
            joinedload(Submission.assignment)
        ).filter(Submission.id == submission_id).first()

        if not submission:
            return

        # ── Text extraction (Check existing cached text first) ───────────
        if submission.extracted_text and submission.extracted_text.strip():
            cleaned_text = submission.extracted_text
        else:
            extraction = extract_text_from_pdf(file_path)

            if not extraction["text"].strip():
                submission.status = "failed"
                submission.error_message = "No text could be extracted from this PDF."
                db.commit()
                return

            cleaned_text = clean_extracted_text(extraction["text"])
            submission.extracted_text = cleaned_text
            submission.extraction_method = extraction["method"]
            submission.extraction_confidence = (
                round(extraction["confidence"]) if extraction["confidence"] is not None else None
            )

            if extraction["low_confidence"]:
                submission.status = "failed"
                submission.error_message = (
                    f"OCR confidence was too low ({extraction['confidence']:.0f}%) to reliably "
                    "evaluate this submission. Please ask the student to resubmit a clearer scan "
                    "or a typed document."
                )
                db.commit()
                return

            submission.status = "extracted"
            db.commit()

        # ── Plagiarism Detection ──────────────────────────────────────────
        plagiarism_report = None
        try:
            plagiarism_report = compute_plagiarism_report(submission.id, db)
        except Exception as p_err:
            print(f"[EvaluationTask] Plagiarism computation error: {p_err}")

        # ── Load assignment + rubric ──────────────────────────────────────
        assignment = submission.assignment or db.query(Assignment).filter(
            Assignment.id == submission.assignment_id
        ).first()

        rubric = db.query(Rubric).filter(Rubric.id == assignment.rubric_id).first()
        criteria = db.query(RubricCriterion).filter(
            RubricCriterion.rubric_id == rubric.id
        ).order_by(RubricCriterion.id).all()

        # ── Prepare submission text — sample across full document ─────────
        submission_excerpt = _prepare_submission_text(cleaned_text)

        # ── Build evaluation prompt ───────────────────────────────────────
        criteria_block = "\n".join([
            f'- Key: "{c.key}" | Criterion: {c.label} | Max marks: {c.max_marks}'
            + (f' | Description: {c.description}' if c.description else '')
            for c in criteria
        ])

        criteria_keys = ", ".join([f'"{c.key}": 0' for c in criteria])

        plagiarism_notice_block = ""
        if plagiarism_report and plagiarism_report.risk_level in ["medium", "high"]:
            plagiarism_notice_block = (
                f"\nPLAGIARISM & SIMILARITY NOTICE:\n"
                f"A similarity score of {submission.plagiarism_score:.1f}% ({plagiarism_report.risk_level.upper()} risk) "
                f"was detected compared to another submission in this course.\n"
                f"Instructions for AI Evaluator:\n"
                f"- Note any relevant academic integrity observations in your written summary if appropriate.\n"
                f"- Do NOT automatically deduct marks or award zero solely based on this notice. Grade the content against rubric criteria fairly as the human teacher will review all plagiarism flags.\n"
            )

        prompt = f"""You are an experienced academic lecturer evaluating a student assignment.
Your goal is fair, balanced, and encouraging assessment — not to find every flaw.

ASSIGNMENT TITLE: {assignment.title}

ASSIGNMENT DESCRIPTION AND INSTRUCTIONS:
{assignment.description or 'No specific instructions provided.'}

RUBRIC CRITERIA (evaluate EACH one separately):
{criteria_block}

STUDENT SUBMISSION (representative sample from the full document):
{submission_excerpt}
{plagiarism_notice_block}
SCORING GUIDELINES — READ CAREFULLY:
- Award FULL marks if the student has made a genuine, reasonable attempt at the criterion.
- Award PARTIAL marks for work that is present but incomplete or lacking depth.
- Award ZERO only if the criterion topic is completely absent from the submission.
- A student who covers a topic with reasonable depth but misses minor details should NOT score zero.
- The submission excerpt may not show every part of the full document — give benefit of the doubt if a topic appears to be covered.
- Do NOT penalize for things not explicitly required by the rubric.
- Keep each criterion feedback to 1-2 sentences. Be specific, not generic.
- Strengths: 2-3 bullet points on what was genuinely done well.
- Weaknesses: 2-3 bullet points on genuine gaps only.
- Summary: 2-3 sentences maximum.

Respond with ONLY a valid JSON object, no other text before or after:
{{
  "criteria_scores": {{ {criteria_keys} }},
  "criteria_feedback": [
    {{
      "key": "criterion_key",
      "label": "Criterion Label",
      "score": 0,
      "max_score": 0,
      "what_was_good": "one specific positive observation",
      "what_was_missing": "one specific gap, or null if fully met"
    }}
  ],
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "improvements": ["improvement suggestion 1", "improvement suggestion 2"],
  "summary": "2-3 sentence overall assessment."
}}"""

        response = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            options={
                "num_predict": 1000,
                "num_ctx": 4096,
                "temperature": 0.10,
                "num_thread": os.cpu_count(),
            },
        )
        raw_output = response["message"]["content"]

        # ── Parse and validate JSON ───────────────────────────────────────
        json_start = raw_output.find("{")
        json_end = raw_output.rfind("}") + 1
        if json_start == -1 or json_end == 0:
            raise ValueError("LLM did not return valid JSON")

        parsed = json.loads(raw_output[json_start:json_end])

        # Clamp scores to criterion maximums
        max_by_key = {c.key: c.max_marks for c in criteria}
        clamped_scores = {
            k: max(0, min(int(v), max_by_key.get(k, int(v))))
            for k, v in parsed["criteria_scores"].items()
        }
        total_score = sum(clamped_scores.values())

        # Merge clamped scores into criteria_feedback for consistency
        criteria_feedback = parsed.get("criteria_feedback", [])
        for item in criteria_feedback:
            item["score"] = clamped_scores.get(item["key"], item.get("score", 0))

        # Build structured feedback object
        structured_feedback = {
            "criteria_feedback": criteria_feedback,
            "strengths": parsed.get("strengths", []),
            "weaknesses": parsed.get("weaknesses", []),
            "improvements": parsed.get("improvements", []),
            "summary": parsed.get("summary", ""),
            "ai_score": submission.ai_score,
            "plagiarism_score": submission.plagiarism_score,
        }

        ai_eval = AIEvaluation(
            submission_id=submission.id,
            criteria_scores=clamped_scores,
            total_score=total_score,
            feedback=json.dumps(structured_feedback),
            raw_model_output=raw_output,
        )
        db.add(ai_eval)
        submission.status = "ai_evaluated"
        db.commit()

    except Exception as e:
        if submission:
            submission.status = "failed"
            submission.error_message = f"Evaluation failed: {str(e)}"
            db.commit()
    finally:
        db.close()