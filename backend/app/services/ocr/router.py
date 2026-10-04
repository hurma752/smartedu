# app/services/ocr/router.py
"""
Per-Page OCR Routing & Pipeline Orchestrator for SmartEdu.

Routes pages:
1. Native PyMuPDF block extraction for typed digital PDFs.
2. Print Probe (Tesseract fast pass on deskewed/flattened image) -> PRINT route if conf >= 85 & word ratio >= 0.90.
3. Handwritten route: Ink isolation, projection line crops, Ollama VLM + TrOCR beam search, postprocessing & composite scoring.

Uses module-level semaphore to limit heavy OCR concurrency to 1 job.
"""

import os
import time
import re
import threading
import logging
from PIL import Image
import fitz  # PyMuPDF
import numpy as np

from app.services.ocr.preprocess import flatten_lighting_and_deskew, isolate_handwriting_ink
from app.services.ocr.lines import segment_page_lines
from app.services.ocr.trocr_engine import TrOCREngine
from app.services.ocr.vlm_engine import VLMEngine
from app.services.ocr.postprocess import clean_academic_text
from app.services.ocr.scoring import (
    evaluate_handwritten_quality, evaluate_print_quality, calculate_lexical_validity
)
from app.services.ocr_engines import TesseractOCREngine

logger = logging.getLogger("smartedu.ocr.router")

# Concurrency semaphore: limit to 1 heavy OCR pipeline at a time
OCR_SEMAPHORE = threading.Semaphore(1)

# Env-configurable thresholds
OCR_PRINT_PROBE_CONF = float(os.getenv("OCR_PRINT_PROBE_CONF", "85.0"))
OCR_PRINT_PROBE_WORD_RATIO = float(os.getenv("OCR_PRINT_PROBE_WORD_RATIO", "0.90"))


def _is_typed_text_page(page) -> bool:
    """
    Determines whether a PDF page contains a genuine, complete typed text layer.
    """
    raw_text = page.get_text()
    if not raw_text or not raw_text.strip():
        return False

    images = page.get_images()
    if not images:
        return True

    cleaned = re.sub(
        r"(?i)\b(camscanner|scanned by|scanned with|adobe scan|tapscanner|docscanner|genius scan|fastscanner|page\s+\d+)\b",
        "",
        raw_text,
    ).strip()

    words = cleaned.split()
    if len(cleaned) < 100 or len(words) < 20:
        return False

    return True


def resolve_pdf_filepath(file_path: str) -> str:
    """
    Resolves relative or DB-stored upload file paths whether the app is run from
    the project root or from inside the backend directory.
    """
    if file_path and os.path.exists(file_path):
        return file_path

    if file_path:
        backend_path = os.path.join("backend", file_path)
        if os.path.exists(backend_path):
            return backend_path

        filename = os.path.basename(file_path)
        for candidate in [
            os.path.join("backend", "uploads", filename),
            os.path.join("uploads", filename),
            os.path.join("backend", filename),
        ]:
            if os.path.exists(candidate):
                return candidate

    return file_path


def process_pdf_document(file_path: str, compare: bool = False) -> dict:
    """
    Main entry point for document text extraction using Hybrid VLM + TrOCR + Tesseract.
    """
    start_time = time.perf_counter()
    resolved_path = resolve_pdf_filepath(file_path)

    if not os.path.exists(resolved_path):
        logger.error("PDF file not found: %s", file_path)
        return {
            "text": "",
            "raw_text": "",
            "method": "ocr",
            "confidence": 0,
            "low_confidence": True,
            "text_usable": False,
            "quality_tier": "LOW_QUALITY",
            "warning_message": "Document file missing on server.",
            "ocr_engine_used": None,
            "extraction_status": "ocr_low_confidence",
            "processing_time": round(time.perf_counter() - start_time, 2),
            "page_details": [],
            "needs_review": True,
        }

    # Acquire concurrency semaphore
    acquired = OCR_SEMAPHORE.acquire(timeout=600)
    try:
        doc = fitz.open(resolved_path)
        page_texts = []
        page_details = []
        engines_used = set()
        page_scores = []
        used_ocr = False

        trocr_engine = TrOCREngine()
        vlm_engine = VLMEngine()
        tess_engine = TesseractOCREngine()

        for p_idx, page in enumerate(doc):
            page_num = p_idx + 1

            if _is_typed_text_page(page):
                blocks = page.get_text("blocks")
                block_strings = [b[4].strip() for b in blocks if b[4].strip()]
                joined = clean_academic_text("\n\n".join(block_strings))
                page_texts.append(joined)
                page_details.append({
                    "page": page_num,
                    "route": "typed",
                    "engine": "pymupdf",
                    "score": 100,
                    "status": "typed",
                    "line_count": len(joined.split("\n"))
                })
                page_scores.append(100.0)
                engines_used.add("pymupdf")
                continue

            used_ocr = True
            pix = page.get_pixmap(dpi=300)
            raw_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            # Print Probe: Flatten lighting & deskew (no ruled line removal)
            flattened_img = flatten_lighting_and_deskew(raw_img)
            tess_res = tess_engine.process_page(flattened_img)

            tess_conf = tess_res.get("confidence", 0.0)
            logger.warning("NEW ROUTER page=%s probe_conf=%.1f", page_num, tess_conf)
            tess_text = tess_res.get("text", "")
            word_ratio = calculate_lexical_validity(tess_text) / 100.0

            # Evaluate if print probe passes PRINT route
            if tess_conf >= OCR_PRINT_PROBE_CONF and word_ratio >= OCR_PRINT_PROBE_WORD_RATIO:
                print_eval = evaluate_print_quality(tess_text, tess_conf)
                if print_eval["status_code"] != "ocr_escalate_handwritten":
                    clean_text = clean_academic_text(tess_text)
                    page_texts.append(clean_text)
                    page_scores.append(print_eval["composite_score"])
                    engines_used.add("tesseract")
                    page_details.append({
                        "page": page_num,
                        "route": "print",
                        "engine": "tesseract",
                        "score": print_eval["composite_score"],
                        "status": print_eval["status_code"],
                        "line_count": len(clean_text.split("\n"))
                    })
                    continue

            # HANDWRITTEN Route: Ink isolation & line crops
            clean_page_img, ink_mask = isolate_handwriting_ink(raw_img)
            line_crops = segment_page_lines(clean_page_img, ink_mask)

            # 1. TrOCR line recognition
            trocr_res = trocr_engine.process_page_lines(line_crops) if trocr_engine.is_available else {"text": "", "confidence": 0.0}

            # 2. VLM exact page transcription
            vlm_res = vlm_engine.process_page_image(clean_page_img) if vlm_engine.is_available else {"text": "", "success": False}

            # Evaluate composite quality score
            hw_eval = evaluate_handwritten_quality(
                vlm_text=vlm_res.get("text", ""),
                trocr_text=trocr_res.get("text", ""),
                trocr_conf=trocr_res.get("confidence", 0.0),
                line_crops_count=len(line_crops),
            )

            clean_hw_text = clean_academic_text(hw_eval["primary_text"])
            page_texts.append(clean_hw_text)
            page_scores.append(hw_eval["composite_score"])

            engine_tag = "vlm+trocr" if (vlm_res.get("success") and trocr_res.get("text")) else ("vlm" if vlm_res.get("success") else "trocr")
            engines_used.add(engine_tag)

            page_details.append({
                "page": page_num,
                "route": "handwritten",
                "engine": engine_tag,
                "score": hw_eval["composite_score"],
                "status": hw_eval["status_code"],
                "line_count": len(clean_hw_text.split("\n")),
                "agreement": hw_eval["agreement"],
                "lexical_validity": hw_eval["lexical_validity"],
                "line_coverage": hw_eval["line_coverage"],
            })

        doc.close()

        full_text = clean_academic_text("\n\n".join(page_texts))
        avg_score = float(np.mean(page_scores)) if page_scores else 0.0

        # Classify overall document extraction status
        if not used_ocr:
            overall_status = "typed"
            quality_tier = "HIGH_QUALITY"
            needs_review = False
            warning_msg = None
        elif avg_score >= 75.0:
            overall_status = "ocr_ok"
            quality_tier = "HIGH_QUALITY"
            needs_review = False
            warning_msg = None
        elif avg_score >= 50.0:
            overall_status = "ocr_needs_review"
            quality_tier = "ACCEPTABLE_WITH_WARNING"
            needs_review = True
            warning_msg = f"Moderate OCR confidence ({avg_score:.0f}%). Text is usable for AI evaluation, but please review transcript."
        else:
            overall_status = "ocr_low_confidence"
            quality_tier = "LOW_QUALITY"
            needs_review = True
            warning_msg = f"Low OCR extraction score ({avg_score:.0f}%). Submission requires teacher transcript correction."

        engine_str = "+".join(sorted(engines_used)) or "pymupdf"

        return {
            "text": full_text,
            "raw_text": full_text,
            "method": "ocr" if used_ocr else "typed",
            "confidence": round(avg_score),
            "low_confidence": (overall_status == "ocr_low_confidence"),
            "text_usable": (overall_status != "ocr_low_confidence"),
            "quality_tier": quality_tier,
            "warning_message": warning_msg,
            "ocr_engine_used": engine_str,
            "extraction_status": overall_status,
            "processing_time": round(time.perf_counter() - start_time, 2),
            "page_details": page_details,
            "needs_review": needs_review,
        }

    finally:
        if acquired:
            OCR_SEMAPHORE.release()
