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

OCR_VLM_ENABLED = os.getenv("OCR_VLM_ENABLED", "true").lower() in ("true", "1", "yes")
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
        if not OCR_VLM_ENABLED:
            logger.info("OCR VLM is disabled (OCR_VLM_ENABLED=false). Using TrOCR-only pipeline.")
            self._available = False
            return

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

    def _transcribe(self, img: Image.Image, prompt: str, max_dim: int) -> str:
        W, H = img.size
        if max(W, H) > max_dim:
            scale = max_dim / float(max(W, H))
            img = img.resize((int(W * scale), int(H * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        client = ollama.Client(host=OLLAMA_HOST, timeout=VLM_TIMEOUT)
        kwargs = dict(
            model=OCR_VLM_MODEL,
            prompt=prompt,
            images=[buf.getvalue()],
            keep_alive="5m",
            options={
                "temperature": 0.0,
                "num_ctx": 8192,
                "num_predict": 2048,
                "repeat_penalty": 1.05,
            },
        )
        try:
            response = client.generate(think=False, **kwargs)
        except TypeError:
            response = client.generate(**kwargs)
        raw = (response.get("response", "") or "").strip()
        raw = re.sub(r"(?s)<think>.*?</think>", "", raw).strip()
        raw = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", raw).strip()
        lines = raw.split("\n")
        if lines and any(p in lines[0].lower() for p in ["transcription", "here is", "transcribed", "text:"]):
            raw = "\n".join(lines[1:]).strip()
        return raw

    def process_page_strips(self, page_image: Image.Image, cuts: list[int], x_range: tuple[int, int] | None = None) -> dict:
        """
        Transcribes the page in horizontal strips (cut at blank inter-line rows)
        so handwriting reaches the VLM at much higher effective resolution.
        """
        if not self.is_available:
            return {"text": "", "success": False, "engine": "vlm"}
        W, H = page_image.size
        x1, x2 = x_range if x_range else (0, W)
        prompt = (
            "This image is a horizontal strip of a handwritten student assignment page. "
            "Transcribe every line of handwriting exactly as written, top to bottom, one output line per written line. "
            "Include headings, names, numbers, symbols and punctuation. Keep the student's spelling. "
            "Do not summarize, translate, correct, explain, or add anything. If a word is unclear, give your best reading. "
            "Output only the transcribed text."
        )
        parts = []
        try:
            for top, bot in zip(cuts[:-1], cuts[1:]):
                if bot - top < 20:
                    continue
                strip = page_image.crop((x1, top, x2, bot))
                txt = self._transcribe(strip, prompt, max_dim=1792)
                if txt:
                    parts.append(txt)
            text = "\n".join(parts).strip()
            logger.info("VLM strip transcription complete (%d strips, %d chars).", len(cuts) - 1, len(text))
            return {"text": text, "success": bool(text), "engine": "vlm"}
        except Exception as exc:
            logger.warning("VLM strip transcription failed: %s. Falling back to full page.", exc)
            return self.process_page_image(page_image)

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
            prompt = (
                "Transcribe this page completely and accurately, line by line. "
                "Output all text exactly as written, including headers, student details, questions, answers, numbers, and bullet points. "
                "Preserve spelling and punctuation. Do NOT summarize, omit, or add words. Output only the transcription."
            )
            cleaned = self._transcribe(page_image, prompt, max_dim=1600)

            logger.info("VLM transcription complete (%d characters).", len(cleaned))
            return {
                "text": cleaned,
                "success": bool(cleaned),
                "engine": "vlm"
            }

        except Exception as exc:
            logger.warning("VLM transcription failed: %s. Falling back to TrOCR.", exc)
            return {"text": "", "success": False, "engine": "vlm"}
