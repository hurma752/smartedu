# app/services/rag_service.py
"""
Hybrid RAG Service for SmartEdu.
Orchestrates Document Ingestion, Hybrid Retrieval (LMS DB + ChromaDB Vectors),
Lecture Ordinal Resolution (Lecture 1, First Lecture, etc.), Prompt Engineering,
Response Caching, and Streaming with Performance Telemetry.
"""

import os
import re
import time
import json
import ollama
from sqlalchemy.orm import Session

from app.rag.embeddings import get_embeddings, get_single_embedding
from app.rag.vector_store import add_chunks_to_collection, search_similar_chunks
from app.services.lms_context_service import build_lms_context
from app.services.intent_classifier import classify_intent
from app.services.cache_service import response_cache, normalize_query
from app.utils.metrics import PipelineMetrics
from app.models.models import Document
from app.config import settings
from app.services.ocr_service import extract_text_from_pdf, chunk_text


from typing import Optional, Dict, Any, List

SYSTEM_PROMPT = """You are SmartEdu, an AI academic assistant for this LMS course.
RULES & DIRECTIVES:
1. Always maintain conversational continuity with prior chat history.
2. If asked to list, name, or identify lectures (e.g., 'Can you name them?', 'List lecture titles'), provide the exact list of lecture titles from the LMS CONTEXT section.
3. Assignment statuses, due dates, and grades MUST come strictly from LMS CONTEXT.
4. If a user asks about a specific lecture (e.g., 'What is Lecture 1 about?'), use both the LMS CONTEXT and the relevant course material excerpts.
5. Never invent facts or hallucinate lecture names. Be clear, precise, direct, and well-formatted."""

ORDINAL_MAP = {
    "first": 1, "1st": 1, "one": 1, "1": 1, "01": 1,
    "second": 2, "2nd": 2, "two": 2, "2": 2, "02": 2,
    "third": 3, "3rd": 3, "three": 3, "3": 3, "03": 3,
    "fourth": 4, "4th": 4, "four": 4, "4": 4, "04": 4,
    "fifth": 5, "5th": 5, "five": 5, "5": 5, "05": 5,
    "sixth": 6, "6th": 6, "six": 6, "6": 6,
    "seventh": 7, "7th": 7, "seven": 7, "7": 7,
    "eighth": 8, "8th": 8, "eight": 8, "8": 8,
    "ninth": 9, "9th": 9, "nine": 9, "9": 9,
    "tenth": 10, "10th": 10, "ten": 10, "10": 10,
}


def resolve_lecture_ordinal(question: str, course_id: int, db: Session):
    """
    Parses ordinal references like 'Lecture 1', 'first lecture', '2nd lecture', 'latest lecture'
    or topic keywords and maps them to the corresponding Document object ordered by created_at.
    Returns (Document or None, target_index or None).
    """
    if not question:
        return None, None

    q_lower = question.lower().strip()

    documents = db.query(Document).filter(
        Document.course_id == course_id,
        Document.status == "indexed"
    ).order_by(Document.created_at.asc()).all()

    if not documents:
        return None, None

    # Check for "last" or "latest" or "most recent" lecture
    if re.search(r"\b(last|latest|most recent)\s+lecture\b", q_lower) or re.search(r"\blecture\s+(last|latest)\b", q_lower):
        return documents[-1], len(documents)

    target_idx = None

    # Pattern 1: "lecture 1", "lecture #1", "lecture no. 1", "lecture one", "lecture 1st"
    m1 = re.search(r"\blecture\s*(?:#|no\.?|number)?\s*(\d+|0\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b", q_lower)
    if m1:
        val = m1.group(1)
        if val.isdigit():
            target_idx = int(val)
        elif val in ORDINAL_MAP:
            target_idx = ORDINAL_MAP[val]

    # Pattern 2: "first lecture", "1st lecture", "lecture 1st", "second lecture"
    if target_idx is None:
        m2 = re.search(r"\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+lecture\b", q_lower)
        if m2:
            val = m2.group(1)
            target_idx = ORDINAL_MAP.get(val)

    if target_idx is not None:
        if 1 <= target_idx <= len(documents):
            return documents[target_idx - 1], target_idx
        else:
            return None, target_idx

    # Pattern 3: Topic / Title keyword matching e.g. "which lecture discusses Digital Twins?"
    for idx, doc in enumerate(documents, 1):
        filename_clean = doc.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").lower()
        terms = [t for t in filename_clean.split() if len(t) > 3]
        if any(t in q_lower for t in terms):
            return doc, idx

    return None, None


def ingest_document_task(document_id: int, file_path: str, course_id: int, db_session_factory):
    """FastAPI BackgroundTask for PDF text extraction & vector indexing."""
    db: Session = db_session_factory()
    document = None
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return

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
        if document:
            document.status = "failed"
            document.error_message = str(e)
            db.commit()
    finally:
        db.close()


def answer_question(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
) -> dict:
    """Synchronous answer question pipeline with response caching, ordinal resolution, history, and telemetry."""
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)

    # 1. Response Cache Check
    cached_res = response_cache.get((course_id, student_id, norm_q))
    if cached_res is not None and not history:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        res_copy = dict(cached_res)
        res_copy["metrics"] = metrics.to_dict()
        return res_copy

    # 2. Intent Classification
    t0 = time.perf_counter()
    intent = classify_intent(question)
    metrics.mark_intent(time.perf_counter() - t0)

    lms_context = ""
    document_chunks = []
    target_doc = None
    target_idx = None

    # 3. LMS Context Query — Always build for complete course awareness
    t0 = time.perf_counter()
    lms_context = build_lms_context(course_id, student_id, db)
    metrics.mark_lms(time.perf_counter() - t0)

    # 4. Vector Retrieval & Lecture Ordinal Resolution
    if intent in ("document", "hybrid"):
        t0 = time.perf_counter()
        target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
        doc_id_filter = target_doc.id if target_doc else None

        question_embedding = get_single_embedding(question)
        document_chunks = search_similar_chunks(
            course_id=course_id,
            query_embedding=question_embedding,
            n_results=3,
            document_id=doc_id_filter,
        )
        metrics.mark_retrieval(time.perf_counter() - t0)

    # Handle empty context
    if not lms_context and not document_chunks:
        metrics.finish()
        metrics.log(question, intent)
        return {
            "answer": "I don't have enough information to answer that question. "
                      "This course may not have any uploaded materials or assignments yet.",
            "sources": [],
            "intent": intent,
            "metrics": metrics.to_dict(),
        }

    # 5. Prompt Construction with Conversation Memory
    t0 = time.perf_counter()
    prompt_parts = [SYSTEM_PROMPT, ""]

    if lms_context:
        prompt_parts.append(f"LMS CONTEXT:\n{lms_context}\n")

    if target_doc and target_idx:
        prompt_parts.append(f"NOTE: 'Lecture {target_idx}' refers to uploaded file: '{target_doc.filename}'.\n")

    if document_chunks:
        prompt_parts.append("COURSE MATERIAL EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:450]}")
        prompt_parts.append("")

    system_content = "\n".join(prompt_parts)

    ollama_messages = [{"role": "system", "content": system_content}]

    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})

    ollama_messages.append({"role": "user", "content": question})
    metrics.mark_prompt(time.perf_counter() - t0)

    # 6. LLM Inference
    t_llm_start = time.perf_counter()
    response = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=ollama_messages,
        options={
            "num_predict": 400,
            "num_ctx": 2048,
            "temperature": 0.2,
            "num_thread": os.cpu_count(),
        },
    )
    llm_duration = time.perf_counter() - t_llm_start
    metrics.mark_ttft(llm_duration * 0.2)
    metrics.mark_llm_total(llm_duration)
    metrics.finish()

    answer_text = response["message"]["content"]
    sources = [c[:150] + "..." for c in document_chunks]

    result = {
        "answer": answer_text,
        "sources": sources,
        "intent": intent,
        "metrics": metrics.to_dict(),
    }

    if not history:
        response_cache.set((course_id, student_id, norm_q), result, ttl=300)
    metrics.log(question, intent)

    return result


def answer_question_stream(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
):
    """Streaming answer pipeline with ordinal lecture resolution and conversation memory."""
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)

    cached_res = response_cache.get((course_id, student_id, norm_q))
    if cached_res is not None and not history:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        yield cached_res["answer"]
        return

    # Intent
    t0 = time.perf_counter()
    intent = classify_intent(question)
    metrics.mark_intent(time.perf_counter() - t0)

    lms_context = ""
    document_chunks = []
    target_doc = None
    target_idx = None

    # LMS — Always build for complete course awareness
    t0 = time.perf_counter()
    lms_context = build_lms_context(course_id, student_id, db)
    metrics.mark_lms(time.perf_counter() - t0)

    # Retrieval & Ordinal Resolution
    if intent in ("document", "hybrid"):
        t0 = time.perf_counter()
        target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
        doc_id_filter = target_doc.id if target_doc else None

        question_embedding = get_single_embedding(question)
        document_chunks = search_similar_chunks(
            course_id=course_id,
            query_embedding=question_embedding,
            n_results=3,
            document_id=doc_id_filter,
        )
        metrics.mark_retrieval(time.perf_counter() - t0)

    if not lms_context and not document_chunks:
        metrics.finish()
        metrics.log(question, intent)
        yield ("I don't have enough information to answer that question. "
               "This course may not have any uploaded materials or assignments yet.")
        return

    # Prompt
    t0 = time.perf_counter()
    prompt_parts = [SYSTEM_PROMPT, ""]
    if lms_context:
        prompt_parts.append(f"LMS CONTEXT:\n{lms_context}\n")
    if target_doc and target_idx:
        prompt_parts.append(f"NOTE: 'Lecture {target_idx}' refers to uploaded file: '{target_doc.filename}'.\n")
    if document_chunks:
        prompt_parts.append("COURSE MATERIAL EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:450]}")
        prompt_parts.append("")

    system_content = "\n".join(prompt_parts)

    ollama_messages = [{"role": "system", "content": system_content}]

    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})

    ollama_messages.append({"role": "user", "content": question})
    metrics.mark_prompt(time.perf_counter() - t0)

    # Stream Generation
    t_llm_start = time.perf_counter()
    stream = ollama.chat(
        model=settings.OLLAMA_MODEL,
        messages=ollama_messages,
        stream=True,
        options={
            "num_predict": 400,
            "num_ctx": 2048,
            "temperature": 0.2,
            "num_thread": os.cpu_count(),
        },
    )

    full_text = []
    first_token_received = False

    for chunk in stream:
        token = chunk["message"]["content"]
        if token:
            if not first_token_received:
                first_token_received = True
                metrics.mark_ttft(time.perf_counter() - t_llm_start)
            full_text.append(token)
            yield token

        if chunk.get("done") and chunk.get("done_reason") == "length":
            cutoff_msg = "\n\n*(Response cut short — ask a more specific question for a complete answer.)*"
            full_text.append(cutoff_msg)
            yield cutoff_msg

    llm_duration = time.perf_counter() - t_llm_start
    metrics.mark_llm_total(llm_duration)
    metrics.finish()
    metrics.log(question, intent)

    full_answer = "".join(full_text)
    sources = [c[:150] + "..." for c in document_chunks]
    result_obj = {
        "answer": full_answer,
        "sources": sources,
        "intent": intent,
        "metrics": metrics.to_dict(),
    }
    if not history:
        response_cache.set((course_id, student_id, norm_q), result_obj, ttl=300)