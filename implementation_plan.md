# Implementation Plan: CalPOP Command Center (SRS-Aligned Update)

## Overview

This living document mirrors the roadmap defined in **Software_requirements_specification.md**. It summarizes what has been delivered, what is in progress, and what comes next for the Admin/Sponsor/Auditor workflows.

## Current Progress Snapshot (07Aug2026)

**Icon legend** (added 08Aug2026 — the icons below previously conflated confidence levels that shouldn't be conflated: ✅ was used both for things independently verified live and for things only ever claimed in someone else's handoff note; 🔄 was used both for "actively being worked" and "status genuinely unknown"):

| Icon | Meaning |
| --- | --- |
| ✅ | Completed **and independently verified** — either live-tested against the running app this session, or confirmed by direct code inspection this session. |
| 📋 | Completed **per inherited documentation only** — carried over from a prior handoff note or status doc, not independently re-checked. Plausible, not confirmed. |
| ⚠️ | Completed, but with a confirmed caveat or partial gap — verified, and the verification found a real issue. |
| 🔄 | Actively in progress right now. |
| ❓ | Unverified — status is genuinely unknown. Not confirmed working, not confirmed broken. |
| 🔜 | Not started / planned. |

> **Note on this doc's history:** earlier versions had two sections that quietly drifted apart — a summary table claiming phases "Completed" while the *Detailed Roadmap* section below it, for the same phases, said "Backend Schema Done." As of 08Aug2026 that's been restructured on purpose: this table is now just a quick-glance index (one icon, nothing else, so it can't drift into its own opinion), and **Detailed Roadmap** below is the one place status is actually explained. If the two ever disagree again, the detailed section is the one to trust.

Quick index — full explanation for each phase is in **Detailed Roadmap** below, this table is intentionally just the icon:

| Phase | Focus | Status |
| --- | --- | --- |
| 0 | Foundation & development environment | ✅ |
| 1 | Configuration & security scaffolding | ⚠️ |
| 2 | Authentication, authorization & sessions | ✅ |
| 3 | Prisoner data layer & Excel integration | ✅ |
| 4 | Letter authoring & conversion workflow | 📋 |
| 5 | OCR & prisoner matching workstation | ⚠️ |
| 6 | Redaction pipeline & scoring gate | ❓ |
| 7 | Assignments & sponsor portal UX | ❓ |
| 8 | Envelope printing & Batch Processing | ⚠️ |
| 9 | OneDrive sync & reconciliation | ❓ |
| 10 | Frontend app build-out | ❓ |
| 11 | Security hardening & compliance | 🔄 |
| 12 | Testing, performance & documentation | 🔜 |

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
1. ✅ **Done (08Aug2026):** `get_prisoner_details` (`server/main.py:213`) is now `require_admin`-only (was `require_admin_or_sponsor`). `get_prisoner_info` (anonymized) is unchanged. Verified live: endpoint still enforces auth (401 anonymous), and `require_admin`'s role check (`server/auth/dependencies.py`) structurally only accepts `ROLE_ADMIN` — a real sponsor session would get `403`. Not verified with an actual sponsor login (would need a real Azure AD session), so the role-distinction itself is confirmed by code inspection, not an end-to-end test.
1b. ✅ **Done (08Aug2026), not on the original list — found while starting item 2 below, more severe than anything else on this list:** `app.mount("/api/static/data", StaticFiles(...))` in `server/main.py` served every file under `data/` — including the full prisoner roster (`active_map.xlsx`, real names/CDCR#s/addresses), scanned envelope/letter images, and submission/envelope exports — to **anyone who could reach port 8000, with zero authentication**. Confirmed live with a raw unauthenticated `curl` before fixing (`HTTP 200` on the roster file). Root cause: Starlette's `StaticFiles` mount bypasses FastAPI's route-level `Depends()` auth entirely, so every other route being locked down didn't matter. Fixed with `StaticDataAuthMiddleware`, added *before* `SessionMiddleware` in `main.py` so Starlette's middleware ordering (most-recently-added = outermost = runs first) puts `SessionMiddleware` first, populating `request.state.user`, before the guard checks it. Requires any authenticated session (admin/sponsor/auditor) — not admin-only, since sponsors legitimately need some of these files (their own letter exports, the scan they're responding to) in normal workflow. Verified live with four cases: anonymous → 401, valid admin session → 200, valid sponsor session → 200, tampered/garbage token → 401 (sessions minted directly via `SessionManager` inside the container for testing, not via a real Azure AD login). **Remaining gap, not fixed:** this closes "anyone on the internet," not "a sponsor can only see their own files" — there's no per-resource ownership check, so any authenticated sponsor could still guess/enumerate another sponsor's filenames. That's a finer-grained authorization project, not done here.
2. ✅ **Done (09Aug2026).** Encryption at rest: database columns are genuinely encrypted (`MAPPING_STORE_KEY` is now a real generated key; new `EncryptedString` SQLAlchemy TypeDecorator in `db/encrypted_types.py` transparently encrypts/decrypts every identifying `Prisoner` column — name, address, city/state/zip, CDCR#, facility, housing, aliases — with AES-256-GCM; `cpid` and `safety_classification` stay plaintext since neither is identifying on its own and `cpid` is the join key used everywhere; verified with a raw `psql` query that Postgres genuinely stores ciphertext and that the ORM decrypts it back correctly). Along the way, `sync_with_postgres_prisoners` was completed (it was silently dropping CDCR number and safety classification) and a real mapping bug was fixed (Excel's `housing` column was being written into the `facility` Postgres column; the actual facility name, `Prison`, was never synced at all). Also added the roster's first real "view everything" endpoint (`GET /api/prisoners`) and an Excel export (`GET /api/prisoners/export`). **Generated files (scanned images, letter/envelope/batch PDFs, the saved roster `.xlsx`) are deliberately left unencrypted at rest — the project owner's explicit call, not a gap:** these sit on their own machine (bind-mounted, not sealed in Docker) under the same threat model as their existing hardcopy/PDF letter archive, and encryption would make routine daily use (open, review, print) meaningfully more cumbersome for a cost judged not worth paying. Agreed mitigation is a warning instead of encryption. Do not "fix" this by wiring `FILE_ENCRYPTION_KEY` in without asking first.
3. Azure AD is a cloud login dependency; evaluate a self-hosted auth replacement (also unlocks distributing this tool to other program managers without a Microsoft tenant).
4. ✅ **Partially done (09Aug2026):** Postgres vs. Excel is resolved — Postgres is the explicit source of truth (see Phase 3), CDCR numbers now live there too (encrypted), Excel is import/export only. **Still open:** the legacy SQLite `letters.db` (`core/letter_db.py`) remains a third, unreconciled store.
5. Delete confirmed dead code from the original Streamlit carryover: `core/database.py`, `core/ocr.py`, and the now-superseded pre-audit version of `services/matching.py`/`services/vector_db.py` (distinct from the still-used `services/matching_service.py`).
6. ✅ **Done (07Aug2026)** — secret rotation (see above). Two loose ends still need the project owner's own action, not something doable from here:
   - If `docker compose up` was ever run before today with the old `calpop/calpop` password, the Postgres data volume already has it baked in — the new `.env` value alone won't rotate a live database's password. Run `ALTER USER calpop WITH PASSWORD '<new password from .env>';` inside the `db` container if an auth error ever shows up (not observed today, since today's run happened to be against a fresh volume).
   - The GCP service-account key's *value* is still the original from July 2025 — file permissions/gitignore are locked down, but actually invalidating/reissuing the key needs the project owner's Google Cloud Console access.
7. Verify Phases 6–10's actual status directly (redaction, assignments/sponsor UX, envelope printing, OneDrive sync, frontend) — none of these were re-audited during the 07Aug2026 session; the table above marks them "Unverified," not confirmed broken or working.
8. Frontend redesign — project owner has said the current UI isn't what they want. Independent of all backend work above; do not block on it.
9. **Per-resource authorization is missing**, distinct from item 1b's fix. Today's fix closed "anyone unauthenticated" on `/api/static/data`; it did not add ownership checks, so any logged-in sponsor can still reach another sponsor's files by guessing/enumerating filenames. Applies more broadly too — worth auditing whether any other route scopes data by role but not by "is this actually yours."
10. **PII is leaking into plaintext application logs.** Observed 07Aug2026: a failed Excel→Postgres sync printed a real prisoner's full name, address, and facility straight into Docker's stdout logs. Not fixed. Needs the sync/logging code audited for anywhere row-level data gets logged on error, and switched to logging counts/IDs instead of full record contents.
11. **Test coverage doesn't cover anything security-relevant.** Existing tests (Phase 12, 318 lines) only exercise Letter/Assignment/Submission service logic. No tests for auth, RBAC boundaries (including today's two fixes), file storage, or OCR/matching.
12. **Documentation freshness is unverified.** `docs/admin_manual.md`, `docs/sponsor_manual.md`, and `docs/technical_deployment_guide.md` exist but haven't been checked against current reality — same failure mode that let `implementation_plan.md` itself drift before the 07Aug2026 audit.
13. **No data retention or legal-hold policy exists anywhere in the project.** Nothing defines how long scans, letters, or the roster should be kept, or under what authority. Worth finding out whether the program has an actual retention requirement before designing storage/backup around an assumption.
14. **No license has been chosen** for the now-public `calpop` repo. Doesn't block anything today, but matters the moment "someone else self-hosts this" becomes real rather than hypothetical — an unlicensed public repo defaults to "all rights reserved," which may not be what's wanted.

**Explicitly NOT a finding, clarified by the project owner:** the Caesar-cipher CPID scheme (`core/cipher.py`) is a human-communication convention (how sponsors/staff refer to a sponsee without using their real name), not a claimed security control. It stays as-is. It is unrelated to, and does not substitute for, the computer-security items above.

**Added 09/10Aug2026, worth its own callout — a git-history PII leak, not just a working-tree one:** two already-pushed commits had real CPID/CDCR numbers (fixed forward in a later commit, but never removed from history — the mistake this section is about was previously assumed to be fully closed once the working tree was clean, which turned out to be wrong). Found via a full `git log --all -p` scan, not the working-tree-only scan used until then. Fixed with `git-filter-repo` (surgical replace, all other commit messages preserved) + a force-push, verified afterward from an independent fresh clone of GitHub, not just by trusting the push output. `docs/pii_sanitization_checklist.md` now has a Step 5 covering exactly this, since scanning history is a heavier, once-per-session operation, not something to repeat after every commit.

## Envelope Mgt (new work, 09/10Aug2026 — not one of the original 12 SRS phases)

Came out of a direct requirements walkthrough with the project owner, not the
original SRS — a planned 5-tab UI reorg (Dashboard / Envelope Mgt / Letter
Mgt / DB Mgt / Sponsors) surfaced real, previously-undocumented process
detail. The full 12-stage (+ terminal codes) program process this is based
on is captured in **`docs/status_workflow.md`** — read that before touching
this area again; `Letter.status`'s current 12-value enum is a rough,
deliberately-incomplete stand-in for that real process, not yet reconciled.

- **Status:** ✅ Built and verified live (10Aug2026). An envelope scan now
  routes to one of two queues based on the prisoner's authoritative
  `Sponsor` value (synced from Excel to a new `Prisoner.sponsor_name`
  column, plaintext/unencrypted on purpose since it needs to stay cheaply
  queryable): no real external sponsor (blank, or the project owner's
  `"Course"` sentinel for self-handled cases) → the admin write queue
  (`queued_for_writing`); a real named sponsor → the letter-scan/OneDrive
  queue (`queued_for_letter_scan`), built out later in Letter Mgt.
- Classification (`classify_sponsor_name`/`resolve_envelope_routing_status`
  in `services/letter_service.py`) deliberately doesn't hardcode a sentinel
  list — it distinguishes real names (title-case) from status-code-looking
  entries (short all-caps tokens) and refuses to guess on anything that
  doesn't clearly fit either. Verified against all 16 real roster records:
  correctly handled 2 real sponsors and 4 "Course"/blank variants, and
  correctly flagged 7 real `DROP`/`CANX`-style entries as ambiguous rather
  than silently misrouting them.
- Ambiguous cases require an explicit human decision: `POST
  /api/letters/scan/` returns `409` with the raw sponsor value and a
  `routing_status_override` field to resubmit with. Verified live: `409`
  without an override, success with one, both confident cases auto-route
  correctly without needing one.
- New `POST /api/prisoners` for the not-found branch — generates a random,
  unique CPID (not derived from name/CDCR#, unlike the legacy
  `core/letter_db.py` generator, which has a bug: it can only ever produce 2
  real letters from 2 initials, padded with `'X'`).
- `postmarked_at` and `picked_up_at` (PO-pickup date) now actually get
  populated — both columns already existed in `LetterDates` but nothing
  wrote to them. `postmarked_at` is a best-effort OCR guess, always
  human-confirmable, same discipline as everywhere else OCR is used here;
  `picked_up_at` is always a manual entry (staff's handwritten note, distinct
  from the postal service's own postmark).
- `GET /api/prisoners` and the Excel export now include `sponsor_name` and a
  computed (not stored) `letters_received_count`.
- Found and fixed along the way: a bug where the Postgres enum had the two
  new statuses (confirmed via raw SQL) but the SQLAlchemy `Enum()`
  definition in `db/models.py` still had the old hardcoded list, so the ORM
  itself rejected them until both were updated.
- **Frontend side built 18Aug2026** (was the "not done yet" below): real
  5-tab nav (`Layout.jsx`/`App.jsx`), `EnvelopeMgtPage.jsx` with Scan & Find
  Person (wraps existing `IntakeArea`), Add New Person (wired to `POST
  /api/prisoners`), and Print Envelopes (batch logic moved out of
  `PrisonersPage.jsx` as planned). `PrisonersPage.jsx` (DB Mgt) got a
  per-record Edit → Update Person form, calling a `PATCH
  /api/prisoners/{cpid}` endpoint that doesn't exist yet on purpose (fails
  with an explicit "not wired up yet" message, not a silent no-op). Whole
  app recolored to a CDCR-derived palette — see
  `docs/color_palette_options.md`. Ambiguous-routing prompt (the `409` +
  `routing_status_override` flow) still has no frontend UI.
- Also 18Aug2026: the roster has more columns than Postgres was capturing
  (`Stage`, `Intake #`, contract/verification/language/notes/BPH-date
  fields) — they were being read into an in-memory pandas dataframe for
  dashboard stats but never persisted. Migration `525e61add4e2` adds them
  to `Prisoner`; `excel_manager.py`'s sync/diff path now carries them
  through. `review_notes`, `date_of_contract`, and `date_sponsor_assigned`
  are encrypted at rest; `bph_date` and everything else in that batch is
  plaintext (matches the existing `sponsor_name`/`Stage` precedent for
  fields that need to stay queryable/displayable without a decrypt pass).
- **Built 22Aug2026** (was "Scoped, not built" below) — closing the loop
  from scan to print, plus the letter status-history table:
  1. **Address verification.** `MatchingService._address_score` fuzzy-matches
     the on-file address alone (not name/facility) against the raw OCR text
     and returns it per-candidate as `address_score` — automated, but never
     applied on its own. `ScantronStation.jsx`'s confirm step shows the
     on-file address next to that score with "Matches" / "Doesn't Match"
     buttons; "Doesn't Match" reveals an editable correction that updates
     the roster on save. Either path sets `address_verified: true` in the
     `POST /api/letters/scan/` payload — that's the actual gate
     `LetterService.create_letter_from_ocr` checks, not the score.
  2. **`letter_exchange_count` increment** — happens in the same method,
     gated on `address_verified` being `true`.
  3. **Print queue** — went with the flag/timestamp column as expected:
     `Prisoner.queued_for_printing_at` (migration `da35999b240d`). Set on a
     verified scan confirm, or manually via the new
     `POST /api/prisoners/{cpid}/queue-for-printing`
     (`DELETE` to remove); cleared automatically in `BatchService.process_batch`
     the moment that prisoner's envelope is actually generated.
  4. **Print Envelopes tab** now shows `GET /api/prisoners/print-queue`
     instead of the full roster, plus a search box (`EnvelopeMgtPage.jsx`)
     that lazily fetches the full roster only to power search-and-add —
     never displayed as a browsable list.
  5. **Letter status-history table** — `LetterStatusHistory` (same
     migration), one append-only row per status a letter has ever held
     (via `LetterService._log_status`, called from `create_letter`,
     `create_letter_from_ocr`, and `update_letter` on an actual change).
     Exposed at `GET /api/letters/{id}/history`. Schema decisions that were
     open when this was scoped, now settled: sub-steps (e.g. "6a", "8S")
     are NOT structured — `note` is free text, unused so far; this table
     sits *alongside* `Letter.status` (denormalized current value for fast
     queries) rather than replacing it.
  - **Verified directly against the running stack** (not just read): full
    scan→verify→increment→queue round trip, the address-correction path,
    manual queue add/remove, and — by invoking `BatchService.process_batch`
    directly, bypassing a pre-existing unrelated auth gap (dev-login's
    session user isn't linked to a `User` row, so `get_db_user` 403s on
    `POST /api/letters` and `/api/batch/letters`; not fixed, out of scope
    here) — that a successful batch print clears the queue. All test
    writes were made against a real roster record (there was no synthetic
    one available in this dev DB at the time) and were cleaned up /
    restored afterward (letters deleted, `letter_exchange_count` and
    `queued_for_printing_at` reset, address restored to its original
    value) — nothing left behind in this environment's dev DB.
  - **Not done:** no frontend for `GET /api/letters/{id}/history` yet (API
    only); the pre-existing `get_db_user` 403 above.
- **Also 22Aug2026: Add New Person now generates a Caesar-cipher CPID** from
  the entered name/CDCR#, not a random one. `core/cipher.py` gets
  `generate_cpid_from_info` (shift=1 default) -- the "ABC123" format,
  fixing a real bug in the older `core/letter_db.py` generator: that one
  only ever fed 2 real letters (the two initials) into a 3-letter slot, so
  the 3rd letter was ALWAYS a fixed 'X' pad, well short of the letter-space
  it should've had. The new version pulls up to 3 real letters from the
  first+last name concatenated and only pads with 'X' when there genuinely
  aren't enough (e.g. both names blank). Still deterministic for a given
  shift, so `POST /api/prisoners` retries at increasing shifts (1-25) on a
  collision before falling back to the old fully-random generator as a
  last resort -- verified live: two people with the *same* name+CDCR#
  correctly got two different, non-colliding CPIDs (`TBN456` then
  `UCO567`, shift 1 then 2). Test records deleted afterward, real 16-record
  roster count unaffected. This is the human-communication convention
  documented earlier in this file, not a security control.
- **Also 22Aug2026: OCR/scan matching now recognizes non-CDCR register
  number formats** — prompted by a real case (someone administered from
  outside CDCR, federal-BOP-style number like `66475-511`, no letters at
  all). `services/matching_service.py`'s `_ID_PATTERNS` only ever matched
  letter-prefixed IDs (`X99999`, `ABC123`), so a scan for this kind of
  person would silently fall through to the much weaker free-text
  name/address score instead of the strong ID-token signal. Added a
  digits-only pattern (dash optional, since OCR won't always transcribe it
  cleanly) and a `_normalize_id()` helper that strips dashes/spaces before
  comparing, so `66475-511` and `66475511` score a full match against each
  other regardless of which form was scanned vs. which form is on file.
  Same fix applies to CDCR numbers typed with/without a dash. Found and
  fixed in passing: `_score_postgres_rows`'s `cdcr_number` was hardcoded to
  `None` with a stale "not tracked in Postgres" comment — that's been a
  real `Prisoner` column since before this session, just never read here.
  Verified live: a synthetic record with `cdcr_number="66475-511"` scored
  a full 100% match against OCR text containing the number *without* the
  dash, correctly outranking every real roster record (~40% on name/address
  text alone); test record deleted immediately after.
- **Scoped, not built (22Aug2026): `ScantronStation.jsx`'s scan-confirm
  screen has grown a lot in one sitting** (Config, Image Tuning, the
  capture stage, then in the confirm modal: OCR text, Candidate Matches,
  Address Verification, and the new Routing card, all visible at once) —
  flagged directly, deferred in favor of operational correctness over
  refinement for now. Three changes agreed but not built:
  1. Turn the confirm flow into real steps (Capture → Confirm Person →
     Verify Address & Route) instead of one long scrollable screen.
  2. Collapse Image Tuning (contrast/brightness) under an "Advanced"
     toggle, default closed — rarely touched.
  3. Merge the Routing card into the same card as Address Verification
     (steps 1 and 3 combine naturally: "Verify Address & Route" becomes
     one step, not two).
- **Rey's full correspondence workflow, given 22Aug2026** — the real
  end-to-end process, receiving through mailing and retention/disposal.
  Documented in full outside this repo (private session memory); the
  actionable feature backlog it produced, all explicitly deferred
  ("later, not now") rather than built this session:
  1. **Priority ordering** for a batch of unprocessed letters (first-time
     responders → oldest-before-newest → other sponsors' sponsees before
     Rey's own). Manual today on purpose; automation candidate later.
  2. **Active/inactive decision on new-prisoner intake** — belongs in the
     **Sponsors tab**, not Envelope Mgt (Rey's correction).
  3. **OneDrive folder creation + upload** — two different naming
     conventions (digitize-incoming step vs. post-writing step; Rey's own
     sponsees vs. others'). Not yet sifted through in detail; will land in
     **Sponsors tab and Letter Mgt tab**, not Envelope Mgt.
  4. **Email/SMTP via Dreamhost** for a *series* of notifications — the
     Green Book list goes to the **ISO of SAA** (the organization Harvey
     worked for, not Harvey personally, who has passed away) — a stable,
     role-based recipient.
  5. Safety-issue handling (note in spreadsheet, notify sponsor, hand them
     the safety SOP) — not yet placed in a specific tab.
  6. "Never give out contact information" on a sponsorship request — a
     hard rule, not currently enforced anywhere in the app.
  7. Letter Mgt (reading/writing) not built or verified against this real
     process.
  8. **Retention/disposal policy is an open question from Rey himself**
     (how long to keep physical letters, when research retention ends,
     disposal method) — explicitly not a build task until he decides, not
     something to guess at.
- **Letter Mgt planning (22Aug2026) — redaction + OneDrive, not built yet.**
  Reviewed the legacy Streamlit app first: it had NO redaction (a manual
  out-of-app process, just a text field for a path) and NO OneDrive
  integration (hardcoded path strings shown as copy-paste hints only,
  `directory_selection_widget()`'s return value was hardcoded to `""`).
  Two real findings that change the plan:
  - **Redaction already exists in the current app** — `ScantronStation.jsx`'s
    crop box + draggable black-box redaction, burned into the canvas before
    upload (built for Envelope Mgt's person-matching scan). Letter Mgt's
    "Scan Letter" (redacting letter CONTENT before it goes to an external
    sponsor) should reuse this mechanism, not rebuild it.
  - **Local filesystem access is off the table.** Windows (where the
    OneDrive-synced curriculum/letter folders live) is air-gapped from the
    Linux side running the Docker backend — confirmed directly by Rey. So
    both curriculum-file reference (for when Rey writes letters himself)
    and OneDrive folder/file operations (Rey's `exchangeX` folder + the
    `TOD_ID_DATE_COUNT`/`ID_NOC_out` naming from the correspondence
    workflow doc) require real Microsoft Graph API integration — auth,
    create-folder, upload, list, download. The codebase already has unused
    scaffolding for this (`config.py`'s `onedrive_root_folder_id`/
    `onedrive_sponsor_prefix`, `db/models.py`'s `storage_backend` enum and
    `onedrive_item_id` column) but zero actual API calls anywhere.
    **Added 22Aug2026: `list_folder` also needs to power kanban-like
    reporting on letter processing** — not just a write-path helper for
    uploads, a first-class read/reporting use case in its own right.
    Confirmed 22Aug2026: the bottleneck-reporting data comes from **both**
    OneDrive folder state (via `list_folder`) **and** Postgres
    `LetterStatusHistory` (built earlier 22Aug2026) — not one or the
    other. Design/build of the actual reporting view is deferred until
    both data sources exist ("stop when we get there").
  - Not decided yet: which Azure AD auth flow for the Graph API calls
    (app-only vs. Rey's own delegated login), exact scopes, and whether
    Scan Letter shares a component with Envelope Mgt's scan UI or is a
    tailored parallel copy. OneDrive folder-structure branching (individual
    sponsor vs. "the Course") also depends on Sponsors tab data that
    doesn't exist yet.
  - **Curriculum access is split, decided 22Aug2026 — and corrected again
    same day: turns out NEITHER curriculum NOR Rey's own past letters need
    the Graph API at all.** Generic 12-step worksheets/program materials
    go **public on GitHub**, own separate repo (not a folder in
    `sputnik57/calpop` — Rey's call, "can have a life of its own"), source
    of truth going forward, doubling as outreach material. `unsafe.docx`
    (word-substitution guidance, e.g. "disease"/"addiction" instead of
    "sex") is **also fine to publish** — corrected 22Aug2026: it's
    sponsor-safety-from-inmates guidance, not a CDCR-mail-screening
    workaround as first assumed. Rey's own past letters stay private on
    his own Windows machine, not migrating, and **don't need the API
    either** — he opens them directly, the app doesn't need to broker it.
    **Net effect: the OneDrive Graph API (item 3 above) is needed for
    exactly one thing — uploading redacted letters to OTHER sponsors'
    OneDrive folders**, not curriculum, not Rey's own reference reading.
    Still open: the new curriculum repo's name/location, a
    license/use-conditions doc, and Rey still needs to sort which existing
    curriculum documents are actually safe to publish (likely a smaller
    private set than first thought).
- **Sponsors tab MVP — built 22Aug2026 (Step 1 of the confirmed build
  sequence).** Directory + Add Sponsor, backend and frontend both wired
  and verified live (dev-login session, curl + browser).
  - New `Sponsor` table (`db/models.py`), separate from `User` (login
    identity) — most sponsors never log into CalPOP; Rey manages
    everything on their behalf. No auth on this table by design.
    Matched to `Prisoner.sponsor_name` by plain name string, not a
    foreign key, so it can't break the Excel-synced routing logic
    (`classify_sponsor_name`) on a naming mismatch.
  - Fields: `name`, `pseudonym`, `email`, `phone`, `sponsor_type`
    (`individual` | `course`), `onedrive_folder_link`. Migration
    `31dd35515eac` applied.
  - New router `api/sponsors.py`, mounted at `/api/sponsor-directory`
    (deliberately not `/api/sponsors` — that path already exists,
    Excel-roster-backed, and `/api/sponsors/{sponsor_name}/prisoners` is
    a dynamic route that would collide). CRUD: list (with a computed
    `sponsee_count` per sponsor, grouped off `Prisoner.sponsor_name`),
    create, update, delete.
  - `SponsorsPage.jsx` — Directory table (name, type badge, contact,
    sponsee count, OneDrive link) + Add Sponsor form, `SubTabs` pattern,
    matches existing CDCR palette/form conventions.
  - Next per the confirmed sequence: OneDrive Graph API foundation (auth
    approach still Rey's call — app-only vs. delegated), then Letter Mgt
    "Scan Letter" redaction flow, then wiring Scan Letter output to
    OneDrive upload using the `exchangeX`/naming conventions, branching
    on `Sponsor.sponsor_type`.
- **`StorageService` interface — built 22Aug2026, in front of OneDrive
  work, not after it.** Rey's question: what does a future CalPOP user
  do if they have no OneDrive account, or no cloud storage at all? Answer:
  don't couple the app to Microsoft Graph directly — put a small
  interface in front of it.
  - New `services/storage_service.py`: abstract `StorageService`
    (`create_folder`, `upload_file`, `list_folder`, `download_file`),
    addressed by logical slash-separated paths (e.g.
    `SponsorName/exchange3`), never backend-specific IDs — callers never
    know or care which backend is live.
  - `LocalStorageService` — real, working, plain files under
    `data/storage/`. **This is the default** and needs zero cloud
    account of any kind; it's what a from-scratch deployment runs on
    out of the box.
  - `OneDriveStorageService` — real, built same day (see next entry).
  - New `Settings.storage_backend` config field (`local` default |
    `onedrive`), mirrors the existing `ocr_provider` pattern exactly —
    one setting picks the implementation, nothing else branches on it.
  - Verified live in the running container: create/upload/list/download
    round-trip on the local backend, a path-traversal attempt (`../..`)
    correctly rejected.
  - Not yet wired into any endpoint — Letter Mgt's "Scan Letter" flow
    (still not built) will be the first real caller.
- **OneDrive Graph API — built and verified live, 22Aug2026.** Auth
  decision: **delegated, against Rey's own personal Microsoft account**
  (his choice, "I'm familiar with it"), not app-only. Real Azure app
  registration reused (an existing but unused/expired one, "OneDrive-CalPOP
  UI") rather than creating a new one — required reconfiguring it (see
  below) since it had been set up for org-tenant-only auth.
  - Azure setup done via the Portal: switched "Supported account types"
    to multi-tenant + personal accounts (required first fixing the app
    manifest's `requestedAccessTokenVersion` from `null` to `2` — Azure
    silently refuses the account-type change otherwise, since personal
    accounts only work over the v2 token endpoint), added the Web
    redirect URI, issued a fresh client secret (old one expired),
    confirmed `Files.ReadWrite` + `offline_access` delegated permissions.
  - New `OneDriveConnection` DB table (migration `42fe77a5be6a`) — a
    single row (one OneDrive connection for the whole deployment, not
    per-admin-login), `access_token`/`refresh_token` both `EncryptedString`.
  - New `services/onedrive_service.py`: builds the Microsoft login URL,
    exchanges the auth code, transparently refreshes the access token
    (silent, ~1hr lifetime) before every Graph API call. `OneDriveStorageService`
    implements the `StorageService` interface for real against
    `graph.microsoft.com` — `create_folder`/`upload_file`/`list_folder`/
    `download_file` all Graph API calls now, not stubs.
  - New router `/api/integrations/onedrive` (login/callback/status/
    disconnect), admin-only. Uses the `/common` authority, never
    `AZURE_TENANT_ID` — personal accounts aren't members of that tenant
    (a separate, unrelated app registration/tenant is used for the
    existing admin/sponsor login flow).
  - **Live end-to-end verified**, not just unit-tested: real OAuth login
    completed (code-server's browser-based dev environment required
    testing through `localhost:8090` directly rather than its
    proxy-forwarded port UI, to keep the session cookie and the OAuth
    redirect URI on the same origin), `connected: true` confirmed via
    `/status`, then create/upload/list/download all round-tripped
    against Rey's actual OneDrive (test folder created and deleted
    afterward). One bug found and fixed along the way:
    `ONEDRIVE_ROOT_FOLDER_ID` in `.env` was wrapped as a JSON-array
    string (leftover from earlier unused scaffolding) but the config
    field expects a plain string — Graph API rejected the malformed ID
    until the `.env` value was unwrapped to a bare string. Also fixed:
    `download_file` needed `follow_redirects=True` — Graph's
    `/content` endpoint 302s to a signed SharePoint download URL.
  - **Real existing folder structure discovered by browsing the live
    account** (Rey: "instead of creating a folder, I have folders
    already in use" — don't invent a new structure). Under
    `CAL POP/...PRISONERS/{SponsorPseudonym}/{CPID}/` there isn't one
    templated "exchange folder" — it's a growing set of SIBLING
    exchange subfolders, one per round of correspondence, each holding
    that round's own file(s): `intro-sent/` (first letter), then
    `exchange1-sent/`, `exchange2-3-sent/` (a combined range, when two
    exchanges went out together), `exchange4-sent/`, etc., accumulating
    over the life of the correspondence. **Corrected 22Aug2026 — an
    earlier draft of this note wrongly implied a single `exchange{N}-sent`
    slot per CPID; Rey caught this.** The top-level names under
    `...PRISONERS` are **sponsor pseudonyms** — what the sponsee sees,
    not the sponsor's real name — confirmed by Rey directly (initial
    assumption that the CPID-shaped subfolder names were real CDCR
    numbers was wrong and corrected by Rey; they're actual CPIDs,
    consistent with how the rest of the app anonymizes).
  - **The `-sent` suffix is a downstream state marker, not part of the
    upload-time name — corrected 22Aug2026 (Rey).** When CalPOP uploads
    a redacted incoming letter for a sponsor to read, the folder it
    creates/targets is plain `exchangeX` (no suffix) — this matches the
    `list_folder`/create-folder step at digitize-incoming time. The
    `-sent` suffix only gets added later, by Rey himself, once he's
    downloaded the sponsor's written reply, printed it, and mailed it to
    the prisoner — it marks "this round is fully closed out," not
    "a file exists here." So the automated upload path must never
    append `-sent` itself; that rename is Rey's own manual step
    (possibly a future automation candidate, but not assumed or built
    now).
  - **Each exchangeX upload also needs a blank reply doc, decided
    22Aug2026 (Rey).** The upload step doesn't just drop the redacted
    incoming letter(s) into the new `exchangeX` folder — it also creates
    a blank `.docx` alongside them, pre-placed for the sponsor to type
    their response directly into. Content: a single placeholder line,
    `"Respond here"` (not empty, not a longer template/instructions
    block). Filename: matches the existing `ID_NOC_out` convention —
    `{CPID}_{exchange_number}_out.docx` (e.g. `ABC123_5_out.docx`) — same
    naming Rey already uses for his own outgoing letters, so the file
    that eventually gets downloaded/printed/mailed already has its final
    name from the moment it's created. `services/artifact_service.py`
    already generates `.docx` via `python-docx`
    (`SubmissionArtifactService`) — reusable for this, not a new
    dependency.
    `Sponsor.pseudonym` (already a field on the Sponsor table from the
    Sponsors tab MVP, unused until now) against the OneDrive folder
    name — not `Sponsor.name`. Rey enters each sponsor's pseudonym via
    the existing Add/Edit Sponsor form to wire up the mapping; no schema
    change needed. The real pseudonym↔sponsor mapping also exists in a
    "sponsor sheet" in Rey's Excel roster file, not currently read by
    the app anywhere — a one-time import would save re-typing pseudonyms
    by hand, but its column structure hasn't been seen yet, so this is
    noted as a future option, not built or assumed.
  - **The write path — built and verified live, 22Aug2026.** New
    `LetterService.upload_redacted_to_sponsor_onedrive(letter_id, files,
    changed_by)`: resolves the letter's prisoner → `sponsor_name` →
    matching `Sponsor` row → `Sponsor.pseudonym`; exchange number is the
    letter's own `letter_exchange_count` (Prisoner's count at
    scan-confirm time — correct as long as no other letter for the same
    prisoner is processed in between, which holds for the current
    single-operator workflow); builds
    `CAL POP/...PRISONERS/{pseudonym}/{cpid}/exchange{N}` (plain, no
    `-sent`, per the correction above), creates it via the
    `StorageService`, uploads each redacted page, then generates and
    uploads the blank `{cpid}_{N}_out.docx` reply doc (new
    `services/artifact_docx.py` — in-memory `python-docx`, distinct from
    `SubmissionArtifactService` which writes to local disk instead of
    handing bytes to a storage backend). Sets `Letter.status="redacted"`
    and logs it to `LetterStatusHistory`. Raises a clear `ValueError` —
    not a silent skip — if the sponsor has no matching `Sponsor` row or
    no pseudonym set, since both are required to resolve the folder and
    both are Rey's own data-entry gaps to fix via the Sponsors tab, not
    something the app can guess at.
  - New endpoint `POST /api/letters/{letter_id}/upload-redacted`
    (admin-only), takes base64-encoded redacted page(s).
  - **Live-verified end-to-end against the real OneDrive account**, not
    just the local backend: test `Sponsor`/`Prisoner`/`Letter` rows
    created, the service call actually ran against
    `storage_backend=onedrive`, and the resulting
    `exchange3/page1.jpg` + `exchange3/ZZT999_3_out.docx` were confirmed
    present in the real account (one transient `httpx` read-timeout hit
    on the reply-doc upload during testing — the file had actually
    already landed server-side despite the client-side timeout; not a
    code bug). All test data removed afterward — the OneDrive test
    folder deleted via the Graph API, local storage test dir removed,
    DB rows cleaned up.
  - **Frontend built too (scoped down 22Aug2026):** new
    `ScanLetterUpload.jsx` (`/letters/:id/scan`, linked from a "Scan"
    action on `LettersPage`) — a plain multi-file picker that
    base64-encodes the selected file(s) client-side and posts them to
    the new endpoint, showing the resulting OneDrive folder path on
    success. **Deliberately NOT the real redaction capture screen** — it
    assumes the file(s) picked are already redacted; it does no
    cropping/black-boxing itself. The actual webcam+crop+black-box
    capture UI for letter content pages (reusing or duplicating
    `ScantronStation.jsx`'s existing mechanism) was explicitly scoped
    OUT of this pass and remains future work.

## Detailed Roadmap

### Phase 0 — Foundation & Development Environment
- **Goal:** Set up the modern project skeleton and local infrastructure.
- **Highlights:** Vite + FastAPI scaffolding, Docker Compose with Traefik, developer TLS certificates, health endpoints.
- **Status:** ✅ Completed. Verified 07–08Aug2026 by actually standing the full stack up (native Docker Engine in WSL, no Docker Desktop) and running it.

### Phase 1 — Configuration & Security Scaffolding
- **Goal:** Centralize settings, secrets, and file-system protections.
- **Highlights:** `server/config.py`, AES-256 helper (`core/cipher.py`), `.env`, `data/` storage layout.
- **Status:** ⚠️ Partially functional, and partially a **deliberate decision, not a gap** (updated 09Aug2026). `MAPPING_STORE_KEY` is now real and in active use — Postgres's `Prisoner` PII columns are genuinely encrypted at rest (verified via raw SQL). `FILE_ENCRYPTION_KEY` is still a placeholder, and scanned images / the saved `data/active_map.xlsx` roster file / generated letter, envelope, and merged-batch PDFs are plaintext on disk (`./data:/app/data` is a bind mount — these are real files directly on the project owner's own computer, not sealed inside Docker). **Explicitly decided (09Aug2026) not to encrypt these**: the project owner already has a large existing archive of hardcopy and plaintext PDF letters on the same machine under the same threat model, and encryption would make daily use (opening, reviewing, printing) meaningfully more cumbersome for a cost they judged not worth paying. A warning (not encryption) is the agreed mitigation — see punch list item 2b. Do not "fix" this by wiring file encryption without asking first.

### Phase 2 — Authentication, Authorization & Sessions
- **Goal:** Replace Streamlit login with Azure AD + RBAC.
- **Highlights:** MSAL integration, `/api/auth/*` routes, session middleware, scoped access for admin/sponsor/auditor, `/api/auth/me`.
- **Status:** ✅ Completed, and independently verified twice: the original 07Aug2026 audit confirmed real MSAL + real per-route role checks (not stubbed); the 08Aug2026 session then found and fixed two RBAC gaps (`get_prisoner_details` was reachable by any sponsor; the `/api/static/data` file mount had **no auth at all**, exposing the full roster) and verified the fixes live with minted test sessions. **Open item:** Azure AD is a cloud dependency — conflicts with the offline-communication goal and requires a Microsoft tenant per deploying org. Self-hosted auth is a candidate replacement.

### Phase 3 — Prisoner Data Layer & Excel Integration
- **Goal:** Postgres as the actual source of truth for prisoner data; Excel as an on-demand import/export convenience, not a parallel authority.
- **Status:** ✅ Reworked and verified live (09Aug2026), decision explicitly made with the project owner: **Postgres is the source of truth.** In-app edits (during envelope processing and letter writing) are canonical; Excel is for offline review/edits you choose to bring in, or a snapshot you download when you don't want to run the app.
  - PII columns encrypted at rest (AES-256-GCM), full sync including CDCR number/housing/safety classification (previously silently dropped), `GET /api/prisoners` + `GET /api/prisoners/export` for viewing/downloading — see punch list item 2 for detail.
  - The dangerous part of the old model — Postgres getting unconditionally overwritten by whatever Excel file sat on disk, on every container restart — is gone. Startup now only loads Excel into memory (harmless); the database is never touched except by an explicit upload.
  - Excel upload is now two-step: `POST /api/excel/upload/preview` stages the file and returns a diff against current Postgres (new / changed with field-level detail / unchanged / present-in-DB-but-missing-from-file); `POST /api/excel/upload/apply` commits only after that's reviewed. Records missing from the uploaded file are never deleted. Verified live with a real modified file before committing.
  - **Still open:** the legacy SQLite `letters.db` (`core/letter_db.py`) is a third store, still wired in, unreconciled — this phase closed the Postgres/Excel duplication, not that one.

### Phase 4 — Letter Authoring & Conversion Workflow
- **Goal:** Deliver markdown/HTML editor, templates, autosave, and conversions.
- **Implemented:** `/api/letters` CRUD, `/api/assignments` CRUD, conversion service (txt/docx/pdf).
- **Status:** 📋 Completed (backend + frontend), per an inherited 09Jan2026 handoff note (editor, autosave with 3s debounce, revision-request flow, test coverage in `server/tests/test_submission_workflow.py`). **Not independently re-verified** during either the 07Aug2026 or 08Aug2026 sessions — plausible, taken on trust, not confirmed firsthand.

### Phase 5 — OCR & Prisoner Matching Workstation
- **Goal:** Provide an OCR workstation similar to the Streamlit flow.
- **Status:** ⚠️ Core loop is real and tested (07–08Aug2026), with a confirmed accuracy caveat. OCR now runs fully offline via a self-hosted Ollama vision model (`qwen2.5vl:7b`), replacing the old Google Vision default and the old mock stub. Validated against real scans: printed/machine text (postage meter, barcodes) transcribes cleanly; handwritten reply-address blocks are unreliable — one test produced a garbled, undeliverable return address at 0.95 self-reported confidence, and cropping/upscaling didn't fix it (the model hallucinated a plausible-sounding but wrong prison name). Self-reported confidence is not trustworthy as a QA gate — this is an inherent OCR/handwriting limitation, not an implementation gap. It's mitigated by design: fuzzy candidate matching (`MatchingService`/rapidfuzz) plus a mandatory human-approval candidate list in `ScantronStation.jsx` — nothing is auto-selected, a person always picks the match, verified end-to-end against the live running stack. The mitigation works; the underlying transcription unreliability is still real, hence ⚠️ not ✅. Redaction (Phase 6) is separate and still unverified.

### Phase 6 — Redaction Pipeline & Scoring Gate
- **Goal:** Implement redaction scoring, visual tools, and audit trails.
- **Status:** ❓ Unverified. Older notes claimed "Visual redaction active in Scantron" — not independently confirmed in either August audit. Needs a direct check before trusting this status either way.

### Phase 7 — Assignments & Sponsor Portal UX
- **Goal:** Recreate and expand sponsor experience with a modern UI.
- **Status:** ❓ Unverified. Needs re-verification.

### Phase 8 — Envelope Printing & Queue Management
- **Goal:** Batch envelope generation with safety-aware templates.
- **Status:** ⚠️ Real and verified live end-to-end (09Aug2026), with caveats. Batch printing generates two separate merged PDFs -- safe and unsafe -- with the return address controlled by config (`.env`), never hardcoded, and a fail-safe default to the generic/unsafe address whenever a prisoner's classification is missing or unrecognized. Verified by reading the actual rendered output of both variants against real roster data: correct recipient info, correct sender block per classification, zero occurrence of "SAA" anywhere in the unsafe variant. Along the way, found and fixed four more pre-existing bugs blocking this path entirely: a broken recipient-data pipeline (mismatched dict keys meant every real envelope printed with a blank recipient section), a pandas NaN bug silently misclassifying every prisoner with a blank `Unsafe?` cell as unsafe, an invalid `letterstatus` enum value in batch letter creation, a no-op migration stub that never actually added `"envelope"` to the `submissionartifacttype` Postgres enum, and a missing `logger` import that turned an intended soft-fail into a hard crash (this one broke `test_submission_lifecycle`; fixed and confirmed the full suite passes). **Not a clean ✅:** queue dashboard / job-queue UI from the original Phase 8 goal doesn't exist -- batch runs are synchronous, no progress tracking or retry UI.
- **Also added:** an admin-only bypass for the sponsor-assignment check on batch submissions, for the real workflow of sending form "wait letters" to prisoners who have no sponsor yet (so there's no assignment to require). Scoped to admin role specifically -- a sponsor running a batch still must actually be assigned to every prisoner in it, otherwise batch mode would let a sponsor submit correspondence for someone else's assigned sponsee.

### Phase 9 — OneDrive Sync & Reconciliation
- **Goal:** Automated push/pull between Postgres artifacts and sponsor folders.
- **Status:** ❓ Unverified. Also worth revisiting given the offline-communication goal — OneDrive sync is itself a cloud dependency; confirm it's actually wanted before building it out further, rather than assuming it should just be finished.

### Phase 10 — Frontend Application Build-Out (Unified Communication)
- **Goal:** Build the React application focusing on a "Unified Inbox" that handles both legacy PDF scans and future digital-only (Email API) messaging.
- **Highlights (as designed, not independently verified):**
    - **Unified Inbox View** — one list for all prisoner communication (scanned/OCR or digital).
    - **Sponsor Response Station** — data-first web editor (Markdown) that stores replies as searchable data.
    - **Dual-Output Engine** — a "Submit" flow that can generate a PDF (current) or call an API (future).
- **Status:** ❓ Unverified, and the project owner has independently flagged the current UI as not what they want — a frontend pass is planned regardless of backend status underneath it.

### Phase 11 — Security Hardening & Compliance
- **Goal:** Enforce security best practices and retention policies.
- **Status:** 🔄 Actively in progress — see "Security & Environment Findings" above for the live, itemized punch list (what's fixed, what's open, what needs the project owner's own action).

### Phase 12 — Testing, Performance & Documentation
- **Goal:** Ensure reliability and produce handoff materials.
- **Status:** 🔜 Planned. 4 test files / 318 lines exist (`server/tests/`), covering Letter/Assignment/Submission service logic against in-memory SQLite — no coverage yet for auth, RBAC boundaries, file storage/encryption, or OCR/matching.

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
