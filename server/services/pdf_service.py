import logging
import io
from typing import Optional, Dict, Any
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Frame, PageTemplate
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.lib import colors

from schemas.submission import SubmissionOut

logger = logging.getLogger(__name__)

class PDFService:
    def __init__(self):
        pass

    def generate_letter_pdf(self, submission: SubmissionOut) -> io.BytesIO:
        """
        Generates a PDF for the submission letter.
        """
        import markdown
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )

        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name='Justify', alignment=TA_JUSTIFY))
        styles.add(ParagraphStyle(name='Date', parent=styles['Normal'], spaceAfter=12))
        styles.add(ParagraphStyle(name='Signature', parent=styles['Normal'], spaceBefore=24))

        # Content Elements
        elements = []

        # 1. Date
        # Use submitted_at or current time
        date_str = (submission.submitted_at or datetime.now()).strftime("%B %d, %Y")
        elements.append(Paragraph(date_str, styles['Date']))
        elements.append(Spacer(1, 0.25 * inch))

        # 2. Greeting (Extracted or Generic)
        # We assume the content has the greeting, or we can prepend one if needed.
        # For now, we trust the sponsor's markdown content to include it or be the body.
        
        # 3. Body Content (Markdown -> HTML -> Formatting)
        # Convert Markdown to simple HTML, then to text/paragraphs? 
        # ReportLab Paragraph supports some XML-like tags (b, i, u, font).
        # We can use python-markdown to convert to HTML, then strip/replace tags for ReportLab compatibility.
        # Ideally, we iterate through lines.
        
        raw_content = submission.content or "(No content provided)"
        
        # Simple Markdown parsing:
        # We will split by newlines and handle paragraphs.
        # Bold/Italic handling is minimal for now.
        
        # Convert simple markdown bold/italic to reportlab tags
        # **text** -> <b>text</b>
        # *text* -> <i>text</i>
        formatted_content = raw_content.replace("**", "<b>").replace("**", "</b>") # Naive replace, needs regex
        import re
        formatted_content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', raw_content)
        formatted_content = re.sub(r'\*(.*?)\*', r'<i>\1</i>', formatted_content)
        
        paragraphs = formatted_content.split('\n')
        
        for p in paragraphs:
            text = p.strip()
            if not text:
                elements.append(Spacer(1, 0.1 * inch))
                continue
            
            # Header handling
            if text.startswith('# '):
                elements.append(Paragraph(text[2:], styles['Heading1']))
            elif text.startswith('## '):
                elements.append(Paragraph(text[3:], styles['Heading2']))
            elif text.startswith('### '):
                elements.append(Paragraph(text[4:], styles['Heading3']))
            else:
                elements.append(Paragraph(text, styles['Normal']))
            
            elements.append(Spacer(1, 0.1 * inch))

        # 4. Signature
        # elements.append(Paragraph("Sincerely,", styles['Signature']))
        # elements.append(Spacer(1, 0.5 * inch))
        # elements.append(Paragraph("A CalPOP Sponsor", styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        buffer.name = f"letter_{submission.id}.pdf"
        return buffer

    def generate_envelope_pdf(self, prisoner: Dict[str, Any], return_address: Optional[Dict[str, Any]] = None) -> io.BytesIO:
        """
        Generates a #10 Envelope PDF.
        """
        # Standard #10 envelope size: 9.5" x 4.125"
        envelope_size = (9.5 * inch, 4.125 * inch)
        
        buffer = io.BytesIO()
        
        # Canvas based approach for fixed positioning on envelope
        from reportlab.pdfgen import canvas
        c = canvas.Canvas(buffer, pagesize=envelope_size)
        width, height = envelope_size
        
        # Return Address (Top Left)
        c.setFont("Helvetica", 10)
        pad = 0.3 * inch
        if return_address:
            # Custom return address
            lines = [
                return_address.get('name', 'California Prisoner Outreach Program'),
                return_address.get('address', 'PO Box 12345'),
                f"{return_address.get('city', 'Sacramento')}, {return_address.get('state', 'CA')} {return_address.get('zip', '95814')}"
            ]
        else:
            # Default Organization Address
            lines = [
                "California Prisoner Outreach Program",
                "PO Box 9876",
                "Oakland, CA 946xx" # Placeholder
            ]
            
        y = height - pad
        for line in lines:
            c.drawString(pad, y, line)
            y -= 12
            
        # Recipient Address (Center)
        # Standard #10 window is roughly 4" from left, 2" from bottom, but we are printing ON envelope, so center it.
        # Center x ~ 4.5 inch, y ~ 2.5 inch
        c.setFont("Helvetica-Bold", 12)
        
        recip_x = 4.0 * inch
        recip_y = 2.5 * inch
        
        # Prisoner Name
        name = f"{prisoner.get('first_name', '')} {prisoner.get('last_name', '')}".strip()
        cpid = prisoner.get('cpid', '')
        # Usually standard format: NAME, CDC#
        # Some facilities require specific format.
        
        recipient_lines = [
            f"{name} {prisoner.get('cdcr_number') or cpid}",
            prisoner.get('housing') or '',
            prisoner.get('facility') or '',
            prisoner.get('address') or '',
            f"{prisoner.get('city', '')}, {prisoner.get('state', '')} {prisoner.get('zip', '')}"
        ]
        
        # Filter empty lines
        recipient_lines = [L for L in recipient_lines if L]
        
        for line in recipient_lines:
            c.drawString(recip_x, recip_y, line)
            recip_y -= 14
            
        c.save()
        buffer.seek(0)
        buffer.name = f"envelope_{cpid}.pdf"
        return buffer

