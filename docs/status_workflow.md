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
- **91** — Silence for 60 days
- **92** — Sponsee dropped out of the program themselves
- **93** — Not in CDCR database / released / died? No contact

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
