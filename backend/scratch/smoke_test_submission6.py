# backend/scratch/smoke_test_submission6.py
import sys
import os
import fitz
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ocr.preprocess import isolate_handwriting_ink
from app.services.ocr.lines import segment_page_lines
from app.services.ocr.router import process_pdf_document

pdf_path = os.path.join(os.path.dirname(__file__), "..", "uploads", "submission_310_submission (6).pdf")
if not os.path.exists(pdf_path):
    print(f"Error: {pdf_path} does not exist")
    sys.exit(1)

doc = fitz.open(pdf_path)
print(f"Loaded PDF: {pdf_path} (Pages: {len(doc)})")

for p_no, page in enumerate(doc):
    pix = page.get_pixmap(dpi=300)
    raw_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    clean_img, ink_mask = isolate_handwriting_ink(raw_img)
    line_crops = segment_page_lines(clean_img, ink_mask)
    print(f"Page {p_no + 1}: {len(line_crops)} crops generated")

doc.close()

print("\n--- Running process_pdf_document ---")
result = process_pdf_document(pdf_path)

print(f"Extraction Status: {result.get('extraction_status')}")
print(f"OCR Engine Used: {result.get('ocr_engine_used')}")
print(f"Confidence: {result.get('confidence')}%")
print(f"Needs Review: {result.get('needs_review')}")
print(f"Processing Time: {result.get('processing_time')}s")

print("\n--- Page Details for Page 1 ---")
if result.get("page_details"):
    import json
    print(json.dumps(result["page_details"][0], indent=2))
else:
    print("No page details found.")

print("\n--- First 20 Lines of Extracted Text ---")
lines = [l for l in result.get("text", "").split("\n") if l.strip()]
for idx, line in enumerate(lines[:20]):
    print(f"{idx + 1:2d}: {line}")
