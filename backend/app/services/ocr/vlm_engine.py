# app/services/ocr/vlm_engine.py
"""
Ollama VLM (Vision Language Model) Engine for SmartEdu OCR.

Supports:
- Models: OCR_VLM_MODEL (default 'qwen3-vl:4b', allow 'qwen3-vl:8b')
- Documented environment: OLLAMA_MAX_LOADED_MODELS=1
- Ollama version check >= 0.12.7
- Exact transcription prompt with temperature=0, num_ctx=8192, keep_alive="5m"
- HTTP client timeout >= 300 seconds (5 minutes)
- Automatic image scaling (max dimension 1600px)
- Graceful try/except fallback to TrOCR-only if Ollama or VLM model is unavailable
"""

import os
import io
import re
import logging
from PIL import Image
import httpx
import ollama

logger = logging.getLogger("smartedu.ocr.vlm")

# Default model: qwen3-vl:4b (supports qwen3-vl:8b as well)
OCR_VLM_MODEL = os.getenv("OCR_VLM_MODEL", "qwen3-vl:4b").lower()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
VLM_TIMEOUT = float(os.getenv("VLM_TIMEOUT", "300.0"))  # 5 minutes minimum


def parse_version_tuple(ver_str: str) -> tuple[int, ...]:
    """Extract numeric components from version string e.g. '0.12.7' -> (0, 12, 7)."""
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", ver_str or "")
    if match:
        g1, g2, g3 = match.groups()
        return (int(g1), int(g2), int(g3 or 0))
    return (0, 0, 0)


class VLMEngine:
    _instance = None
    _available = None
    _ollama_version = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VLMEngine, cls).__new__(cls)
            cls._instance._check_availability()
        return cls._instance

    def _check_availability(self):
        try:
            logger.info("Checking Ollama server and VLM model '%s' at %s...", OCR_VLM_MODEL, OLLAMA_HOST)
            client = ollama.Client(host=OLLAMA_HOST, timeout=10.0)

            # 1. Check Ollama Version (Requirement >= 0.12.7)
            try:
                ver_resp = httpx.get(f"{OLLAMA_HOST}/api/version", timeout=5.0).json()
                ver_str = ver_resp.get("version", "0.0.0")
                self._ollama_version = ver_str
                ver_tuple = parse_version_tuple(ver_str)
                if ver_tuple < (0, 12, 7):
                    logger.warning(
                        "Ollama version is %s, which is below recommended 0.12.7 for VLM vision handling.",
                        ver_str
                    )
                else:
                    logger.info("Ollama version %s verified.", ver_str)
            except Exception as ver_err:
                logger.debug("Could not verify Ollama version endpoint: %s", ver_err)

            # 2. Check installed model list
            models_list = client.list()

            available_names = []
            if hasattr(models_list, "models"):
                available_names = [m.model for m in models_list.models if hasattr(m, "model")]
            elif isinstance(models_list, dict):
                available_names = [m.get("name") or m.get("model") for m in models_list.get("models", [])]

            matching = [n for n in available_names if n and OCR_VLM_MODEL in n.lower()]
            if matching:
                self._available = True
                logger.info("VLM model '%s' verified in Ollama.", OCR_VLM_MODEL)
            else:
                logger.warning(
                    "VLM model '%s' not found in Ollama installed models: %s. Pipeline will fall back to TrOCR-only.",
                    OCR_VLM_MODEL, available_names
                )
                self._available = False
        except Exception as exc:
            logger.warning("Ollama VLM check failed: %s. Pipeline will fall back to TrOCR-only.", exc)
            self._available = False

    @property
    def is_available(self) -> bool:
        if self._available is None:
            self._check_availability()
        return self._available is True

    def process_page_image(self, page_image: Image.Image) -> dict:
        """
        Sends cleaned page image to Ollama VLM for exact transcription.

        Returns:
        {
            "text": str,
            "success": bool,
            "engine": "vlm"
        }
        """
        if not self.is_available:
            return {"text": "", "success": False, "engine": "vlm"}

        try:
            # Resize image to cap max dimension at ~1600px for optimal VLM tokenization
            W, H = page_image.size
            max_dim = 1600
            if max(W, H) > max_dim:
                scale = max_dim / float(max(W, H))
                new_size = (int(W * scale), int(H * scale))
                img_to_send = page_image.resize(new_size, Image.Resampling.LANCZOS)
            else:
                img_to_send = page_image

            # Convert image to PNG bytes
            img_buffer = io.BytesIO()
            img_to_send.save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()

            prompt = (
                "Transcribe this handwritten page exactly as written, line by line. "
                "Preserve spelling mistakes and punctuation. Do NOT correct, summarise, or add words. "
                "Write [illegible] for unreadable words. Output only the transcription."
            )

            client = ollama.Client(host=OLLAMA_HOST, timeout=VLM_TIMEOUT)
            response = client.generate(
                model=OCR_VLM_MODEL,
                prompt=prompt,
                images=[img_bytes],
                options={
                    "temperature": 0.0,
                    "num_ctx": 8192,
                    "keep_alive": "5m",
                }
            )

            raw_response = response.get("response", "").strip()

            # Strip common model preambles like "Here is the transcription:"
            cleaned = raw_response
            lines = cleaned.split("\n")
            if lines and any(p in lines[0].lower() for p in ["transcription", "here is", "transcribed", "text:"]):
                cleaned = "\n".join(lines[1:]).strip()

            logger.info("VLM transcription complete (%d characters).", len(cleaned))
            return {
                "text": cleaned,
                "success": bool(cleaned),
                "engine": "vlm"
            }

        except Exception as exc:
            logger.warning("VLM transcription failed: %s. Falling back to TrOCR.", exc)
            return {"text": "", "success": False, "engine": "vlm"}
