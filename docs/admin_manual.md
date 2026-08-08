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
