# Implementation Plan: CalPOP Command Center (SRS-Aligned Update)

## Overview

This living document mirrors the roadmap defined in **Software_requirements_specification.md**. It summarizes what has been delivered, what is in progress, and what comes next for the Admin/Sponsor/Auditor workflows.

## Session summary (02Sep2026) -- Letter Writing Mgt, first real build pass

Picking up "Letter Writing Mgt" from the 31Aug2026 priorities list below -- this is no longer "not scoped," a substantial first pass got built and tested live this session. What shipped:

- **Nav restructured** (`Layout.jsx`): dropdown groups -- "Letters" (Letter Writing / Translation / Letter Mgt) and "People" (Sponsees, renamed from "DB Mgt" / Sponsors). Dashboard and Envelope Mgt stay top-level.
- **"Start New Letter"** (`Inbox.jsx` + new `POST /api/assignments/start-letter`): write to a sponsee with no incoming scan required -- creates a bare `Letter` (`queued_for_writing`) + `Assignment` together, lands in the same compose screen as any scanned reply. Closes a real gap (previously Letter Writing only ever surfaced replies to already-scanned intake).
- **`ResponseStation.jsx`**: Incoming Letter tab now handles the no-scan case gracefully (badge + empty state, not a broken image). Added "Copy Clean Text" (strips markdown syntax for pasting into Word, since DOCX generation itself is still unwired -- see open items).
- **Reference Hub grew from 2 categories to 4** (`ReferenceLibrary.jsx`, `server/api/library.py`, `server/services/library_service.py`):
  - **Local Files** -- curriculum/past letters from Rey's own machine. Went through two designs this session: first a persistent host-synced folder, then corrected (per Rey: keep Windows/WSL as source of truth, don't duplicate permanently) to an **ephemeral, upload-based cache** -- native browser file picker uploads a copy into a container-only path (`/tmp/calpop_library_uploads/local`, no Docker bind mount), wiped on every backend restart. Written up as a deliberate security decision, not just a technical choice -- see its own section above and `docs/security_decisions_index.md` §1.
  - **Translations** -- the Translate tool's overlay/text results can now be saved here via "Save to Reference Hub" (new `POST /api/letters/translation-docx/save-to-library`), filed by CPID, numbered using the live `letters_received_count` (not the unrelated, OneDrive-scoped `letter_exchange_count`), filename convention `{CPID}_{DATE}_in_{COUNT}.docx` (`_` between words, `-` in dates, per Rey's explicit correction). The composited overlay PNG saves alongside the DOCX when one exists (`{stem}_overlay_p{N}.png`) -- this was a real gap found and fixed mid-session (overlay-only results didn't trigger the save UI at all originally; fixed by broadening the visibility gate beyond the old Step1/2-only `hasTranslations` check). This is genuine, durable, bind-mounted storage (`data/ref/translations/`) -- deliberately the opposite persistence model from Local Files, for the reasons written up above.
  - Both new categories, plus a "Copy path" affordance for the two host-synced ones (`GET /api/library/host-paths`), so the actual on-disk location is never a silent default.
- **Prisoner-lookup modularized**: `usePrisonerDirectory` hook (fetch-once, filter) + `PrisonerCombobox` component, now shared by Inbox's Start New Letter modal, the Translate tool's CPID field, `EnvelopeMgtPage.jsx`'s print-queue search, and `ScantronStation.jsx`'s roster preload -- four call sites that used to each roll their own fetch, now one implementation. `PrisonersPage.jsx` (the canonical directory/CRUD page) intentionally stays separate.
- **Brand-color pass**: `Inbox.jsx`, `ResponseStation.jsx`, `ReferenceLibrary.jsx`, and the shared `.docx-preview-container`/`.markdown-preview` CSS in `index.css` moved off the old dark slate/emerald/cyan/amber theme onto `calpop-*` tokens, matching `TranslateLetter.jsx`/`Layout.jsx`. `LetterEditor.jsx` still needs this (see below, unchanged from 31Aug2026 note).
- Backend endpoints added/extended this session: `POST /api/assignments/start-letter`, `GET /api/library/host-paths`, `POST /api/library/upload`, `POST /api/letters/translation-docx/save-to-library` (+ its `overlay_images` support). All smoke-tested live against the running containers before being called done, including a restart-and-verify test proving the ephemeral cache actually clears.

### RESOLVED 20Sep2026 -- `calpop-bg` contrast regression (found at the end of the 02Sep2026 session)

**Fix (confirmed good by Rey on screen):** split the one token into two. `calpop-bg` (#BCD8FF) is now the page backdrop only (`Layout.jsx` + `body`); new `calpop-panel` (#E6F0FF, the old pale value, replaces the unused `calpop-tint`) is used for all nested/recessed surfaces (70 uses, 15 files). Also raised every muted `text-calpop-navy/30-60` to `/70-75` (54 uses) -- the low-opacity text was the bigger readability problem. Borders/backgrounds at those opacities untouched. Original write-up of the problem kept below for context.

**Original problem statement (02Sep2026):**

**`calpop-bg` retuning (raised 02Sep2026, unresolved) broke contrast in nested/recessed UI elements.** The original `calpop-bg` (#E6F0FF) was too pale as a page background sitting behind white cards (barely-readable text, flagged early in the session). Fixed by swapping `calpop-bg` to `#BCD8FF` (`tailwind.config.js`) and preserving the old value as a new `calpop-tint` token for later use on dark surfaces. That fix was right for the *page-level* background, but **the same `bg-calpop-bg` class is also used for smaller nested/recessed elements sitting on top of white cards** (filter inputs, the "N Slots Open" workbench-tab area, the Local Files upload note bar in `ReferenceLibrary.jsx`) -- and at the new, more saturated value, muted text on those smaller elements (like the `/40`-`/60` opacity `calpop-navy` text used for placeholders and secondary labels) is now hard to read. Rey flagged this explicitly as an accessibility concern, not just a preference ("my eyes are bad so it makes a difference"). **Needs a real pass, not a quick tweak**: likely means introducing a genuinely distinct "recessed panel" background (lighter/more neutral than the new page bg, not simply reusing `calpop-bg` for both the full page AND every nested panel), and auditing text-opacity choices against it -- rather than one token doing two visually different jobs. Don't just nudge the hex again without checking every place `bg-calpop-bg` is used as a *nested* panel color, not a page background (`ReferenceLibrary.jsx`'s filter bar, path bars, and workbench tab area are the ones already seen broken; there may be others not yet checked in `Inbox.jsx`/`ResponseStation.jsx`/`EnvelopeMgtPage.jsx`/`ScantronStation.jsx`).

## One-time cleanup 29Sep2026 -- 199 date values across 116 records had the bug baked in already

The `date_field()` fix (below) only stops the `00:00:00` bug on future uploads -- it didn't touch what was already stored. Checked how far it went: a raw SQL scan undercounted it, since `date_of_contract`/`date_sponsor_assigned` are `EncryptedString` columns and a `LIKE` can't see inside ciphertext -- had to decrypt each row via the ORM in Python to check properly. Real scope: **date_of_contract 101/104, date_sponsor_assigned 97/97 (all of them), bph_date 1/14** -- 199 field values across 116 of 157 prisoners (74%). Every single affected value had the identical shape `YYYY-MM-DD 00:00:00`, so stripped the trailing ` 00:00:00` uniformly via the ORM (so the encrypted columns re-encrypt correctly on write), verified back down to 0 affected afterward. Also fixed in passing along the way: SFN568's `step_received_count` (Current Step) had reverted to blank from an earlier stale-file upload (Rey: "I made changes online that were not reflected in the xlsx") -- restored to 4 via `PATCH /api/prisoners/SFN568`, unrelated to the date bug but caught while looking at the same record.

## Real bug found and fixed 29Sep2026 -- Excel diff falsely flagged every date field as "changed"

`date_of_contract`, `date_sponsor_assigned`, and `bph_date` are plain string DB columns (not real `Date` columns -- `db/models.py:118,122,125`), but `excel_manager.py`'s row extractor read them with the generic `field()` helper, which just does `str(val).strip()`. pandas parses an Excel date cell as a `Timestamp`, and `str()` on a `Timestamp` always appends `00:00:00` even with no time-of-day set -- so a value already stored as a bare `2022-04-05` (from a prior upload/manual entry) never matched the freshly-read `2022-04-05 00:00:00`, and EVERY date field on EVERY unchanged row showed up in the upload preview's "Changed records" list. Caught live by Rey ("no need for the timestamp, date is enough") looking at a real diff before uploading. Fixed with a new `date_field()` helper (`strftime('%Y-%m-%d')` when pandas hands back something date-like, plain-string fallback otherwise), used for all three fields. Verified directly against a real `pandas.Timestamp` -- comes out as `2022-04-05`, matches the stored value, no longer a false "changed" entry.

## 29Sep2026 -- Real OneDrive upload-preview bug traced to a pseudonym typo, not code

Rey, testing the "Upload to Sponsor" flow live for BMB627 (real letter, real Kurt S/Eric K OneDrive folder): "this is not detecting the exchange number or new folder" -- preview showed "existing folders: None yet" and guessed "intro" despite `letter_exchange_count=6` on file.

Traced with real (read-only) Graph API `list_folder` calls against the actual connected OneDrive, at each path level: `CAL POP/...PRISONERS` listed fine and showed a folder named **"Eric K"**; `CAL POP/...PRISONERS/Erik K` (the pseudonym on file for Kurt S) came back not-found. `LetterService.resolve_upload_destination`'s folder-lookup logic (`_guess_next_exchange_label`, built 30Aug2026) was working exactly as designed -- it just had the wrong pseudonym to search under, from a transposed-letter typo ("Erik" vs "Eric") made when Kurt S was added to the Sponsor directory earlier the same day. Fixed the pseudonym via `PUT /api/sponsor-directory/6`; re-verified `upload-preview` for BMB627 (letter #27) now correctly lists all 4 real folders (`intro-sent`, `exchange1-sent`, `exchange2-3-sent`, `exchange4-sent`) and guesses `exchange5`.

**Also, a real mistake caught and fixed in the same breath**: fixing the typo via a hand-typed `curl` PUT (rather than the Edit-in-place UI built earlier today) sent `onedrive_folder_link: null`, briefly wiping Kurt S's real SharePoint link -- this endpoint replaces every field, no partial-update support, exactly the failure mode `SponsorsPage.jsx`'s Edit feature exists to avoid by pre-filling the full form. Caught immediately from the same response, restored from it, re-verified. Lesson for future sessions: use the app's own Edit UI for real sponsor edits, not raw API calls, even for "simple" one-field fixes.

## 29Sep2026 -- Sponsee counting split active/dormant; Dashboard rebuilt onto live Postgres

**Rey: "50 seems like too high of a number. does this include 90+ status codes too?"** -- yes. `_sponsee_counts()` in `api/sponsors.py` was a flat `COUNT(*)` with no Stage filter, so every sponsor's "Sponsees" number on the Sponsors tab silently mixed Stage 90+ (terminal/exception: dropped, went silent, etc.) in with genuinely active people. For "Rey G" specifically: 29 at Stage 12, 1 at Stage 11, 20 at Stage 90+ -- the headline 50 was real but misleading. Fixed: `sponsee_count` split into `sponsee_count_active` (Stage 1-12) and `sponsee_count_dormant` (Stage 90+), shown as "active/dormant" in the UI (column header + per-cell). Applies to every sponsor, not just this one.

**Then, while asked to "update the dashboard too":** found the Dashboard's Program Summary card (`SponsorshipStats.jsx` / `GET /api/dashboard/program-summary`) wasn't reading Postgres at all -- it called `excel_manager.get_sponsorship_stats()`, which reads `self.df`, an in-memory Excel snapshot loaded once at container startup from `data/active_map.xlsx` and never touched by any of today's direct-Postgres edits (Rey G rename, Current Step fixes, sponsor archiving). It was silently showing stale, pre-today data on the one day Rey explicitly said he'd be relying on the DB as source of truth. Rewrote the endpoint to query Postgres live (`main.py`); same response shape, so the frontend needed no changes. Verified live: "Top Sponsors" now correctly shows "Rey G: 29" instead of "Course" with whatever the snapshot happened to hold.

Left as-is, not a bug: the Dashboard's "Active Sponsees" stays Stage-12-only (already labeled that way in the UI: "Active Sponsees (Stage 12)"), narrower than the Sponsors tab's new Stage 1-12 "active" bucket -- a pre-existing, explicitly-labeled distinction, not unified since it wasn't asked for.

## 29Sep2026 -- "Course" sentinel renamed to "Rey G"

Rey: "id like my name to be on the list instead of course to show stats." Considered a display-only fix first (match sponsee_count by `sponsor_type == 'course'` instead of by name -- see the now-dormant `_count_for` helper in `api/sponsors.py`, still in place and harmless, just unused by this specific sponsor going forward), but Rey asked for the simpler thing: rename the actual data.

Done carefully, not as a blind find-replace, because `classify_sponsor_name()` (`letter_service.py`) does real routing off this exact string (`.startswith("course")` -> no external sponsor -> admin write queue):
- Updated that check to recognize **both** `"course"` and `"rey g"` as prefixes, not just one -- covers old data, the new value, and two real records with extra hand-written notes appended (`BMD784`: "Course; formerly Jose", `UIH906`: "Course; has a sponsor from "SA" Samuel. 2Feb2025") that were deliberately left un-renamed rather than mangling those notes with a blind replace.
- Renamed exactly the 50 `Prisoner` rows where `sponsor_name` was the bare string `"Course"` -- verified before/after via an independent re-read, not just the write's own return value.
- Fixed the Sponsor directory row itself: it had literally been created as `name="Rey G (Course)"` (a single string, breaking the exact-match stats lookup) with an existing real pseudonym `"Rudy C"` already set. Split it to `name="Rey G"`, kept the existing pseudonym as-is.
- **Still open, not done here**: the Excel roster's own "Sponsor" column source data still says "Course" for these 50 people. Until that's corrected in the actual spreadsheet, the next roster upload will write "Course" back into Postgres for them (though routing stays correct either way now, since both strings are recognized -- only the *display name* on the Sponsors tab would revert).

## 29Sep2026 -- Letter Journey tracking built (13-touchpoint checklist from Rey's real paper process)

Scoped from a real photo of Rey's physical tracking sheet ("there are many touch points for each envelope/letter that needs recording") plus his own per-touchpoint auto/manual decisions given directly, including a live test that decided the hardest case: does Graph API detect a sponsor/admin opening or printing a letter? Rey printed a real letter from his phone's OneDrive app mid-session while a background poll (`analytics/allTime` + `activities`, every 20s for 4 minutes) watched two real files -- **no change registered**. Combined with an earlier same-session success (a real `rename` action *did* register immediately), the conclusion: edits/renames are captured reliably and fast, plain view/print is not (or lags past minutes) -- so print/review detection is NOT built as automatic; stays manual, same as Rey already expected for most of this list.

**Split three ways, all 13 touchpoints now tracked:**
- **Auto, from an existing event, no new UI action needed:** postmarked (OCR guess, pre-existing), PO pickup + envelope scanned (pre-existing), address change y/n (new -- `LetterDates.address_change_confirmed`, set at scan-confirm from whether a `corrected_address`/city/state/zip was entered), uploaded to sponsor's portal (new -- `LetterDates.uploaded_at` + `sponsor_reply_item_id`, set the moment `upload_redacted_to_sponsor_onedrive` actually files the reply doc).
- **Auto, best-effort, checked on demand:** sponsor folder visits -- new `StorageService.get_visit_stats(ref)` (default `None` on the abstract base/`LocalStorageService`; real Graph `analytics/allTime` call on `OneDriveStorageService`, live-verified against a real pre-existing file: `actionCount=5, actorCount=1`). Kept storage-agnostic on purpose, matching this module's existing "nothing outside storage_service.py knows about OneDrive item IDs" rule (see its own docstring) -- `LetterService.check_sponsor_visits` calls the generic interface, never Graph directly.
- **Manual, entered by Rey** (all explicitly "could move to Telnyx later" per Rey, not built now): informed sponsor, sponsor finished letter, admin review, printed, mailed -- new `PATCH /api/letters/{id}/journey`. Reminder dates are a log, not one field (`LetterReminder` table, `POST`/`GET`/`DELETE /api/letters/{id}/reminders`), since Rey's checklist has them as plural.

**Built and live-verified against real data** (not just unit-level): migration `d19a3f6c8e21` applied; ran `update_journey`, `add_reminder`/`list_reminders`/`delete_reminder`, and `check_sponsor_visits` directly against real letter #28 (cleaned up the test writes afterward); `get_visit_stats` confirmed against the same real known-good OneDrive item id used in the earlier live test (`response.docx`, `actionCount=5`); confirmed `LetterOut` schema serializes every new field correctly end-to-end.

**Frontend**: new `LetterJourneyPanel.jsx`, mounted on the existing `/letters/:id` detail view (`LetterEditor.jsx`) -- a checklist-style card, green/blue checkmarks for auto vs. manual, inline "Mark now" / backdate / clear controls for manual fields, a "Check now" button for visit stats, and an inline reminder log with add/delete. Not yet clicked through in a browser this session (backend fully live-tested; frontend verified by clean HMR compile only) -- worth a quick visual pass before relying on it day-to-day.

**Follow-up same day, from Rey looking at the real panel**: "make a way to manually enter the letter date and postmark date." Postmark had only ever been an OCR guess with no way to correct it after scan-confirm, and there was no field at all for the date written on the letter itself (its dateline, distinct from the envelope's postmark -- two different real dates). Added `LetterDates.letter_written_at` (migration `f3a7c9e21b04`), and extended `LetterJourneyUpdate` to also accept `postmarked_at` -- `update_journey`'s implementation was already generic (`setattr` over whatever fields are present), so no service-layer change needed, just the schema. Frontend: new `EditableDateRow` component (always shows a pre-filled, editable date input, unlike `ManualRow`'s hide-until-cleared pattern) used for both fields. Live-verified against real letter #28: set/cleared `letter_written_at`, corrected `postmarked_at`, then restored its original OCR-guessed value afterward.

**Second follow-up, same session**: "po box pickup needs a calendar manual entry too." `picked_up_at` already existed and was already staff-entered (at scan intake), just not correctable afterward from the Journey panel itself -- same gap as postmark. Added it to `LetterJourneyUpdate` (no new column, no migration) and switched its row to `EditableDateRow`. Live-verified against real letter #28 (set, then restored to its original `None`).

## Additions 20Sep2026 (writing-first session)

- **Curriculum moved into WSL.** WSL's Windows-drive mounts are deliberately restricted (Rey, security), so `/mnt/e/...` was never reachable -- Docker had silently created empty root-owned folders there, and the Curriculum tab was just empty. `LIBRARY_CURRICULUM_PATH` now `./data/ref/curriculum` (git-ignored). **Letter Exchange History still points at the dead `/mnt/e` path** -- use Local Files > Upload for past letters (ephemeral, wiped on restart) until decided. Still worth doing: make an empty/unreachable library tab say so instead of showing a path as if configured.
- **"Add Spanish" button in Reference Hub** (`POST /api/library/translate-to-spanish`, `services/document_translation_service.py`, `OCRService.translate_texts_cloud`). Rey's curriculum ships bilingual (English paragraph, then Spanish), so this inserts a Spanish paragraph after each English one in a copy saved as `{name}_bilingual.docx` in **`data/course_students/`** (`bilingual_output_root` in `config.py`; deliberately never beside the source, per Rey; durable bind mount, downloaded to the browser automatically after translating, then Rey moves it to a Windows folder; output files/folder are chmod-opened because the container runs as root and root-owned files under `./data` can't otherwise be deleted/moved from WSL without sudo -- note earlier smoke-test files under `data/ref/translations/` had this problem); headings/tables/styles carry over. Google Cloud Translate, so it is **server-gated on `no_personal_info_confirmed`** (plus a confirm dialog) -- intended for public curriculum only, never letters with names. `.docx`/`.txt` only (PDFs refused). Known limits: mixed bold/italic inside one paragraph collapses to the first run's style on the Spanish side; numbered-list Spanish lines are indented but unnumbered. Verified live on a synthetic worksheet; not yet run on a real curriculum document.
- **`data/course_students/` is now Rey's single exchange folder with Windows** (decided 20Sep2026) "until I move all of it to WSL" -- he wants to build the habit of using one place. Reference Hub has a **Course Students** tab (`category=course_students`, root = `bilingual_output_root`): browse, preview, Download, and **Upload** (native file picker, multiple files at once) -- durable, unlike Local Files. Uploads never overwrite (`_2`, `_3`...), and files/folder are chmod-opened so they're manageable from WSL. Windows-side path: `\\wsl.localhost\Ubuntu\home\me-linux3\projects\calpop\sponsor_dashboard3\data\course_students`. **A deliberate exception to the ephemeral-copy principle** (see the Local Files security section above): this folder holds copies of things whose original lives on Windows, but Rey chose durability here on purpose as the migration bridge -- so it should shrink away as material moves into WSL, not become permanent storage. Curriculum translations are meant to *eventually* land beside the curriculum instead: repoint `BILINGUAL_OUTPUT_ROOT` (config.py `bilingual_output_root`) when that happens. **Open question:** should the Translate tool's saved Spanish->English letter translations (currently `data/ref/translations/{CPID}/`) also go to course_students? Not changed pending Rey's answer.
- **Backlog, noted 20Sep2026 -- NOT scheduled** (Rey: big letter backlog, no time to refine right now; "Add Spanish" is already a real time saver as-is): (1) **local / no-Google translate option** for anything containing names or personal details -- Rey called this a good idea; the cloud button is only safe for public curriculum, and at least one real letter has already gone through it as a "letter"; (2) batch-translate a whole folder in one click; (3) style the Spanish paragraphs (italic or a different shade) so a printed bilingual copy is easier to scan; (4) a Reference Hub tab that says so when a library folder is empty/unreachable instead of showing a path as if it were fine. Don't start any of these without asking.
- **Discussed, not built:** "Quick Write" mode (compose with no DB sponsee, browser-side draft protection) + a real Download .docx (markdown -> proper Word formatting). Rey's stated priority is getting letters written even when they aren't entered in the database.

## Next session priorities (raised 31Aug2026, still current except Letter Writing Mgt above)

Rey named four areas as needed next, at a naming/scoping level only:
- **Sponsor Mgt tab** -- beyond the current MVP (directory + add sponsor, built 22Aug2026). What specifically is needed beyond that isn't scoped yet.
- **Letter Mgt: "letter journey"** -- Rey's own phrase; reads as wanting a fuller per-letter lifecycle/status view than exists today (today's `LetterStatusHistory` table has the raw audit trail, but there's no UI built around presenting a letter's full journey). Not scoped.
  - **Added 02Sep2026: no way to actually view a letter today.** Letter Mgt's "Edit" link opens `LetterEditor.jsx`, which is edit-only -- title/CPID form fields plus a raw markdown textarea. It doesn't show the scanned original image, doesn't render OCR'd content, has no read-only view mode at all. The "Scan" link is for uploading a redacted scan, not viewing an existing one. This is a real gap, found while testing Letter Writing, not yet scoped -- fold into the "letter journey" scoping conversation (a view mode is presumably part of what a journey view needs to show anyway).
  - **Added 02Sep2026: `LetterEditor.jsx` also needs the brand-color correction** applied to the rest of Letter Writing this session (Inbox.jsx, ResponseStation.jsx, ReferenceLibrary.jsx) -- it's still on the old slate/emerald dark theme, inconsistent with `LettersPage.jsx` (which is already on `calpop-*` brand colors) and the rest of the app. Roll this into the same pass when the letter-view feature is built, rather than a separate cosmetic-only pass.
- **Letter Writing Mgt** -- substantially built this session (see summary directly above). What's explicitly still NOT done, so the next session doesn't have to rediscover it:
  - The `calpop-bg` contrast regression above -- probably the first thing to fix, since it's a live readability/accessibility issue, not a nice-to-have.
  - DOCX generation for the actual reply itself is still unwired -- `ResponseStation.jsx`'s Finalize flow only requests `pdf` and `envelope` artifacts; the `docx` artifact type exists in the data model and backend dispatch but the export logic (`artifact_service.py`'s `export_docx`) is a naive line-per-paragraph dumper with no bold/italic/heading translation. "Copy Clean Text" was a stopgap, not a fix.
  - No template letters exist anywhere (confirmed absent, not just unbuilt-here) -- flagged as a possible future want, not scoped.
  - The overlay PNG saved to Reference Hub isn't yet verified to preview correctly inside `ReferenceLibrary.jsx`'s file browser (should work via the existing `__IMAGE__:` preview path used elsewhere, but this specific combination wasn't actually clicked through and confirmed this session).
  - `Assignment` rows still don't differentiate `queued_for_writing` vs. `queued_for_letter_scan` routing downstream (a gap noted earlier this session, not addressed).
- **Reporting / analytics** -- not scoped at all yet; no existing reporting surface in the app today beyond the Excel export.

Don't start building any of these from assumption alone -- each needs its own scoping conversation with Rey first, the way image-overlay translation and Letter Writing Mgt itself got real scope written down before being built.

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
15. **The OneDrive connection (built 22Aug2026) is a standing, broad-scope credential to Rey's real personal Microsoft account — explicit tradeoff, discussed and accepted 30Aug2026, not an oversight, but worth re-checking periodically.** `OneDriveConnection` holds a refresh token (`offline_access`) that silently renews the access token before every Graph API call, so once connected it never needs re-auth — by design, the same model every "connect once" OAuth integration uses (Dropbox, Google Drive, etc.). Two things make this worth a standing note rather than a one-line fact, given this app handles a vulnerable population's mail:
    - **Scope is `Files.ReadWrite` against the whole account, not folder-scoped.** This was a deliberate choice, not an accident — the app needs to browse Rey's real pre-existing `CAL POP/...PRISONERS/{pseudonym}/{cpid}/exchangeN` folder structure (see the OneDrive Graph API section above), which a sandboxed `Files.ReadWrite.AppFolder` scope couldn't reach. The tradeoff: if this app is ever compromised, so is the entirety of Rey's personal OneDrive, not just a CalPOP-created folder.
    - **The token is encrypted at rest** (`EncryptedString`, AES-256-GCM, same mechanism as `Prisoner` PII columns) — a raw DB dump alone doesn't leak it. It would take the DB *and* `MAPPING_STORE_KEY` together. Not nothing, but also not a strong boundary on its own.
    - **Nothing in the app currently prompts a periodic "is this still needed / still trusted" review** — it was connected once (22Aug2026) and, absent an explicit disconnect via `/api/integrations/onedrive/disconnect`, stays live indefinitely.
    - **Do not silently narrow the scope or add auto-expiry without asking first** — Rey chose full delegated access against his own account specifically so the app could work with his real existing folder structure; a well-intentioned "harden this" pass that breaks that lookup would be a regression, not a fix. If tightening this is ever wanted, the discussion should start from "does the app still need full-account access for the current folder structure," not from assuming AppFolder scope is a drop-in improvement.
16. **RBAC's actual granularity, clarified 30Aug2026 — read this before assuming role separation is protecting anything today.** This app has three defined roles (`admin`/`sponsor`/`auditor`, `auth/models.py`), but checking every route (`grep`, 30Aug2026) shows only two guards are ever actually applied: `require_admin` (admin only) and `require_admin_or_sponsor` (admin or sponsor). **`auditor` is dead scaffolding** — `require_admin_or_auditor` is defined in `auth/dependencies.py` but not one route in the app depends on it; the role exists in the type system and does nothing.
    - **What this means for PII/anonymity safeguards specifically:** today, the only person who ever actually logs in is Rey, as `admin`. With one real role in play, RBAC's role *granularity* isn't currently doing any PII-protection work beyond what plain authentication already does (see item 1b/main Phase 2 note on `/api/static/data`) — there is no second class of logged-in human yet for the roster/roles to be separated from.
    - **Why it's built out anyway, and why it's not wasted:** `require_admin_or_sponsor` gates `/api/assignments`, `/api/submissions`, `/api/library`, and parts of `/api/letters` — all written assuming a real external sponsor will eventually log into CalPOP directly and see *only* their own assigned sponsee's data, not the roster, not other sponsors' sponsees, not admin functions. That's Phase 7 (Assignments & Sponsor Portal UX), still `❓ unverified/not built` (see Detailed Roadmap). **If Phase 7 is ever built, this is exactly the mechanism that would keep one sponsor's account from seeing another sponsee's real name/address/CDCR#** — i.e. role granularity becomes a real anonymity/PII safeguard the moment a second class of human account exists, not before.
    - **Decided 30Aug2026 (Rey): sponsors should never see the CalPOP app/directory when logged in locally — this is admin-only.** Consistent with how the Sponsors tab MVP was already built (22Aug2026: "No auth on this table by design... most sponsors never log into CalPOP; Rey manages everything on their behalf") — this makes it explicit and final, not just an inference from that one build note. Concrete implications:
      - **Phase 7 ("Assignments & Sponsor Portal UX") as originally scoped — a sponsor logging into CalPOP directly — is decided against, not merely unbuilt.** The "sponsor experience" this app actually delivers is the OneDrive folder handoff (redacted letter + blank reply doc dropped into their exchange folder, already built) — not an in-app login. Don't resume building a sponsor-login UI under the Phase 7 name without re-confirming this changed; treat that roadmap entry as superseded.
      - **The `sponsor` role and every `require_admin_or_sponsor` guard (`/api/assignments`, `/api/submissions`, `/api/library`, parts of `/api/letters`) are now in the same position as the already-dead `auditor` role** — plumbing for a login path that isn't going to be used. Not removed here (that's a real code change, not a documentation task, and touches several routers), but flagged so a future cleanup pass knows it's safe to simplify toward "authenticated admin vs. not" rather than assuming the three-role split still matters.
      - **RBAC's actual job in this app, going forward, is what items 1/1b above already established about authentication generally:** keeping the app closed to Rey (the sole logged-in operator) versus the open network — not separating multiple classes of logged-in humans, since there's only ever going to be one.

**Explicitly NOT a finding, clarified by the project owner:** the Caesar-cipher CPID scheme (`core/cipher.py`) is a human-communication convention (how sponsors/staff refer to a sponsee without using their real name), not a claimed security control. It stays as-is. It is unrelated to, and does not substitute for, the computer-security items above.

**Added 09/10Aug2026, worth its own callout — a git-history PII leak, not just a working-tree one:** two already-pushed commits had real CPID/CDCR numbers (fixed forward in a later commit, but never removed from history — the mistake this section is about was previously assumed to be fully closed once the working tree was clean, which turned out to be wrong). Found via a full `git log --all -p` scan, not the working-tree-only scan used until then. Fixed with `git-filter-repo` (surgical replace, all other commit messages preserved) + a force-push, verified afterward from an independent fresh clone of GitHub, not just by trusting the push output. `docs/pii_sanitization_checklist.md` now has a Step 5 covering exactly this, since scanning history is a heavier, once-per-session operation, not something to repeat after every commit.

**Added 30Aug2026, a confirmed positive safeguard rather than a gap — worth recording precisely so it doesn't get assumed away later:** a captured-but-not-yet-uploaded letter page (via `RedactionCaptureStage`/`ScanLetterUpload.jsx`'s Capture & Redact screen) never touches disk or the network until the operator explicitly clicks "Upload to Sponsor OneDrive." Traced end-to-end, not assumed: capture draws the frame onto an in-memory `<canvas>`, converts it to a `data:image/jpeg;base64,...` string held only in React component state, and nothing else happens to it. Confirmed live during a real session (30Aug2026) when a hot-reload discarded two already-captured, not-yet-redacted real pages from a live case (FON949) — checked backend logs (zero `upload-redacted` requests logged) and the local-storage fallback directory (empty) to verify no server-side copy existed anywhere. The only caveat, stated precisely rather than overclaimed: browser process memory isn't necessarily zeroed the instant it's freed, but that's not reachable through any normal means (not a file, not a cache entry, not in any browser storage API) — practically equivalent to gone. Net effect: an operator can safely discard/abandon an in-progress capture (including one that still shows unredacted PII) without worrying it persisted somewhere.

**Added 30Aug2026 alongside the above finding — post-capture redaction editor, closing a real usability gap:** `RedactionCaptureStage`'s masks (black boxes) had to be positioned *before* clicking capture, baked into the canvas at that moment — impractical when physically holding a webcam by hand rather than using a mounted one, which is Rey's actual real-world setup. New `PageRedactionEditor.jsx` lets a page already sitting in the capture queue be redacted afterward, on the frozen frame — opened via a pencil icon on each thumbnail, `Apply & Save` re-burns the boxes into a new image and marks the page `redacted: true`. Each thumbnail now shows a `Redacted`/`Not redacted` badge, and submitting with any unredacted page still queued triggers an explicit confirm-or-cancel prompt rather than silently uploading it. Both redaction paths (pre-capture and post-capture) are kept, not one replacing the other — pre-capture still makes sense with a camera on a stand.

**Added 30Aug2026 — a second live case (IJG749/sponsor Dan/pseudonym Caleb) confirmed the `letter_exchange_count`-based exchange-folder guess wrong in a *different* way than FON949 was, which changed the actual design, not just the fix:**
- **Upload destination confirmation, with an editable override.** The upload-preview flow got a real UI: `ScanLetterUpload.jsx`'s confirm modal now shows an editable exchange-folder field (defaulting to the guess, editable, with a "Recheck" button that re-resolves the full destination — folder path, reply filename — against the corrected value via `GET /upload-preview?exchange_override=`). `POST /upload-redacted` accepts the same `exchange_override` field. Necessary because the very first version of this confirmation (read-only) asked Rey to verify a number he had no way to actually check without separately opening OneDrive.
- **The confirm modal also now lists the sponsee's real existing OneDrive folders** (`existing_folders` in the preview response) directly in the UI, for exactly that reason — verifying a guess is meaningless without seeing the real data it should match.
- **The default guess itself was redesigned, per Rey's direct correction, to stop using `letter_exchange_count` at all.** The original (same-day) fix computed the guess as `received_count - 1` (assuming every sponsee has exactly one `intro` letter before numbered exchanges begin) — confirmed correct for FON949, then confirmed *wrong* for IJG749, which has no `intro` folder at all and a historical "-push" exchange that got merged into the next round instead of getting its own folder (so the physical count and the folder count diverge for reasons no formula on `letter_exchange_count` could predict). Rey's correction: **derive the guess from the real OneDrive folder listing itself** — one more than the highest existing `exchangeN` folder, tolerant of real naming variance found in practice (an accidental extra dash, `exchange-2-sent`; combined ranges, `exchange2-3-sent`, taking the higher number) — falling back to `"1"` if only `intro`/`intro-sent` exists, or `"intro"` for a genuinely new sponsee with no folder yet. `LetterService._guess_next_exchange_label` (unit-testable, pure function over a folder-name list). Verified against both real sponsees' actual histories: correctly produces `"5"` for both FON949 and IJG749 with no override needed, and correctly advances to `"6"` for FON949 after that sponsee's real `exchange5` folder was actually created. `letter_exchange_count` is kept as a *reported* fact (physical letters received, matching the roster's "letter exchange (received only)" column) but is no longer used to derive the folder number at all.
- **Along the way:** `Sponsor` "Dan" (pseudonym `Caleb`) created; `DIS759`'s roster `sponsor_name` corrected from a departed sponsor (`Dave R`, no longer active) to `Dan` via the new `PATCH /api/prisoners/{cpid}` endpoint (see below) -- `Caleb`'s real OneDrive folder holds sponsees from both eras (`DIS759`, `HBH004`, `IJG749`), which is what surfaced the stale roster data in the first place.

**Added 30Aug2026 — `PATCH /api/prisoners/{cpid}` is now real, closing a gap flagged the same day.** `PrisonersPage.jsx`'s "Update Person" form previously called this exact path/method and failed with an explicit "not wired up yet" message (by design, not a silent no-op) — surfaced as a real blocker when `sponsor_name` and `letter_exchange_count` turned out to directly control which OneDrive folder a letter uploads to (see `LetterService.resolve_upload_destination`), with no working UI path to fix either if wrong. Also added `sponsor_name` to the form's editable fields (it was missing before, despite being exactly the field most likely to need correction). Backend: numeric fields (`stage`, `letter_exchange_count`, `step_received_count`) are parsed from the form's string inputs with a clear 400 on invalid input; other fields sent blank are cleared to `null`, matching the frontend's "always sends the full form" behavior. No audit-log entry for prisoner edits (unlike `LetterStatusHistory` for letters) — consistent with the rest of this model's existing endpoints, not a new gap introduced here.

**Added 30Aug2026 — real bug found and fixed in the PATCH form itself: numeric fields round-tripped as raw JSON numbers, not strings, and silently 422'd.** `GET /api/prisoners` returns `stage`/`letter_exchange_count`/`step_received_count` as real JSON numbers; `UpdatePersonPanel`'s form initializer (`prisoner[key] || ''`) didn't stringify those, so an untouched numeric field stayed a raw number in form state and got PATCHed back as JSON int -- rejected outright by `PrisonerUpdate`'s strict `Optional[str]` schema, before any of the endpoint's own coercion logic ran. Fixed by explicitly `String(...)`-coercing every field on form load. Also fixed in passing: FastAPI 422 validation errors put an array of `{loc, msg}` objects in `detail`, not a string -- the frontend was rendering that directly, showing a literal `"[object Object]"` to Rey. Now formatted into a readable message.

**Added 30Aug2026, same incident -- a second real gap surfaced while debugging the above: no in-app way to recover when `resolve_upload_destination`'s sponsor_name lookup fails.** Real case: an Excel apply overwrote `FON949.sponsor_name` from `"Matt E"` to `"Matt"` -- a plain-string mismatch against the `Sponsor` table (deliberately not a foreign key, see that model's docstring), which blocked `/upload-preview` and `/upload-redacted` with a "No Sponsor record found" error and no way to proceed except editing the prisoner record directly, outside the upload flow. Fixed properly, not just patched around:
- `resolve_upload_destination`/`upload_redacted_to_sponsor_onedrive` both take an optional `sponsor_id_override` (by real `Sponsor.id`, not name-string, to avoid the exact ambiguity that caused this), same "always overridable" pattern as `exchange_override`. `GET /upload-preview` and `POST /upload-redacted` both accept it.
- `ScanLetterUpload.jsx`'s confirmation modal now **always opens**, success or failure -- previously a failed initial resolution just showed a dead-end error banner and never reached the modal at all. A Sponsor dropdown (populated from `/api/sponsor-directory`) sits in the modal at all times, not just on failure, consistent with the exchange-number field already being always-editable there. "Confirm & Upload" is disabled until a successful resolution exists and any pending override has been rechecked.
- **Live-verified the override actually works** against real data (Letter #22/FON949): overriding to Dan's sponsor id correctly re-resolved to `Caleb/FON949/intro` with a fresh (empty) existing-folder listing, not stale data from the previous sponsor.
- **Found while verifying, not yet resolved as a one-time fix:** the `"Matt"` vs `"Matt E"` mismatch is **not a one-off** -- across this same session, three separate Excel applies of the same source file each re-overwrote `sponsor_name` back to `"Matt"`, silently undoing a manual Postgres fix each time. Rey's call: **fix it in the source Excel file** (correct the Sponsor column for FON949 to say `"Matt E"`) rather than renaming the `Sponsor` record to match Excel -- so `Sponsor.name` stays `"Matt E"`, and the Excel file is the thing that needs correcting before its next real apply. Worth remembering if this exact mismatch reappears after a future apply: it means the source file was never actually corrected, not that the fix regressed.

**Added 31Aug2026 — real data corruption found and fixed: `_extract_prisoner_row`'s CPID extraction treated a blank Excel cell (pandas `NaN`) as a valid identifier, string `"nan"`.** `str(row.get('CPID') or row.get('code') or '')` -- `NaN` is truthy in Python, so the `or` chain never fell through to check `'code'` or `''`, and `str(nan).strip()` produces the non-empty string `"nan"`, so the "no CPID" guard never fired either. Every blank-CPID row silently became a real record with `cpid='nan'`, and **every such row collided on that same fake key** -- confirmed live: a real `Prisoner` row with `cpid='nan'` already existed in Postgres from a prior apply, holding stale data for whichever of several real people (a "batch of prisoners sent from our international office," some already paroled) happened to sync last. Fixed with explicit `pd.isna()` checks (matching the `clean()` helper elsewhere in this file that was already doing this correctly) instead of relying on Python truthiness.

**Added 31Aug2026, same investigation -- a deeper design question this surfaced, worked through live with Rey, changed the actual behavior, not just the bug fix:** once the NaN bug was fixed, the diff correctly stopped merging blank-CPID rows into a fake shared record -- but now surfaced **17 real contacts** (a real batch from the international office) with genuinely blank CPIDs, all previously invisible. Rey's first instinct (don't auto-generate CPIDs for them, "these are individuals we could not service") turned out to need refinement through several rounds of real back-and-forth:
- All 17 turned out to already have a **recognized `Stage`** value (90 or 91) in the sheet -- the diff just didn't know to treat a terminal-stage blank CPID as expected rather than an error.
- Two new terminal Stage codes were added to the taxonomy (see `docs/status_workflow.md`): **94** (Tradition 3 prevents service -- does not identify as an addict) and **95** (Other, e.g. admin).
- **The real design conclusion, after going back and forth on whether Stage 91 specifically requires a prior CPID:** it doesn't. CPID presence isn't the meaningful signal at all -- Stage is. Rey's words: *"CPIDs are not sacred, but the category has more meaning."* A contact can legitimately go silent (Stage 91) before ever being formally taken on with a CPID, not only after.
- **Final rule implemented in `diff_with_postgres_prisoners`:** a blank-CPID row with any recognized Stage (`RECOGNIZED_STAGES` = 1-12, 90-95, module-level constant, kept in sync with `STAGE_LEGEND` in `PrisonersPage.jsx`) goes into a new `no_cpid_categorized` list -- expected, not flagged, just counted. Only a blank CPID *and* a blank/unrecognized Stage lands in `skipped_missing_cpid` -- genuinely ambiguous, still surfaced for Rey to look at. Both lists are now shown in `ExcelUploader.jsx`'s diff preview (summary counts plus expandable detail), not silently dropped the way blank-CPID rows were before this investigation started.
- **Live-verified against the real staged upload file:** all 17 real contacts landed in `no_cpid_categorized` (4 at Stage 90, 13 at Stage 91), zero in `skipped_missing_cpid`.
- **Not yet cleaned up:** the corrupted `cpid='nan'` Postgres record itself (currently holding stale data for whichever person synced there last, believed to be Gabe Phillips) still needs deleting now that his real status (Stage 91, no CPID needed) is understood -- flagged, not done, pending Rey's confirmation before deleting anything.

**Added 30Aug2026 — DB Mgt (`PrisonersPage.jsx`) reworked from a card grid to a dense, Excel-sheet-style table, prompted directly by Rey ("the cards take up so much space, its use is bad") while preparing for a real roster upload.** Several follow-on requests landed the same session, in order:
- **Cards → single-row-per-record table.** Same treatment then applied to Letter Mgt and Sponsors' tables for visual consistency (tighter padding, `text-xs uppercase tracking-wider` headers, `hover:bg-calpop-blue/5` rows) — all three list views now share one dense style, not three different ones.
- **`Layout.jsx`'s page width widened** from `max-w-6xl` (1152px) to `max-w-[1600px]` — the card layout had been capping every page's content well short of typical browser width, which became actively limiting once a data-dense table needed the room. Applies to all pages, not just DB Mgt.
- **Excel upload card moved from Dashboard to DB Mgt** (Rey: it belongs next to "Download Excel," not on a separate page) and made compact — collapsed behind an "Upload Excel" toggle button, tighter spacing throughout, the explanatory caption turned into a hover tooltip (ⓘ icon) instead of always-visible text.
- **Column picker, added because DB Mgt has 20+ possible fields** and no fixed table could show them all at once without becoming unreadable. A "Columns" toggle lists every optional field as a checkbox; selection persists per-browser via `localStorage` (`calpop_prisoners_visible_columns`). CPID and First/Last Name are `locked: true` (always shown, not hideable, excluded from the picker) — **CPID pinned at the very front by Rey's explicit choice** ("easier to find"), even though it sits near the end of the real spreadsheet's column order.
- **Column order matches `active_map.xlsx`'s real sequence** (Intake#, Stage, First/Last Name, Safety, CDCR#, Housing, Address, City, State, Zip, Facility, CDCR DB Verified, Contract, Date of Contract, Needs Green Book, Language, Review Notes, Sponsor, Date Sponsor Assigned, Letter Exchange Count, Step, BPH Date), not an arbitrary order — caught and fixed twice: first the optional columns were reordered to match, then First/Last Name (initially hardcoded as pinned leading columns like CPID) were found to be breaking the sequence and moved into their real spreadsheet position instead, while staying always-visible like CPID. **The Excel *export* file itself did NOT match this order at the time** — flagged to Rey, explicitly left alone. **Fixed later the same day (31Aug2026)**, once Rey decided Postgres/the app would become authoritative going forward and Excel would become a pure export/review artifact (see that decision below) — at that point a mismatched export stopped being a minor inconsistency and became the actual review document's correctness. `main.py`'s `export_prisoners_excel` now matches `active_map.xlsx`'s exact column order and names (`Prison` instead of `facility`; `Count` deliberately omitted as a superseded duplicate of `Intake #`).
- **Sortable columns** — every header (including CPID, First/Last Name) is clickable, cycling ascending/descending with a chevron indicator; blanks always sort last regardless of direction. Sorts on the raw underlying value, not rendered JSX (e.g. the Safety badge sorts on the plain `safe`/`unsafe` string).
- **Search field un-stretched** — was `flex-1` (full container width), now a fixed `w-[36rem]`, sharing its row with the Columns picker instead of its own full-width row.
- **Date display fixed roster-wide.** Date-ish fields (`date_of_contract`, `date_sponsor_assigned`, `bph_date`) arrive from Excel as pandas-style `"2022-03-25 00:00:00"` strings; both the table (`formatDateDisplay` helper) and the Update Person edit form (time portion stripped on load) now show `25-Mar-2022` instead — noted in `docs/status_workflow.md` as the convention to reuse whenever the 14-point letter-tracking checklist gets built.
- **"Review Notes" is now a full-width, resizable `<textarea>`** instead of a truncated single-line input — the only field long enough in practice to need it.
- Also fixed in passing: the Excel *export* filename's timestamp was in UTC (container clock) instead of Pacific time — same fix pattern already used in `LetterService`'s scan-title timestamp, applied here too.

**Decided 31Aug2026 — Postgres/the app is authoritative going forward; Excel becomes a pure export/review artifact, not a two-way-edited document.** Surfaced by Rey directly noticing the risk: quick fixes made through the app's own edit form (e.g. today's `sponsor_name`/`letter_exchange_count` PATCHes) have no path back into his maintained Excel file, so the two would silently diverge the moment both got edited independently. Weighed three options (A: Excel stays authoritative, app edits are emergency-only and must be manually mirrored back; B: Postgres authoritative, Excel is read-only; C: keep both live with an explicit reconciliation habit). **Chose B** — matches how Rey already said he'd use Excel going forward ("a quick, portable review doc," not a live two-way document). Concrete requirement that came with this: the export must show ALL real data the way the real sheet does, which surfaced a genuine architecture gap — the 17 no-CPID contacts (see above) have no way to exist in Postgres at all, since `cpid` is the primary key, so they'd be invisible in an export sourced only from `Prisoner`. Resolved pragmatically rather than by building a second table: Rey chose to generate real CPIDs for all 17 after all (see below), rather than the earlier-discussed separate no-CPID tracking table -- simpler, and consistent with CPID no longer being treated as scarce/precious ("CPIDs are not sacred").

**Added 31Aug2026 — 17 real CPIDs generated for the previously-blank contacts, handed to Rey to enter into Excel himself.** Same generator as "Add New Person" (`core.cipher.generate_cpid_from_info`, Caesar-cipher, collision-checked against all 140 real records and the batch itself) -- run as a one-off script, not a new endpoint, since Rey is entering these into his Excel file by hand rather than the app writing them directly to Postgres (keeps Excel as the actual point of entry, consistent with the authority decision above). The already-corrupted `cpid='nan'` record (Gabe Phillips' stale data, from the NaN bug above) was deleted once his real CPID (`HBC659`) made it fully superseded -- Postgres count corrected from 141 to the real 140.

**Found 31Aug2026, adjacent, not yet acted on:** Rey noticed duplicate `Intake #` values in the real sheet while reviewing (5 duplicated numbers, 11 rows out of 157, scattered rather than clustered -- looks like organic manual-tracking drift over years, not a systematic merge of two batches). Confirmed with Rey: **no external reference to these numbers exists** (not on physical paperwork, purely informal accounting) -- he's fixing the 11 historical duplicates himself in Excel by sorting, not something built into the app. **Still open, not built:** auto-assigning the next available Intake # for new entries going forward (the same pattern CPID generation already uses), to stop this drift at the root now that the app is authoritative. Proposed, not yet requested.

## Letter Mgt — Spanish-language letter translation workflow (built 31Aug2026)

**Motivation, direct from Rey:** envelopes arrive in English (existing person-matching/routing OCR handles this fine), but the letter *content* is sometimes Spanish, and sponsors need to be able to read and respond to it. Distinct from Envelope Mgt's OCR, which deliberately never translates (needed verbatim for fuzzy person-matching) -- this is a new capability for Letter Mgt's content pipeline, which previously handled only images, no text extraction at all.

**Design decided through direct Q&A with Rey before building, since guessing wrong here meant real rework:**
- Sponsor receives **both** the original redacted scan and the English translation (not translation-only) -- preserves the letter's real visual/emotional content even if the sponsor can't read Spanish.
- Translation lives as **its own separate file**, not prepended into the existing blank reply doc.
- **No in-app reviewer role.** The bilingual reviewer is a trusted internal person, but review happens entirely outside the app (email/text, however Rey already reaches them) -- same pattern as how sponsors themselves already work. This ruled out building a new permission tier, which the RBAC work earlier this session (item 16 in the Security & Environment Findings section) had already flagged as something to avoid adding without a real need.

**Built:**
- `OCRService.translate_image` (`server/services/ocr_service.py`) -- a second prompt (`OLLAMA_TRANSLATE_PROMPT`), separate from the existing OCR prompt which explicitly forbids translation. **Local-only, no cloud fallback at all** -- raises rather than silently sending letter content to Google Vision if `OCR_PROVIDER` isn't `local`, since letter content (not just an envelope) is exactly the PII this app's local-OCR design exists to keep offline.
- `build_translation_review_docx` (`server/services/artifact_docx.py`) -- bundles one or more translated pages into a `.docx` clearly headed "DRAFT TRANSLATION -- NEEDS BILINGUAL REVIEW BEFORE USE," so it's never mistaken for a finished document if it ends up somewhere unexpected.
- Two new endpoints: `POST /api/letters/translate-page` (stateless, one page in, transcription+translation+detected language out) and `POST /api/letters/translation-docx` (bundles current drafts into a downloadable file).
- `ScanLetterUpload.jsx`: a new opt-in "Translate Pages" section (only for `capturedPages`, not file-mode uploads -- the real use case is a physical letter under the webcam) -- editable original/translation text areas per page, a "Download for Review" button, and a file picker to bring a reviewer's corrected `.docx` back in. Final upload includes the corrected file if provided, otherwise builds one from the current (possibly hand-edited) draft -- never silently drops the translation step.
- **Live-verified against the real local Ollama model**, not just code-reviewed: a synthetic Spanish test image correctly transcribed, translated naturally to English, and language-detected as Spanish -- both through the service directly and through the real authenticated HTTP endpoints, and a genuinely valid `.docx` (verified as real OOXML) produced by the docx endpoint.
- **Not yet tested against a real physical Spanish letter** -- the synthetic test confirms the pipeline works, not real-world handwriting legibility, which is the same caveat already on file for the existing OCR (Phase 5: handwriting is inherently unreliable regardless of language).

## Standalone "Translate" tool (built 31Aug2026) — security account

**Motivation, direct from Rey:** a real Spanish-language letter from his own sponsee, in hand, that has no destination through the existing Letter Mgt flow — it isn't going to a sponsor's OneDrive (Rey *is* the sponsor) and isn't being logged as a Letter record (never routed through Letter Mgt's assign/scan step). The existing `ScanLetterUpload.jsx` translation section is embedded inside the sponsor-upload flow and requires a resolvable upload destination, so it couldn't serve this case. Built as a new top-level nav tab, `/translate` (`TranslateLetter.jsx`), positioned between Envelope Mgt and Letter Mgt — capture/upload a page, translate, read/edit on screen, optionally download a `.docx`. No sponsor resolution, no Letter record, no OneDrive step.

Rey asked directly what PII exposure this introduces, since it's a new path handling real letter content. Full account, traced end to end:

- **Browser.** Captured page image lives only in React component state (in-memory JS) — no `localStorage`/`sessionStorage` persistence was added for it, so it's gone on refresh or navigating away. Nothing touches client disk unless the user explicitly clicks Download.
- **Browser → backend.** Goes over `POST /api/letters/translate-page`, gated by the same `require_admin` dependency as the rest of the admin app — no new auth surface. Same trust boundary as every other page (local network / Traefik on :8090 or Vite dev on :4000), not internet-exposed.
- **Backend → Ollama.** `OCRService.translate_image` (pre-existing, from the sponsor-facing translation workflow above) refuses to run at all unless `OCR_PROVIDER=local` — raises rather than silently falling back to a cloud service. Posts to `settings.ollama_base_url` (`http://host.docker.internal:11434` per `.env`) — Ollama running on Rey's own machine, never a remote host. Letter content never leaves the machine at this step, same guarantee as the sponsor-facing translation path.
- **Logging.** Verified by reading both `_process_image_ollama` and `translate_image` in full: neither logs image bytes or transcribed/translated text anywhere, including on the error path (only the Ollama connection-error string is logged, never content).
- **Database / disk.** This tool makes **no DB writes** (no Letter record, no Prisoner touch — the one deliberate difference from the rest of Letter Mgt) and **no server-side file writes**. The regular scan/upload flow saves originals to `data/originals/letters/`; this standalone tool doesn't persist anything server-side at all.
- **The `.docx` download.** Built in-memory on the backend (`build_translation_review_docx`, extended with a `personal_use: bool` flag so the heading doesn't say "NEEDS BILINGUAL REVIEW BEFORE USE" for a letter with no reviewer and nothing ever uploaded), streamed straight to the browser's download — never written to server disk.

**Net exposure is strictly less than the rest of the app**: same admin-auth boundary and the same local-only-OCR guarantee as the existing sponsor-facing translation workflow, but with zero server-side persistence unless/until the user explicitly downloads a copy — at which point it's a file on Rey's own machine, same open item as everywhere else in the app (see [Windows disk encryption follow-up](calpop_windows_disk_encryption_followup.md) memory note, still unresolved).

### Update (31Aug2026 same day): opt-in Google Vision path, redaction-gated

**Motivation:** the local model (qwen2.5vl 7B) has a real, repeatedly-observed capability ceiling on dense/tabular handwritten content — it read an 8-row/4-column resentment-inventory table column-by-column instead of row-by-row despite explicit prompting not to (confirmed via the image itself, not focus/legibility — Rey checked the actual pixels via the new full-scale compare view and confirmed the bottom rows were equally sharp as the good ones), and the misordered content then also caught the worst of a separate, known VLM failure mode (accuracy degrading over a longer generation). More prompt tuning stopped being a good use of time. Rey's call: keep local as the default, but add Google Vision as an explicit, narrow, opt-in exception for exactly this case — **gated on the image being redacted first**, never on raw letter content.

**Design, mirroring the app's existing OneDrive-upload redaction pattern:**
- `TranslateLetter.jsx` pages now carry a `redacted` flag (default `false`) and a pencil-icon control opening the same `PageRedactionEditor` used elsewhere in the app (black-box masking, burned into the image client-side before anything is sent anywhere).
- Two buttons: **Translate Pages (Local)** — unchanged, always available. **Translate via Google Vision (redacted only)** — disabled client-side (`pages.some(p => !p.redacted)`) until every captured page is marked redacted.
- **Server-side enforcement, not just a UI gate**: new `POST /api/letters/transcribe-page-cloud` requires `redaction_confirmed: true` in the request body and returns a 400 refusing the call otherwise — this is checked independently of whatever the frontend's button state claims. There is no way to verify pixel content is *actually* redacted server-side (no server-side redaction-detection exists), so this flag is the strongest enforcement actually available; the real guarantee is structural (the only frontend caller only ever sends `true` once its own `redacted` flags are all true), not cryptographic.
- **Narrow blast radius**: only the OCR/transcription step can go to Google Vision (`OCRService.transcribe_image_cloud_redacted`, using `google-cloud-vision`'s `document_text_detection`). Translation of the resulting text is still always the local, text-only `/translate-lines` call (Ollama) — it never touches the image, so there's no reason to send it anywhere but locally. Net: at most a redacted image (never raw) reaches a third party, and only when explicitly requested per-page.
- **Default posture unchanged**: `OCR_PROVIDER` stays `local` app-wide; nothing about the default envelope/letter OCR path changed. `OCRService._init_client` was loosened to initialize the Google Vision client whenever credentials exist (previously gated on `ocr_provider == "google_vision"`), purely so this opt-in path has a client to call — it does not change what the default paths use. Verified live: Google Vision credentials (`GOOGLE_VISION_CREDENTIALS_PATH` in `.env`) were already configured from earlier envelope-OCR-fallback work, so `self.client` initializes successfully without any new secret being introduced.
- **Bonus, not the reason it was built but worth noting**: Google Vision's `document_text_detection` preserves real line breaks in its output natively, sidestepping the local model's separate line-order problem (see `translate_lines`' docstring) without needing the array-of-lines prompting trick the local path relies on.

### Update (31Aug2026, later same day): translate-lines-cloud added (Google end-to-end), and a NEW formatting problem found on full prose pages

Rey asked for Google to be used for both steps, not just OCR, so translation didn't hand off to the local model. Built:
- `OCRService.translate_lines_cloud` (Google Cloud Translate, `translate_v2`, same shared service-account credentials as Vision) and `POST /api/letters/translate-lines-cloud`, same `redaction_confirmed` gate as the OCR step even though it's text-only.
- `_init_client` now builds both `self.client` (Vision) and `self.translate_client` (Translate) from one shared `creds` object.
- **Real deployment snag, resolved**: the existing Vision service-account credentials (`crypto-haven-411118`, dated Jul 2025 — an old, unrelated-by-name project, not something set up for CalPOP specifically) had Vision enabled but not Cloud Translation, and the project wasn't even visible under the Google account Rey was initially browsing with -- turned out to be reachable under `rey@prisoneroutreach.org`. Enabled Cloud Translation API there; live-verified working (`"Hola mundo"` → `"Hello world"`).
- **Also split Transcribe and Translate into two separate, user-triggered steps** (were previously one auto-chained pipeline) -- Rey's explicit ask: translating a bad transcription immediately just translates the OCR errors too. Now the Original box is meant to be corrected between Step 1 and Step 2; `runTranslatePipeline` re-splits whatever's *currently* in each page's Original textarea (not the raw transcription result) into lines before calling either translate endpoint.

**Then, testing a full page of continuous prose (not a table) surfaced a different formatting problem** — not yet diagnosed (no screenshot captured before Rey moved on). Suspected cause, not confirmed: Google Vision's `document_text_detection` returns one array line per physical *line-wrap* of the page, not one per paragraph/sentence -- fine for a table (each row is already a real semantic unit) but likely wrong for prose, where translating each wrapped line independently (current `transcribe_image_cloud_redacted`/`translate_lines_cloud` behavior) would lose sentence-level context per API call and could reproduce the mid-sentence wrap points as spurious line breaks in the translated output. **Not fixed** -- Rey's call was to go back to doing full-page letters by hand (his phone) rather than debug this further right now. Worth revisiting with an actual screenshot before attempting a fix; don't assume the diagnosis above without seeing it happen.

**A follow-up screenshot did clarify one specific case**: a 7-row "things I can/can't control" worksheet, each row a short left-side phrase, an arrow, and a wrapped response on the right. Initially misdiagnosed as a 2-column table (it isn't -- Rey corrected this: "no columns"); it's paired left→right entries. The general lesson holds either way -- linearizing loses the pairing/structure a human reading the photo gets for free.

**Root-cause insight from Rey, comparing against his own iPhone workflow**: the reason his phone's camera-translate feels effortless isn't a better OCR model -- it's that it never linearizes the page into flat text at all. It detects each text block's position and overlays the translation directly on the image in place, so spatial structure (which response pairs with which phrase, column order, row order) is preserved visually instead of needing to be reconstructed as a sequence. Every formatting failure this session (table column-bleeding, row/pair misalignment, mid-sentence line wraps) is a direct consequence of this app's pipeline linearizing first -- transcribe to flat lines, translate flat lines -- which discards exactly the spatial information that would have prevented each of these.

### Image-overlay translation mode -- built same session, not "next session" after all

Originally scoped below for a future session; Rey decided to build it the same night once the real cost (see below) was made explicit.

**Real cost this is solving, quantified by Rey**: he answers letters roughly in sequence. When one is in Spanish, he skips it rather than break that sequence, sets it aside until he's fresh, and handles it separately via his phone -- in practice this adds up to **up to two weeks of delay** per Spanish letter versus how quickly an English one gets answered. This isn't a UX-polish request; it's the actual bottleneck a working overlay mode would remove, by making a Spanish letter answerable in-sequence like any other.

**Core idea**: detect text blocks *with position* (Google Vision's response already returns per-paragraph bounding boxes -- currently only used for the confidence average), translate each block's text independently, and paint the translation back onto a copy of the image at that same position -- a read-only composited view, not more flat text.

**Why it should actually fix the recurring problem**: reading-order correctness stops being required at all once nothing gets reordered into a sequence.

**Concrete scope:**
- **Google Vision only, by necessity** -- Ollama's vision model returns text with no bounding boxes, so this mode can't run locally. Same redaction-gate posture as the existing cloud path (`redaction_confirmed`).
- **Backend**: new method using Vision's paragraph-level bounding boxes, batch-translating each paragraph via Cloud Translate, then Pillow (already present in the image, `PIL 12.3.0`, transitively -- would still want it added to `requirements.txt` explicitly rather than relying on that) to paint a white rectangle over each region and draw the translated text back in, wrapped/sized to fit. Returns a composited image.
- **Frontend**: a new toggle on the existing full-scale compare viewer (zoom/pan already built for it) between "Text" (today's editable Original/Translation boxes -- kept as-is, still needed for corrections and the `.docx` export) and "Overlay" (the new composited image, read-only, for a fast visual read). Additive, not a replacement of the text flow.
- **Open questions to settle during the build, not before**: block granularity (paragraph vs. line -- affects both translation coherence and visual crowding); what happens when translated English text is longer than the Spanish it replaces and doesn't fit its box (shrink-to-fit font vs. controlled overflow).
- **Size**: a real feature (image compositing, font/text-fit handling, a new view mode) -- roughly half-a-day-to-a-day of focused work including testing against real handwritten pages of varying density, not a quick patch.
- **Honest risk**: the block *grouping* Vision provides is what would define the overlay regions, and that grouping showed some of the same column-bleeding behavior in this session's testing -- likely a meaningful improvement, not a guaranteed full fix, until actually tried against a real page.

**Built, with one real design change from the scope above.** Vision's own paragraph grouping was NOT used in the end -- a live synthetic test (two unrelated phrases on the same text row) showed Vision merging them into one paragraph and mistranslating them as a single sentence, exactly the failure this feature exists to eliminate. Replaced with `_group_words_into_cells` in `ocr_service.py`: words are clustered into rows by vertical (y-axis) overlap, then each row is split into cells wherever the horizontal gap between consecutive words is an outlier relative to that SAME row's own normal word spacing (`gap_threshold = max(avg_h * 0.9, median_gap * 2.5, 10)` -- tuned against the live failure case, where a real 32px column gap sat just under a flat 1.5x-text-height threshold while normal word gaps in the same row were only ~9-13px). Verified fixed with the same synthetic test, byte-for-byte confirmed different output after the fix, then visually confirmed correct (two independently-correct translated phrases, each in its original position).

New pieces: `OCRService.translate_overlay_cloud` (Vision detect -> `_group_words_into_cells` -> batch Cloud Translate -> Pillow paints a white rect + wrapped translated text back at each cell's bounding box, using reportlab's bundled Vera.ttf as the render font since Pillow itself ships none -- no new font dependency needed), `POST /api/letters/translate-overlay-cloud` (same `redaction_confirmed` gate as every other cloud endpoint, returns a composited PNG not JSON), and a new "Overlay (Google)" button + read-only viewer modal in `TranslateLetter.jsx` (cached per page via blob URL so repeat views don't re-call Google). `Pillow` added to `requirements.txt` explicitly (was already present only transitively).

**Translation-context decision, made explicitly rather than defaulted into**: considered swapping the per-cell Cloud Translate calls for one context-aware array call (giving the model every cell's text at once, so cross-cell/sentence context isn't lost at cell boundaries) via the existing `translate_lines` pattern. Rejected for now: Cloud Translate's list API is a real structural guarantee (N strings in, exactly N results out, no parsing involved) -- swapping to the local model's array translation would trade "no cross-cell context" for "risk of a returned array being the wrong length," which silently shifts every subsequent translation onto the wrong cell's bounding box. Given this session's repeated evidence that the local model doesn't reliably follow formatting instructions (dropped requested newlines, misread table row order) even on short content, that risk was judged worse than the context loss, for this specific feature where correct position is the entire point. Staying on Cloud Translate for now; revisit only if real evaluation (below) shows the context loss is actually costing something -- and if revisited, do it defensively (validate returned-array length before trusting it, fall back to the guaranteed per-cell calls on any mismatch), not blindly.

### Four-way evaluation, same real letter page (31Aug2026): Local vs. Google (flat) vs. Overlay vs. Rey's iPhone

Rey ran the same physical letter page (a "things I can/can't control" worksheet, mixing short paired phrases with a few full sentences) through all three of this app's methods, comparing each against his existing iPhone camera-translate workflow. Two smaller UX bugs surfaced and were fixed along the way -- also documented here since they came directly out of this comparison:
- **Two full-screen viewers (the Text compare modal and the new Overlay viewer) shared the same z-index with no mutual-exclusion** -- if both `viewingPageId` and `viewingOverlayPageId` were ever simultaneously set (e.g. the thumbnail was clicked earlier in the session), the later-rendered one in the DOM would silently win, so "View Overlay" could show the wrong modal's content. (Rey initially reported this, then retracted it after re-checking -- noted as a real latent bug worth fixing regardless, not confirmed as the actual cause of that specific report.)
- **Multiple in-session `page reload dist/index.html` events** (Vite forcing a full browser reload rather than hot-swapping some structural edits) wiped Rey's in-progress captured/redacted pages and results several times during this same testing session -- not a code bug, just a real cost of live-editing `TranslateLetter.jsx` while it was actively being used; flagged so a future session doesn't repeat large structural edits mid-use without warning first.
- **Per-method results were previously a single shared slot per page** -- running Google after Local silently overwrote the local result with no way back except re-running. Rebuilt so `translations[pageId]` holds separate `local`/`google` slots plus a `selectedMethod` tab switcher, so both survive and can be compared directly. `runTranslatePipeline` now operates on whichever slot is currently selected (not tied to which engine did the transcription), so engines can be mixed (e.g. Local transcribe + Google translate).
- **Native `<textarea>` resize doesn't auto-scroll the page** past the viewport edge (a real browser limitation, not a CSS bug) -- replaced with a custom drag handle (`startTextareaResize`) that runs a `requestAnimationFrame` loop to scroll the page while dragging near either edge, tuned down from an initial too-fast speed (18px/frame -> 6px/frame) after live feedback.

**The actual findings, per method, on the same page:**
- **Local (Ollama)**: genuinely variable run-to-run, not just occasionally wrong. One run produced a real repetition-loop hallucination (`"Ser un seguidor"` / `"Being a follower"` repeated 3x verbatim) plus several lines of fabricated content near the end that don't match the handwriting at all (`"Mi padre cruel y violenta"`, `"Globo constante y puntual"`) -- a known small-VLM long-generation failure mode. A **second run on the identical page came back clean and accurate**, no repetition, no fabrication. Rey's own framing, worth keeping verbatim: *"variability is not what we need."* The unpredictability itself -- not knowing in advance whether a given run will be good or bad -- is the disqualifying property, separate from and worse than average quality being mediocre.
- **Google Vision + Google Translate (flat, Step 1 -> Step 2, no overlay)**: shares the same physical-line-based splitting as local (choppy per-line output, no cross-line sentence coherence), **and is not immune to real OCR misreads**: transcribed `"le puse los cuernos"` (a real idiom -- "I cheated on her") as `"le hice cuando le Puse 105"` -- confirmed as a genuine Vision-engine recognition error, not a translation-layer artifact, since it also appeared via the overlay's independent word-extraction path (see below) and google-cloud-translate's list API has a hard structural guarantee against cross-item corruption.
- **Overlay (Google Vision + Translate, position-preserving)**: successfully solves the SPATIAL problem the other two methods have -- verified both synthetically (two unrelated same-row phrases, correctly kept separate and correctly positioned after the `_group_words_into_cells` geometry fix) and on this real page (paired phrase/response rows stayed correctly matched, not scrambled). But it **inherits both of the other methods' remaining problems**: the same `"105"` OCR misread reproduced in the exact same spot (confirming, cross-path, that it's a pure Vision-engine error -- the grouping/positioning code never touches word *content*, only word *position*), and a NEW failure mode specific to per-line cell splitting -- a hyphenated word wrapped across a line break (`"Ex-perimento"`) got split into two separate cells (`"10 ex-"` and `"Perimento para no sex come el."`), and Google Translate, given the second garbled fragment, returned it largely untranslated rather than a clean sentence.
- **Real usability cost, not just accuracy**: even where Overlay's positioning is correct, Rey's direct feedback was that assembling a coherent reply from the resulting copy-pasted fragments took *longer* than the tool's "automation" implied -- worth separating from raw accuracy, since a spatially-correct-but-choppy result doesn't automatically save drafting time. Surfaced an important distinction: the iPhone method **never extracts text at all** -- Rey reads the phone's live overlay and writes his reply independently, with no copy-paste step. This app's Copy buttons assumed the extracted text itself would be a drafting starting point; that assumption doesn't necessarily hold once the text is this fragmented. **Not resolved** -- open question for Rey to settle: is Overlay meant here as a reading aid (write replies independently, same as the phone) or as an editable draft source worth further cleanup investment?
- **iPhone baseline, direct comparison on the "los cuernos" sentence**: got BOTH things right that every one of this app's three methods got wrong on this specific line -- correct OCR (no "105" misread) AND the multi-line sentence translated as one coherent unit (*"How I reacted to my partner, thinking she did the same thing I did when I cheated on her"*), not broken into disconnected fragments.

**Root cause, unifying all three of this app's methods**: every one of them treats each PHYSICAL LINE (a line as it happens to wrap on the page) as an independent unit for translation purposes. This is fine for short, self-contained content (a table cell, a one-line worksheet phrase) but breaks down exactly when a single sentence/thought wraps across a line boundary -- ordinary in real handwritten prose. The iPhone doesn't have this problem for two separate reasons this session finally disentangled: (1) it never linearizes spatially (Overlay now matches this), and (2) it apparently joins wrapped lines back into coherent sentences before translating (none of this app's three methods do this).

**Practical implication**: earlier in this session, on short/structured content (a table, a 7-row worksheet), this app's methods were judged roughly on par with the iPhone. This deeper, same-page four-way comparison shows that parity does NOT extend to genuine continuous prose that wraps across physical lines -- that specific case still favors the iPhone. This is a more precise scoping than was understood before tonight, not a reason to abandon what's built: short/structured content is common in these worksheets and letters, and works well; full paragraphs of flowing prose are the harder remaining case.

**Not fixed tonight** -- logged as a real, now well-evidenced, well-scoped limitation for a future session: joining hyphenated/wrapped lines back into whole sentences before translation (likely via a smarter row-merging heuristic -- detecting a trailing hyphen, or lack of terminal punctuation, as a signal to merge with the next row) would directly address the "Ex-perimento" and "los cuernos" sentence-fragmentation cases, though it would not fix the underlying OCR misread itself (a genuine Vision recognition error, not a structural one).

**Why the iPhone's Google Translate app outperforms this app's own Google integration, even though both ultimately sit on Google's technology** -- Rey's direct question, worth answering precisely rather than leaving as a vague "Google is just better" impression. The Cloud Vision API and Cloud Translate API this app calls are general-purpose *building-block* APIs: OCR gives back words and bounding boxes; Translate takes a string in and returns a string out. Neither one's job is "recognize that this text visually wraps across a line break but is really one sentence, and read it that way" -- that's document-layout understanding, a distinct, harder capability. The Google Translate app's camera/live-translate mode is a fully engineered *consumer product*, refined over years specifically for "photograph text, understand its structure, translate it naturally" -- that layout/sentence-reconstruction intelligence is product-level work Google has not exposed through the public Vision/Translate APIs this app integrates with. So this isn't a sign of a misconfiguration or a wrong API choice -- it's the expected gap between assembling raw primitives to approximate a feature and using the finished, more capable product Google already shipped on top of (likely) a materially different and more sophisticated pipeline. The closer-fit product for this exact problem is Google's Document AI (structured-document-understanding, flagged earlier this session as a bigger/costlier option, not attempted tonight) -- not a different way of calling Vision/Translate.

## Reference Hub "Local Files" — ephemeral upload cache, a deliberate security posture (added 02Sep2026)

Built as part of Letter Writing Mgt's Reference Hub, which now has four categories: Curriculum, Letter Exchange History, Local Files, and Translations. The first two and Translations are real host-mounted (or, for Translations, app-generated) persistent storage. **Local Files is intentionally different, and the difference is a security decision, not an oversight.**

**What it's for**: Rey's own curriculum materials and past letters, which normally live on his Windows machine, sometimes need to be pulled up while composing a reply. The mechanism: a native browser file picker (`<input type="file">` — the browser itself opens the OS dialog, no server-side desktop access needed, works from inside Docker/WSL with no architecture workaround required) uploads a copy into Reference Hub's Local Files tab.

**The security decision**: that uploaded copy is deliberately never persisted. `server/config.py`'s `library_local_root` points at `/tmp/calpop_library_uploads/local` — a container-only path with **no Docker bind mount**, unlike every other library category. `server/main.py`'s `startup_event` explicitly wipes and recreates this directory on every backend start/restart, as a second, redundant enforcement on top of the container's own ephemeral storage layer already being discarded on removal. Verified live: uploaded a test file, restarted the backend, confirmed the file was gone (`docker compose restart backend` then `GET /api/library/list?category=local` → `[]`).

**Why this matters, stated explicitly**: curriculum and past-letter content can include real names, addresses, and other identifying details about prisoners and sponsors. Rey's own Windows/WSL folder is already the durable, access-controlled source of truth for this material. Uploading a copy into the app for reference-while-writing convenience should not create a *second*, less-controlled, easily-forgotten-about copy that lingers indefinitely in the app's storage — especially since (unlike Translations, which are app-generated output tied to a specific letter and CPID with a clear retention rationale) an uploaded reference file has no such rationale for permanence. This is the same instinct already applied elsewhere in the project (the standalone Translate tool making zero server-side writes unless explicitly downloaded, §1 of `docs/security_decisions_index.md`) — extended to this new upload path. **This directly parallels, and should be read as part of, the general "don't let personal content sit dormant and forgotten in app storage" posture** — added to the security decisions index, §1.

Contrast, for clarity: Translations (`library_translations_root`, `data/ref/translations/`) and draft-letter artifacts (`data/submissions/`) are both real Docker bind mounts — the bytes live on the host disk from the moment they're written, `docker compose down` does not touch them, and that's correct, because those are the app's own durable output with a real reason to persist (numbered by CPID, referenced later, mailed). Local Files uploads have no equivalent reason to persist, since the real original never left the uploader's own machine.

## Terminology & Scope — "Prisoner"/CPID naming (raised 30Aug2026, not decided, not started)

Rey raised a real concern mid-session, unprompted by any bug: calling the
people this app serves "prisoners" throughout the codebase (`Prisoner`
model/table, "prisoner roster," etc.) may be disrespectful — it names
people by their incarcerated status rather than the actual relationship
this app manages (sponsor/**sponsee** in a 12-step correspondence program),
which is the term Rey actually uses in every real conversation about this
work. **Correction (30Aug2026, Rey):** CPID does NOT carry that same
assumption in its own name — it stands for "CalPOP ID" (named after the
program, not the person's status), so it's not part of this naming concern
on its own terms. The broader scope point still stands independent of
CPID's name, though: the current "Prisoner" naming may be unnecessarily
narrowing what this tool is understood to be for — its real capability
(anonymized-identifier correspondence management, redaction, audit trail,
role-gated access) could serve other vulnerable-population letter-management
use cases beyond prison outreach specifically, not just this one.

**Two options on the table, neither started:**
1. **Full rename** — `Prisoner` model/table, all migrations, every API
   route and frontend component that references it (15+ files). The
   respectful and more accurate option, but a real, invasive engineering
   project in its own right — a schema/table rename done carelessly risks
   breaking the live workflows this session just got working (FON949's
   upload, the new PATCH endpoint, etc.). Needs its own dedicated planning
   session, not a rushed mid-task change.
2. **UI-label-only fix** — change only what's shown to the user ("Sponsee"
   instead of "Prisoner" in labels/copy) while leaving the internal
   code/database naming as `Prisoner`/CPID for now. Much lower risk, gets
   the dignity improvement immediately, defers the deeper structural
   question.

**Not decided which (or whether/when) to do either.** Also open: whether
solving this is an opportunity to reconsider the project's broader scope
(is this purpose-built for prison correspondence, or a more general
anonymized-correspondence tool that happens to be used for that today) —
that's a bigger product conversation than a naming fix alone, and
shouldn't be assumed one way or the other while just renaming fields.

## Envelope Mgt (new work, 09/10Aug2026 — not one of the original 12 SRS phases)

Came out of a direct requirements walkthrough with the project owner, not the
original SRS — a planned 5-tab UI reorg (Dashboard / Envelope Mgt / Letter
Mgt / DB Mgt / Sponsors) surfaced real, previously-undocumented process
detail. The full 12-stage (+ terminal codes) program process this is based
on is captured in **`docs/status_workflow.md`** — read that before touching
this area again; `Letter.status`'s current 12-value enum is a rough,
deliberately-incomplete stand-in for that real process, not yet reconciled.
**Added 30Aug2026:** that doc now also has a finer-grained 14-point
per-letter tracking checklist (Rey's actual physical rubber stamp) covering
the inner journey of a single exchange — postmark, PO pickup, sponsor
portal upload, sponsor writing/reminders, admin review, mail-out — a
different granularity than the 12-stage sponsee lifecycle above it, and
also not yet reconciled against `Letter.status`/`LetterStatusHistory`.

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
     **Added 30Aug2026 — a second, related notification use case for the
     same infrastructure, worth building together rather than twice:**
     automated sponsor notifications — "you have a new letter uploaded,"
     plus periodic check-in/engagement messages — aimed specifically at
     preventing sponsor churn, not just informing them. Motivation, per Rey
     directly: very few people volunteer for this kind of sponsoring in the
     first place (see the sponsor-scarcity reflection elsewhere in this
     session's history), so retention matters more here than raw throughput
     — losing an already-rare sponsor is a bigger loss than the time any
     admin-side automation saves Rey personally. Notably **safer than the
     earlier-considered email-to-prisoners idea**: this only touches the
     sponsor side, which was never part of the anonymized data flow to
     begin with (Rey already knows sponsors' real names/emails) — no new
     anonymity tradeoff, unlike routing prisoner correspondence through
     email. **SMS channel:** Rey is considering asking Intergroup (the
     regional 12-step governance body) to cover a **Telnyx** SMS account
     for this, separate from the Dreamhost email piece. Not started, not
     designed — this is a backlog note, not a build plan.
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
  below) since it had been set up for org-tenant-only auth. **See punch-list
  item 15 above for the standing-credential/broad-scope tradeoff this
  creates** — accepted deliberately, not an oversight, but read that before
  touching scope or token handling here.
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
