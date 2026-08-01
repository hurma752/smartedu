# create_tables.py — sync tables and run migrations
from sqlalchemy import text
from app.database.db import engine, Base
from app.models import models

# 1. Create any missing tables
Base.metadata.create_all(bind=engine)

# 2. Migration for existing PostgreSQL/SQLite tables: Add summary column if missing
with engine.connect() as conn:
    try:
        # PostgreSQL / SQLite ALTER TABLE
        conn.execute(text("ALTER TABLE plagiarism_reports ADD COLUMN IF NOT EXISTS summary TEXT;"))
        conn.execute(text("ALTER TABLE plagiarism_reports ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(20) DEFAULT 'high';"))
        conn.commit()
        print("Successfully migrated plagiarism_reports table (summary & confidence_level columns added).")
    except Exception as e:
        print(f"Migration note: {e}")

print("Tables synced and migrated.")