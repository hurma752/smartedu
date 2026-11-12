# backend/scratch/check_submissions.py
import sys
import os
from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database.db import engine

with engine.connect() as conn:
    res = conn.execute(text("""
        SELECT id, ocr_engine_used, extraction_status, extraction_confidence,
               ocr_processing_time, (ocr_details IS NOT NULL) AS has_details
        FROM submissions ORDER BY id DESC LIMIT 5;
    """)).fetchall()

    print("ID | Engine | Extraction Status | Confidence | Processing Time | Has Details")
    print("-" * 75)
    for row in res:
        print(f"{row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]}")
