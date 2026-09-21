# Security & Privacy Decisions — Index

This is a table of contents, not a rewrite. Every decision below already has its full
reasoning written down somewhere in this repo (`implementation_plan.md`, another doc, or a
code docstring) — this file exists so that reasoning can be found *by topic* instead of by
date, since `implementation_plan.md` is a chronological log. Use this when assembling a
presentation, demo, or a compliance-facing summary (12-step program partners, HIPAA-ish
questions from another client) — pull from the cited source, don't rewrite from memory.

Keep this current the way the rest of the project stays current: when a new
security/privacy-relevant decision gets made, add one line here pointing at where the real
reasoning was written down. Don't duplicate the reasoning itself into this file.

## 1. Cloud exposure boundaries — what leaves this machine, and when

- **Default posture: local-only OCR and translation.** `OCR_PROVIDER=local` runs a local
  Ollama vision model; no scanned letter/envelope content reaches the internet by default.
  → `implementation_plan.md`, "Security & Environment Findings" §"Fixed this session" (line 47).
- **Explicit, narrow, opt-in cloud exceptions exist for two things, each separately gated:**
  - Envelope/person-matching OCR may fall back to Google Vision (off by default) — never
    used for letter *content*. → same section, line 47.
  - Letter-content OCR/translation to Google (Vision + Translate) is available but
    **structurally requires the page be redacted first** — enforced server-side
    (`redaction_confirmed` flag, refused otherwise), not just a disabled UI button.
    → `implementation_plan.md` "Standalone Translate tool" section and its "Update"
    subsections (lines 155–213); the actual enforcement is in
    `server/api/letters.py` (`/transcribe-page-cloud`, `/translate-lines-cloud`,
    `/translate-overlay-cloud`).
- **A captured-but-not-yet-uploaded letter page never touches disk or network** until the
  operator explicitly clicks upload — traced end-to-end and confirmed live (a real
  hot-reload discarded in-progress captures with zero server-side trace).
  → `implementation_plan.md`, "Added 30Aug2026, a confirmed positive safeguard" (line 90).
- **The standalone Translate tool makes zero server-side writes** (no DB row, no disk
  file) unless the user explicitly downloads a `.docx` copy.
  → `implementation_plan.md`, "Standalone Translate tool" security account (line 155–168).
- **Reference Hub's "Local Files" uploads (curriculum/past letters pulled in via the
  browser's native file picker) are deliberately never persisted** — written only to a
  container-only path with no Docker bind mount, explicitly wiped on every backend
  start/restart, verified live. Personal/identifying content doesn't sit dormant in a
  second, easily-forgotten copy once the uploader's own Windows/WSL folder is already the
  durable source of truth. Contrast: Translations and draft-letter artifacts *are* real
  bind-mounted, persistent storage — a deliberate distinction, not an inconsistency, since
  those are the app's own durable output rather than a reference copy of something that
  already exists elsewhere.
  → `implementation_plan.md`, "Reference Hub 'Local Files' — ephemeral upload cache, a
  deliberate security posture" (added 02Sep2026).

## 2. Encryption at rest

- **Database columns holding identifying `Prisoner` data are AES-256-GCM encrypted**
  (`EncryptedString` SQLAlchemy type) — name, address, city/state/zip, CDCR#, facility,
  housing, aliases. `cpid` and `safety_classification` stay plaintext (join key; not
  identifying alone). Verified live via a raw `psql` query showing genuine ciphertext.
  → `implementation_plan.md` §"Security & Environment Findings", item 2 (line 58).
- **Generated files (scans, PDFs, the saved roster `.xlsx`) are deliberately left
  unencrypted at rest** — an explicit accepted tradeoff (routine daily use vs. encryption
  friction), not a gap. Do not "fix" this without asking first.
  → same item, line 58.
- **The OneDrive standing credential (refresh token) is encrypted at rest** the same way,
  but that alone isn't a strong boundary — see §4 below.
- **Open, unresolved, tracked separately (not in this repo's scope):** whole-device/disk
  encryption on Rey's own Windows machine — a memory note, distinct from the
  already-decided-against idea of encrypting the app's generated PDFs.

## 3. Authentication & access control

- **Session auth**: itsdangerous-signed cookies, no server-side session store;
  `SessionMiddleware` populates `request.state.user`; role guards are `require_admin` and
  `require_admin_or_sponsor`. → `implementation_plan.md` §"Security & Environment
  Findings", items 1/1b (lines 56–57).
- **A real, since-fixed severe gap**: `/api/static/data` served the *entire* roster
  (names, CDCR#s, addresses, scans) to anyone reaching port 8000, with zero auth —
  Starlette's `StaticFiles` mount bypassed FastAPI's route-level auth entirely. Fixed with
  `StaticDataAuthMiddleware`, verified live with four real auth-state test cases.
  → item 1b, line 57.
- **RBAC's actual real-world granularity, clarified 30Aug2026**: three roles are defined
  (`admin`/`sponsor`/`auditor`) but only two guards are ever applied, and only one human
  (Rey, as `admin`) ever actually logs in today. Sponsors do not and will not log into the
  app directly — decided explicitly, not just unbuilt (the "sponsor portal" roadmap phase
  is superseded by the OneDrive folder handoff, which is already built).
  → item 16 (lines 78–84), the most important read for "does role separation protect
  anything today" — short answer: not yet, because there's only one class of logged-in
  human, but the guards are already in place for if/when that changes.
- **Per-resource authorization gap, still open**: closing "anyone unauthenticated" is not
  the same as "a sponsor can only see their own files" — no ownership check exists yet.
  → item 9 (line 67).

## 4. Third-party standing credentials

- **OneDrive**: a real, standing, whole-account (`Files.ReadWrite`, not folder-scoped)
  credential to Rey's personal Microsoft account — a deliberate, discussed, accepted
  tradeoff (needed to reach his real pre-existing folder structure), not an oversight.
  Token is encrypted at rest but that alone isn't a strong boundary; nothing currently
  prompts a periodic "is this still needed" review. **Do not silently narrow scope or add
  auto-expiry without asking first.**
  → `implementation_plan.md` §"Security & Environment Findings", item 15 (lines 73–77).
- **Google Vision/Translate**: service-account credentials from a pre-existing,
  unrelated-by-name GCP project (`crypto-haven-411118`, dated Jul 2025) — not something
  created for CalPOP specifically. Ownership was briefly unclear (project wasn't visible
  under the Google account initially checked) — resolved, reachable under
  `rey@prisoneroutreach.org`.
  → `implementation_plan.md`, "translate-lines-cloud added" update (line 182–190).

## 5. Audit trail & data integrity

- **`LetterStatusHistory`**: full audit trail of every status a letter has held, in order.
- **Excel diff-then-apply pattern**: nothing from an Excel upload silently overwrites
  Postgres — staged, diffed, shown to Rey, applied only on confirm.
- **A real data-corruption incident, found and fixed**: blank Excel CPID cells were
  coerced to the literal string `"nan"` (Python truthiness of `float('nan')`), causing
  multiple real people's records to collide on that fake shared key. Fixed with explicit
  `pd.isna()` checks; the corrupted record deleted once the real person's status was
  understood. → `implementation_plan.md`, "Added 31Aug2026 — real data corruption found"
  (line 110) and the following section on the Stage-taxonomy resolution (lines 112–118).
- **A git-history PII leak** (not just working-tree): two already-pushed commits had real
  CPID/CDCR numbers, found only via a full `git log --all -p` scan. Fixed with
  `git-filter-repo` + force-push, verified from an independent fresh clone.
  → `implementation_plan.md`, line 88, and the full remediation procedure in
  `docs/pii_sanitization_checklist.md`.

## 6. PII hygiene in logs and the repo

- **PII was leaking into plaintext application logs** (a failed sync once printed a real
  name/address/facility to stdout) — flagged, fix pattern established (log
  `type(e).__name__` and safe identifiers, never raw row contents), applied to the
  Excel-sync paths and the newer OCR/translation code.
  → `implementation_plan.md` §"Security & Environment Findings", item 10 (line 68);
  applied fix visible in `server/services/excel_manager.py`.
- **Repo-level secret/PII scrubbing procedure**: full step-by-step checklist (working tree
  *and* git history, since those are different failure modes) for before making the repo
  public, pushing after a session with real data, or handing the project to someone else.
  → `docs/pii_sanitization_checklist.md` (the whole file).

## 7. Explicitly accepted tradeoffs (not gaps — don't "fix" without asking)

These read like open items but are actually settled decisions, made with full context, that
would be a regression to silently "improve":
- Generated files unencrypted at rest (§2).
- OneDrive's full-account credential scope (§4).
- The Caesar-cipher CPID scheme (`core/cipher.py`) is a human-communication convention,
  not a claimed security control — unrelated to the computer-security items in this doc.
- Sponsors never logging into the app directly (§3) — the "sponsor portal" phase is
  superseded, not just deferred.

## 8. Still genuinely open (real gaps, not yet resolved)

- Per-resource authorization (a logged-in sponsor could enumerate another sponsor's files)
  — §3.
- No data retention / legal-hold policy exists anywhere in the project.
  → `implementation_plan.md` §"Security & Environment Findings", item 13 (line 71).
- No license chosen for the now-public repo — matters once "someone else self-hosts this"
  becomes real. → item 14 (line 72).
- Test coverage doesn't cover anything security-relevant (auth, RBAC boundaries, file
  storage, OCR/matching). → item 11 (line 69).
- Windows disk encryption on Rey's own machine (§2) — a reminder, not yet actioned.

## Where the source documents live

- `implementation_plan.md` — the full chronological decision log this index points into.
- `docs/pii_sanitization_checklist.md` — repo-scrubbing procedure (working tree + git
  history).
- `docs/technical_deployment_guide.md` — prerequisites, environment variables, deployment.
- `README.md` — top-level architecture and security bullet points, written for a reader
  who hasn't opened `implementation_plan.md` at all.
