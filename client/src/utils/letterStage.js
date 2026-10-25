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

// Letters held for a sponsor (status waiting_for_sponsor) skip every sponsor
// step: Rey answers with a waiting-list letter, and the letter is done once
// that's mailed. The person stays in the sponsor backlog. Added 25Oct2026.
export const BACKLOG_STAGES = [
    { key: 'picked_up',  label: 'Picked up at PO',          waiting: 'Scan' },
    { key: 'scanned',    label: 'Scanned, no sponsor yet',  waiting: 'Write and print a waiting-list letter' },
    { key: 'printed',    label: 'Waiting-list letter printed', waiting: 'Mail' },
    { key: 'mailed',     label: 'Waiting-list letter mailed',  waiting: null },
]

// A date later than today is planned, not reached: Rey enters a mailing
// date ahead of time, and the letter shouldn't count as mailed until then.
function happened(iso) {
    if (!iso) return false
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    return parseUTC(iso) <= endOfToday
}

function plannedMail(d) {
    return d.mailed_at && !happened(d.mailed_at) ? `Mail on ${shortDate(d.mailed_at)}` : null
}

function backlogStage(letter, d) {
    const reached = [
        ['mailed', d.mailed_at],
        ['printed', d.printed_at],
        ['scanned', d.scanned_at],
        ['picked_up', d.picked_up_at],
    ].find(([, date]) => happened(date))
    const [key, date] = reached || ['scanned', letter?.created_at]
    const index = BACKLOG_STAGES.findIndex(s => s.key === key)
    const stage = BACKLOG_STAGES[index]
    return { ...stage, waiting: plannedMail(d) || stage.waiting, index, date, done: key === 'mailed', stages: BACKLOG_STAGES }
}

// letter: a LetterOut (with .dates). submission: the assignment's
// active_submission, if any -- a response submitted in the app counts as
// the sponsor having finished, even before the journey date is entered.
// The result's `stages` is the track to draw the progress bar from.
export function getLetterStage(letter, submission) {
    const d = letter?.dates || {}
    if (letter?.status === 'waiting_for_sponsor') return backlogStage(letter, d)

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
    ].find(([, date]) => happened(date))

    // No journey date at all, but a scan on file: a letter added before
    // journey dates were tracked (29Sep2026). Scanned, as of when it was added.
    if (!reached && (letter?.original_file_path || letter?.redacted_file_ref)) {
        const index = STAGES.findIndex(s => s.key === 'scanned')
        return { ...STAGES[index], index, date: letter.created_at, done: false, stages: STAGES }
    }
    // No journey date and no scan: a letter started in the app with no
    // incoming letter behind it (Start New Letter). It's waiting on someone
    // to write, the same point in the journey as "Sponsor informed".
    if (!reached) {
        const index = STAGES.findIndex(s => s.key === 'informed')
        return { key: 'to_write', label: 'Waiting to be written', waiting: 'Rey or sponsor to write', index, date: letter?.created_at, done: false, stages: STAGES }
    }
    const [key, date] = reached
    const index = STAGES.findIndex(s => s.key === key)
    return { ...STAGES[index], waiting: plannedMail(d) || STAGES[index].waiting, index, date, done: key === 'mailed', stages: STAGES }
}
