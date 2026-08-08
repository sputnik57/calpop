**Software requirements specification**

**This updated specification integrates the legacy Streamlit functionality into the React + FastAPI architecture, preserving sponsor usability (web only), admin control (Docker), and secure OneDrive storage for redacted artifacts. It is written so another LLM can implement the system end to end.**

**Roles and capabilities**

- **Admin: Full workflow control; write/edit letters; ingest and redact PII; run OCR; manage prisoners, envelopes, assignments, and approvals; configure sync and retention; access audits.**
- **Sponsor: View assigned redacted letters only; compose/augment responses; track status; no access to raw PII.**
- **Auditor (optional): Read-only visibility into audits, retention reports, and system health.**

**System overview and goals**

- **Goal: A secure, auditable system for intake, redaction, OCR, envelope printing, sponsor response, and approval.**
- **Architecture: React web portal + FastAPI backend + DB + reverse proxy; Docker for admin deployment; OneDrive for sponsor-facing storage; pluggable OCR provider with a default local pipeline and optional Google Vision.**
- **Principles: Least privilege; PII never leaves admin zone unredacted; reproducibility via Docker; duplication-ready with documentation and sample configs.**

**Excel and Postgres Architecture**

- **Excel role:** The "Secure Vault" and master source of truth for sensitive prisoner identity data (PII). Managed by `server/services/excel_manager.py`. It holds real names, CDCR numbers, and housing locations.
- **Postgres role:** The "Operational Engine" for daily app operations. Dockerized `postgres:15-alpine` with SQLAlchemy. Holds Users, Letters, Submissions, Assignments, and Audit Logs.
- **The Bridge:** The app syncs structured data from Excel to Postgres, allowing the web app to link records using CPIDs while keeping the authoritative PII in the secure spreadsheet.

**Functional requirements**

**Letter writing and document management**

- **Document creation:**
  - **Requirement: Create new letters with a markdown/HTML editor; support templates.**
  - **Autosave: Persist drafts per user session; restore on re-login.**
- **Document upload & editing:**
  - **Requirement: Upload DOCX and PDF; extract text; edit content in the editor.**
  - **Parsing: Extract plain text and maintain a structured representation for formatting.**
- **Document conversion:**
  - **Requirement: Convert DOCX ↔ PDF ↔ TXT; preserve metadata and version history.**
  - **Batch operations: Allow multi-file conversion with progress and error reporting.**
- **Search:**
  - **Document search: Filter by name, status, dates, tags.**
  - **Prisoner search integration: Query prisoner DB; return CPIDs and profile snippets for letter targeting.**
- **Downloads:**
  - **Requirement: Download edited letters in DOCX/PDF/TXT; enforce redaction gates for any sponsor-facing export.**

**OCR processing and envelope scanning**

- **Image upload & enhancement:**
  - **Requirement: Upload images/PDF scans; perform scale, sharpen, crop, rotate; preview changes.**
- **OCR extraction:**
  - **Requirement: Run OCR on images and PDFs; capture text blocks and confidence scores.**
  - **Provider model: Default local OCR; optional Google Vision via pluggable adapter; provider must be configurable at runtime.**
- **Prisoner matching:**
  - **Requirement: Match extracted text to prisoner records by name/address/CPID heuristics; allow manual overrides.**
- **Auto-save to DB:**
  - **Requirement: Persist OCR outputs to the letter record; maintain provenance (source image refs, transformations).**
- **Multi-page PDF generation:**
  - **Requirement: Combine multiple scanned pages into a single ordered PDF; embed page-level metadata.**
- **Envelope queue:**
  - **Requirement: Add processed envelopes to a print queue with status tracking and batch operations.**

**Letter management and workflow**

- **Database operations:**
  - **Requirement: View/edit/manage all letters; filter by status, dates, prisoner, sponsor.**
- **Status tracking:**
  - **Requirement: Manage granular statuses: intake, scanned, redacted, reviewed, assigned, response_started, sponsor_submitted, revisions_requested, approved, archived.**
- **Date tracking:**
  - **Requirement: Record timestamps for scanned, picked_up, postmarked, response_started, response_submitted, approved.**
- **OCR text review:**
  - **Requirement: Display OCR text alongside images; allow corrections; track edits and reviewers.**
- **Image management:**
  - **Requirement: Associate envelope and page images with letter records; support thumbnails and full-resolution secure downloads.**
- **Processing notes:**
  - **Requirement: Add structured notes; tag with categories (e.g., mailroom issue, address check).**
- **File downloads:**
  - **Requirement: Download associated images/PDFs; enforce role checks and redaction gates.**
- **Letter deletion:**
  - **Requirement: Soft-delete by default; admin option to hard-delete with file purging; log deletion with reason.**

**Envelope printing**

- **Prisoner selection:**
  - **Requirement: Search/select prisoners for envelope generation; multi-select.**
- **Bulk operations:**
  - **Requirement: Print in batches; track per-envelope generation success/failure.**
- **Safety classification:**
  - **Requirement: Separate "safe" vs "unsafe" environments; apply different templates/rules.**
- **PDF generation:**
  - **Requirement: Produce envelope-ready PDFs with return addresses; validate address formatting.**
- **Queue management:**
  - **Requirement: Manage queues across OCR-derived and manual selections; pause/resume/cancel.**

**Data management and security**

- **Excel integration:**
  - **Requirement: Import/sync prisoner data from Excel; map columns; validate and deduplicate.**
  - **CPID sync: Update prisoner CPIDs and related fields; maintain a change log.**
- **PII protection:**
  - **Requirement: Enforce strict admin-only access to raw PII; sponsors see only redacted content; tokenize PII with an isolated mapping store.**
- **Session state management:**
  - **Requirement: Persist user session context (current letter, draft state) server-side with expiry.**
- **File organization:**
  - **Requirement: Structured storage of images, PDFs, and documents with predictable paths and metadata; redacted artifacts separated from originals.**

**Integration points**

- **OneDrive:**
  - **Requirement: Store redacted letters and sponsor submissions only; per-sponsor folders; idempotent sync push/pull.**
- **Redaction workflow:**
  - **Requirement: Visual redaction tools; thresholds and gates; override with audit reason; no external sync until safe.**
- **Sponsor portal:**
  - **Requirement: Simple browser access; view assignments; compose/submit; status tracking; MS365 login; no downloads of raw artifacts.**
- **Audit trail:**
  - **Requirement: Capture all access, edits, syncs, approvals, deletions with actor, resource, timestamp, and metadata.**

**Data model**

- **User: id (UUID), email, display_name, role, status, created_at.**
- **Prisoner: id (UUID), cpid (string), first_name, last_name, aliases, facility, address, safety_classification, updated_at.**
- **Letter: id, prisoner_id, created_by, intake_source, original_file_path (encrypted local), redacted_file_ref (OneDrive item id), status, tags, created_at, updated_at.**
- **LetterDates: letter_id, scanned_at, picked_up_at, postmarked_at, response_started_at, response_submitted_at, approved_at.**
- **OCRArtifact: id, letter_id, source_file_ref, text, confidence, blocks (JSON), transformations (JSON), created_at.**
- **Assignment: id, letter_id, sponsor_id, assigned_by, assigned_at, due_date, notes.**
- **Submission: id, letter_id, sponsor_id, content (HTML/markdown), attachments (array of file refs), onedrive_item_id, status, submitted_at, reviewed_by, reviewed_at.**
- **EnvelopeJob: id, batch_id, prisoner_id, template_id, environment (safe|unsafe), status, pdf_ref, created_at, completed_at, error.**
- **RedactionEvent: id, letter_id, method (ner|rule_based|manual), score, performed_by, performed_at, notes.**
- **AuditLog: id, actor_user_id, action, resource_type, resource_id, timestamp, metadata (JSON).**

**API specification**

- **Conventions: Base URL /api; JSON responses; HTTP status codes; auth required on all endpoints.**

**Auth and users**

- **GET /api/me:**
  - **Returns: user profile, role claims, feature flags.**
- **POST /api/users (admin):**
  - **Creates: sponsor/auditor; sends invite metadata; sets initial role.**

**Prisoners**

- **GET /api/prisoners:**
  - **Query: name, CPID, facility, safety classification.**
  - **Returns: paginated list.**
- **POST /api/prisoners/import/excel (admin):**
  - **Body: file upload + column mapping.**
  - **Behavior: validate, dedupe, upsert; return summary with errors.**

**Letters**

- **POST /api/letters (admin):**
  - **Body: file upload (multipart) or empty for new draft; prisoner_id; metadata.**
  - **Behavior: create letter; store original on encrypted volume; status=intake.**
- **PUT /api/letters/:id/content (admin):**
  - **Body: HTML/markdown; autosave flag.**
  - **Behavior: update content; maintain version history.**
- **POST /api/letters/:id/convert (admin):**
  - **Body: target_format (docx|pdf|txt).**
  - **Behavior: generate converted file; attach to letter.**
- **GET /api/letters (admin|sponsor):**
  - **Behavior: role-filtered list; sponsors see assigned redacted metadata only.**
- **GET /api/letters/:id (admin|sponsor):**
  - **Behavior: detail view; sponsor hides PII fields and original paths.**
- **DELETE /api/letters/:id (admin):**
  - **Behavior: soft-delete by default; optional hard-delete; audit.**

**OCR**

- **POST /api/ocr/:letter_id/images (admin):**
  - **Body: image/PDF uploads.**
  - **Behavior: store originals; return refs.**
- **POST /api/ocr/:letter_id/run (admin):**
  - **Body: {provider, enhancements, options}.**
  - **Behavior: apply enhancements; run OCR; persist OCRArtifact; attach to letter.**
- **GET /api/ocr/:letter_id/artifacts (admin):**
  - **Returns: OCR outputs with confidence, transformations.**

**Redaction**

- **POST /api/redact/:letter_id (admin):**
  - **Body: {method, thresholds, actions}.**
  - **Behavior: run redaction; compute score; generate redacted artifact; block external sync if below threshold unless override provided; log RedactionEvent.**

**Assignments and submissions**

- **POST /api/assignments (admin):**
  - **Body: {letter_id, sponsor_id, due_date, notes}.**
  - **Behavior: status=assigned; place redacted artifact in sponsor's OneDrive folder.**
- **GET /api/assignments (admin|sponsor):**
  - **Behavior: role-filtered list.**
- **POST /api/submissions (sponsor):**
  - **Body: {letter_id, content, attachments}.**
  - **Behavior: create submission; upload to OneDrive; status=submitted.**
- **POST /api/submissions/:id/approve (admin):**
  - **Behavior: approve; log audit; optional archive step.**
- **POST /api/submissions/:id/request-revisions (admin):**
  - **Body: {comment}.**
  - **Behavior: mark revisions_requested; notify sponsor.**

**Envelopes**

- **POST /api/envelopes/batch (admin):**
  - **Body: {prisoner_ids, environment, template_id}.**
  - **Behavior: enqueue jobs; return batch_id.**
- **GET /api/envelopes/batch/:batch_id (admin):**
  - **Returns: job statuses; downloadable PDFs.**

**Sync and audit**

- **POST /api/sync/push (admin):**
  - **Behavior: push redacted artifacts and assignments to OneDrive; idempotent.**
- **POST /api/sync/pull (admin):**
  - **Behavior: pull sponsor submissions; reconcile.**
- **GET /api/sync/status (admin):**
  - **Returns: recent operations.**
- **GET /api/audits (admin|auditor):**
  - **Query: actor, action, resource, time range.**

**Frontend specification (React)**

**Routing**

- **/login: Azure AD sign-in and callback.**
- **/admin: Intake, editor, OCR, redaction, assignments, envelopes, audits.**
- **/sponsor: Assigned letters, editor for submissions, status tracking.**

**Admin components**

- **Document editor:**
  - **Features: Markdown/HTML editing, autosave, version history, conversion actions.**
- **File upload interface:**
  - **Features: Drag-and-drop for DOCX/PDF/images; parsing status; error handling.**
- **OCR workstation:**
  - **Features: Image enhancement previews, OCR run controls, confidence visualization, prisoner matching UI.**
- **Redaction runner:**
  - **Features: Visual highlights; rules/NER toggles; score display; override dialog with audit reason.**
- **Workflow dashboard:**
  - **Features: Kanban-style board across statuses; bulk actions; filters.**
- **Envelope generator:**
  - **Features: Prisoner search; environment selection; batch queue; PDF download links.**
- **Audit viewer:**
  - **Features: Filter, sort, export; event drill-down.**

**Sponsor components**

- **Assigned letters list:**
  - **Features: Redacted previews; due dates; clear status indicators.**
- **Submission editor:**
  - **Features: Rich text, attachments, autosave drafts, submit flow, revision loop.**
- **Status timeline:**
  - **Features: Submission → review → approval; notifications.**
- **Curriculum Library:**
  - **Features: Read-only access to educational materials (PDF/DOCX).**
  - **Rendering:** DOCX files are converted to HTML on-the-fly (using Mammoth) for embedded viewing; they are not converted to Markdown.

**Security requirements**

- **Transport security:**
  - **TLS everywhere: Reverse proxy terminates HTTPS; HSTS; modern ciphers.**
- **Authentication:**
  - **Azure AD + MFA: MS365 sign-in; short-lived tokens; server-side session rotation.**
- **Authorization:**
  - **RBAC: Admin, Sponsor, Auditor; scope checks on every endpoint; default deny.**
- **Secrets and keys:**
  - **Storage: Environment variables or key vault; rotation; no hardcoding.**
  - **Separation: Different keys for file encryption vs. mapping store.**
- **Data protection:**
  - **At rest: Encrypted volumes (BitLocker/LUKS); file-level encryption for raw PII; non-root containers.**
  - **Redaction gate: No external sync until safe; override requires justification and audit.**
- **Audit and retention:**
  - **Append-only logs: Encrypted backups; retention policies and secure deletion workflows.**
- **Supply chain:**
  - **Minimal images: SBOM, CVE scanning, image signing; dependency pinning.**

**Deployment and configuration**

- **Services (docker-compose):**
  - **Reverse proxy: Nginx/Traefik with TLS; routes / to React, /api to FastAPI.**
  - **Backend: FastAPI app; background workers for OCR, redaction, sync (Celery or BackgroundTasks).**
  - **Frontend: React built assets served via proxy.**
  - **DB: Postgres with persistent encrypted volume.**
  - **Job runner: Scheduled sync and backup jobs.**
- **Environment variables (.env):**
  - **Auth: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.**
  - **DB: DATABASE_URL.**
  - **Crypto: FILE_ENCRYPTION_KEY, MAPPING_STORE_KEY.**
  - **Sync: ONEDRIVE_ROOT_FOLDER_ID, ONEDRIVE_SPONSOR_PREFIX.**
  - **OCR: OCR_PROVIDER (local|google_vision), GOOGLE_VISION_CREDENTIALS_PATH (optional).**
  - **App: BASE_URL, COOKIE_SECRET, TLS_CERT_PATH, TLS_KEY_PATH.**
- **OneDrive structure:**
  - **Root: /LettersApp/**
    - **Redacted/ per-letter folders.**
    - **Sponsors/{sponsor_id}/ submissions and assigned redacted copies.**

**Operational workflows**

- **Admin intake → editor → conversion:**
  - **Flow: Create/upload → edit/convert → autosave → assign prisoner → advance status.**
- **OCR and matching:**
  - **Flow: Upload scans → enhance → run OCR → review/correct → match prisoner → persist artifacts.**
- **Redaction and sync:**
  - **Flow: Run redaction → score gate → push to OneDrive → assign sponsor.**
- **Sponsor submission and review:**
  - **Flow: Sponsor composes → submit → admin reviews → approve or request revisions.**
- **Envelope printing:**
  - **Flow: Select prisoners → choose environment → generate batch PDFs → download/print.**
- **Auditing:**
  - **Flow: All actions logged; regular review via Audit viewer; export for reports.**

**Acceptance criteria**

- **Letter writing:**
  - **Criteria: Admin can create/edit letters; autosave works; DOCX/PDF/TXT conversions succeed; downloads enforce role and redaction rules.**
- **OCR:**
  - **Criteria: Images enhanced; OCR artifacts persisted with confidence; prisoner matching available; multi-page PDFs generated.**
- **Workflow:**
  - **Criteria: Status and date tracking visible; notes and images associated; deletion logged and enforced.**
- **Envelopes:**
  - **Criteria: Batch generation works; environment templates applied; PDFs valid for printing; queue statuses accurate.**
- **Sponsor UX:**
  - **Criteria: Sponsors log in via Azure AD; see assigned redacted letters; compose/submit; track status; never access raw PII.**
- **Sync:**
  - **Criteria: Push/pull idempotent; OneDrive folders reflect assignments and submissions; conflicts resolved with admin override and audit.**
- **Security:**
  - **Criteria: TLS enforced; secrets externalized; encrypted volumes; RBAC checks block unauthorized access; redaction gate prevents unsafe sync.**
- **Audit:**
  - **Criteria: Every significant action appears in AuditLog with actor, resource, timestamp, metadata; exports available.**

**Testing requirements**

- **Unit tests:**
  - **Targets: Models; RBAC guards; editor/conversion functions; OCR adapter(s); redaction rules; OneDrive client.**
- **Integration tests:**
  - **Flows: Intake → edit → redact → assign → sponsor submit → approve; OCR run and artifact persistence; envelope batch generation.**
- **Security tests:**
  - **Checks: Auth bypass; role escalation; secret misconfiguration; TLS refusal; redaction gate enforcement.**
- **Performance tests:**
  - **Goals: OCR throughput; batch envelope generation; sync job latency; dashboard responsiveness.**

**Documentation deliverables**

- **Admin guide: Intake, editing, OCR, redaction, assignments, envelopes, audits, retention.**
- **Sponsor guide: Login, view assignments, compose/submit, revisions, status tracking.**
- **Deployment guide: Server hardening, TLS, docker-compose, environment setup, backups.**
- **Security guide: Redaction pipeline, RBAC scopes, secrets, encryption, audit, retention.**
- **Handoff package: .env.example, docker-compose.yml, seed scripts, DB migrations, CI configuration, OCR provider adapter docs.**