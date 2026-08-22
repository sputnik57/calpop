"""In-memory .docx builders -- separate from services/artifact_service.py's
SubmissionArtifactService, which writes to a local file path; these return
raw bytes for callers (like LetterService.upload_redacted_to_sponsor_onedrive)
that hand the result straight to a StorageService instead of the local disk."""

from io import BytesIO

from docx import Document


def build_blank_reply_docx() -> bytes:
    """The blank reply doc dropped into each exchangeX upload -- a single
    placeholder line, not empty and not a longer template (Rey's call,
    22Aug2026: "I usually type 'Respond here'")."""
    doc = Document()
    doc.add_paragraph("Respond here")
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()
