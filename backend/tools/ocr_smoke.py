# backend/tools/ocr_smoke.py
"""
SmartEdu OCR Pipeline Smoke Test Script.

Usage:
python -m tools.ocr_smoke "path/to/pdf_file.pdf"
"""

import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import app.services.ocr_service as ocr_facade
from app.services.ocr.router import process_pdf_document

def run_smoke(pdf_path: str):
    print("=" * 80)
    print("SMOKE TEST DIAGNOSTIC SUMMARY")
    print("=" * 80)
    print(f"Module file: {ocr_facade.__file__}")
    print(f"Extract fn target: {ocr_facade.extract_text_from_pdf}")
    print(f"PDF target path: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF file not found at '{pdf_path}'")
        return

    t0 = time.time()
    res = ocr_facade.extract_text_from_pdf(pdf_path)
    elapsed = time.time() - t0

    print("-" * 80)
    print(f"Engine: {res.get('ocr_engine_used')}")
    print(f"Status: {res.get('extraction_status')}")
    print(f"Confidence (Quality Score): {res.get('confidence')}%")
    print(f"Needs Review: {res.get('needs_review')}")
    print(f"Processing Time: {res.get('processing_time')}s (Total Elapsed: {elapsed:.2f}s)")
    print(f"Page Details Count: {len(res.get('page_details', []))}")

    if res.get('page_details'):
        for page_info in res['page_details']:
            print(f"  Page {page_info.get('page')}: Route={page_info.get('route')}, Engine={page_info.get('engine')}, Score={page_info.get('score')}")

    print("-" * 80)
    print("Extracted Text Excerpt (First 300 chars):")
    print(res.get('text', '')[:300])
    print("=" * 80)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m tools.ocr_smoke <path_to_pdf>")
    else:
        run_smoke(sys.argv[1])
