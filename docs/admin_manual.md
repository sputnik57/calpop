# Admin Manual - CalPOP Command Center

## Welcome
This guide is for CalPOP administrators ("Sisters") who manage the flow of mail between prisoners and sponsors. The system ("Command Center") allows you to digitize incoming mail, redact sensitive information, assign letters to sponsors, and process their responses for mailing.

## 1. Getting Started
### Logging In
1. Navigate to the Admin Portal URL (provided by IT).
2. Click **"Login with Microsoft"**.
3. Use your authorized CalPOP credentials.
4. Once logged in, you will land on the **Admin Dashboard**.

## 2. Incoming Mail Workflow (The "Intake" Loop)
When you receive physical mail from a prisoner:

### Step 1: Scanning & Upload (Intake)
1. Go to the **"Intake"** tab.
2. **Scan** the physical letter (and envelope) to PDF or Images.
3. Drag and drop the files into the **"Upload New Letter"** area.
4. The system will create a "Draft" letter record.

### Scan-confirm: choosing the Next Step (updated 25Oct2026)
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

## 3. Outgoing Mail Workflow (The "Response" Loop)
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

## 4. Envelope Printing
1. Go to the **"Envelopes"** tab.
2. Select the **Batch** of approved letters you are ready to mail.
3. Choose the **Environment** (Safe vs. Unsafe facility templates).
4. Click **"Generate PDFs"**.
5. Download the PDF bundle and print physically on envelopes.

## 5. User Management
*   **Add Sponsor**: Go to "Users" -> "Invite". Enter their email.
*   **Deactivate**: If a volunteer leaves, toggle their status to "Inactive". They will lose access immediately.

## 6. Audit & History
*   **Audit Logs**: View a timeline of who accessed which letter and when.
*   **Letter Archive**: Searchable history of all past correspondence.
