# app/services/ocr/trocr_engine.py
"""
TrOCR Line-Crop Recognition Engine for SmartEdu OCR.

Uses HuggingFace VisionEncoderDecoderModel with beam search generation:
- Model: TROCR_MODEL (default 'microsoft/trocr-large-handwritten', fallback 'microsoft/trocr-base-handwritten')
- Generation: num_beams=4, max_new_tokens=64, early_stopping=True
- Length-normalized beam confidence: exp(sequences_scores[0]) * 100
- Drops low-confidence lines below TROCR_LINE_MIN_CONF (default 35)
"""

import os
import math
import logging
from PIL import Image
import numpy as np

logger = logging.getLogger("smartedu.ocr.trocr")

TROCR_MODEL_NAME = os.getenv("TROCR_MODEL", "microsoft/trocr-large-handwritten")
TROCR_FALLBACK_MODEL = "microsoft/trocr-base-handwritten"
TROCR_LINE_MIN_CONF = float(os.getenv("TROCR_LINE_MIN_CONF", "35.0"))


class TrOCREngine:
    _instance = None
    _processor = None
    _model = None
    _loaded_model_name = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TrOCREngine, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        torch.set_num_threads(max(1, (os.cpu_count() or 4) // 2))

        for model_name in [TROCR_MODEL_NAME, TROCR_FALLBACK_MODEL]:
            try:
                logger.info("Loading TrOCR model '%s'...", model_name)
                self._processor = TrOCRProcessor.from_pretrained(model_name)
                self._model = VisionEncoderDecoderModel.from_pretrained(model_name)
                self._model.eval()
                self._loaded_model_name = model_name
                logger.info("TrOCR model '%s' loaded successfully.", model_name)
                break
            except Exception as exc:
                logger.warning("Failed to load TrOCR model '%s': %s", model_name, exc)

    @property
    def is_available(self) -> bool:
        return self._model is not None and self._processor is not None

    @property
    def model_name(self) -> str:
        return self._loaded_model_name or "trocr"

    def recognize_line(self, crop_image: Image.Image) -> tuple[str, float]:
        """
        Runs TrOCR beam search inference on a single line crop image.
        Returns (text, conf_percentage_0_100).
        """
        import torch

        if not self.is_available:
            return "", 0.0

        try:
            rgb = crop_image.convert("RGB")
            pixel_values = self._processor(images=rgb, return_tensors="pt").pixel_values

            with torch.no_grad():
                out = self._model.generate(
                    pixel_values,
                    num_beams=4,
                    max_new_tokens=64,
                    early_stopping=True,
                    output_scores=True,
                    return_dict_in_generate=True,
                )

            sequences = out.sequences
            raw_text = self._processor.batch_decode(sequences, skip_special_tokens=True)[0].strip()

            # Calculate length-normalized confidence from beam sequences_scores
            conf = 50.0
            if hasattr(out, "sequences_scores") and out.sequences_scores is not None and len(out.sequences_scores) > 0:
                log_prob = float(out.sequences_scores[0].item())
                conf = math.exp(log_prob) * 100.0
                conf = min(100.0, max(0.0, conf))

            # Drop lines below TROCR_LINE_MIN_CONF threshold
            if conf < TROCR_LINE_MIN_CONF:
                logger.debug("Dropped TrOCR line with low beam conf (%.1f%% < %.1f%%): %r", conf, TROCR_LINE_MIN_CONF, raw_text)
                return "", conf

            return raw_text, conf

        except Exception as exc:
            logger.warning("TrOCR line recognition error: %s", exc)
            return "", 0.0

    def process_page_lines(self, line_crops: list[tuple[Image.Image, tuple[int, int, int, int]]]) -> dict:
        """
        Processes list of (crop_pil, bbox) line crops and returns page transcription.
        """
        recognized_lines = []
        confs = []

        for crop, bbox in line_crops:
            text, conf = self.recognize_line(crop)
            if text and text.strip():
                recognized_lines.append(text.strip())
                confs.append(conf)

        page_text = "\n".join(recognized_lines)
        avg_conf = float(np.mean(confs)) if confs else 0.0

        return {
            "text": page_text,
            "confidence": avg_conf,
            "line_count": len(recognized_lines),
            "lines": recognized_lines,
            "engine": "trocr"
        }
