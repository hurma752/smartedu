# app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from app.database.db import get_db, SessionLocal
from app.models.models import User, ChatHistory
from app.utils.auth import get_current_user
from app.services.rag_service import answer_question, answer_question_stream
from app.routers.courses import get_course_for_access
from app.database.db import get_db, SessionLocal

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    course_id: int


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    # Pass student_id and db so the hybrid pipeline can fetch LMS data
    result = answer_question(
        question=request.message,
        course_id=request.course_id,
        student_id=current_user.id,
        db=db,
    )

    db.add(ChatHistory(
        student_id=current_user.id, course_id=request.course_id,
        message=request.message, role="user",
    ))
    db.add(ChatHistory(
        student_id=current_user.id, course_id=request.course_id,
        message=result["answer"], role="assistant",
    ))
    db.commit()

    return {"answer": result["answer"], "sources": result.get("sources", [])}


@router.post("/stream")
def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    # Capture these before db session is potentially closed by the time
    # the streaming generator runs
    student_id = current_user.id
    course_id = request.course_id
    message = request.message

    def generate():
        full_answer = ""
        try:
            # Streaming needs its own session — request session may be
            # gone by the time the generator yields tokens
            stream_db = SessionLocal()
            try:
                for token in answer_question_stream(message, course_id, student_id, stream_db):
                    full_answer += token
                    yield token
            finally:
                stream_db.close()
        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"
            return

        # Save to history using another fresh session
        history_db = SessionLocal()
        try:
            history_db.add(ChatHistory(
                student_id=student_id, course_id=course_id,
                message=message, role="user",
            ))
            history_db.add(ChatHistory(
                student_id=student_id, course_id=course_id,
                message=full_answer, role="assistant",
            ))
            history_db.commit()
        finally:
            history_db.close()

    return StreamingResponse(generate(), media_type="text/plain")