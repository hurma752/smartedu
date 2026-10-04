# app/services/ocr/scoring.py
"""
Composite Quality Scoring & Relevance Guard Module for SmartEdu OCR.

Calculates page quality score (0-100):
- 35% VLM vs TrOCR text agreement (RapidFuzz token similarity)
- 25% Lexical validity (English dictionary word ratio + assignment vocab boost)
- 20% Line coverage (transcribed lines / detected line bands)
- 20% TrOCR beam confidence score

Includes relevance guard (MiniLM embedding cosine similarity vs assignment brief)
and env-configurable gating thresholds.
"""

import os
import re
import logging
from difflib import SequenceMatcher
import numpy as np

try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

logger = logging.getLogger("smartedu.ocr.scoring")

# Gating Thresholds (Env configurable)
OCR_HANDWRITTEN_GATE_OK = float(os.getenv("OCR_HANDWRITTEN_GATE_OK", "75.0"))
OCR_HANDWRITTEN_GATE_REVIEW = float(os.getenv("OCR_HANDWRITTEN_GATE_REVIEW", "50.0"))
OCR_PRINT_GATE_OK = float(os.getenv("OCR_PRINT_GATE_OK", "80.0"))
OCR_PRINT_GATE_REVIEW = float(os.getenv("OCR_PRINT_GATE_REVIEW", "60.0"))

COMMON_ENGLISH_WORDS = {
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for",
    "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by",
    "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one",
    "all", "would", "there", "their", "what", "so", "up", "out", "if", "about",
    "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no",
    "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
    "could", "them", "see", "other", "than", "then", "now", "look", "only", "come",
    "its", "over", "think", "also", "back", "after", "use", "two", "how", "our",
    "work", "first", "well", "way", "even", "new", "want", "because", "any", "these",
    "give", "day", "most", "us", "is", "are", "was", "were", "been", "has", "had",
    "student", "assignment", "course", "question", "answer", "section", "part",
    "organization", "theory", "behavior", "management", "system", "report", "study",
    "structure", "software", "engineering", "sample", "full", "printed", "text",
    "written", "clean", "handwritten", "architecture", "design", "analysis",
    "process", "data", "model", "result", "method", "paper", "solution", "correct",
    "correctly", "value", "function", "input", "output", "page", "image", "line",
    "file", "code", "computer", "science", "business", "project", "problem", "write",
    "something", "this", "that", "those", "these", "where", "which", "while", "during"
}


def calculate_agreement_score(text_a: str, text_b: str) -> float:
    """Calculates similarity percentage (0-100) between two engine transcriptions."""
    if not text_a or not text_b:
        return 0.0

    a = text_a.strip().lower()
    b = text_b.strip().lower()

    if HAS_RAPIDFUZZ:
        return float(fuzz.token_set_ratio(a, b))

    return SequenceMatcher(None, a, b).ratio() * 100.0


def calculate_lexical_validity(text: str, assignment_vocab: set = None) -> float:
    """Calculates share of tokens (0-100%) that are recognized English or assignment vocabulary."""
    if not text or not text.strip():
        return 0.0

    tokens = [w.lower() for w in re.findall(r"\b[a-zA-Z]{2,}\b", text)]
    if not tokens:
        return 0.0

    valid_set = set(COMMON_ENGLISH_WORDS)
    if assignment_vocab:
        valid_set = valid_set.union({v.lower() for v in assignment_vocab})

    valid_count = sum(1 for t in tokens if t in valid_set)
    return (valid_count / float(len(tokens))) * 100.0


def check_relevance_guard(ocr_text: str, assignment_brief: str) -> tuple[float, bool]:
    """
    Computes MiniLM cosine similarity between extracted OCR text and the assignment brief.
    Returns (similarity_score_0_to_1, is_flagged).
    """
    if not ocr_text or not ocr_text.strip() or not assignment_brief or not assignment_brief.strip():
        return 1.0, False

    try:
        from app.rag.embeddings import get_single_embedding
        vec_ocr = np.array(get_single_embedding(ocr_text[:1000]))
        vec_brief = np.array(get_single_embedding(assignment_brief[:1000]))

        norm_ocr = np.linalg.norm(vec_ocr)
        norm_brief = np.linalg.norm(vec_brief)

        if norm_ocr == 0 or norm_brief == 0:
            return 1.0, False

        sim = float(np.dot(vec_ocr, vec_brief) / (norm_ocr * norm_brief))
        is_flagged = sim < 0.20  # Flag if cosine similarity is below 0.20
        return sim, is_flagged
    except Exception as exc:
        logger.debug("Relevance guard evaluation error: %s", exc)
        return 1.0, False


def evaluate_handwritten_quality(
    vlm_text: str,
    trocr_text: str,
    trocr_conf: float,
    line_crops_count: int,
    assignment_context: str = None
) -> dict:
    """
    Evaluates handwritten page quality score (0-100) and returns classification.

    Returns:
    {
        "composite_score": float,
        "agreement": float,
        "lexical_validity": float,
        "line_coverage": float,
        "trocr_conf": float,
        "status_code": "ocr_ok" | "ocr_needs_review" | "ocr_low_confidence",
        "primary_text": str,
        "relevance_score": float,
        "relevance_flagged": bool
    }
    """
    vlm_clean = vlm_text.strip() if vlm_text else ""
    trocr_clean = trocr_text.strip() if trocr_text else ""

    # Choose primary text (VLM preferred if present, else TrOCR)
    primary_text = vlm_clean if vlm_clean else trocr_clean

    vocab = set(re.findall(r"\b[a-zA-Z]{3,}\b", assignment_context.lower())) if assignment_context else set()

    lexical = max(
        calculate_lexical_validity(vlm_clean, vocab),
        calculate_lexical_validity(trocr_clean, vocab)
    )

    lines_count = len([l for l in primary_text.split("\n") if l.strip()])
    coverage = (lines_count / float(max(1, line_crops_count))) * 100.0 if line_crops_count > 0 else 50.0
    coverage = min(100.0, max(0.0, coverage))

    has_vlm = bool(vlm_clean)
    has_trocr = bool(trocr_clean)

    if has_vlm and has_trocr:
        agreement = calculate_agreement_score(vlm_clean, trocr_clean)
        score = (
            0.35 * agreement +
            0.25 * lexical +
            0.20 * coverage +
            0.20 * trocr_conf
        )
    elif has_trocr:
        agreement = 0.0
        score = (
            0.40 * lexical +
            0.30 * coverage +
            0.30 * trocr_conf
        )
    elif has_vlm:
        agreement = 0.0
        score = (
            0.60 * lexical +
            0.40 * coverage
        )
    else:
        agreement = 0.0
        score = 0.0

    score = min(100.0, max(0.0, round(score, 1)))

    rel_score, rel_flagged = 1.0, False
    if assignment_context and primary_text:
        rel_score, rel_flagged = check_relevance_guard(primary_text, assignment_context)
        if rel_flagged and score >= OCR_HANDWRITTEN_GATE_OK:
            # Downgrade to needs review if relevance similarity is suspiciously low
            score = OCR_HANDWRITTEN_GATE_REVIEW

    if score >= OCR_HANDWRITTEN_GATE_OK:
        status_code = "ocr_ok"
    elif score >= OCR_HANDWRITTEN_GATE_REVIEW:
        status_code = "ocr_needs_review"
    else:
        status_code = "ocr_low_confidence"

    return {
        "composite_score": score,
        "agreement": round(agreement, 1),
        "lexical_validity": round(lexical, 1),
        "line_coverage": round(coverage, 1),
        "trocr_conf": round(trocr_conf, 1),
        "status_code": status_code,
        "primary_text": primary_text,
        "relevance_score": round(rel_score, 3),
        "relevance_flagged": rel_flagged,
    }


def evaluate_print_quality(text: str, confidence: float) -> dict:
    """Evaluates printed scan quality score (0-100) and returns classification."""
    lexical = calculate_lexical_validity(text)
    score = round(0.60 * confidence + 0.40 * lexical, 1)

    if score >= OCR_PRINT_GATE_OK:
        status_code = "ocr_ok"
    elif score >= OCR_PRINT_GATE_REVIEW:
        status_code = "ocr_needs_review"
    else:
        status_code = "ocr_escalate_handwritten"

    return {
        "composite_score": score,
        "confidence": confidence,
        "lexical_validity": lexical,
        "status_code": status_code,
    }
