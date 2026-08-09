from pathlib import Path
from typing import Dict, Any, List
from reportlab.lib.pagesizes import landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

from config import get_settings


class EnvelopeService:
    """
    Generates #10 envelope PDFs. The sender (return) address is org-controlled
    config, never hardcoded here -- see config.py's envelope_sender_* fields
    for the safety rationale behind the safe/unsafe distinction.
    """

    def __init__(self, storage_root: Path):
        self.storage_root = storage_root
        self.storage_root.mkdir(parents=True, exist_ok=True)

        # Standard #10 Envelope Size: 4.125" x 9.5"
        self.envelope_size = (9.5 * inch, 4.125 * inch)

    @staticmethod
    def resolve_safety_classification(prisoner: Dict[str, Any]) -> str:
        """
        Normalize a prisoner dict's safety classification to 'safe' or 'unsafe'.
        Fail-safe default: unknown/missing/unrecognized -> 'unsafe'. Printing the
        generic sender address for a safe prisoner is a non-issue; printing the
        identifying address for an unsafe prisoner is not a mistake this can
        afford to make silently.
        """
        value = str(prisoner.get("safety_classification") or "").strip().lower()
        return "safe" if value == "safe" else "unsafe"

    def _sender_lines(self, safety_classification: str) -> List[str]:
        settings = get_settings()
        if safety_classification == "safe":
            lines = [settings.envelope_sender_name_safe]
            if settings.envelope_sender_attn_safe:
                lines.append(settings.envelope_sender_attn_safe)
        else:
            lines = [settings.envelope_sender_name_unsafe]
        lines.append(settings.envelope_sender_address_line1)
        lines.append(settings.envelope_sender_city_state_zip)
        return lines

    def _destination(self, submission_id: int, safety_classification: str) -> Path:
        return self.storage_root / f"envelope_{submission_id}_{safety_classification}.pdf"

    def generate_envelope(self, submission_id: int, prisoner: Dict[str, Any]) -> Path:
        """
        Generates a PDF for a #10 envelope.

        prisoner dict should contain: first_name, last_name, cdcr_number (or
        cpid as a fallback), address, city, state, zip, housing, facility,
        safety_classification.
        """
        safety_classification = self.resolve_safety_classification(prisoner)
        dest = self._destination(submission_id, safety_classification)
        c = canvas.Canvas(str(dest), pagesize=self.envelope_size)

        # 1. Draw Return Address (Top Left) -- selected by safety classification
        c.setFont("Helvetica", 10)
        curr_y = self.envelope_size[1] - 0.5 * inch
        for line in self._sender_lines(safety_classification):
            c.drawString(0.5 * inch, curr_y, line)
            curr_y -= 12

        # 2. Draw Recipient Address (Center)
        c.setFont("Helvetica-Bold", 12)
        name = f"{prisoner.get('first_name', '')} {prisoner.get('last_name', '')}".strip()
        cdcr = prisoner.get("cdcr_number") or prisoner.get("cpid") or "ID PRTCTD"
        housing = prisoner.get("housing", "")
        facility = prisoner.get("facility", "")

        addr = prisoner.get("address", "")
        city_line = f"{prisoner.get('city', '')}, {prisoner.get('state', '')} {prisoner.get('zip', '')}".strip()

        # Center start point: ~4" from left, ~2" from bottom
        center_x = 4.0 * inch
        center_y = 2.2 * inch

        c.drawString(center_x, center_y, f"{name}, {cdcr}")
        c.setFont("Helvetica", 11)
        curr_y = center_y - 14

        if housing:
            c.drawString(center_x, curr_y, f"Housing: {housing}")
            curr_y -= 14

        if facility:
            c.drawString(center_x, curr_y, facility)
            curr_y -= 14

        if addr:
            c.drawString(center_x, curr_y, addr)
            curr_y -= 14

        c.drawString(center_x, curr_y, city_line)

        c.save()
        return dest
