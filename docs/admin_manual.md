# Admin Manual - CalPOP Command Center

> **NEEDS REVIEW (marked 25Oct2026):** Sections 1-6 below were written before the app's current screens and describe some that no longer exist (an "Intake" tab, "Run OCR", a "Redaction" tab, "Assign Sponsor", a "Review Queue", "Users > Invite"). Treat them as out of date until each is checked against the app. The sections marked **(current)**, "Scan-confirm: choosing the Next Step" and "7. Special Cases", match the app as of 25Oct2026.

## Welcome
This guide is for CalPOP administrators ("Sisters") who manage the flow of mail between prisoners and sponsors. The system ("Command Center") allows you to digitize incoming mail, redact sensitive information, assign letters to sponsors, and process their responses for mailing.

## 1. Getting Started  *(needs review)*
### Logging In
1. Navigate to the Admin Portal URL (provided by IT).
2. Click **"Login with Microsoft"**.
3. Use your authorized CalPOP credentials.
4. Once logged in, you will land on the **Admin Dashboard**.

## 2. Incoming Mail Workflow (The "Intake" Loop)  *(needs review: steps 1-4 describe screens that no longer exist; the scan-confirm subsection is current)*
When you receive physical mail from a prisoner:

### Step 1: Scanning & Upload (Intake)
1. Go to the **"Intake"** tab.
2. **Scan** the physical letter (and envelope) to PDF or Images.
3. Drag and drop the files into the **"Upload New Letter"** area.
4. The system will create a "Draft" letter record.

### Scan-confirm: choosing the Next Step (current, updated 25Oct2026)
After you confirm who the letter is from, **Next Step (pick one)** offers two choices. The first is always **Letter Writing Queue**. The second depends on that person:

| Situation | Second choice reads |
|---|---|
| Person identified, **has a sponsor** (including Rey G) | **Route to Sponsor (name)** |
| Person identified, **no sponsor** | **Waiting for a sponsor (backlog)** |
| **No person identified yet** (no CPID confirmed) | **Waiting for a sponsor (backlog)** |

- "No sponsor" means the sponsor field is blank, "?", "Course", or a drop/cancel marker such as "DROP" or "CANX".
- **Waiting for a sponsor (backlog)** holds the letter until someone is assigned. The person appears on **People > Sponsor Backlog**, grouped as organic requests (they wrote to us) or the original list. People marked **Needs attention** (active, Stage 10-12, but no sponsor) are listed first.
- Once you click **Matches** on the address, an **Exchange # for this letter** box shows the next number. Change it if the person was entered by hand from this same letter, so it isn't counted twice.
- The popup after confirming shows the **Letter #** (write it on the bottom right of the envelope) and the **Exchange #** (write it on the front of the envelope).

### Step 2: OCR & Identification
1. Open the newly uploaded letter.
2. In the **"OCR Workstation"**, click **"Run OCR"** to convert the handwriting/type to text.
3. **Prisoner Matching**: The system will attempt to read the CDCR number or Name.
   - If correct, confirm the match.
   - If incorrect, search the database and manually link the correct Prisoner.

### Step 3: Redaction (Safety Check)
*Critical Step: We must remove PII (Personal Identifiable Information) before a sponsor sees the letter.*
1. Go to the **"Redaction"** tab for the letter.
2. Use the highlighting tool to black out:
   - Real Names (Prisoner or Family)
   - Specific Addresses
   - Phone Numbers
   - Gang affiliations or sensitive casework details
3. Click **"Save Redacted Version"**.
4. The system calculates a "Safety Score". If approved, it is marked **Ready for Assignment**.

### Step 4: Assignment
1. Click **"Assign Sponsor"**.
2. Select a qualified Sponsor from the list.
3. Add a **Due Date** (usually 2 weeks).
4. Add any specific **Notes** (e.g., "This prisoner asks about college courses").
5. Confirm. The letter is now visible in that Sponsor's portal.

## 3. Outgoing Mail Workflow (The "Response" Loop)  *(needs review: the app has no "Review Queue"; replies are printed from Letter Mgt)*
When a sponsor submits a response:

### Step 1: Review
1. You will see a notification in the **"Review Queue"**.
2. Read the Sponsor's submitted response.
3. Check for policy violations (e.g., promises of money, sharing personal addresses).

### Step 2: Approval or Revision
*   **If Good**: Click **"Approve"**. The letter moves to the "Ready to Print" queue.
*   **If Issues**: Click **"Request Revisions"**.
    *   Add a comment explaining what needs to change.
    *   The Sponsor will be notified to edit and resubmit.

## 4. Envelope Printing  *(needs review: now Envelope Mgt > Print Envelopes, with Envelopes Only and Batch Letter + Envelopes)*
1. Go to the **"Envelopes"** tab.
2. Select the **Batch** of approved letters you are ready to mail.
3. Choose the **Environment** (Safe vs. Unsafe facility templates).
4. Click **"Generate PDFs"**.
5. Download the PDF bundle and print physically on envelopes.

## 5. User Management  *(needs review)*
*   **Add Sponsor**: Go to "Users" -> "Invite". Enter their email.
*   **Deactivate**: If a volunteer leaves, toggle their status to "Inactive". They will lose access immediately.

## 6. Audit & History  *(needs review)*
*   **Audit Logs**: View a timeline of who accessed which letter and when.
*   **Letter Archive**: Searchable history of all past correspondence.

## 7. Special Cases (current, added 25Oct2026)
Letters don't always follow the usual path. Here is what to do in the cases that have come up so far.

**A letter you're scanning was already answered.**
Scan it anyway and enter its dates in the letter's **Letter Journey**, even if they're earlier than the scan. That's expected.

**A follow-up letter ("I haven't heard from you") that your reply to an earlier letter already covered.**
Give it the same Sponsor finished, Printed and Mailed dates as the reply that covered it, and add a note to the person's record saying which letter's reply covered it.

**The Exchange # at scan-confirm looks one too high.**
If the person was entered by hand from this same letter, it was already counted. Change the **Exchange # for this letter** box before confirming. The screen warns you when this is likely.

**The person isn't in the system yet.**
Use **Add New Person**. If someone with the same CDCR # or name is already on file, nothing is added and the matches are shown. If it's the same person, use their existing CPID. If not, click **Different person -- add anyway**.

**No sponsor is available yet.**
Choose **Waiting for a sponsor (backlog)** at scan-confirm. Write and mail a waiting-list letter, then enter its Printed and Mailed dates. The letter is done once it's mailed; the person stays on **People > Sponsor Backlog** until you assign a sponsor.

**Someone is marked "Needs attention" on the backlog.**
They're active (Stage 10-12) but have no sponsor. Either assign a sponsor or correct their record (for example, mark a literature-only request as literature only).

**A sponsor leaves the program.**
For each of their sponsees: set the new sponsor on **People > Sponsees**, add a dated note, and move the sponsee's OneDrive folder to the new sponsor's folder (your own transferred sponsees go in "move to Rey").

**A sponsor writes their reply as a PDF.**
The Letter Journey's sponsor-saves count stays at 0 for them. Check the exchange folder in OneDrive for their new PDF instead.

**Sponsor saves include your own edits.**
If you edit a document through a sponsor's shared link, OneDrive records it the same way as the sponsor's edits, so it counts toward their saves.

**A letter was uploaded to the sponsor but still shows "Scanned".**
The upload wasn't recorded in the app. Ask for the record to be fixed; there's no screen for it yet.

**You need envelopes without a reply** (for your backlog stack, or mail that isn't a reply).
Use **Envelope Mgt > Print Envelopes > Envelopes Only**. Don't use **Batch Letter + Envelopes** for this: it creates a new letter for each person and double-books letters that already exist.

**You changed someone's address or housing on People after scanning.**
Nothing more to do. It's recorded as an address change on their latest letter that hasn't been mailed.

**You entered a mailing date ahead of time.**
The letter shows "Next: Mail on <date>" until that day, then moves to Done.

**A new sponsor is starting with new sponsees.**
Check their intro letter template before they use it. It must not contain your name; sign it "[NAME]" so the sponsor fills in their own.
