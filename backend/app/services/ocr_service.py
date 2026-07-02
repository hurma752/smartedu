# app/services/ocr_service.py
# This module extracts text from PDF files

import re
import cv2
import numpy as np
from PIL import Image
import pytesseract
import fitz  # This is PyMuPDF — imported as "fitz" for historical reasons

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def preprocess_image_for_ocr(pil_image: Image.Image) -> Image.Image:
    """
    Cleans up a scanned page image before OCR. Helps meaningfully with
    scanned PRINTED text; helps only marginally with true handwriting,
    since the core problem there isn't image noise — it's that Tesseract
    was never trained to recognize handwritten letterforms at all.
    """
    img = np.array(pil_image.convert("L"))  # grayscale

    # Denoise — removes scan artifacts/specks that confuse character matching
    img = cv2.fastNlMeansDenoising(img, h=10)

    # Adaptive thresholding — converts to clean black/white, robust to
    # uneven lighting across a scanned page (much better than a single
    # global threshold for real-world phone-camera scans)
    img = cv2.adaptiveThreshold(
        img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )

    return Image.fromarray(img)


def extract_text_from_pdf(file_path: str) -> dict:
    """
    Returns a dict instead of a bare string:
    {
        "text": str,                  # best-effort extracted text
        "method": "typed" | "ocr",    # how it was extracted
        "confidence": float | None,   # average OCR confidence (0-100), None for typed PDFs
        "low_confidence": bool,       # True if OCR text is likely unreliable
    }
    Callers (rag_service ingestion, evaluation_service) must read .text
    from this rather than treating the return value as a plain string.

    Tesseract config notes:
    - oem 1 = LSTM engine (default, generally best for printed text)
    - psm 6 = "assume a single uniform block of text", which tends to
      perform more consistently than the default psm 3 on scanned
      assignment pages (single column, no complex layout). This is a
      free, zero-dependency tuning step — modest but real improvement
      on handwriting-adjacent and scanned printed text alike.
    """
    TESSERACT_CONFIG = "--oem 1 --psm 6"

    doc = fitz.open(file_path)
    full_text_parts = []
    used_ocr = False
    confidences = []

    for page in doc:
        page_text = page.get_text()

        if page_text.strip():
            full_text_parts.append(page_text)
        else:
            used_ocr = True
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = preprocess_image_for_ocr(img)

            # image_to_data gives per-word confidence, unlike image_to_string
            # which only gives raw text with no quality signal at all
            ocr_data = pytesseract.image_to_data(
                img, config=TESSERACT_CONFIG, output_type=pytesseract.Output.DICT
            )

            page_words = []
            for i, word in enumerate(ocr_data["text"]):
                conf = int(ocr_data["conf"][i])
                if word.strip() and conf > 0:  # conf == -1 means "no text detected" for that box
                    page_words.append(word)
                    confidences.append(conf)

            full_text_parts.append(" ".join(page_words))

    doc.close()

    full_text = "\n\n".join(full_text_parts).strip()
    avg_confidence = sum(confidences) / len(confidences) if confidences else None

    # Threshold chosen empirically: Tesseract confidence below ~40 on
    # average reliably correlates with garbage output in practice —
    # either handwriting it couldn't parse, or a very poor scan
    low_confidence = used_ocr and (avg_confidence is None or avg_confidence < 40)

    return {
        "text": full_text,
        "method": "ocr" if used_ocr else "typed",
        "confidence": avg_confidence,
        "low_confidence": low_confidence,
    }


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

    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

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