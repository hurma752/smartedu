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

    result = answer_question(request.message, request.course_id)

    db.add(ChatHistory(
        student_id=current_user.id, course_id=request.course_id,
        message=request.message, role="user",
    ))
    db.add(ChatHistory(
        student_id=current_user.id, course_id=request.course_id,
        message=result["answer"], role="assistant",
    ))
    db.commit()

    return result


@router.post("/stream")
def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    def generate():
        full_answer = ""
        try:
            for token in answer_question_stream(request.message, request.course_id):
                full_answer += token
                yield token
        except Exception as e:
            yield f"\n\n[Error generating response: {str(e)}]"
            return

        history_db = SessionLocal()
        try:
            history_db.add(ChatHistory(
                student_id=current_user.id, course_id=request.course_id,
                message=request.message, role="user",
            ))
            history_db.add(ChatHistory(
                student_id=current_user.id, course_id=request.course_id,
                message=full_answer, role="assistant",
            ))
            history_db.commit()
        finally:
            history_db.close()

    return StreamingResponse(generate(), media_type="text/plain")