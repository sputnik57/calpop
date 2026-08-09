# PII / Secret Sanitization Checklist

Run this before: making the repo public, pushing after a session that touched
real data, handing this project to another user, or setting up a fresh clone
for someone else. It exists because this exact mistake has already happened
twice — real prisoner names and CDCR-style numbers ended up hardcoded as
"example" values in code comments, docstrings, and test fixtures, written by
someone who was looking at real data while coding and didn't notice they'd
copied it in as a placeholder. Static review missed it both times; only a
full-text grep across the actual file set caught it.

## Before touching anything: confirm `.gitignore` is doing its job

```bash
grep -E "^\.env$|^secrets/|^data/|\*\.db$" .gitignore
```

Confirm `.env`, `secrets/`, `data/`, and `*.db` are all covered. If this repo
doesn't have a `.gitignore` yet, write one before running anything else below
— there's no point sanitizing tracked files if the untracked ones aren't
actually excluded.

## Step 1: See exactly what would be tracked

Never trust "I didn't touch that file" — check the real, current file set:

```bash
git add -A -n | grep "^add" | sed "s/^add '//;s/'$//" > /tmp/tracked_files.txt
wc -l /tmp/tracked_files.txt
```

Skim the list. Anything that looks like a one-off debug/inspection script at
the repo root (`inspect_*.py`, `check_*.py`, `debug_*.py`) is worth opening —
these are exactly the files most likely to have a hardcoded real search
target left in them from whoever was debugging with real data at the time.

## Step 2: Full-text scan for known real values

Grep every file in `/tmp/tracked_files.txt` for anything you know is real:
names, CDCR numbers, CPIDs, addresses, phone numbers, emails, API keys,
tokens, passwords. Build the pattern from whatever's come up in the current
session or was visible in any test data used:

```bash
while IFS= read -r f; do
  grep -lE "REAL_NAME|REAL_CDCR_NUMBER|REAL_CPID|REAL_SECRET_VALUE" "$f" 2>/dev/null
done < /tmp/tracked_files.txt
```

**Don't just check names.** IDs, CPIDs, and other bare identifiers are easy
to miss because they don't "look like" PII the way a full name does — but a
CPID or CDCR number is a unique identifier tied to one specific real person,
and it's exactly what tends to get reused as a convenient "realistic-looking"
example value. If a real CPID has ever been mentioned in a conversation,
grep for it explicitly, not just for names.

## Step 3: Check the usual hiding spots specifically

- **Docstrings and inline comments** — `# e.g. <value>` is the single most
  common place a real value ends up as a permanent "example." Both leaks
  found so far were exactly this pattern.
- **Test fixtures** (`conftest.py`, `test_*.py`) — hardcoded IDs in fixture
  setup are easy to miss since they read as "just test data," but if the
  value happens to be a real one, it isn't.
- **Placeholder text in frontend forms** (`placeholder="e.g. ..."`) — same
  failure mode as docstrings, just in JSX instead of Python.
- **`.docx`/binary files** — these don't show up in a normal text grep.
  Extract and search their text content explicitly:
  ```bash
  python3 -c "
  import zipfile, re
  with zipfile.ZipFile('FILE.docx') as z:
      xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
  text = re.sub('<[^>]+>', ' ', xml)
  print(text)
  " | grep -iE "REAL_NAME|REAL_ID"
  ```
- **Dump/log/output files** (`*.txt` files that look like captured stdout,
  `vault_audit.txt`-style files) — these are often literally a paste of a
  real debugging session.

## Step 4: Fix, then re-scan the *exact same* file set

After editing, re-run Step 1 and Step 2 again from scratch. Don't assume the
fix worked — confirm it, the same way you'd verify any other change. A fix
that "looks right" in the diff but wasn't re-scanned is not a verified fix.

## Step 5: Local file hygiene (not about the repo, about this machine)

- `chmod 600` on `.env` and any credential files in `secrets/` — not
  committed either way, but no reason to leave them world-readable.
- If a service-account key or similar credential has been sitting readable
  for a long time, consider whether it's worth rotating via the provider's
  console — locking down file permissions doesn't un-expose a value that may
  already have been readable for months.

## What's fine to leave in, so this doesn't become paranoid busywork

- The organization's own real mailing address (e.g. the return address
  printed on outgoing mail) — that's already public by design, it's how
  people know where to send mail *to* the program.
- Fully synthetic/generated test data (randomly generated names, IDs) —
  the point is real data tied to a real person, not test data in general.
- Generic example values that were deliberately made up (`X99999`,
  `ABC123`) rather than copied from something real.
