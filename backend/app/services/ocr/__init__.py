# app/services/ocr/__init__.py
"""
SmartEdu OCR Package Initializer.

Exports core functions:
- extract_text_from_pdf
- chunk_text
- resolve_pdf_filepath
"""

import re
from app.services.ocr.router import process_pdf_document as extract_text_from_pdf, resolve_pdf_filepath


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    """
    Sentence-aware chunking instead of blind character slicing.
    """
    if not text or not text.strip():
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text.strip())

    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        sentence_len = len(sentence)

        if current_length + sentence_len > chunk_size and current_chunk:
            chunks.append(" ".join(current_chunk))

            overlap_sentences = []
            overlap_len = 0
            for s in reversed(current_chunk):
                if overlap_len + len(s) > overlap:
                    break
                overlap_sentences.insert(0, s)
                overlap_len += len(s)

            current_chunk = overlap_sentences
            current_length = overlap_len

        current_chunk.append(sentence)
        current_length += sentence_len

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


__all__ = ["extract_text_from_pdf", "chunk_text", "resolve_pdf_filepath"]
