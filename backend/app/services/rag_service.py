# app/services/rag_service.py
"""
Orchestrates: PDF -> text -> chunks -> embeddings -> ChromaDB.
Also updates the Document row's status so the frontend can poll progress
instead of guessing whether a background task finished.
"""


import os
import json
import ollama
from sqlalchemy.orm import Session

from app.rag.embeddings import get_embeddings, get_single_embedding
from app.rag.vector_store import add_chunks_to_collection, search_similar_chunks
from app.services.lms_context_service import build_lms_context
from app.services.intent_classifier import classify_intent
from app.models.models import Document, Submission
from app.config import settings
from app.services.ocr_service import extract_text_from_pdf, chunk_text


def ingest_document_task(document_id: int, file_path: str, course_id: int, db_session_factory):
    """
    Runs as a FastAPI BackgroundTask. Takes a SESSION FACTORY (not a session)
    because the session that handled the original HTTP request gets closed
    as soon as the response is returned — background tasks need their OWN
    fresh session, opened and closed inside this function.
    """
    db: Session = db_session_factory()
    document = None
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return  # shouldn't happen, but don't crash silently if it does

        # extract_text_from_pdf now returns a DICT (text/method/confidence/
        # low_confidence), not a plain string — unwrap .text here. This is
        # the one line that needed to change after the OCR confidence-gating
        # update; everything else in this function is unaffected.
        extraction = extract_text_from_pdf(file_path)
        raw_text = extraction["text"]

        if not raw_text.strip():
            document.status = "failed"
            document.error_message = "No text could be extracted from this PDF"
            db.commit()
            return

        text_chunks = chunk_text(raw_text, chunk_size=500, overlap=100)
        if not text_chunks:
            document.status = "failed"
            document.error_message = "Chunking produced no results"
            db.commit()
            return

        embeddings = get_embeddings(text_chunks)
        chunks_data = [{"text": t, "embedding": e} for t, e in zip(text_chunks, embeddings)]

        stored_count = add_chunks_to_collection(
            course_id=course_id,
            document_id=document_id,
            chunks=chunks_data,
        )

        document.status = "indexed"
        document.chunk_count = stored_count
        db.commit()

    except Exception as e:
        # Always leave a record of WHY it failed — silent failures are
        # what made your original bug hard to diagnose
        if document:
            document.status = "failed"
            document.error_message = str(e)
            db.commit()
    finally:
        db.close()


def answer_question(question: str, course_id: int, student_id: int, db: Session) -> dict:
    """
    Hybrid RAG: combines LMS database context with document retrieval
    depending on the intent of the student's question.

    Now requires student_id and db so it can fetch personalised LMS data.
    """
    intent = classify_intent(question)
    lms_context = ""
    document_chunks = []

    # Build LMS context if the question is about course structure/metadata
    if intent in ("lms", "hybrid"):
        lms_context = build_lms_context(course_id, student_id, db)

    # Retrieve document chunks if the question might need course content
    if intent in ("document", "hybrid"):
        question_embedding = get_single_embedding(question)
        document_chunks = search_similar_chunks(course_id, question_embedding, n_results=3)

    # Build the prompt — sections only included when they have content
    # app/services/rag_service.py — update prompt_parts in BOTH answer_question and answer_question_stream

    prompt_parts = [
    "You are SmartEdu, an academic assistant integrated into this Learning Management System.",
    "",
    "CRITICAL RULES — follow these exactly:",
    "1. Assignment status MUST come only from the LMS CONTEXT section below.",
    "2. If LMS CONTEXT shows a submission exists for an assignment, that assignment",
    "   is NOT pending — regardless of anything said earlier in this conversation.",
    "3. Never tell a student they have not submitted when a submission record exists.",
    "4. Submission statuses: processing/extracted = submitted and processing,",
    "   ai_evaluated = submitted awaiting review, teacher_reviewed = graded.",
    "5. A submission record means the system accepted the file. Never judge correctness.",
    "6. If conversation history contradicts LMS CONTEXT, always trust LMS CONTEXT.",
    "7. For counts, dates, names, grades — use exact values from LMS CONTEXT only.",
    "8. If information is absent, say so. Never invent facts.",
    "",
]

    if lms_context:
        prompt_parts.append("=== COURSE & LMS INFORMATION ===")
        prompt_parts.append(lms_context)
        prompt_parts.append("")

    if document_chunks:
        prompt_parts.append("=== COURSE MATERIAL (from uploaded lectures) ===")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[Excerpt {i}]: {chunk[:800]}")
        prompt_parts.append("")

    # Replace the existing no-data return in answer_question:
    if not lms_context and not document_chunks:
        return {
            "answer": "I don't have enough information to answer that question. "
                    "This course may not have any uploaded materials or assignments yet.",
            "sources": [],
            "intent": intent,
        }

    prompt_parts.append(f"STUDENT QUESTION: {question}")
    prompt_parts.append("")
    prompt_parts.append("ANSWER:")

    prompt = "\n".join(prompt_parts)

    response = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        options={
            "num_predict": 800,
            "num_ctx": 3072,
            "temperature": 0.2,
            "num_thread": os.cpu_count(),
        },
    )

    return {
        "answer": response["message"]["content"],
        "sources": [chunk[:200] + "..." for chunk in document_chunks],
        "intent": intent,  # useful for debugging
    }


def answer_question_stream(question: str, course_id: int, student_id: int, db: Session):
    """
    Streaming version of the hybrid RAG pipeline.
    Same logic as answer_question but yields tokens as they're generated.
    """
    intent = classify_intent(question)
    lms_context = ""
    document_chunks = []

    if intent in ("lms", "hybrid"):
        lms_context = build_lms_context(course_id, student_id, db)

    if intent in ("document", "hybrid"):
        question_embedding = get_single_embedding(question)
        document_chunks = search_similar_chunks(course_id, question_embedding, n_results=3)

    # Replace the existing no-data return in answer_question:
    if not lms_context and not document_chunks:
        yield ("I don't have enough information to answer that question. "
            "This course may not have any uploaded materials or assignments yet.")
        return

    prompt_parts = [
    "You are SmartEdu, an academic assistant integrated into this Learning Management System.",
    "",
    "CRITICAL RULES — follow these exactly:",
    "1. Assignment status MUST come only from the LMS CONTEXT section below.",
    "2. If LMS CONTEXT shows a submission exists for an assignment, that assignment",
    "   is NOT pending — regardless of anything said earlier in this conversation.",
    "3. Never tell a student they have not submitted when a submission record exists.",
    "4. Submission statuses: processing/extracted = submitted and processing,",
    "   ai_evaluated = submitted awaiting review, teacher_reviewed = graded.",
    "5. A submission record means the system accepted the file. Never judge correctness.",
    "6. If conversation history contradicts LMS CONTEXT, always trust LMS CONTEXT.",
    "7. For counts, dates, names, grades — use exact values from LMS CONTEXT only.",
    "8. If information is absent, say so. Never invent facts.",
    "",
]

    if lms_context:
        prompt_parts.append("=== COURSE & LMS INFORMATION ===")
        prompt_parts.append(lms_context)
        prompt_parts.append("")

    if document_chunks:
        prompt_parts.append("=== COURSE MATERIAL (from uploaded lectures) ===")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[Excerpt {i}]: {chunk[:800]}")
        prompt_parts.append("")

    prompt_parts.append(f"STUDENT QUESTION: {question}")
    prompt_parts.append("")
    prompt_parts.append("ANSWER:")

    prompt = "\n".join(prompt_parts)

    stream = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        options={
            "num_predict": 800,
            "num_ctx": 3072,
            "temperature": 0.2,
            "num_thread": os.cpu_count(),
        },
    )

    for chunk in stream:
        token = chunk["message"]["content"]
        if token:
            yield token

        if chunk.get("done") and chunk.get("done_reason") == "length":
            yield "\n\n*(Response cut short — ask a more specific question for a complete answer.)*"