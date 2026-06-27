# app/services/rag_service.py
"""
Orchestrates: PDF -> text -> chunks -> embeddings -> ChromaDB.
Also updates the Document row's status so the frontend can poll progress
instead of guessing whether a background task finished.
"""
import os
from sqlalchemy.orm import Session
from app.services.ocr_service import extract_text_from_pdf, chunk_text
from app.rag.embeddings import get_embeddings, get_single_embedding
from app.rag.vector_store import add_chunks_to_collection, search_similar_chunks
from app.models.models import Document
from app.config import settings
import ollama


def ingest_document_task(document_id: int, file_path: str, course_id: int, db_session_factory):
    """
    Runs as a FastAPI BackgroundTask. Takes a SESSION FACTORY (not a session)
    because the session that handled the original HTTP request gets closed
    as soon as the response is returned — background tasks need their OWN
    fresh session, opened and closed inside this function.
    """
    db: Session = db_session_factory()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return  # shouldn't happen, but don't crash silently if it does

        raw_text = extract_text_from_pdf(file_path)
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
        document.status = "failed"
        document.error_message = str(e)
        db.commit()
    finally:
        db.close()


def answer_question(question: str, course_id: int) -> dict:
    question_embedding = get_single_embedding(question)
    relevant_chunks = search_similar_chunks(course_id, question_embedding, n_results=3)

    if not relevant_chunks:
        return {"answer": "No course material has been indexed for this course yet.", "sources": []}

    relevant_chunks = [chunk[:1000] for chunk in relevant_chunks]
    context = "\n\n---\n\n".join(relevant_chunks)

    prompt = f"""You are a helpful academic assistant for students.
Answer the student's question using ONLY the course material provided below.
If the answer is not in the provided material, say "I couldn't find information about this in the course material."
Give a complete, well-organized answer. Keep it focused — aim for 3-4 solid paragraphs maximum.
Always finish your answer with a complete sentence; do not leave any thought unfinished.

COURSE MATERIAL:
{context}

STUDENT QUESTION:
{question}

ANSWER:"""

    response = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        options={
            "num_predict": 800,
            "num_ctx": 3072,
            "temperature": 0.3,
            "num_thread": os.cpu_count(),
        },
    )

    answer = response["message"]["content"]

    # done_reason == "length" means Ollama hit num_predict and was forced
    # to stop — as opposed to "stop", which means the model finished
    # naturally. Flag this honestly instead of presenting a cut sentence
    # as if it were the complete answer.
    if response.get("done_reason") == "length":
        answer += "\n\n*(This answer was cut short due to length limits. Ask a follow-up question if you'd like more detail on a specific part.)*"

    return {
        "answer": answer,
        "sources": [chunk[:200] + "..." for chunk in relevant_chunks],
    }

# app/services/rag_service.py — add a streaming variant alongside answer_question
def answer_question_stream(question: str, course_id: int):
    """
    Same retrieval logic as answer_question, but yields tokens as they're
    generated instead of waiting for the full response. This doesn't make
    Ollama generate faster — it changes WHEN the user sees output, which is
    what actually matters for perceived speed.
    """
    question_embedding = get_single_embedding(question)
    relevant_chunks = search_similar_chunks(course_id, question_embedding, n_results=3)

    if not relevant_chunks:
        yield "No course material has been indexed for this course yet."
        return

    relevant_chunks = [chunk[:1000] for chunk in relevant_chunks]
    context = "\n\n---\n\n".join(relevant_chunks)

    prompt = f"""You are a helpful academic assistant for students.
Answer the student's question using ONLY the course material provided below.
If the answer is not in the provided material, say "I couldn't find information about this in the course material."
Give a complete, thorough answer.

COURSE MATERIAL:
{context}

STUDENT QUESTION:
{question}

ANSWER:"""

    stream = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        options={
            "num_predict": 800,
            "num_ctx": 3072,
            "temperature": 0.3,
            "num_thread": os.cpu_count(),
        },
    )

    for chunk in stream:
        token = chunk["message"]["content"]
        if token:
            yield token
        if chunk.get("done") and chunk.get("done_reason") == "length":
            yield "\n\n*(This answer was cut short due to length limits. Ask a follow-up question if you'd like more detail.)*"