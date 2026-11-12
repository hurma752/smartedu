# backend/scratch/verify_pipeline.py
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ocr_service import extract_text_from_pdf

typed_pdf = "uploads/submission_292_Submission_A_Ayesha_Khan.pdf"
scanned_pdf = "uploads/submission_305_02-235231-013-139722103988-03102025-094230pm.pdf"

print("--- Testing Typed PDF Extraction ---")
res_typed = extract_text_from_pdf(typed_pdf)
print(f"Method: {res_typed['method']}, Status: {res_typed['extraction_status']}, Score: {res_typed['confidence']}%")
print(f"Extracted Length: {len(res_typed['text'])} chars")
print("Excerpt:", res_typed['text'][:200])

if os.path.exists(scanned_pdf):
    print("\n--- Testing Scanned PDF Extraction ---")
    res_scanned = extract_text_from_pdf(scanned_pdf)
    print(f"Method: {res_scanned['method']}, Status: {res_scanned['extraction_status']}, Score: {res_scanned['confidence']}%")
    print(f"Engine used: {res_scanned['ocr_engine_used']}, Needs review: {res_scanned['needs_review']}")
    print(f"Extracted Length: {len(res_scanned['text'])} chars")
    print("Excerpt:", res_scanned['text'][:200])
