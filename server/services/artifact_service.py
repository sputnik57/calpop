from pathlib import Path
from typing import Optional, List

from docx import Document
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


class SubmissionArtifactService:
    """Handles generation of DOCX/PDF/TXT files for submissions."""

    def __init__(self, storage_root: Path):
        self.storage_root = storage_root
        self.storage_root.mkdir(parents=True, exist_ok=True)

    def _destination(self, submission_id: int, ext: str) -> Path:
        return self.storage_root / f"submission_{submission_id}.{ext}"

    def export_txt(self, submission_id: int, content: str) -> Path:
        dest = self._destination(submission_id, "txt")
        dest.write_text(content or "", encoding="utf-8")
        return dest

    def export_docx(self, submission_id: int, content: str) -> Path:
        doc = Document()
        for line in (content or "").splitlines():
            doc.add_paragraph(line)
        dest = self._destination(submission_id, "docx")
        doc.save(dest)
        return dest

    def export_pdf(self, submission_id: int, content: str, title: Optional[str] = None) -> Path:
        dest = self._destination(submission_id, "pdf")
        c = canvas.Canvas(str(dest), pagesize=letter)
        width, height = letter
        y = height - 72
        if title:
            c.setFont("Helvetica-Bold", 14)
            c.drawString(72, y, title)
            y -= 24
        c.setFont("Helvetica", 12)
        for line in (content or "").splitlines():
            if y < 72:
                c.showPage()
                y = height - 72
                c.setFont("Helvetica", 12)
            c.drawString(72, y, line)
            y -= 16
        c.save()
        return dest
    def merge_pdfs(self, paths: List[Path], output_filename: str) -> Path:
        from PyPDF2 import PdfMerger
        merger = PdfMerger()
        for path in paths:
            if path.exists():
                merger.append(str(path))
        
        dest = self.storage_root / output_filename
        with open(dest, "wb") as f:
            merger.write(f)
        merger.close()
        return dest
