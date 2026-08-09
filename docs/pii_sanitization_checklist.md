# PII / Secret Sanitization Checklist

Run this before: making the repo public, pushing after a session that touched
real data, handing this project to another user, or setting up a fresh clone
for someone else. It exists because this exact mistake has already happened
twice — real prisoner names and CDCR-style numbers ended up hardcoded as
"example" values in code comments, docstrings, and test fixtures, written by
someone who was looking at real data while coding and didn't notice they'd
copied it in as a placeholder. Static review missed it both times; only a
full-text grep across the actual file set caught it.

**A third version of the same mistake showed up 09/10Aug2026: fixing a leak
in the working tree isn't enough if the bad value is still sitting in an
earlier commit.** Two commits from earlier the same session had already been
pushed to the public repo with the real values still in them, even though
the *latest* commit was clean — every scan up to that point had only ever
checked the current file set, never the actual git history. Fixed via
`git-filter-repo` + a force-push (see Step 5). This is exactly the kind of
check worth doing once, deliberately, at the natural end of a session,
rather than after every single commit.

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

## Step 5: Check git history, not just the current tree — do this once, at the end

Steps 1-4 only ever look at what would be tracked *right now*. That's the
right cadence for most of a session, but it's not sufficient on its own —
something fixed forward in a later commit can still be sitting in an earlier
one, already pushed. This step is heavier (a history rewrite + force-push if
anything's found), so it belongs at the natural close of a session that
touched real data, not after every commit.

```bash
# Search the full history (all commits, not just HEAD) for known real values
git log --all -p 2>/dev/null | grep -E "REAL_NAME|REAL_CDCR_NUMBER|REAL_CPID|REAL_SECRET_VALUE"

# If something turns up, find exactly which commits introduced it
git log --all --oneline -S "REAL_VALUE" -- .
```

If it finds something, there's no way to remove a value from git history
without rewriting the commits that contain it — editing the current file
again does nothing, the old commit still exists. Real fix, in order of
preference:

1. **Surgical rewrite** (preserves all other commit messages/history):
   ```bash
   pip install --quiet git-filter-repo
   # replacements.txt: one `old==>new` mapping per line
   git filter-repo --replace-text replacements.txt --force
   git remote add origin <url>   # filter-repo strips the remote on purpose
   git push origin main --force
   ```
   Before force-pushing: back up the repo directory first (a plain `cp -r`
   is enough), and after pushing, verify from a **fresh clone** — not just
   trusting the push output — that the bad value is actually gone from
   every commit:
   ```bash
   git clone <url> /tmp/verify_clone && cd /tmp/verify_clone
   git log --all -p | grep -E "REAL_VALUE"   # should be empty
   ```
   Only delete the backup once that fresh-clone check comes back clean.
2. **Squash to one commit** — simpler and guaranteed-clean, but throws away
   per-commit history/messages. Worth it if there's a lot to redact or the
   history itself isn't valuable.
3. **Don't touch history, neutralize the value instead** — e.g. if a real
   CPID leaked, reassign that person a new one going forward so the exposed
   old code stops mapping to anything current. Leaves the old value visible
   in history, but makes it stale/useless rather than live.

A force-push to a shared/public repo is a hard-to-reverse action — confirm
with whoever owns the project before doing it, same as any other
destructive git operation, even when the fix itself is clearly right.

## Step 6: Local file hygiene (not about the repo, about this machine)

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
