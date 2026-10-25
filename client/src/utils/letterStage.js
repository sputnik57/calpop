// Where a letter is in its physical journey, read from the Letter Journey
// dates (LetterDates). The stage is the latest touchpoint reached, checked
// from the end of the journey backward, so a later date wins even when an
// earlier one was never entered. Added 25Oct2026 so the Work Queue shows
// each letter's stage instead of a fixed "Assigned".

// Backend datetimes come without a timezone marker but are UTC.
function parseUTC(iso) {
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
}

export function shortDate(iso) {
    if (!iso) return null
    return parseUTC(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// In journey order. `waiting` is what the letter needs next. Picked-up
// letters sit on Rey's desk until scanned, and the pickup date is backdated
// at scan time, so "Picked up at PO" is rarely a letter's latest stage here.
export const STAGES = [
    { key: 'picked_up',  label: 'Picked up at PO',         waiting: 'Scan' },
    { key: 'scanned',    label: 'Scanned',                 waiting: 'Upload to sponsor' },
    { key: 'uploaded',   label: 'Uploaded to sponsor',     waiting: 'Inform sponsor' },
    { key: 'informed',   label: 'Sponsor informed',        waiting: 'Sponsor to write' },
    { key: 'written',    label: 'Sponsor finished',        waiting: 'Admin review' },
    { key: 'reviewed',   label: 'Admin reviewed',          waiting: 'Print' },
    { key: 'printed',    label: 'Printed',                 waiting: 'Mail' },
    { key: 'mailed',     label: 'Mailed',                  waiting: null },
]

// letter: a LetterOut (with .dates). submission: the assignment's
// active_submission, if any -- a response submitted in the app counts as
// the sponsor having finished, even before the journey date is entered.
export function getLetterStage(letter, submission) {
    const d = letter?.dates || {}
    const finished = d.sponsor_finished_at || d.response_submitted_at
        || (['submitted', 'approved'].includes(submission?.status) ? submission.updated_at : null)
    const reached = [
        ['mailed', d.mailed_at],
        ['printed', d.printed_at],
        ['reviewed', d.admin_reviewed_at || d.approved_at],
        ['written', finished],
        ['informed', d.informed_sponsor_at],
        ['uploaded', d.uploaded_at],
        ['scanned', d.scanned_at],
        ['picked_up', d.picked_up_at],
    ].find(([, date]) => date)

    // No journey date at all: a letter started in the app with no incoming
    // letter behind it (Start New Letter). It's waiting on someone to write,
    // the same point in the journey as "Sponsor informed".
    if (!reached) {
        const index = STAGES.findIndex(s => s.key === 'informed')
        return { key: 'to_write', label: 'Waiting to be written', waiting: 'Rey or sponsor to write', index, date: letter?.created_at, done: false }
    }
    const [key, date] = reached
    const index = STAGES.findIndex(s => s.key === key)
    return { ...STAGES[index], index, date, done: key === 'mailed' }
}
