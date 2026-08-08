from pathlib import Path
from typing import Dict, Any, Optional
from reportlab.lib.pagesizes import landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

class EnvelopeService:
    def __init__(self, storage_root: Path):
        self.storage_root = storage_root
        self.storage_root.mkdir(parents=True, exist_ok=True)
        
        # Standard #10 Envelope Size: 4.125" x 9.5"
        self.envelope_size = (9.5 * inch, 4.125 * inch)
        
        # Mock Return Address (Company Info)
        self.return_address = [
            "Californians for Penal Reform",
            "P.O. Box 1234",
            "Sacramento, CA 95814"
        ]

    def _destination(self, submission_id: int) -> Path:
        return self.storage_root / f"envelope_{submission_id}.pdf"

    def generate_envelope(self, submission_id: int, prisoner: Dict[str, Any]) -> Path:
        """
        Generates a PDF for a #10 envelope.
        prisoner dict should contain: fName, lName, CDCRno, address, city, state, zip, housing.
        """
        dest = self._destination(submission_id)
        c = canvas.Canvas(str(dest), pagesize=self.envelope_size)
        
        # 1. Draw Return Address (Top Left)
        c.setFont("Helvetica", 10)
        curr_y = self.envelope_size[1] - 0.5 * inch
        for line in self.return_address:
            c.drawString(0.5 * inch, curr_y, line)
            curr_y -= 12
            
        # 2. Draw Recipient Address (Center)
        c.setFont("Helvetica-Bold", 12)
        name = f"{prisoner.get('fName', '')} {prisoner.get('lName', '')}".strip()
        cdcr = prisoner.get('CDCRno', 'ID PRTCTD')
        housing = prisoner.get('housing', '')
        facility = prisoner.get('facility', '')
        
        addr = prisoner.get('address', '')
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
