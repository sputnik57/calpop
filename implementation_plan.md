# Implementation Plan: CalPOP Command Center (SRS-Aligned Update)

## Overview

This living document mirrors the roadmap defined in **Software_requirements_specification.md**. It summarizes what has been delivered, what is in progress, and what comes next for the Admin/Sponsor/Auditor workflows.

## Current Progress Snapshot (07Aug2026)

> **Note on this table's history:** prior versions of this table (12Dec2025) marked Phases 2, 3, 5, 7, 8, and 10 "✅ Completed" while the *Detailed Roadmap* section below them, for the same phases, said "Backend Schema Done." A code audit on 07Aug2026 confirmed the detailed-roadmap language was the accurate one — the summary table had drifted into aspirational status, not a record of what the code actually did. Statuses below are code-verified as of 07Aug2026; phases marked "Unverified" simply haven't been audited yet, not confirmed broken.

| Phase | Focus | Status | Notes |
| --- | --- | --- | --- |
| 0 | Foundation & development environment | ✅ Completed | Repo scaffolding, Docker, Traefik, dev TLS |
| 1 | Configuration & security scaffolding | ⚠️ Scaffolding only, not functional | `FILE_ENCRYPTION_KEY`/`MAPPING_STORE_KEY` in `.env` are still literal placeholder strings; `core/cipher.py`'s AES-GCM functions are never called anywhere. All PII on disk (scans, PDFs) is plaintext today. |
| 2 | Authentication, authorization & sessions | ✅ Completed (real MSAL, real RBAC) | Verified: real Azure AD auth-code flow, per-route role checks. **Open item:** Azure AD is a cloud dependency — conflicts with the "eliminate unnecessary internet communication" requirement and requires each deploying org to have a Microsoft tenant. Self-hosted auth is a candidate replacement (see Phase 11). |
| 3 | Prisoner data layer & Excel integration | ⚠️ Completed but duplicated | Postgres schema + Alembic real. **But:** the Excel-based `ExcelMapManager` ("Secure Vault") is a second, parallel PII store still live in `main.py`/`globals.py`, and it's the *only* place CDCR numbers are tracked — the Postgres `Prisoner` table has no CDCR column at all. A third store, the legacy SQLite `letters.db`, is also still wired in via `core/letter_db.py`. Three overlapping data stores, unreconciled. |
| 4 | Letter authoring & conversion workflow | ✅ Completed (backend + frontend) | Per 09Jan2026 handoff: editor, autosave (3s debounce), revision-request flow, full lifecycle test coverage in `server/tests/test_submission_workflow.py`. |
| 5 | OCR & prisoner matching workstation | ✅ Core loop real and tested (07Aug2026) | Local, fully offline OCR via Ollama (`qwen2.5vl:7b`) replaces the old Google Vision default and the old mock stub. Validated against real scans: printed/machine text (postage meter, barcodes) transcribes cleanly; handwritten reply-address blocks are unreliable — one test produced a garbled, undeliverable return address at 0.95 self-reported confidence, and cropping/upscaling did not fix it (the model hallucinated a plausible-sounding but wrong prison name instead). Self-reported confidence is not trustworthy as a QA gate. Fuzzy candidate matching (`MatchingService`, rapidfuzz) + a human-approval candidate list in `ScantronStation.jsx` now replace the old silent auto-CPID-detection — nothing is auto-selected, a person must pick the match. Redaction (Phase 6) is separate and still open. |
| 6 | Redaction pipeline & scoring gate | 🔄 Unverified | Table previously claimed "Visual redaction active in Scantron" — not independently confirmed in the 07Aug2026 audit. Needs a direct check before trusting this status. |
| 7 | Assignments & sponsor portal UX | 🔄 Unverified | Same caveat — detailed roadmap section historically said "Backend Schema Done," not "Completed." Needs re-verification. |
| 8 | Envelope printing & Batch Processing | 🔄 Unverified | Same caveat. Needs re-verification. |
| 9 | OneDrive sync & reconciliation | 🔄 Unverified | Same caveat. Also worth revisiting given the offline-communication goal — OneDrive sync is itself a cloud dependency; confirm it's actually wanted before building it out further. |
| 10 | Frontend app build-out | 🔄 Unverified (and UI is being redone regardless) | Project owner has flagged the current UI as not what they want; a frontend pass is planned independent of backend correctness. |
| 11 | Security hardening & compliance | 🔄 In Progress — punch list below | See "Security & Environment Findings" section. |
| 12 | Testing, performance & documentation | 🔜 Planned | 4 test files / 318 lines exist (`server/tests/`), covering Letter/Assignment/Submission service logic against in-memory SQLite — no coverage yet for auth, RBAC boundaries, file storage/encryption, or OCR/matching. |

If needed, requirements.txt packages are stored in mamba enviornment named calpop

## Security & Environment Findings (07Aug2026 audit + same-day remediation)

**Guiding constraint, newly made explicit:** this build should eliminate internet communication except where genuinely necessary — it handles PII for a prisoner-correspondence program, and the goal is a tool other 12-step program managers can self-host without depending on this project owner's cloud accounts. Every dependency below should be read against that bar, not just against "does it work."

**Fixed this session:**
- OCR no longer sends scanned letters/envelopes to Google's cloud by default. `OCR_PROVIDER` in `.env` switched from `google_vision` to `local`; `server/services/ocr_service.py` now calls a local Ollama vision model (`qwen2.5vl:7b`) over `localhost`/`host.docker.internal`, never the internet. Google Vision remains available as an opt-in fallback, off by default (kept intentionally for future deployments without a GPU).
- OCR → prisoner identity is no longer a silent auto-match. `MatchingService.find_candidates()` (rapidfuzz-based) ranks candidates; a human must click one in `ScantronStation.jsx` before a letter is filed against it. This was validated as necessary, not theoretical — real test scans showed the model confidently (0.95 self-reported) producing a wrong, undeliverable address.
- `COOKIE_SECRET` and the Postgres password are now real random values, pulled from `.env` into `docker-compose.yml` via `${POSTGRES_USER}`/`${POSTGRES_PASSWORD}`/`${POSTGRES_DB}` instead of a separate hardcoded copy. `.env` and the GCP service-account key file in `secrets/` are now `chmod 600`. Added a project `.gitignore` (there wasn't one) covering `.env`, `secrets/`, `data/`, `*.db`, `certs/`.
- **`/api/letters/scan/` and `/api/letters/scan/analyze` had zero authentication** — discovered by directly `curl`-ing the live running stack, not by static review. Anyone reaching port 8000 could query prisoner-matching candidates with no login. Both now require `require_admin`.
- Docker Engine installed natively inside WSL (no Docker Desktop / Windows dependency, consistent with the project owner's decision to close off WSL-Windows interop for security). Full stack (`db`, `backend`, `frontend`, `reverse-proxy`) verified actually running: migrations applied, RBAC enforcement confirmed live (401 without auth), OCR→matching pipeline confirmed correct end-to-end against a real sample scan (top-ranked fuzzy-match candidate was the correct real record despite an OCR misspelling in the surname).
- Along the way: fixed `host.docker.internal` resolution (native Docker Engine doesn't provide it for free like Docker Desktop does — added `extra_hosts` in `docker-compose.yml`) and Ollama's bind address (was `127.0.0.1`-only via its systemd service, unreachable from the Docker bridge network — rebound to `0.0.0.0` via a systemd override). **Worth periodically re-checking:** binding Ollama to all interfaces means it's reachable from anything that can route to this WSL VM, not just local Docker containers — confirm nothing outside this machine can actually reach it.
- Moved the frontend off port 3000 (conflicted with an unrelated `sm_post` project on this machine) to port 4000: `client/vite.config.js`, `docker-compose.yml`, `.env`'s `ALLOWED_ORIGINS`, and `client/Dockerfile`'s `EXPOSE` all updated and verified consistent.

**Still open, in rough priority order:**
1. `get_prisoner_details` (`server/main.py:213`) is gated by `require_admin_or_sponsor`, letting any sponsor pull any prisoner's real name/address by CPID. Per the program's actual model (sponsors work in CPID space; the manager resolves identity to answer/mail letters), this should be `require_admin`-only.
2. Encryption at rest is unimplemented despite Phase 1 claiming it done: generate real `FILE_ENCRYPTION_KEY`/`MAPPING_STORE_KEY` values and actually call `core/cipher.py`'s AES-GCM functions from the file-writing services (`artifact_service.py`, `envelope_service.py`, `ocr_service.py`) instead of writing plaintext.
3. Azure AD is a cloud login dependency; evaluate a self-hosted auth replacement (also unlocks distributing this tool to other program managers without a Microsoft tenant).
4. Reconcile the three overlapping prisoner data stores (Postgres `Prisoner`, `ExcelMapManager` vault, legacy SQLite `letters.db`) into one. At minimum, decide where CDCR numbers canonically live — right now it's Excel-only.
5. Delete confirmed dead code from the original Streamlit carryover: `core/database.py`, `core/ocr.py`, and the now-superseded pre-audit version of `services/matching.py`/`services/vector_db.py` (distinct from the still-used `services/matching_service.py`).
6. ✅ **Done (07Aug2026)** — secret rotation (see above). Two loose ends still need the project owner's own action, not something doable from here:
   - If `docker compose up` was ever run before today with the old `calpop/calpop` password, the Postgres data volume already has it baked in — the new `.env` value alone won't rotate a live database's password. Run `ALTER USER calpop WITH PASSWORD '<new password from .env>';` inside the `db` container if an auth error ever shows up (not observed today, since today's run happened to be against a fresh volume).
   - The GCP service-account key's *value* is still the original from July 2025 — file permissions/gitignore are locked down, but actually invalidating/reissuing the key needs the project owner's Google Cloud Console access.
7. Verify Phases 6–10's actual status directly (redaction, assignments/sponsor UX, envelope printing, OneDrive sync, frontend) — none of these were re-audited during the 07Aug2026 session; the table above marks them "Unverified," not confirmed broken or working.
8. Frontend redesign — project owner has said the current UI isn't what they want. Independent of all backend work above; do not block on it.

**Explicitly NOT a finding, clarified by the project owner:** the Caesar-cipher CPID scheme (`core/cipher.py`) is a human-communication convention (how sponsors/staff refer to a sponsee without using their real name), not a claimed security control. It stays as-is. It is unrelated to, and does not substitute for, the computer-security items above.

## Detailed Roadmap

### Phase 0 — Foundation & Development Environment
- **Goal:** Set up the modern project skeleton and local infrastructure.
- **Highlights:** Vite + FastAPI scaffolding, Docker Compose with Traefik, developer TLS certificates, health endpoints.
- **Status:** ✅ Completed (30Nov2025)

### Phase 1 — Configuration & Security Scaffolding
- **Goal:** Centralize settings, secrets, and file-system protections.
- **Highlights:** `server/config.py`, AES-256 helper, `.env`/`.env.example`, secure `data/` storage layout.
- **Status:** ✅ Completed (30Nov2025)

### Phase 2 — Authentication, Authorization & Sessions
- **Goal:** Replace Streamlit login with Azure AD + RBAC.
- **Highlights:** MSAL integration, `/api/auth/*` routes, session middleware, scoped access for admin/sponsor/auditor, `/api/auth/me`.
- **Status:** ✅ Completed (12Dec2025)

### Phase 3 — Prisoner Data Layer & Excel Integration
- **Goal:** Move prisoner/sponsor data into Postgres while keeping Excel uploads as the intake method.
- **Highlights:** SQLAlchemy models, Alembic migrations, Excel upsert pipeline, CSV export endpoints for prisoners, letters, sponsors.
- **Status:** ✅ Completed (12Dec2025)

### Phase 4 — Letter Authoring & Conversion Workflow
- **Goal:** Deliver markdown/HTML editor, templates, autosave, and conversions.
- **Implemented:** `/api/letters` CRUD, `/api/assignments` CRUD, conversion service (txt/docx/pdf).
- **Upcoming Tasks:** Frontend editor integration (Phase 10).
- **Status:** ✅ Backend Completed (12Dec2025).

### Phase 5 — OCR & Prisoner Matching Workstation
- **Goal:** Provide an OCR workstation similar to the Streamlit flow.
- **Upcoming Tasks:** Pluggable OCR providers (local/Google Vision), image enhancement, confidence visualization, matching heuristics.
- **Status:** 🔄 Backend Schema Done (12Dec2025).

### Phase 6 — Redaction Pipeline & Scoring Gate
- **Goal:** Implement redaction scoring, visual tools, and audit trails.
- **Upcoming Tasks:** Redaction service/UI, threshold enforcement, RedactionEvent logging.
- **Status:** 🔄 Backend Schema Done (12Dec2025).

### Phase 7 — Assignments & Sponsor Portal UX
- **Goal:** Recreate and expand sponsor experience with a modern UI.
- **Upcoming Tasks:** Assignment lifecycle, sponsor submission editor, revisions loop.
- **Status:** 🔄 Backend Schema Done (12Dec2025).

### Phase 8 — Envelope Printing & Queue Management
- **Goal:** Batch envelope generation with safety-aware templates.
- **Upcoming Tasks:** Envelope job queues, PDF rendering, queue dashboard.
- **Status:**  Backend Schema Done (12Dec2025).

### Phase 9 — OneDrive Sync & Reconciliation
- **Goal:** Automated push/pull between Postgres artifacts and sponsor folders.
- **Upcoming Tasks:** Graph client, scheduled jobs, conflict resolution workflows.
- **Status:**  Backend Schema Done (12Dec2025).

### Phase 10 — Frontend Application Build-Out (Unified Communication)
- **Goal:** Build the React application focusing on a "Unified Inbox" that handles both legacy PDF scans and future digital-only (Email API) messaging.
- **Highlights:** 
    - **Unified Inbox View**: One list for all prisoner communication (Scanned/OCR or Digital).
    - **Sponsor Response Station**: Data-first web editor (Markdown) that stores replies as searchable data.
    - **Dual-Output Engine**: A "Submit" flow that can generate a PDF (Current) or call an API (Future).
- **Status:** 🔄 In Progress (Building Unified Inbox foundation).

### Phase 11 — Security Hardening & Compliance
- **Goal:** Enforce security best practices and retention policies.
- **Upcoming Tasks:** TLS enforcement, secrets rotation, encrypted backups, image scanning.
- **Status:** 🔜 Planned.

### Phase 12 — Testing, Performance & Documentation
- **Goal:** Ensure reliability and produce handoff materials.
- **Upcoming Tasks:** Unit/integration tests, performance benchmarks, CI/CD, admin/sponsor/deployment guides.
- **Status:** 🔜 Planned.

## Operational Checkpoints (to date)

1. `mamba activate calpop`
2. `pip install -r server/requirements.txt`
3. `alembic upgrade head`
4. `docker compose down && docker compose up -d --build`
5. `docker compose logs -f backend`
6. `curl http://localhost/api/health`
7. Azure login via `http://localhost/api/auth/login`, inspect `calpop_session`
8. `curl -H "Cookie: calpop_session=<token>" http://localhost/api/auth/me`
9. Excel import: `POST /api/excel/upload` (admin) seeds Postgres
10. CSV exports: `/api/prisoners/export`, `/api/letters/export`, `/api/sponsors/export`
11. Frontend: `http://localhost:4000` (Direct Vite HMR) or `http://localhost:8090` (Traefik)

## Legacy Streamlit Continuity Notes

- Excel remains the canonical intake document; uploading it seeds Postgres exactly like the Streamlit app seeded SQLite.
- Export endpoints provide spreadsheet-ready views so admins can still download segments into Excel.
- Remaining phases carry forward the Streamlit capabilities (redaction tool, envelope printing, sync) with stronger security, automation, and role separation.

---
