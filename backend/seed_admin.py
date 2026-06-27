# seed_admin.py
"""
Run once to create the first Admin account.
After this, that admin can create more admins if needed (or just stays the one admin —
typical for an FYP demo).
"""

from app.database.db import SessionLocal
from app.models.models import User
from app.utils.auth import hash_password

db = SessionLocal()

existing = db.query(User).filter(User.email == "admin@smartedu.com").first()
if existing:
    print("Admin already exists.")
else:
    admin = User(
        email="admin@smartedu.com",
        password_hash=hash_password("admin123"),  # change after first login in a real deployment
        full_name="System Admin",
        role="admin",
    )
    db.add(admin)
    db.commit()
    print(f"Admin created: {admin.email} / password: admin123")

db.close()