
# Implementation Plan - Phase 8: Envelope Batches & PDF Generation

This phase focuses on the "Final Mile" of the letter workflow: converting approved digital submissions into printable PDFs and managing the envelope printing queue.

## 1. Goal
Enable the printing of letters and envelopes for approved submissions.
- **Batches**: Group multiple approved letters into a single job.
- **Letter PDF**: Generate formatted PDFs from Markdown content (using ReportLab).
- **Envelope PDF**: Generate #10 Envelope PDFs with proper addressing.

## 2. Feature Note: Address Verification
> **User Requirement**: Incoming letters may contain updated address information (e.g. new housing unit).
- **Current State**: Address data is pulled from the `Prisoner` database table during envelope generation.
- **Future Integration**: An "Address Confirmation" step should be added to the Intake/Review workflow (Phase 3) where the admin verifies the address on the scanned envelope against the database.
- **Phase 8 Impact**: The `PDFService` will assume the `Prisoner` table is the source of truth. Admins must ensure this data is updated (via the "Prisoners" management page) if a move is detected *before* approving the response.

## 3. Proposed Changes

### A. Backend - New Services
1. **`services/pdf_service.py`**:
   - `generate_letter_pdf(submission) -> bytes`: Converts markdown -> styled PDF.
   - `generate_envelope_pdf(prisoner_address, sponsor_address) -> bytes`: Creates #10 envelope.
   - **Libraries**: `reportlab` (for PDF generation), `markdown` (for parsing content).

2. **`services/batch_service.py`**:
   - `create_batch(submission_ids) -> Batch`: Groups submissions.
   - `get_batch_pdf(batch_id)`: Merges all letter PDFs in a batch.
   - `get_envelope_batch_pdf(batch_id)`: Merges all envelopes.

### B. Backend - API Extensions
1. **Update `api/submissions.py`**:
   - `POST /{id}/approve` -> Trigger PDF generation automatically (fixing the missing button issue).
   - `GET /{id}/pdf`: Return the specific letter PDF.
   - `GET /{id}/envelope`: Return the specific envelope PDF.

2. **New `api/batches.py`**:
   - `POST /create`: Select multiple `approved` submissions -> New Batch.
   - `GET /{id}/letters.pdf`: Download multipage PDF of all letters.
   - `GET /{id}/envelopes.pdf`: Download multipage PDF of all envelopes.

### C. Frontend - UI Updates
1. **`ResponseStation.jsx`**:
   - Ensure "Letter PDF" and "Envelope" buttons appear immediately after approval.
   - Fix the checking logic for artifact existence.

2. **`BatchCenter.jsx` (New Page)** (Optional/Later):
   - A dedicated page for admins to select approved letters and "Close Batch" for printing.
   - *For now, we might skipping the UI page and just auto-generate artifacts on approval for individual download to keep it simple.*

## 4. Step-by-Step Implementation

### Step 1: Install Dependencies
- Add `reportlab` to `requirements.txt` (or verify it's there).

### Step 2: PDF Service Implementation
- Create `server/services/pdf_service.py`.
- Implement `render_html_to_flowables` custom logic or use `xhtml2pdf` / `reportlab` platypus.
- *Decision*: We will use `reportlab` strictly for control over page margins and addressing blocks.

### Step 3: Integrate with Approval Workflow
- Modify `SubmissionService.approve_submission` to:
  1. Update status to `approved`.
  2. **Call PDF Service** to generate artifacts immediately.
  3. Save artifacts to `SubmissionArtifact` table.

### Step 4: Verification
- Re-run the Phase 4 manual workflow.
- Verify that clicking "Approve" (as admin) now immediately makes the buttons appear in the Sponsor UI.

## 5. Risks & Mitigations
- **Markdown Rendering**: Simple markdown to PDF conversion can be tricky. We will use a robust stack (`markdown` lib -> HTML -> `xhtml2pdf` OR `markdown` -> `reportlab` flowables). *ReportLab Platypus is preferred for "Letterhead" style.*
- **Address Data**: Envelope generation requires valid addresses. We must ensure the `Prisoner` record has `facility` and `housing` info.

---

## 6. Current Status & Next Steps (2026-01-13)

### Current Status
- **Success**: Letter PDF and Envelope PDF generation logic is implemented and working on disk.
- **Success**: Batch transaction handling in `approve_submission` is fixed to prevent session conflicts.
- **Failure**: The "Envelope" artifact cannot be saved to the database due to an enum constraint.

### Current Blocker
The database type `submissionartifacttype` does not include `'envelope'`. 
- **Migration**: Alembic migration `723019d5abc4` was created and run to add the value.
- **Issue**: For unknown reasons, the database (`calpop`) still shows only `{docx,pdf,txt}` when queried directly. The `500 Internal Server Error` persists during approval because the `INSERT` into `submissionartifact` fails.

### Next Steps
1. **Force Enum Update**: Manually execute `ALTER TYPE submissionartifacttype ADD VALUE 'envelope';` in the `calpop` database inside the Postgres container.
2. **Verify Change**: Run `SELECT enum_range(NULL::submissionartifacttype);` to ensure "envelope" is present.
3. **Finish Approval**: Retest the "Finalize & Archive" workflow on an assigned submission.
4. **UI Check**: Confirm both buttons appear and link to the correct generated files.
