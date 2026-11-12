# app/services/ocr_service.py
"""
Facade Module for SmartEdu OCR Service.

Re-exports extract_text_from_pdf, chunk_text, and resolve_pdf_filepath from the
modular app.services.ocr package for backward compatibility.
"""

from app.services.ocr import extract_text_from_pdf, chunk_text, resolve_pdf_filepath

__all__ = ["extract_text_from_pdf", "chunk_text", "resolve_pdf_filepath"]