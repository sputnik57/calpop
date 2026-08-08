import base64
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import httpx
from google.cloud import vision
from google.oauth2 import service_account

from config import get_settings

settings = get_settings()

# Instructs the local vision model to transcribe rather than describe the image,
# and to self-report a legibility confidence since Ollama has no native score.
OLLAMA_OCR_PROMPT = (
    "You are transcribing a scanned handwritten or printed letter/envelope for a prisoner "
    "correspondence program. Read every line of text in the image exactly as written, "
    "preserving line breaks. Do not summarize, translate, or correct spelling/grammar. "
    "If a word is illegible, write [illegible] in its place.\n\n"
    "Respond with ONLY a JSON object of this form, no other text:\n"
    '{"text": "<full transcription>", "confidence": <number from 0.0 to 1.0 reflecting how '
    'certain you are of the transcription overall>}'
)


class OCRService:
    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        if settings.ocr_provider == "google_vision":
            try:
                # 1. Check for Raw JSON String
                if settings.google_vision_credentials_json:
                    try:
                        info = json.loads(settings.google_vision_credentials_json)
                        creds = service_account.Credentials.from_service_account_info(info)
                        self.client = vision.ImageAnnotatorClient(credentials=creds)
                        print("SUCCESS: Initialized Google Vision client from JSON string.")
                    except Exception as json_err:
                        print(f"ERROR: Failed to parse GOOGLE_VISION_CREDENTIALS_JSON: {json_err}")
                
                # 2. If path is provided in settings/env
                if not self.client and settings.google_vision_credentials_path and Path(settings.google_vision_credentials_path).exists():
                    creds = service_account.Credentials.from_service_account_file(
                        str(settings.google_vision_credentials_path)
                    )
                    self.client = vision.ImageAnnotatorClient(credentials=creds)
                
                # 3. Otherwise, fallback to default environment variable GOOGLE_APPLICATION_CREDENTIALS
                elif not self.client and os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                     self.client = vision.ImageAnnotatorClient()
                
                if not self.client:
                    print("WARNING: Google Vision credentials not found. OCR will fail if attempted.")
            except Exception as e:
                print(f"ERROR: Failed to initialize Google Vision client: {e}")

    def process_image(self, image_content: bytes) -> Tuple[str, float, Dict[str, Any]]:
        """
        Process an image (bytes) and return (text, confidence, raw_blocks).
        """
        # Local provider: fully offline OCR via a local Ollama vision-language model.
        if settings.ocr_provider == "local":
            return self._process_image_ollama(image_content)

        if not self.client:
            return "OCR Client not initialized (Check Credentials)", 0.0, {}

        image = vision.Image(content=image_content)
        
        # Use DOCUMENT_TEXT_DETECTION for handwriting/letters
        response = self.client.document_text_detection(image=image)
        
        if response.error.message:
            raise Exception(f"Google Vision API Error: {response.error.message}")

        text = response.full_text_annotation.text
        
        # Calculate a rough confidence score (avg of page confidence)
        confidence = 0.0
        if response.full_text_annotation.pages:
            # Simple avg of block confidences for the first page
            page = response.full_text_annotation.pages[0]
            block_confs = [block.confidence for block in page.blocks]
            if block_confs:
                confidence = sum(block_confs) / len(block_confs)

        # Convert simple blocks to dict for storage (JSON serialization)
        # This is a simplified extraction, you might want more detail for reconstruction
        blocks_data = []
        for page in response.full_text_annotation.pages:
            for block in page.blocks:
                block_text = ""
                for paragraph in block.paragraphs:
                    for word in paragraph.words:
                        for symbol in word.symbols:
                            block_text += symbol.text
                            if symbol.property.detected_break.type_:
                                block_text += " "
                
                blocks_data.append({
                    "text": block_text.strip(),
                    "confidence": block.confidence,
                    "box": [(v.x, v.y) for v in block.bounding_box.vertices]
                })

        return text, confidence, {"blocks": blocks_data}

    def _process_image_ollama(self, image_content: bytes) -> Tuple[str, float, Dict[str, Any]]:
        """OCR via a local Ollama vision-language model (e.g. qwen2.5vl). Never leaves the machine."""
        image_b64 = base64.b64encode(image_content).decode("ascii")
        payload = {
            "model": settings.ollama_vision_model,
            "prompt": OLLAMA_OCR_PROMPT,
            "images": [image_b64],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.0},
        }
        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"

        try:
            resp = httpx.post(url, json=payload, timeout=settings.ollama_timeout_seconds)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            error_text = (
                f"Local OCR error: could not reach Ollama at {settings.ollama_base_url} "
                f"(model={settings.ollama_vision_model}): {e}"
            )
            return error_text, 0.0, {"provider": "ollama", "error": error_text}

        raw_response = resp.json().get("response", "")
        text = raw_response
        confidence = 0.5  # neutral default if the model doesn't return the requested JSON shape
        self_reported = False

        try:
            parsed = json.loads(raw_response)
            text = parsed.get("text", raw_response)
            conf_val = parsed.get("confidence")
            if isinstance(conf_val, (int, float)):
                confidence = max(0.0, min(1.0, float(conf_val)))
                self_reported = True
        except (json.JSONDecodeError, TypeError):
            # Model didn't return valid JSON; fall back to the raw text with a neutral confidence
            pass

        return text, confidence, {
            "provider": "ollama",
            "model": settings.ollama_vision_model,
            # Unlike Google Vision's per-block confidence, this is the model's own self-assessment,
            # not a calibrated score -- staff should still eyeball anything below ~0.8.
            "confidence_is_self_reported": self_reported,
        }

    def process_image_from_path(self, path: str) -> Tuple[str, float, Dict[str, Any]]:
        with open(path, "rb") as image_file:
            content = image_file.read()
        return self.process_image(content)
