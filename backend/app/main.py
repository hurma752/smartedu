# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import ollama
from app.config import settings
from app.database.db import SessionLocal
from app.routers import auth, admin, courses, documents, chat, password, assignments, badges, attendance, analytics
from app.services.badge_service import seed_default_achievements

app = FastAPI(
    title="SmartEdu API",
    description="AI-powered Learning Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(password.router, prefix="/api/password", tags=["Password"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chatbot"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["Assignments"])
app.include_router(badges.router, prefix="/api/badges", tags=["Badges"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])


@app.on_event("startup")
def startup_tasks():
    # 1. Warm up Ollama
    try:
        ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[{"role": "user", "content": "Hi"}],
            options={"num_predict": 1},
        )
        print("Ollama warmed up and ready.")
    except Exception as e:
        print(f"Ollama warm-up failed (is Ollama running?): {e}")

    # 2. Seed default achievements
    try:
        db = SessionLocal()
        seed_default_achievements(db)
        db.close()
        print("Default achievements seeded.")
    except Exception as e:
        print(f"Achievement seeding failed: {e}")


@app.get("/")
def root():
    return {"message": "SmartEdu API is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
