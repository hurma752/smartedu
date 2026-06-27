# app/services/ocr_service.py
# This module extracts text from PDF files

import fitz  # This is PyMuPDF — imported as "fitz" for historical reasons
import re
def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file.
    
    Strategy:
    1. Try to extract text directly (works for typed/digital PDFs perfectly)
    2. If a page has no text (scanned image), we skip it for now
       (Tesseract OCR for scanned PDFs is Phase 2 of this module)
    
    Returns: full extracted text as a single string
    """
    try:
        doc = fitz.open(file_path)
        full_text = []
        
        for page_num, page in enumerate(doc):
            # get_text() extracts text from a digital PDF page
            # Returns empty string if page is a scanned image
            page_text = page.get_text()
            
            if page_text.strip():
                # Page has text (typed PDF)
                full_text.append(f"[Page {page_num + 1}]\n{page_text}")
            else:
                # Page has no extractable text (scanned)
                # For now, note this and skip
                full_text.append(f"[Page {page_num + 1}: scanned image - text extraction not available]")
        
        doc.close()
        return "\n\n".join(full_text)
    
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    """
    Sentence-aware chunking instead of blind character slicing.

    The old version cut text at exact character N regardless of whether
    that fell mid-sentence — e.g. "...the kernel manages mem" | "ory
    allocation by..." Splitting mid-sentence damages embedding quality
    (the chunk's meaning is incomplete) AND damages the LLM's ability to
    use it as context (it's reading a fragment).

    Strategy: split into sentences first, then group sentences together
    until we approach chunk_size, never cutting a sentence in half.
    """
    if not text.strip():
        return []

    # Split on sentence boundaries (. ! ?) followed by whitespace.
    # Not perfect (abbreviations like "Dr." will mis-split occasionally)
    # but far better than character-count slicing for FYP purposes.
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks = []
    current_chunk = []
    current_length = 0

    for sentence in sentences:
        sentence_len = len(sentence)

        if current_length + sentence_len > chunk_size and current_chunk:
            # Current chunk is full — save it and start a new one
            chunks.append(" ".join(current_chunk))

            # Build overlap: carry the last sentence(s) into the next chunk
            # so context isn't lost at the boundary
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