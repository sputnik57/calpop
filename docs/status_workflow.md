# CalPOP Status Code Workflow

The real, authoritative process a prisoner's letter moves through, from first
contact to ongoing dialogue. Captured directly from the project owner
(09/10Aug2026) — this is the actual operational process, not an approximation.
**`Letter.status` in `db/models.py` (`intake, scanned, redacted, reviewed,
assigned, response_started, sponsor_submitted, revisions_requested, approved,
archived`) is a rough, incomplete stand-in for this real workflow and needs
reconciling against it, not the other way around.**

When CalPOP receives a prisoner's letter, the sponsee is assigned an
encrypted number (CPID). As their letter is responded to, it moves through
the status codes below.

## Main sequence

**1 — ISO or CalPOP RECEIVED** — original/first prisoner letter (PO Box, ISO, or other channel)
- a. If vetted by ISO: ingest contact information, anonymize (the commitment letter itself isn't needed) → move to 2

**2 — REVIEW for response** *[Rey]*
- a. Statistical tabulation
- b. Help criteria: liberal interpretation of Tradition 3; vague ask; pamphlet questions. If we can help, ingest into database, anonymize.
- c. If a returning sponsee → forward to 8; scan the letter, covering (redacting) Personal ID Info
- d. If it's simply an address → send commitment letter

**3 — RESPONDED to prisoner** *[Rey]*
- a. Send commitment letter and pamphlet(s)
- b. Or: letter stating there's a backlog to assign sponsors (the "wait letter")
- c. Or: cannot help — outside Tradition scope or outside program scope

**4 — Send ISO literature request** (if independent of a sponsor request) *[Harvey]*

**5 — CONTract letter RECeived back from prisoner** *[prisoner]*
- a. Scan the accompanying letter (if any), covering PII. **Do not scan the basic commitment letter itself** — it carries too much Personal ID Info.

**6 — CONTract letter REViewed** *[Rey, Juan]*
- a. Forward to a specialized track (e.g. LGBT, Spanish, previously incarcerated)
- b. Forward to an individual sponsor
- c. Curriculum track (first-time): orientation, lesson plan
- d. Send ISO literature request (Green Book)
- e. If time has lapsed: check the [CDCR Inmate Locator](https://inmatelocator.cdcr.ca.gov/)

**7 — SPONsor ASsigned** — where the letter goes, based on availability:
- a. Individual sponsor
- b. Group sponsor, with a point of contact
- c. `"Course"` — the project owner's own curriculum track, handled directly (no external sponsor). **This is the sentinel value used in the roster's `Sponsor` column when Rey is handling a sponsee personally rather than a real named volunteer.**

**8 — Forwarded to Sponsor or Course** — the latest letter
- **8S — SPONSor–sponsee EXchange, using the SCISAA address** *[Sponsor]*
  - a. De-anonymize the name on the letter (this is the one point in the process where a real external sponsor is deliberately shown the real name — everywhere upstream of this, it stays anonymized)
  - b. Via a digital portal (cyber-secure, online word processor, monitored workflow) — this is the OneDrive-based sponsor interface described elsewhere in this doc/`implementation_plan.md`
  - c. Independent response: sponsor sends a photo of their response, automated follow-up email
  - d. Add to knowledge base
- **8C — CLASS curriculum sponsor-evaluators** (after curriculum is developed) *[Juan]*
  - a. Meet in person or on Zoom to respond to the letter
  - b. De-anonymize name on letter
  - c. Add to knowledge base

**9 — Returned from Sponsor or Course**
- a. De-anonymize name on letter

**10 — PROCESS first letter**
- a. Returned from sponsor or course
- b. Print, envelope, stamp

**11 — MAILED first letter**
- a. Resent letter after no response

**12 — DIALOGUE**, ongoing letter exchange with the sponsee (steady state)

## Terminal / exception codes

- **90** — Literature request only, doesn't ask for a sponsor
- **91** — No response, silence for at least 60 days
- **92** — Sponsee dropped out of the program themselves
- **93** — Not in CDCR database / released / died? No contact
- **94** — Tradition 3 prevents service — does not identify as an addict *(added 31Aug2026)*
- **95** — Other, (e.g., admin) *(added 31Aug2026)*

**Added 31Aug2026, surfaced by a real Excel upload, worked through live with
Rey:** 17 real contacts (rows 93–119 of that file) had a blank CPID cell —
4 already correctly coded Stage 90, 13 coded Stage 91 ("Sent pledge letter;
no response?"). The app just didn't know a terminal-stage blank CPID was
expected rather than an error (see the `_extract_prisoner_row` NaN-handling
fix the same day, `implementation_plan.md`). 94 and 95 above were added
partly to give this a home, but the final answer, after going back and
forth on the 13 Stage-91 rows specifically, turned out simpler than
expected: **CPID presence isn't the meaningful signal at all — Stage is.**
Rey's words: "CPIDs are not sacred, but the category has more meaning."
Stage 91 does NOT require a prior CPID (a contact can go silent before ever
being formally taken on, not only after) — the 13 stayed Stage 91, blank
CPID and all, no reclassification needed. **The actual rule going forward:
a blank-CPID row with any recognized Stage value (1–95) is understood and
categorized, not an error; only a blank CPID *and* a blank/unrecognized
Stage is genuinely ambiguous and worth flagging.** Kept in sync with
`STAGE_LEGEND` in `client/src/pages/PrisonersPage.jsx` (the Stage-column
tooltip legend, also added 31Aug2026) — update both together if this list
ever changes again.

## Per-letter tracking checklist (Rey's physical rubber stamp, added 30Aug2026)

A finer grain than the main sequence above — this tracks a single letter's
own journey once it's already an ongoing exchange (roughly the inside detail
of steps 8 through 11: forwarded to sponsor, through mailed response), not
the sponsee's overall lifecycle. Rey stamps each physical letter with this
checklist today; not yet represented anywhere in the app's schema.

1. Letter written *(by the sponsee, the incoming letter)*
2. Letter postmarked
3. PO pickup
4. No. of correspondence *(the exchange count — `Prisoner.letter_exchange_count` in the current schema)*
5. Scanned envelope
6. Address change y/n
7. Upload to sponsor portal *(the OneDrive upload built 22/30Aug2026 — `LetterService.upload_redacted_to_sponsor_onedrive`)*
8. Informed sponsor *(today: a manual text message — no in-app notification exists for this yet)*
9. Sponsor writing letter
10. Date(s) reminded sponsor
11. Sponsor finishes letter
12. Admin review/edit final response
13. Printed response
14. Mailed response

**Not yet reconciled against `LetterStatusHistory`** (built 22Aug2026, one
append-only row per status change) or `Letter.status` itself — both are
coarser than this 14-point checklist. Whether this becomes the actual
`Letter.status` values, a separate finer-grained tracking table, or stays a
physical-only process is an open design question, not decided here.

**Added 30Aug2026 — display convention to carry over when this is built:**
any date shown for these checkpoints should use the same `30-Aug-2026`
format established the same day in DB Mgt (`PrisonersPage.jsx`'s
`formatDateDisplay` helper and the Update Person form's raw-value
stripping) — not a raw timestamp, and not the pandas-style
`2022-03-25 00:00:00` string Excel dates arrive in.

**Added 30Aug2026 — a new signal Rey wants, sitting between items 8 and 9:**
a datetime stamp for when the sponsor actually *opens* their OneDrive
portal, distinct from "Sponsor finishes letter" (item 11, currently signaled
by the sponsor texting Rey manually when done). Investigation into how this
would even be possible was started and explicitly paused (Rey: "don't do it
now") — worth recording what's already known so it doesn't get re-derived
from scratch later:
- The account is a **personal** Microsoft account, not OneDrive for
  Business/M365 — Graph API's item-view/activity analytics
  (`/items/{id}/analytics/...`) has historically been far more limited or
  simply unavailable for personal accounts versus business ones. Whether
  it's available here at all is **unconfirmed** — a live test against a
  real folder was attempted and interrupted before getting a result, not
  because it failed.
- **A more universally reliable alternative, not yet evaluated in detail:**
  a CalPOP-generated short redirect link (e.g. sent via the not-yet-built
  sponsor-notification text/email, see the Telnyx/Dreamhost backlog item
  above) that logs a timestamp server-side before forwarding the sponsor
  into the real OneDrive folder. Doesn't depend on any Microsoft
  analytics capability, but only captures opens that go through a link
  CalPOP itself issued — a sponsor who already has the folder bookmarked
  or synced locally could open it without ever hitting that link.
- Not started, not designed, no code written. Natural pairing with the
  sponsor-notification backlog item — if that gets built first, this
  timestamp is a byproduct of the tracking link it would need.

## Open reconciliation work (not done yet)

This full status model is not yet reflected in the app's schema. Current
`Letter.status` enum is a rough 10-value approximation built before this
process was documented in detail. Reconciling the two is real design work,
deliberately deferred rather than done as part of the Envelope Mgt build —
see `implementation_plan.md` for current scope/sequencing.

Also worth designing explicitly, not assumed: the redact/de-anonymize cycle
described above is **reversible by design** — a letter gets anonymized on
intake, then deliberately de-anonymized at specific controlled points (8S,
8C, 9) when a sponsor or evaluator legitimately needs the real name, then
presumably re-anonymized again for storage/knowledge-base purposes. That's a
different, more careful mechanism than a one-way redaction tool.
