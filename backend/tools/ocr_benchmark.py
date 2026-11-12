# backend/tools/ocr_benchmark.py
"""
SmartEdu OCR Evaluation & Benchmarking Harness.

Reads PDFs from backend/ocr_eval/pdfs/ and ground-truth transcriptions from
backend/ocr_eval/truth/<pdf_name_without_ext>.txt.

Runs the extraction pipeline in 3 modes:
1. TrOCR-only
2. VLM-only
3. Full Hybrid (VLM + TrOCR + Tesseract)

Computes Character Error Rate (CER), Word Error Rate (WER), OCR Quality Score, and Latency per page,
printing a Markdown comparative benchmark table.
"""

import os
import sys
import time
import glob
import logging
from PIL import Image
import fitz  # PyMuPDF

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import jiwer
    HAS_JIWER = True
except ImportError:
    HAS_JIWER = False

from app.services.ocr.preprocess import flatten_lighting_and_deskew, isolate_handwriting_ink
from app.services.ocr.lines import segment_page_lines
from app.services.ocr.trocr_engine import TrOCREngine
from app.services.ocr.vlm_engine import VLMEngine
from app.services.ocr.postprocess import clean_academic_text
from app.services.ocr.scoring import evaluate_handwritten_quality, calculate_agreement_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("smartedu.ocr.benchmark")

EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ocr_eval"))
PDF_DIR = os.path.join(EVAL_DIR, "pdfs")
TRUTH_DIR = os.path.join(EVAL_DIR, "truth")


def compute_cer_wer(hypothesis: str, reference: str) -> tuple[float, float]:
    """Computes CER and WER percentage (0-100%)."""
    if not reference or not reference.strip():
        return 0.0, 0.0

    hyp = hypothesis.strip()
    ref = reference.strip()

    if HAS_JIWER:
        try:
            cer = jiwer.cer(ref, hyp) * 100.0
            wer = jiwer.wer(ref, hyp) * 100.0
            return round(min(100.0, cer), 2), round(min(100.0, wer), 2)
        except Exception as exc:
            logger.debug("jiwer calculation warning: %s", exc)

    # Fallback difflib token similarity approximation
    from difflib import SequenceMatcher
    char_sim = SequenceMatcher(None, hyp, ref).ratio()
    cer = (1.0 - char_sim) * 100.0

    hyp_words = hyp.split()
    ref_words = ref.split()
    word_sim = SequenceMatcher(None, hyp_words, ref_words).ratio()
    wer = (1.0 - word_sim) * 100.0

    return round(cer, 2), round(wer, 2)


def run_benchmark():
    pdf_files = glob.glob(os.path.join(PDF_DIR, "*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {PDF_DIR}. Creating directory structure for evaluation...")
        os.makedirs(PDF_DIR, exist_ok=True)
        os.makedirs(TRUTH_DIR, exist_ok=True)
        print("Please place test PDFs in backend/ocr_eval/pdfs/ and ground-truth text in backend/ocr_eval/truth/")
        return

    print("=" * 90)
    print(f"SmartEdu OCR Pipeline Benchmark Engine (Evaluating {len(pdf_files)} PDFs)")
    print("=" * 90)

    trocr_engine = TrOCREngine()
    vlm_engine = VLMEngine()

    results = []

    for pdf_path in sorted(pdf_files):
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        truth_path = os.path.join(TRUTH_DIR, f"{base_name}.txt")

        ground_truth = ""
        if os.path.exists(truth_path):
            with open(truth_path, "r", encoding="utf-8") as fh:
                ground_truth = fh.read().strip()
        else:
            print(f"Notice: Ground truth missing for {base_name}.txt; error rate metrics will be zero-referenced.")

        doc = fitz.open(pdf_path)
        page_count = len(doc)

        for mode in ["trocr_only", "vlm_only", "full_hybrid"]:
            t0 = time.perf_counter()
            texts = []
            scores = []

            for p_idx, page in enumerate(doc):
                pix = page.get_pixmap(dpi=300)
                raw_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                clean_img, ink_mask = isolate_handwriting_ink(raw_img)
                line_crops = segment_page_lines(clean_img, ink_mask)

                if mode == "trocr_only":
                    trocr_res = trocr_engine.process_page_lines(line_crops) if trocr_engine.is_available else {"text": "", "confidence": 0.0}
                    clean_text = clean_academic_text(trocr_res.get("text", ""))
                    texts.append(clean_text)
                    scores.append(trocr_res.get("confidence", 0.0))

                elif mode == "vlm_only":
                    vlm_res = vlm_engine.process_page_image(clean_img) if vlm_engine.is_available else {"text": "", "success": False}
                    clean_text = clean_academic_text(vlm_res.get("text", ""))
                    texts.append(clean_text)
                    eval_res = evaluate_handwritten_quality(clean_text, "", 0.0, len(line_crops))
                    scores.append(eval_res["composite_score"])

                else:  # full_hybrid
                    trocr_res = trocr_engine.process_page_lines(line_crops) if trocr_engine.is_available else {"text": "", "confidence": 0.0}
                    vlm_res = vlm_engine.process_page_image(clean_img) if vlm_engine.is_available else {"text": "", "success": False}
                    eval_res = evaluate_handwritten_quality(
                        vlm_text=vlm_res.get("text", ""),
                        trocr_text=trocr_res.get("text", ""),
                        trocr_conf=trocr_res.get("confidence", 0.0),
                        line_crops_count=len(line_crops)
                    )
                    clean_text = clean_academic_text(eval_res["primary_text"])
                    texts.append(clean_text)
                    scores.append(eval_res["composite_score"])

            elapsed = time.perf_counter() - t0
            time_per_page = round(elapsed / float(max(1, page_count)), 2)

            full_hyp = "\n\n".join(texts)
            cer, wer = compute_cer_wer(full_hyp, ground_truth) if ground_truth else (0.0, 0.0)
            avg_score = round(float(sum(scores) / max(1, len(scores))), 1)

            results.append({
                "file": base_name,
                "mode": mode,
                "pages": page_count,
                "cer": cer,
                "wer": wer,
                "score": avg_score,
                "sec_per_page": time_per_page,
            })

        doc.close()

    # Output Markdown table
    print("\n### OCR Pipeline Performance Benchmark Summary\n")
    print("| Document | Mode | Pages | CER (%) | WER (%) | Quality Score | Time / Page (s) |")
    print("|:---|:---|:---:|:---:|:---:|:---:|:---:|")

    for r in results:
        print(f"| `{r['file']}` | **{r['mode']}** | {r['pages']} | {r['cer']}% | {r['wer']}% | {r['score']} | {r['sec_per_page']}s |")

    print("\nBenchmark completed successfully.")


if __name__ == "__main__":
    run_benchmark()
