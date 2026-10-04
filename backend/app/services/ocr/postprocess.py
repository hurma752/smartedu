# app/services/ocr/postprocess.py
"""
Shared Postprocessing & Hallucination Filtering Module for SmartEdu OCR.

Strips mobile scanner watermarks, date-grid headers, runs of digits/zeros,
low-alpha symbol lines, and Wikipedia hallucination blacklist phrases.
Normalizes whitespace and hyphenated line breaks.
Preserves student spelling, grammar, and original wording without paraphrasing.
"""

import re
import logging

logger = logging.getLogger("smartedu.ocr.postprocess")

HALLUCINATION_BLACKLIST = [
    r"(?i)\bwhat links here\b",
    r"(?i)\brelated changes\b",
    r"(?i)\bupload file\b",
    r"(?i)\bspecial pages\b",
    r"(?i)\bpermanent link\b",
    r"(?i)\bpage information\b",
    r"(?i)\bcite this page\b",
    r"(?i)\bwikidata item\b",
    r"(?i)\bdisplaystyle\b",
    r"(?i)\bdeutscher richard\b",
    r"(?i)\bthe new zealand parliament\b",
    r"(?i)\bthe new zealand government\b",
    r"(?i)\bnot to be confused with\b",
    r"(?i)\bamerican politician\b",
    r"(?i)\bfrom wikipedia\b",
    r"(?i)\bfree encyclopedia\b",
]

WATERMARK_PATTERNS = [
    r"(?i)\b(camscanner|scanned by|scanned with|adobe scan|tapscanner|docscanner|genius scan|fastscanner)\b.*",
    r"(?i)\bdate\s*[/:\-_]?\s*(?:[mtwfss]\s*){3,}.*",
    r"(?i)^[\s/|\-_]*date[\s/|\-_]*[mtwfss\s/|\-_]*$",
    r"(?i)\bpage\s+\d+(\s+of\s+\d+)?\b",
]


def clean_line_text(line: str) -> str:
    """
    Cleans a single line of text: strips watermarks, normalizes spaces.
    Returns empty string if line matches hallucination or watermark patterns.
    """
    if not line:
        return ""

    text = line.strip()

    # Check hallucination blacklist
    for pattern in HALLUCINATION_BLACKLIST:
        if re.search(pattern, text):
            logger.debug("Filtered hallucination line: %r", text)
            return ""

    # Check scanner watermarks
    for pattern in WATERMARK_PATTERNS:
        text = re.sub(pattern, "", text).strip()

    # Filter lines with runs of zero digits like "000000" or ".000 # 1.000"
    if re.search(r"0{4,}", text) or re.search(r"^[\d\.\s#\-_:\+=]{4,}$", text):
        return ""

    # Filter lines with < 30% alphabetic characters (except short math or lists like "1. A)")
    if len(text) > 4:
        alpha_count = sum(1 for c in text if c.isalpha())
        if (alpha_count / float(len(text))) < 0.30:
            return ""

    # Normalize inner multiple spaces
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def clean_academic_text(text: str) -> str:
    """
    Cleans multi-line extracted OCR text while preserving paragraph structure,
    headings, and bullet lists. Normalizes hyphenated line breaks.
    """
    if not text:
        return ""

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")

    # Rejoin hyphenated line breaks e.g. "structu-\nral" -> "structural"
    normalized = re.sub(r"(\b[a-zA-Z]{2,})-\s*\n\s*([a-zA-Z]{2,}\b)", r"\1\2", normalized)

    lines = normalized.split("\n")
    cleaned_lines = []
    prev_line = None

    for line in lines:
        cleaned = clean_line_text(line)

        # Deduplicate identical consecutive lines
        if cleaned and cleaned == prev_line:
            continue

        if cleaned:
            cleaned_lines.append(cleaned)
            prev_line = cleaned
        elif cleaned_lines and cleaned_lines[-1] != "":
            # Keep a blank line for section breaks
            cleaned_lines.append("")
            prev_line = ""

    result = "\n".join(cleaned_lines).strip()
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result
