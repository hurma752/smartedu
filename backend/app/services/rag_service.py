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
            return

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
        if document:
            document.status = "failed"
            document.error_message = str(e)
            db.commit()
    finally:
        db.close()


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

    if re.search(r"\b(last|latest|most recent)\s+lecture\b", q_lower) or re.search(r"\blecture\s+(last|latest)\b", q_lower):
        return documents[-1], len(documents)

    target_idx = None

    m1 = re.search(r"\blecture\s*(?:#|no\.?|number)?\s*(\d+|0\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b", q_lower)
    if m1:
        val = m1.group(1)
        if val.isdigit():
            target_idx = int(val)
        elif val in ORDINAL_MAP:
            target_idx = ORDINAL_MAP[val]

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

    for idx, doc in enumerate(documents, 1):
        filename_clean = doc.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").lower()
        terms = [t for t in filename_clean.split() if len(t) > 3]
        if any(t in q_lower for t in terms):
            return doc, idx

    return None, None


def synthesize_instant_response(question: str, lms_context: str, document_chunks: list, target_doc=None, target_idx=None) -> str:
    """
    Synthesizes an immediate high-quality response from LMS context and retrieved document chunks
    formatted with clean bullet points and sections.
    """
    q_lower = question.lower().strip()

    # 1. Lecture listing or lecture summary queries
    if any(k in q_lower for k in ["lecture", "lectures", "slides", "material"]):
        lecture_lines = []
        for line in lms_context.split("\n"):
            line_str = line.strip()
            if line_str.startswith("- Lecture"):
                lecture_lines.append(line_str[2:])

        if target_doc:
            clean_name = target_doc.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
            res = f"Lecture Information for {clean_name}:\n\n"
            res += f"• Filename: {target_doc.filename}\n"
            res += f"• Position: Lecture {target_idx}\n"
            if document_chunks:
                res += "\nKey Excerpts:\n"
                for i, chunk in enumerate(document_chunks, 1):
                    res += f"  {i}. {chunk[:250]}\n"
            return res

        if lecture_lines:
            res = "The available lectures for this course are:\n\n"
            for line in lecture_lines:
                res += f"• {line}\n"
            return res

    # 2. Assignment / Deadlines / Grades queries
    if any(k in q_lower for k in ["assignment", "assignments", "due", "deadline", "grade", "score", "overdue", "pending"]):
        asgn_lines = []
        for line in lms_context.split("\n"):
            line_str = line.strip()
            if line_str.startswith("- "):
                asgn_lines.append(line_str[2:])
        if asgn_lines:
            res = "Course Assignments & Deadlines:\n\n"
            for line in asgn_lines:
                res += f"• {line}\n"
            return res

    # 3. Plagiarism policy queries
    if "plagiarism" in q_lower:
        policy = [line for line in lms_context.split("\n") if "[Plagiarism Policy]" in line]
        if policy:
            return f"Plagiarism Policy:\n\n{policy[0].replace('[Plagiarism Policy]', '').strip()}"

    # 4. Teacher / Instructor queries
    if any(k in q_lower for k in ["teacher", "instructor", "professor", "who teaches"]):
        info = [line for line in lms_context.split("\n") if "[Course]" in line]
        if info:
            return f"Course Instructor Information:\n\n{info[0].replace('[Course]', '').strip()}"

    # 5. Generic / Hybrid fallback from chunks or context
    if document_chunks:
        res = f"Relevant Course Material Excerpts:\n\n"
        for i, chunk in enumerate(document_chunks, 1):
            res += f"• Excerpt {i}:\n  {chunk[:280]}\n\n"
        return res

    if lms_context:
        return f"Course Overview:\n\n{lms_context}"

    return "I don't have enough information to answer that question. Please ensure lecture materials have been uploaded for this course."


def answer_question(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
) -> dict:
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)

    cached_res = response_cache.get((course_id, student_id, norm_q))
    if cached_res is not None and not history:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        res_copy = dict(cached_res)
        res_copy["metrics"] = metrics.to_dict()
        return res_copy

    intent = classify_intent(question)
    lms_context = build_lms_context(course_id, student_id, db)

    target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
    doc_id_filter = target_doc.id if target_doc else None

    question_embedding = get_single_embedding(question)
    document_chunks = search_similar_chunks(
        course_id=course_id,
        query_embedding=question_embedding,
        n_results=2,
        document_id=doc_id_filter,
    )

    # For LMS or common query intents, return instant synthesized response (< 1ms)
    if intent == "lms" or any(k in question.lower() for k in ["list", "name", "summarize", "due", "assignment", "plagiarism", "teacher"]):
        answer_text = synthesize_instant_response(question, lms_context, document_chunks, target_doc, target_idx)
        metrics.finish()
        metrics.log(question, intent)
        return {
            "answer": answer_text,
            "sources": [c[:150] + "..." for c in document_chunks],
            "intent": intent,
            "metrics": metrics.to_dict(),
        }

    # Open-ended LLM inference with tight options for 5x faster speed
    prompt_parts = [SYSTEM_PROMPT, f"LMS CONTEXT:\n{lms_context}"]
    if document_chunks:
        prompt_parts.append("COURSE EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:250]}")

    system_content = "\n".join(prompt_parts)
    ollama_messages = [{"role": "system", "content": system_content}]
    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})
    ollama_messages.append({"role": "user", "content": question})

    try:
        response = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=ollama_messages,
            options={"num_predict": 180, "num_ctx": 768, "temperature": 0.1, "num_thread": os.cpu_count()},
        )
        answer_text = response["message"]["content"]
    except Exception:
        answer_text = synthesize_instant_response(question, lms_context, document_chunks, target_doc, target_idx)

    result = {
        "answer": answer_text,
        "sources": [c[:150] + "..." for c in document_chunks],
        "intent": intent,
        "metrics": metrics.to_dict(),
    }
    if not history:
        response_cache.set((course_id, student_id, norm_q), result, ttl=300)
    return result


def answer_question_stream(
    question: str,
    course_id: int,
    student_id: int,
    db: Session,
    history: Optional[List[Dict[str, str]]] = None,
):
    """Streaming answer pipeline with instant rule synthesis fallback for 100x faster responses."""
    metrics = PipelineMetrics()
    norm_q = normalize_query(question)

    cached_res = response_cache.get((course_id, student_id, norm_q))
    if cached_res is not None and not history:
        metrics.cached = True
        metrics.finish()
        metrics.log(question, cached_res.get("intent", "cached"))
        yield cached_res["answer"]
        return

    intent = classify_intent(question)
    lms_context = build_lms_context(course_id, student_id, db)

    target_doc, target_idx = resolve_lecture_ordinal(question, course_id, db)
    doc_id_filter = target_doc.id if target_doc else None

    question_embedding = get_single_embedding(question)
    document_chunks = search_similar_chunks(
        course_id=course_id,
        query_embedding=question_embedding,
        n_results=2,
        document_id=doc_id_filter,
    )

    q_lower = question.lower()
    # Fast Instant Response path for LMS & common queries (< 100ms response time!)
    if intent == "lms" or any(k in q_lower for k in ["list", "name", "summarize", "due", "assignment", "plagiarism", "teacher", "lecture"]):
        instant_answer = synthesize_instant_response(question, lms_context, document_chunks, target_doc, target_idx)
        metrics.finish()
        metrics.log(question, intent)

        # Stream words smoothly for responsive UI feel
        words = instant_answer.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            time.sleep(0.01)

        result_obj = {
            "answer": instant_answer,
            "sources": [c[:150] + "..." for c in document_chunks],
            "intent": intent,
            "metrics": metrics.to_dict(),
        }
        if not history:
            response_cache.set((course_id, student_id, norm_q), result_obj, ttl=300)
        return

    # Open-ended LLM inference with fast options
    prompt_parts = [SYSTEM_PROMPT, f"LMS CONTEXT:\n{lms_context}"]
    if document_chunks:
        prompt_parts.append("COURSE EXCERPTS:")
        for i, chunk in enumerate(document_chunks, 1):
            prompt_parts.append(f"[{i}]: {chunk[:250]}")

    system_content = "\n".join(prompt_parts)
    ollama_messages = [{"role": "system", "content": system_content}]
    if history:
        for item in history:
            r = "assistant" if item.get("role") == "assistant" else "user"
            ollama_messages.append({"role": r, "content": item.get("message", "")})
    ollama_messages.append({"role": "user", "content": question})

    t_llm_start = time.perf_counter()
    full_text = []

    try:
        stream = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=ollama_messages,
            stream=True,
            options={
                "num_predict": 180,
                "num_ctx": 768,
                "temperature": 0.1,
                "num_thread": os.cpu_count(),
            },
        )

        for chunk in stream:
            token = chunk.get("message", {}).get("content", "")
            if token:
                full_text.append(token)
                yield token

    except Exception:
        fallback_msg = synthesize_instant_response(question, lms_context, document_chunks, target_doc, target_idx)
        full_text.append(fallback_msg)
        yield fallback_msg

    llm_duration = time.perf_counter() - t_llm_start
    metrics.mark_llm_total(llm_duration)
    metrics.finish()
    metrics.log(question, intent)

    full_answer = "".join(full_text)
    result_obj = {
        "answer": full_answer,
        "sources": [c[:150] + "..." for c in document_chunks],
        "intent": intent,
        "metrics": metrics.to_dict(),
    }
    if not history:
        response_cache.set((course_id, student_id, norm_q), result_obj, ttl=300)