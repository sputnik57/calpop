# Phase 4 Implementation Plan (Next Steps)

This document captures the remaining work items for completing the Phase 4 sponsor submission workflow.

## Backend

1. **Submission Workflow Endpoints**
   - Flesh out `SubmissionService` with guardrails (assignment validation, autosave retention policy).
   - Expose autosave endpoint (PATCH/POST) and add admin review endpoints for approve/request-revisions.
   - Add submission artifact generation service (DOCX/PDF/TXT conversions) and storage references.
   - Integrate status history logging in service helpers.

2. **Assignment Validation**
   - Ensure letters must have active sponsor assignment before submission creation.
   - Update error handling/responses for invalid states.

3. **Export/Conversion Pipeline**
   - Implement conversion utilities (python-docx/reportlab) to produce files stored under `data/submissions/`.
   - Add API endpoints to trigger download/export for admins.

4. **Testing Hooks**
   - Seed fixtures / sample data for manual testing in DEV environment.
   - Prepare API contract tests once endpoints are stable.

## Frontend

1. **Sponsor Letter Editor**
   - Build React view for assigned letters with rich text/markdown editor.
   - Wire autosave polling + optimistic UI updates.

2. **Status Timeline & Actions**
   - Display submission status history (draft, submitted, revisions, approved).
   - Provide submit and revise actions with confirmation modals.

3. **Admin Review Console**
   - Create admin interface to review sponsor submissions, leave revision comments, approve, or request changes.

4. **Download / Export Buttons**
   - Provide export buttons (DOCX, PDF, TXT) for admins and approved sponsor submissions.

## Integration & QA

1. **End-to-End Flow**
   - Manual validation: sponsor draft → submit → admin review → approve → export.
   - Ensure audit logging is captured for each critical state change.

2. **Documentation Updates**
   - Update README/SRS with new endpoints and user flows.
   - Draft quickstart guide for sponsor/admin usage once UI is ready.

## Immediate Next Steps (recommended order)

1. **Finalize backend migration & validation**
   - [ ] Validate Alembic migration matches ORM models; run `alembic upgrade` in dev.
   - [ ] Add tests/fixtures for submission workflow endpoints.

2. **Implement sponsor UI for drafting & submitting**
   - [ ] Build React sponsor editor with autosave + submit flows.
   - [ ] Add admin review UI (status timeline, approve/revision actions).

3. **Integration & QA**
   - [ ] Run end-to-end smoke test (draft → submit → revise/approve → export).
   - [ ] Document workflow and update README/SRS.

4. **Export pipeline & docs**
   - [ ] Extend conversion/export pipeline and ensure file storage conventions.
   - [ ] Finalize documentation once UI + backend are stable.

---

> **Note:** This plan intentionally prioritizes backend services first, followed by frontend integration and QA. Adjust ordering as sprint priorities evolve.
