# app/services/intent_classifier.py
"""
Fast rule-based intent classifier for LMS Chatbot.
Replaces slow synchronous LLM calls with ultra-fast pattern and keyword matching.
Categorizes queries into:
  - 'lms': questions about course structure, assignments, grades, deadlines, teacher info, progress
  - 'document': questions about lecture materials, definitions, explanations, slides, concepts
  - 'hybrid': questions combining course/assignment context with lecture material content
  
Runs in < 0.5 ms and defaults to 'hybrid' when uncertain.
"""

import re

# Keyword sets
LMS_KEYWORDS = {
    "assignment", "assignments", "grade", "grades", "score", "scores", "mark", "marks",
    "due", "deadline", "overdue", "pending", "submit", "submitted", "submission", "submissions",
    "teacher", "instructor", "professor", "enrolled", "enrollment", "student", "students",
    "lecture count", "list lectures", "course info", "course description", "rubric", "feedback",
    "status", "progress", "my grade", "my score", "when is", "how many assignments"
}

DOCUMENT_KEYWORDS = {
    "explain", "definition", "define", "what is", "what are", "how does", "how to",
    "concept", "summary", "summarise", "summarize", "chapter", "lecture note", "slides",
    "theory", "formula", "example", "architecture", "algorithm", "process", "difference between",
    "meaning", "overview", "describe", "function"
}

HYBRID_TRIGGERS = [
    r"for (assignment|homework|exam|test|quiz)",
    r"related to (assignment|my grade|lecture)",
    r"which lecture",
    r"study for",
    r"prepare for",
    r"help (me )?with (assignment|homework)",
    r"concept.*assignment",
    r"assignment.*concept"
]


def classify_intent(question: str) -> str:
    """
    Classifies a student's question in < 0.5 ms using pattern matching.
    Returns 'lms', 'document', or 'hybrid'.
    """
    if not question or not question.strip():
        return "hybrid"

    q_lower = question.lower().strip()

    # 1. Check explicitly for explicit hybrid patterns
    for pattern in HYBRID_TRIGGERS:
        if re.search(pattern, q_lower):
            return "hybrid"

    # 2. Score LMS vs Document keywords
    lms_hits = sum(1 for kw in LMS_KEYWORDS if kw in q_lower)
    doc_hits = sum(1 for kw in DOCUMENT_KEYWORDS if kw in q_lower)

    # 3. Decision logic
    if lms_hits > 0 and doc_hits > 0:
        return "hybrid"
    elif lms_hits > 0:
        return "lms"
    elif doc_hits > 0:
        return "document"

    # 4. Fallback to hybrid when uncertain
    return "hybrid"