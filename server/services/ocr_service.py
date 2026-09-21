import base64
import io
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import httpx
from google.cloud import vision
from google.cloud import translate_v2 as gcloud_translate
from google.oauth2 import service_account
from PIL import Image, ImageDraw, ImageFont

from config import get_settings

settings = get_settings()

_overlay_font_path_cache = None


def _find_overlay_font_path() -> str:
    """
    A real TrueType font for translate_overlay_cloud's text rendering.
    Pillow itself doesn't ship one in the installed package (only in its
    source-repo Tests/ dir, not the wheel) -- reportlab (already a
    dependency, for the blank-reply/translation-review .docx builders)
    happens to bundle Bitstream Vera Sans, so this reuses that rather than
    adding a new font dependency just for this. Falls back to Pillow's
    tiny built-in bitmap font if that path ever moves (a reportlab
    version bump could relocate it) -- overlay text would look worse but
    the feature wouldn't hard-fail.
    """
    global _overlay_font_path_cache
    if _overlay_font_path_cache is not None:
        return _overlay_font_path_cache
    try:
        import reportlab
        candidate = os.path.join(os.path.dirname(reportlab.__file__), "fonts", "Vera.ttf")
        if os.path.exists(candidate):
            _overlay_font_path_cache = candidate
            return candidate
    except Exception:
        pass
    _overlay_font_path_cache = ""
    return ""


def _group_words_into_cells(response) -> list:
    """
    Groups Google Vision's individual detected words into translatable
    "cells" (text + bounding box) using our own geometry, NOT Vision's own
    paragraph/block grouping. Added 31Aug2026 after a live test showed
    Vision's paragraph grouping merging two visually-separate, unrelated
    phrases that happened to sit on the same text row into one paragraph
    -- which then got mistranslated as one continuous sentence. Exactly
    the kind of failure translate_overlay_cloud exists to eliminate, so
    trusting Vision's grouping for it wasn't good enough.

    Two-pass heuristic:
    1. Cluster words into rows by vertical (y-axis) overlap -- words whose
       vertical extent overlaps significantly belong to the same physical
       text line, regardless of Vision's paragraph boundaries.
    2. Within each row, split into separate cells wherever the horizontal
       gap between consecutive words is unusually wide relative to that
       row's own text height -- a real gap between columns reads very
       differently from normal word spacing.

    Trade-off, accepted deliberately: this treats each PHYSICAL line as
    its own cell, so a response that wraps across 2-3 lines becomes 2-3
    separate cells rather than one paragraph. For overlay purposes that's
    fine -- each line still gets translated and painted back in its own
    correct position, preserving the visual structure either way. The
    downside is each line is translated independently rather than as one
    flowing sentence, which can read slightly choppier for wrapped prose.
    """
    words = []
    for page in response.full_text_annotation.pages:
        for block in page.blocks:
            for paragraph in block.paragraphs:
                for word in paragraph.words:
                    text = "".join(symbol.text for symbol in word.symbols).strip()
                    if not text:
                        continue
                    verts = word.bounding_box.vertices
                    xs = [v.x for v in verts]
                    ys = [v.y for v in verts]
                    words.append({"text": text, "x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)})

    if not words:
        return []

    words.sort(key=lambda w: (w["y0"] + w["y1"]) / 2)
    rows = []
    for w in words:
        placed = False
        for row in rows:
            row_y0 = min(x["y0"] for x in row)
            row_y1 = max(x["y1"] for x in row)
            overlap = min(w["y1"], row_y1) - max(w["y0"], row_y0)
            if overlap > 0.5 * min(w["y1"] - w["y0"], row_y1 - row_y0):
                row.append(w)
                placed = True
                break
        if not placed:
            rows.append([w])

    cells = []
    for row in rows:
        row.sort(key=lambda w: w["x0"])
        avg_h = sum(w["y1"] - w["y0"] for w in row) / len(row)
        gaps = [row[i + 1]["x0"] - row[i]["x1"] for i in range(len(row) - 1)]
        # Baseline "normal" word spacing for THIS row, not a fixed constant --
        # a live test found a real column gap (32px) sitting just under a
        # flat 1.5x-text-height threshold (40.5px) while normal word gaps
        # in the same row were only ~9-13px. The gap that actually matters
        # is the one that stands out from this row's own spacing pattern,
        # not one measured against an arbitrary font-size multiple.
        baseline = sorted(gaps)[len(gaps) // 2] if gaps else 0
        gap_threshold = max(avg_h * 0.9, baseline * 2.5, 10)
        current = [row[0]]
        for w, gap in zip(row[1:], gaps):
            if gap > gap_threshold:
                cells.append(current)
                current = [w]
            else:
                current.append(w)
        cells.append(current)

    result = []
    for cell in cells:
        text = " ".join(w["text"] for w in cell)
        x0 = min(w["x0"] for w in cell)
        y0 = min(w["y0"] for w in cell)
        x1 = max(w["x1"] for w in cell)
        y1 = max(w["y1"] for w in cell)
        result.append((text, (x0, y0, x1, y1)))
    return result


def _draw_wrapped_text(draw: "ImageDraw.ImageDraw", text: str, x0: int, y0: int, box_w: int, box_h: int, font_path: str) -> None:
    """
    Word-wraps `text` to fit within (box_w, box_h), shrinking font size
    (24pt down to 6pt) until it fits both dimensions, then draws it
    top-left-aligned starting at (x0, y0). At the smallest size, draws
    anyway even if it overflows the box vertically -- a translation that's
    readable-but-slightly-overflowing beats one silently dropped.
    """
    words = text.split()
    if not words:
        return
    box_w = max(1, box_w)
    box_h = max(1, box_h)

    for font_size in range(24, 5, -1):
        try:
            font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
        except Exception:
            font = ImageFont.load_default()

        lines = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            w = draw.textbbox((0, 0), trial, font=font)[2]
            if w <= box_w or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)

        ascent, descent = font.getmetrics()
        line_height = ascent + descent + 3
        total_h = line_height * len(lines)

        if total_h <= box_h or font_size <= 6:
            ty = y0
            for line in lines:
                draw.text((x0, ty), line, fill="black", font=font)
                ty += line_height
            return

# Instructs the local vision model to transcribe rather than describe the image,
# and to self-report a legibility confidence since Ollama has no native score.
OLLAMA_OCR_PROMPT = (
    "You are transcribing a scanned handwritten or printed letter/envelope for a prisoner "
    "correspondence program. Read the image one line at a time, exactly as written. If the "
    "image is a table or form with rows and columns, treat each ROW as one line, reading left "
    "to right across it -- do not read column by column. "
    "Do not summarize, translate, or correct spelling/grammar. "
    "If a word is illegible, write [illegible] in its place.\n\n"
    "Respond with ONLY a JSON object of this form, no other text. \"lines\" MUST be a JSON "
    "array with one string per line/row -- never merge multiple lines into one array element:\n"
    '{"lines": ["<line 1 text>", "<line 2 text>", "..."], "confidence": <number from 0.0 to 1.0 '
    'reflecting how certain you are of the transcription overall>}'
)

# Separate from OLLAMA_OCR_PROMPT above on purpose -- that one explicitly
# forbids translation (needed verbatim for envelope/person matching); this
# one is for Letter Mgt's Spanish-language letter workflow (added 31Aug2026).
# Transcription and translation used to be asked for in a single combined
# generation (one JSON object with both "original_lines" and
# "translation_lines"); split into two separate calls the same day after a
# real 8-line table came back with the first several rows transcribed well
# and the last two visibly worse, on an image confirmed equally sharp
# throughout -- a known VLM failure mode where accuracy degrades over a
# longer generation, not an image-quality problem. Doubling the output asked
# for in one pass (transcription + translation together) was making that
# worse than it needed to be for even a short document. Splitting into a
# vision call (this prompt, transcription only) and a text-only call
# (OLLAMA_TRANSLATE_TEXT_PROMPT below, translating the already-clean
# transcription) gives each step a shorter, narrower generation.
OLLAMA_TRANSCRIBE_PROMPT = (
    "You are transcribing a scanned handwritten or printed letter for a prisoner correspondence "
    "program. The letter may be in Spanish or English. Read the image one line at a time and "
    "transcribe each line exactly as written, in its original language. If the image is a table "
    "or form with rows and columns, treat each ROW as one line, reading left to right across it "
    "-- do not read column by column. Do not translate or correct spelling/grammar. If a word is "
    "illegible, write [illegible] in its place.\n\n"
    "Respond with ONLY a JSON object of this form, no other text. \"lines\" MUST be a JSON array "
    "with one string per line/row -- never merge multiple lines into one array element:\n"
    '{"lines": ["<line 1 text>", "..."], "detected_language": "<e.g. Spanish, English>", '
    '"confidence": <number from 0.0 to 1.0 reflecting how certain you are of the transcription '
    "overall>}"
)

# Text-only (no image) -- translates an already-transcribed letter. Always
# shown to a human (a bilingual reviewer, outside the app) for correction
# before it reaches a sponsor -- this prompt's job is a first-pass draft,
# not a final translation.
OLLAMA_TRANSLATE_TEXT_PROMPT_TEMPLATE = (
    "Translate the following letter into natural, complete English, line by line, preserving "
    "the same number of lines and their order. This is a first-pass draft that a human bilingual "
    "reviewer will check and correct before it is sent to anyone, so prioritize completeness and "
    "natural phrasing over hedging. Do not add commentary.\n\n"
    "Lines to translate (as a JSON array):\n{lines_json}\n\n"
    "Respond with ONLY a JSON object of this form, no other text. \"translation_lines\" MUST be "
    "a JSON array with exactly one string per input line, in the same order:\n"
    '{{"translation_lines": ["<line 1, English>", "..."]}}'
)


class OCRService:
    def __init__(self):
        self.client = None  # Google Vision (OCR)
        self.translate_client = None  # Google Cloud Translate -- added 31Aug2026, shares the same credentials as Vision
        self._init_client()

    def _init_client(self):
        # Previously gated on settings.ocr_provider == "google_vision" --
        # loosened 31Aug2026 so the Google clients are available whenever
        # credentials exist, regardless of the app's default OCR provider
        # (which stays "local"). This is what transcribe_image_
        # cloud_redacted / translate_lines_cloud below need: an explicit,
        # narrow, per-request opt-in cloud path for letter content the
        # local model struggles with, without changing the app-wide
        # default. The normal process_image/_process_image_ollama paths
        # are unaffected -- they still branch on settings.ocr_provider
        # exactly as before.
        if settings.ocr_provider == "google_vision" or settings.google_vision_credentials_json or settings.google_vision_credentials_path or os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            try:
                creds = None
                # 1. Check for Raw JSON String
                if settings.google_vision_credentials_json:
                    try:
                        info = json.loads(settings.google_vision_credentials_json)
                        creds = service_account.Credentials.from_service_account_info(info)
                        print("SUCCESS: Loaded Google credentials from JSON string.")
                    except Exception as json_err:
                        print(f"ERROR: Failed to parse GOOGLE_VISION_CREDENTIALS_JSON: {json_err}")

                # 2. If path is provided in settings/env
                if not creds and settings.google_vision_credentials_path and Path(settings.google_vision_credentials_path).exists():
                    creds = service_account.Credentials.from_service_account_file(
                        str(settings.google_vision_credentials_path)
                    )

                # 3. Build both clients from the same credentials (or the
                # default environment variable GOOGLE_APPLICATION_CREDENTIALS
                # if neither of the above was set, in which case each
                # client resolves its own default credentials).
                if creds:
                    self.client = vision.ImageAnnotatorClient(credentials=creds)
                    self.translate_client = gcloud_translate.Client(credentials=creds)
                elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
                    self.client = vision.ImageAnnotatorClient()
                    self.translate_client = gcloud_translate.Client()

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
            # "lines" (a JSON array, one string per line) replaced a single
            # "text" blob 31Aug2026 -- asking the model to put a literal \n
            # inside one string was a weak instruction it routinely ignored,
            # collapsing multi-line/tabular letters into one run-on
            # paragraph. An array boundary is a far stronger structural
            # signal for a small vision model to actually respect. Still
            # accept the old "text" key so this doesn't break if a stale
            # prompt/response shape ever comes back.
            lines = parsed.get("lines")
            if isinstance(lines, list):
                text = "\n".join(str(line) for line in lines)
            else:
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

    def transcribe_image_cloud_redacted(self, image_content: bytes) -> Dict[str, Any]:
        """
        Google Vision OCR for a letter page -- opt-in, and ONLY for an
        already-redacted image (identifying info blacked out by the
        operator before this is ever called). Added 31Aug2026 after real,
        repeated cases of the local model (qwen2.5vl 7B) reading a
        handwritten table column-by-column instead of row-by-row despite
        explicit prompting not to, with the misordered content then also
        catching the worst of a separate end-of-generation accuracy drop
        (see transcribe_image/translate_lines) -- a real capability ceiling
        for this content on this hardware, not something more prompt
        tuning was fixing.

        Deliberately narrow: this app's local-OCR-only design (see
        transcribe_image's docstring) stays the default for everything
        else. The enforcement that this is only ever called on a redacted
        image is NOT done here -- there's no way to verify pixel content
        server-side -- it's structural instead: the caller
        (/transcribe-page-cloud) requires an explicit redaction_confirmed
        flag, and the only frontend path that calls it (TranslateLetter.jsx)
        only offers this button once every page has been run through
        PageRedactionEditor and marked redacted.

        Returns the same {lines, original_text, detected_language,
        confidence, confidence_is_self_reported} shape as transcribe_image
        so callers (and translate_lines downstream) don't need to care
        which OCR path produced it. Translation of the resulting text still
        happens locally via translate_lines -- only the image itself, and
        only once redacted, ever reaches Google.
        """
        if not self.client:
            raise ValueError(
                "Google Vision is not configured (no credentials found) -- cloud OCR is unavailable."
            )

        image = vision.Image(content=image_content)
        response = self.client.document_text_detection(image=image)
        if response.error.message:
            raise ValueError(f"Google Vision API Error: {response.error.message}")

        text = response.full_text_annotation.text or ""
        # Unlike the local model, Google Vision's document_text_detection
        # preserves real line breaks in the returned text natively -- no
        # array-of-lines prompting trick needed to get structure out of it.
        lines = [line for line in text.split("\n") if line.strip()]

        confidence = 0.0
        if response.full_text_annotation.pages:
            page = response.full_text_annotation.pages[0]
            block_confs = [block.confidence for block in page.blocks]
            if block_confs:
                confidence = sum(block_confs) / len(block_confs)

        detected_language = None
        try:
            if response.full_text_annotation.pages:
                langs = response.full_text_annotation.pages[0].property.detected_languages
                if langs:
                    detected_language = langs[0].language_code
        except Exception:
            pass

        return {
            "lines": lines,
            "original_text": text,
            "detected_language": detected_language,
            "confidence": confidence,
            "confidence_is_self_reported": False,
        }

    def transcribe_image(self, image_content: bytes) -> Dict[str, Any]:
        """
        Step 1 of the Spanish-language workflow (added 31Aug2026, split out
        from a combined translate_image 31Aug2026 -- see translate_lines'
        docstring for why): transcribe a letter page, original language,
        no translation. Vision call.

        Local-only, deliberately -- letter *content* (not just an envelope
        for person-matching) is exactly the PII this app's whole local-OCR
        design exists to keep offline. Raises rather than silently sending
        letter content to Google Vision if OCR_PROVIDER isn't 'local'.
        """
        if settings.ocr_provider != "local":
            raise ValueError(
                "Translation requires OCR_PROVIDER=local -- letter content should never be sent "
                "to a cloud OCR/translation service. Current provider: "
                f"{settings.ocr_provider!r}."
            )

        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        result = {
            "lines": [],
            "original_text": "",
            "detected_language": None,
            "confidence": 0.5,
            "confidence_is_self_reported": False,
        }

        image_b64 = base64.b64encode(image_content).decode("ascii")
        payload = {
            "model": settings.ollama_vision_model,
            "prompt": OLLAMA_TRANSCRIBE_PROMPT,
            "images": [image_b64],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.0},
        }
        try:
            resp = httpx.post(url, json=payload, timeout=settings.ollama_timeout_seconds)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(
                f"Local transcription error: could not reach Ollama at {settings.ollama_base_url} "
                f"(model={settings.ollama_vision_model}): {e}"
            )

        raw_response = resp.json().get("response", "")
        try:
            parsed = json.loads(raw_response)
            raw_lines = parsed.get("lines")
            if isinstance(raw_lines, list):
                result["lines"] = [str(line) for line in raw_lines]
            result["original_text"] = "\n".join(result["lines"]) if result["lines"] else parsed.get("text", raw_response)
            result["detected_language"] = parsed.get("detected_language")
            conf_val = parsed.get("confidence")
            if isinstance(conf_val, (int, float)):
                result["confidence"] = max(0.0, min(1.0, float(conf_val)))
                result["confidence_is_self_reported"] = True
        except (json.JSONDecodeError, TypeError):
            # Model didn't return valid JSON -- fall back to the raw text,
            # no line array to translate against.
            result["original_text"] = raw_response

        return result

    def translate_lines(self, lines: list) -> Dict[str, Any]:
        """
        Step 2 of the Spanish-language workflow: translate an already-
        transcribed letter (a list of lines, from transcribe_image) into
        English. Text-only -- no image, no vision call.

        Split from a single combined transcribe+translate generation
        31Aug2026 after a real 8-row table came back with the first several
        rows transcribed well and the last two visibly worse, on an image
        confirmed equally sharp throughout -- a known VLM failure mode where
        accuracy degrades over a longer generation, not an image-quality
        problem. Doing OCR and translation as two separate, shorter-output
        calls (vision then text-only) gives each step its own full
        attention instead of splitting it across one long generation.

        Always shown to a human (a bilingual reviewer, outside the app) for
        correction before it reaches a sponsor -- this is a first-pass
        draft, not a final translation.
        """
        if settings.ocr_provider != "local":
            raise ValueError(
                "Translation requires OCR_PROVIDER=local -- letter content should never be sent "
                "to a cloud OCR/translation service. Current provider: "
                f"{settings.ocr_provider!r}."
            )
        if not lines:
            return {"translation": "", "translation_lines": []}

        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        payload = {
            "model": settings.ollama_vision_model,
            "prompt": OLLAMA_TRANSLATE_TEXT_PROMPT_TEMPLATE.format(lines_json=json.dumps(lines, ensure_ascii=False)),
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.0},
        }
        try:
            resp = httpx.post(url, json=payload, timeout=settings.ollama_timeout_seconds)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(
                f"Local translation error: could not reach Ollama at {settings.ollama_base_url} "
                f"(model={settings.ollama_vision_model}): {e}"
            )

        raw_response = resp.json().get("response", "")
        try:
            parsed = json.loads(raw_response)
            translation_lines = parsed.get("translation_lines")
            if isinstance(translation_lines, list):
                translation_lines = [str(line) for line in translation_lines]
            else:
                translation_lines = [raw_response]
        except (json.JSONDecodeError, TypeError):
            translation_lines = [raw_response]

        return {"translation": "\n".join(translation_lines), "translation_lines": translation_lines}

    def translate_lines_cloud(self, lines: list) -> Dict[str, Any]:
        """
        Google Cloud Translate counterpart to translate_lines -- added
        31Aug2026 at Rey's request, so the Google Vision cloud OCR path
        (transcribe_image_cloud_redacted) can use Google end-to-end for
        both steps instead of handing off to the local model for
        translation. Rey's own manual fallback for content the local model
        handles poorly, done here so the same redaction gate applies
        consistently rather than being remembered by habit.

        Text-only, same as translate_lines -- doesn't touch the image.
        Still only ever called on text that was transcribed FROM an
        already-redacted image (see /translate-lines-cloud's docstring for
        the enforcement), so the "letter content, redacted first" posture
        holds all the way through this path, not just at the OCR step.
        """
        if not self.translate_client:
            raise ValueError(
                "Google Cloud Translate is not configured (no credentials found) -- cloud translation is unavailable."
            )
        if not lines:
            return {"translation": "", "translation_lines": []}

        try:
            # format_="text" -- without it the API treats input/output as
            # HTML and escapes characters like apostrophes (literal "&#39;"
            # showing up in translated text), since our input is plain
            # handwritten-letter text, not markup.
            results = self.translate_client.translate(lines, target_language="en", format_="text")
        except Exception as e:
            raise ValueError(f"Google Cloud Translate error: {e}")

        # translate() returns one dict per input when given a list, in the
        # same order -- no JSON-array prompting trick needed, same as
        # transcribe_image_cloud_redacted's line-break advantage.
        translation_lines = [r.get("translatedText", "") for r in results]
        return {"translation": "\n".join(translation_lines), "translation_lines": translation_lines}

    def translate_texts_cloud(self, texts: list, target_language: str, source_language: str = None) -> list:
        """
        General text-to-text Google Cloud Translate, either direction --
        added 20Sep2026 for Reference Hub's "Translate to Spanish" on an
        already-open curriculum document (every other translate method in
        this class is hardcoded Spanish -> English).

        Unlike translate_lines_cloud this is NOT for letter content read off
        a scan: it's for public program material (curriculum/worksheets), so
        the gate is api/library.py's `no_personal_info_confirmed`, enforced
        server-side by the caller, not the image-redaction gate. Chunked
        because the v2 API caps a request at 128 strings.
        """
        if not self.translate_client:
            raise ValueError(
                "Google Cloud Translate is not configured (no credentials found) -- cloud translation is unavailable."
            )
        out = []
        for i in range(0, len(texts), 100):
            chunk = texts[i:i + 100]
            try:
                kwargs = {"target_language": target_language, "format_": "text"}
                if source_language:
                    kwargs["source_language"] = source_language
                results = self.translate_client.translate(chunk, **kwargs)
            except Exception as e:
                raise ValueError(f"Google Cloud Translate error: {e}")
            out.extend(r.get("translatedText", "") for r in results)
        return out

    def translate_overlay_cloud(self, image_content: bytes) -> bytes:
        """
        Image-overlay translation (added 31Aug2026) -- the actual fix for
        this session's recurring formatting failures (table columns read
        out of order, worksheet row-pairs split apart, mid-sentence line
        wraps), all of which trace back to one root cause: every other path
        in this file linearizes the page into flat text before translating,
        which throws away the spatial layout a human reading the photo
        gets for free. Rey's own iPhone camera-translate doesn't have this
        problem for exactly that reason -- it never linearizes either, it
        overlays the translation on the image in place. This does the same:
        detect each text block's position, translate each block
        independently, and paint the translation back onto a copy of the
        image at that same position. Reading order never has to be
        reconstructed correctly, because nothing gets reordered.

        Real motivation, not just a UX nicety: Rey answers letters roughly
        in sequence, and skips a Spanish one rather than break that
        sequence -- in practice adding up to two weeks of delay per letter
        versus an English one. A working overlay mode lets a Spanish letter
        be answered in-sequence instead.

        Google Vision + Google Cloud Translate ONLY -- Ollama's vision
        model returns text with no bounding boxes, so there is no local
        equivalent of this specific mode. Same redaction_confirmed gate as
        every other cloud path in this file (enforced by the caller, see
        /translate-overlay-cloud's docstring) -- this reaches Google either
        way, and the gate exists so that's always an explicit, redacted-
        image-only choice.

        Text is grouped into cells via our OWN geometry (_group_words_into_
        cells), not Vision's paragraph/block grouping -- a live test during
        this build showed Vision merging two unrelated same-row phrases
        into one paragraph and mistranslating them as a single sentence,
        exactly the failure this feature exists to eliminate. See that
        function's docstring for the row/column-gap heuristic and its
        accepted trade-off (each physical line becomes its own cell).

        Returns a dict: composited PNG image bytes plus the plain original/
        translated text (for copy-paste into a reply), not image bytes alone.
        """
        if not self.client or not self.translate_client:
            raise ValueError(
                "Google Vision/Translate is not configured (no credentials found) -- cloud overlay translation is unavailable."
            )

        image = vision.Image(content=image_content)
        response = self.client.document_text_detection(image=image)
        if response.error.message:
            raise ValueError(f"Google Vision API Error: {response.error.message}")

        paragraphs = _group_words_into_cells(response)

        if not paragraphs:
            raise ValueError("No text detected on this page -- nothing to overlay.")

        try:
            translations = self.translate_client.translate(
                [text for text, _ in paragraphs], target_language="en", format_="text"
            )
        except Exception as e:
            raise ValueError(f"Google Cloud Translate error: {e}")
        translated_texts = [r.get("translatedText", "") for r in translations]

        img = Image.open(io.BytesIO(image_content)).convert("RGB")
        draw = ImageDraw.Draw(img)
        font_path = _find_overlay_font_path()

        for (_, (x0, y0, x1, y1)), translated in zip(paragraphs, translated_texts):
            draw.rectangle([x0, y0, x1, y1], fill="white")
            _draw_wrapped_text(draw, translated, x0, y0, x1 - x0, y1 - y0, font_path)

        buf = io.BytesIO()
        img.save(buf, format="PNG")

        # Plain text alongside the image, added 31Aug2026 at Rey's request --
        # the overlay's whole point is showing translated text positioned
        # in place, but replying to a sponsee needs to copy/paste actual
        # text, not read it off a picture. Cell order here follows
        # _group_words_into_cells' row-then-column construction (rows in
        # top-to-bottom encounter order, cells within a row left-to-right),
        # which keeps a phrase and its paired response adjacent -- more
        # useful for drafting a reply than a strict per-column ordering
        # would be.
        original_text = "\n".join(text for text, _ in paragraphs)
        translation = "\n".join(translated_texts)

        return {
            "image_bytes": buf.getvalue(),
            "original_text": original_text,
            "translation": translation,
        }

    def translate_image(self, image_content: bytes) -> Dict[str, Any]:
        """
        Convenience wrapper combining transcribe_image + translate_lines in
        one call -- kept for ScanLetterUpload.jsx's existing single-request
        translate flow. TranslateLetter.jsx's standalone tool calls the two
        steps separately instead (added 31Aug2026), so each phase is
        independently visible in that UI rather than hidden inside one
        request.
        """
        transcribed = self.transcribe_image(image_content)
        result = {
            "original_text": transcribed["original_text"],
            "translation": "",
            "detected_language": transcribed["detected_language"],
            "confidence": transcribed["confidence"],
            "confidence_is_self_reported": transcribed["confidence_is_self_reported"],
        }
        if not transcribed["lines"]:
            return result
        translated = self.translate_lines(transcribed["lines"])
        result["translation"] = translated["translation"]
        return result
