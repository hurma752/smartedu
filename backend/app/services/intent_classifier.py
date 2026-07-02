# app/services/intent_classifier.py
"""
LLM-based intent classifier — replaces the brittle regex approach.
Uses Ollama with num_predict=3 to get a single-letter classification
(L, R, or H), which is fast and handles any question phrasing naturally.
Falls back to 'hybrid' on any error so we never silently drop context.
"""

import ollama
from app.config import settings

CLASSIFICATION_PROMPT = """You are a routing classifier for an LMS chatbot.
Classify the student's question into exactly one category:

L = LMS question (needs database: enrollments, assignments, grades, deadlines,
    submission status, teacher info, course structure, student progress, rubric scores,
    how many lectures, list assignments, who is teaching, enrollment count, scores)

R = RAG question (needs lecture document content: concepts, definitions,
    explanations, summaries of uploaded materials, examples from lecture notes)

H = Hybrid question (needs BOTH database AND document content, e.g. which
    lecture to study for an assignment, concepts needed to complete pending work,
    summarize lectures related to my assignments)

Rules:
- Questions about COUNTS, LISTS, DEADLINES, SUBMISSIONS, GRADES, NAMES → L
- Questions about EXPLAINING CONCEPTS, CONTENT FROM NOTES, DEFINITIONS → R
- Questions combining LMS structure WITH content understanding → H
- When genuinely unsure, choose H

Respond with ONLY the single letter: L, R, or H

Question: {question}
Category:"""


def classify_intent(question: str) -> str:
    """
    Returns 'lms', 'document', or 'hybrid'.
    Uses a fast Ollama call with num_predict=3 for near-instant classification.
    """
    try:
        response = ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[{
                "role": "user",
                "content": CLASSIFICATION_PROMPT.format(question=question)
            }],
            options={
                "num_predict": 3,
                "temperature": 0,
                "num_ctx": 512,
            },
        )
        result = response["message"]["content"].strip().upper()

        for char in result:
            if char == "L":
                return "lms"
            if char == "R":
                return "document"
            if char == "H":
                return "hybrid"

        return "hybrid"

    except Exception as e:
        print(f"[Classifier] Error: {e} — defaulting to hybrid")
        return "hybrid"