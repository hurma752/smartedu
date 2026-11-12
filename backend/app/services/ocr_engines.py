# app/services/ocr_engines.py
"""
Tesseract OCR Engine wrapper for SmartEdu.

Supports TESSERACT_CMD environment variable override (defaulting to standard Windows installation
path or PATH resolution) for fast print probe and fallback recognition.
"""

import os
import shutil
import logging
from PIL import Image
import pytesseract
import numpy as np

logger = logging.getLogger("smartedu.ocr.tesseract")


class TesseractOCREngine:
    def __init__(self):
        tess_cmd = os.getenv("TESSERACT_CMD")
        if not tess_cmd:
            default_win_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
            if os.path.exists(default_win_path):
                tess_cmd = default_win_path
            else:
                tess_cmd = shutil.which("tesseract") or "tesseract"
        pytesseract.pytesseract.tesseract_cmd = tess_cmd

    def process_page(self, image: Image.Image) -> dict:
        """
        Runs Tesseract OCR on a PIL image.

        Returns:
        {
            "text": str,
            "confidence": float (0.0 to 100.0)
        }
        """
        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            confs = []
            for c in data.get("conf", []):
                try:
                    val = float(c)
                    if val >= 0:
                        confs.append(val)
                except (ValueError, TypeError):
                    continue

            mean_conf = float(np.mean(confs)) if confs else 0.0
            text = pytesseract.image_to_string(image)
            return {
                "text": text or "",
                "confidence": mean_conf,
            }
        except Exception as e:
            logger.warning("Tesseract OCR execution error: %s", e)
            return {
                "text": "",
                "confidence": 0.0,
            }
