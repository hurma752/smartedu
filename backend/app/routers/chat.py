# app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from fastapi.responses import StreamingResponse

from app.database.db import get_db, SessionLocal
from app.models.models import User, ChatHistory
from app.utils.auth import get_current_user
from app.services.rag_service import answer_question, answer_question_stream
from app.services.engagement_service import log_event
from app.routers.courses import get_course_for_access

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    course_id: int


class EditMessageRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    intent: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None


@router.get("/history/{course_id}")
def get_chat_history(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves full persistent chat history for the student & course."""
    get_course_for_access(course_id, current_user, db)

    records = db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == course_id
    ).order_by(ChatHistory.created_at.asc()).all()

    return [
        {
            "id": r.id,
            "role": r.role,
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.delete("/history/{course_id}")
def clear_chat_history(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clears all conversation history for the student & course (Start New Conversation)."""
    get_course_for_access(course_id, current_user, db)

    db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == course_id
    ).delete(synchronize_session=False)
    db.commit()

    return {"message": "Chat history cleared successfully."}


@router.delete("/message/{message_id}")
def delete_chat_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes a single chat message owned by the student."""
    msg = db.query(ChatHistory).filter(
        ChatHistory.id == message_id,
        ChatHistory.student_id == current_user.id
    ).first()

    if not msg:
        raise HTTPException(404, "Message not found or access denied.")

    db.delete(msg)
    db.commit()
    return {"message": "Message deleted."}


@router.put("/message/{message_id}")
def edit_chat_message(
    message_id: int,
    payload: EditMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edits a single chat message text owned by the student."""
    if not payload.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    msg = db.query(ChatHistory).filter(
        ChatHistory.id == message_id,
        ChatHistory.student_id == current_user.id
    ).first()

    if not msg:
        raise HTTPException(404, "Message not found or access denied.")

    msg.message = payload.message.strip()
    db.commit()
    return {"id": msg.id, "message": msg.message, "role": msg.role}


@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    recent_history_objs = db.query(ChatHistory).filter(
        ChatHistory.student_id == current_user.id,
        ChatHistory.course_id == request.course_id
    ).order_by(ChatHistory.created_at.desc()).limit(12).all()

    recent_history = [
        {"role": h.role, "message": h.message} for h in reversed(recent_history_objs)
    ]

    result = answer_question(
        question=request.message,
        course_id=request.course_id,
        student_id=current_user.id,
        db=db,
        history=recent_history,
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
    log_event(current_user.id, request.course_id, "chat_message", db)

    return {
        "answer": result["answer"],
        "sources": result.get("sources", []),
        "intent": result.get("intent"),
        "metrics": result.get("metrics"),
    }


@router.post("/stream")
def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    get_course_for_access(request.course_id, current_user, db)

    student_id = current_user.id
    course_id = request.course_id
    message = request.message

    recent_history_objs = db.query(ChatHistory).filter(
        ChatHistory.student_id == student_id,
        ChatHistory.course_id == course_id
    ).order_by(ChatHistory.created_at.desc()).limit(12).all()

    recent_history = [
        {"role": h.role, "message": h.message} for h in reversed(recent_history_objs)
    ]

    def generate():
        full_answer = ""
        try:
            stream_db = SessionLocal()
            try:
                for token in answer_question_stream(message, course_id, student_id, stream_db, history=recent_history):
                    full_answer += token
                    yield token
            finally:
                stream_db.close()
        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"
            return

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
            log_event(student_id, course_id, "chat_message", history_db)
        finally:
            history_db.close()

    return StreamingResponse(generate(), media_type="text/plain")