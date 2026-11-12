# add_ocr_details_column.py — One-shot migration script for submission ocr_details & needs_review columns
from sqlalchemy import text
from app.database.db import engine

def migrate():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ocr_details TEXT;"))
            conn.execute(text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;"))
            conn.commit()
            print("Successfully added ocr_details and needs_review columns to submissions table.")
        except Exception as e:
            print(f"Migration error/note: {e}")

if __name__ == "__main__":
    migrate()
