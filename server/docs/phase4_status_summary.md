# Phase 4 Status Summary — Sponsor Submission Workflow

## Current Backend Capabilities (as of this checkpoint)

1. **Submission creation & assignment guardrails**
   - Sponsors (or admins acting on their behalf) can create submission records tied to a letter *only if an assignment exists* (`POST /api/submissions`).
   - Content is stored with format metadata and the current version tracked.

2. **Draft editing, autosave & submit**
   - Sponsors can autosave draft text (`POST /api/submissions/{id}/autosave`) while in `draft` or `revisions_requested` status.
   - Submitting (`POST /api/submissions/{id}/submit`) transitions to `submitted`, clears revision comments, logs status history, and timestamps.

3. **Admin review actions**
   - Admins can request revisions (`POST /api/submissions/{id}/request-revisions`) or approve (`POST /api/submissions/{id}/approve`), each logging review metadata and status history.

4. **Version & history tracking**
   - Every save writes a version snapshot; status transitions append to `submissionstatushistory`.
   - Sponsor/Admin endpoints (`GET /mine`, `GET /{id}`, `PUT /{id}`) expose the full object graph with versions, artifacts (future use), and history.

5. **RBAC enforcement**
   - Role checks ensure only sponsors use autosave/submit endpoints; admin-only routes manage reviews or global listings.

## Limitations (Not yet implemented)

- Frontend editor/admin review UI not started.
- Migration fails currently (audit log `metadata` column name conflict).
- Export endpoints to deliver generated files outstanding.

## Remaining Work (High Level)
1. Finalize backend endpoints (artifact conversion/downloads, migration validation).
2. Implement sponsor/editor and admin review UI in React.
3. Add export/download functionality (DOCX/PDF/TXT) and verify storage paths.
4. Run end-to-end workflow tests once backend + frontend are stable.

## Suggested Next Steps
1. Complete backend submission workflow service, migrations, and artifact generation helpers.
2. Build sponsor draft editor view with autosave + submit actions.
3. Implement admin review controls and status timeline UI.
4. Document workflow and add testing/checklists after UI integration.

*See `phase4_next_steps.md` for detailed task breakdown.*
