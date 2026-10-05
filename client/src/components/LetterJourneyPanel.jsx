import { useState, useEffect, useCallback } from 'react'
import {
    CheckCircle2, Circle, RefreshCw, Bell, Trash2, Mail,
    Eye, Upload, MapPin, ScanLine, Inbox, UserCheck, PenLine,
    ClipboardCheck, Printer, Send,
} from 'lucide-react'

// The backend always stores/serializes these as real UTC instants, but
// without a trailing "Z"/offset (e.g. "2026-09-29T20:41:14", not
// "...Z") -- new Date() on a timezone-less string parses it as *local*
// time per the JS spec, which silently mislabels a UTC clock reading as
// if it were already Pacific. Force it to be read as UTC by appending Z
// when there's no timezone marker already; only then does toLocaleString/
// getHours etc. correctly convert to the viewer's real local time.
function parseUTC(iso) {
    if (!iso) return null
    const hasTz = /Z$|[+-]\d\d:?\d\d$/.test(iso)
    return new Date(hasTz ? iso : iso + 'Z')
}

function fmt(iso) {
    if (!iso) return null
    return parseUTC(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
}

// For pre-filling a <input type="datetime-local"> from an ISO value --
// that input wants local time with no timezone/seconds, "YYYY-MM-DDTHH:mm".
function toLocalInputValue(iso) {
    if (!iso) return ''
    const d = parseUTC(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Date-only variants (added 04Oct2026) for the three fields that are
// genuinely calendar dates with no meaningful time-of-day (letter written,
// postmarked, PO pickup) -- matching the plain date pickers already used
// for these same fields on the scan-confirm screen (ScantronStation.jsx).
function fmtDate(iso) {
    if (!iso) return null
    return parseUTC(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function toLocalDateInputValue(iso) {
    if (!iso) return ''
    const d = parseUTC(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A bare <input type="date"> value has no time-of-day -- sending it as
// midnight UTC can shift it to the previous calendar day once converted
// back to local time for display. Anchoring at local noon avoids that in
// any real-world timezone (same fix as ScantronStation.jsx's
// dateInputToNoonISO, which this mirrors).
function dateInputToNoonISO(dateStr) {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

// One row for a touchpoint that's tracked automatically -- no user input,
// just a read-only fact (or "not yet") plus who/what sets it.
function AutoRow({ icon: Icon, label, sourceNote, value, extra }) {
    const done = !!value
    return (
        <div className="flex items-start gap-3 py-2.5">
            {done ? (
                <CheckCircle2 className="w-5 h-5 text-calpop-olive shrink-0 mt-0.5" />
            ) : (
                <Circle className="w-5 h-5 text-calpop-navy/30 shrink-0 mt-0.5" />
            )}
            <Icon className="w-4 h-4 text-calpop-navy/50 shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-calpop-ink">{label}</span>
                    <span className="text-xs font-mono text-calpop-navy/70 whitespace-nowrap">
                        {done ? fmt(value) : 'Not yet'}
                    </span>
                </div>
                <div className="text-[11px] text-calpop-navy/50">{sourceNote}</div>
                {extra}
            </div>
        </div>
    )
}

// One row for a manually-entered touchpoint -- Rey marks it done (now, or
// backdated) and can clear it if entered by mistake.
function ManualRow({ icon: Icon, label, sourceNote, value, onSet, onClear, saving }) {
    const done = !!value
    const [customDate, setCustomDate] = useState('')

    return (
        <div className="flex items-start gap-3 py-2.5">
            {done ? (
                <CheckCircle2 className="w-5 h-5 text-calpop-blue shrink-0 mt-0.5" />
            ) : (
                <Circle className="w-5 h-5 text-calpop-navy/30 shrink-0 mt-0.5" />
            )}
            <Icon className="w-4 h-4 text-calpop-navy/50 shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-calpop-ink">{label}</span>
                    {done && (
                        <span className="text-xs font-mono text-calpop-navy/70 whitespace-nowrap">{fmt(value)}</span>
                    )}
                </div>
                <div className="text-[11px] text-calpop-navy/50 mb-1">{sourceNote}</div>
                <div className="flex items-center gap-2 flex-wrap">
                    {done ? (
                        <button
                            disabled={saving}
                            onClick={onClear}
                            className="text-xs text-calpop-navy/60 hover:text-red-600 underline disabled:opacity-50"
                        >
                            Clear
                        </button>
                    ) : (
                        <>
                            <button
                                disabled={saving}
                                onClick={() => onSet(new Date().toISOString())}
                                className="text-xs px-2 py-1 bg-calpop-blue/10 text-calpop-blue rounded hover:bg-calpop-blue/20 disabled:opacity-50 font-medium"
                            >
                                Mark now
                            </button>
                            <input
                                type="datetime-local"
                                value={customDate}
                                onChange={e => setCustomDate(e.target.value)}
                                className="text-xs border border-calpop-navy/25 rounded px-1.5 py-1 text-calpop-ink"
                            />
                            <button
                                disabled={saving || !customDate}
                                onClick={() => { onSet(new Date(customDate).toISOString()); setCustomDate('') }}
                                className="text-xs px-2 py-1 bg-calpop-panel text-calpop-navy rounded hover:bg-calpop-navy/10 disabled:opacity-40"
                            >
                                Set date
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// Like ManualRow, but always shows an editable date field -- even once a
// value is set -- rather than hiding the input behind "Clear" first. Used
// for dates that can carry an initial best-effort guess (postmark's OCR
// guess) or simply need easy correction (letter's own written date), not
// just a one-shot "mark it done."
function EditableDateRow({ icon: Icon, label, sourceNote, value, onSet, onClear, saving }) {
    const done = !!value
    const [draft, setDraft] = useState(toLocalDateInputValue(value))

    useEffect(() => { setDraft(toLocalDateInputValue(value)) }, [value])

    return (
        <div className="flex items-start gap-3 py-2.5">
            {done ? (
                <CheckCircle2 className="w-5 h-5 text-calpop-blue shrink-0 mt-0.5" />
            ) : (
                <Circle className="w-5 h-5 text-calpop-navy/30 shrink-0 mt-0.5" />
            )}
            <Icon className="w-4 h-4 text-calpop-navy/50 shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-calpop-ink">{label}</span>
                    {done && (
                        <span className="text-xs font-mono text-calpop-navy/70 whitespace-nowrap">{fmtDate(value)}</span>
                    )}
                </div>
                <div className="text-[11px] text-calpop-navy/50 mb-1">{sourceNote}</div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        type="date"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        className="text-xs border border-calpop-navy/25 rounded px-1.5 py-1 text-calpop-ink"
                    />
                    <button
                        disabled={saving || !draft}
                        onClick={() => onSet(dateInputToNoonISO(draft))}
                        className="text-xs px-2 py-1 bg-calpop-blue/10 text-calpop-blue rounded hover:bg-calpop-blue/20 disabled:opacity-40 font-medium"
                    >
                        {done ? 'Correct date' : 'Set date'}
                    </button>
                    {done && (
                        <button
                            disabled={saving}
                            onClick={onClear}
                            className="text-xs text-calpop-navy/60 hover:text-red-600 underline disabled:opacity-50"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export function LetterJourneyPanel({ letterId }) {
    const [letter, setLetter] = useState(null)
    const [reminders, setReminders] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [checkingVisits, setCheckingVisits] = useState(false)
    const [reminderNote, setReminderNote] = useState('')

    const load = useCallback(() => {
        Promise.all([
            fetch(`/api/letters/${letterId}`).then(r => r.json()),
            fetch(`/api/letters/${letterId}/reminders`).then(r => r.json()),
        ]).then(([l, r]) => {
            setLetter(l)
            setReminders(r)
            setLoading(false)
        }).catch(err => { console.error(err); setLoading(false) })
    }, [letterId])

    useEffect(() => { load() }, [load])

    const dates = letter?.dates || {}

    const setJourneyField = async (field, value) => {
        setSaving(true)
        try {
            const res = await fetch(`/api/letters/${letterId}/journey`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            })
            if (!res.ok) throw new Error('Failed to save')
            const updated = await res.json()
            setLetter(updated)
        } catch (err) {
            alert('Error saving: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    const checkVisits = async () => {
        setCheckingVisits(true)
        try {
            const res = await fetch(`/api/letters/${letterId}/journey/check-visits`, { method: 'POST' })
            const result = await res.json()
            setLetter(prev => ({ ...prev, dates: { ...prev.dates, ...result } }))
        } catch (err) {
            alert('Error checking visits: ' + err.message)
        } finally {
            setCheckingVisits(false)
        }
    }

    const addReminder = async () => {
        try {
            const res = await fetch(`/api/letters/${letterId}/reminders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: reminderNote || null }),
            })
            if (!res.ok) throw new Error('Failed to add reminder')
            setReminderNote('')
            load()
        } catch (err) {
            alert('Error: ' + err.message)
        }
    }

    const deleteReminder = async (id) => {
        try {
            await fetch(`/api/letters/${letterId}/reminders/${id}`, { method: 'DELETE' })
            setReminders(prev => prev.filter(r => r.id !== id))
        } catch (err) {
            alert('Error: ' + err.message)
        }
    }

    if (loading) return <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm text-calpop-navy text-sm">Loading letter journey...</div>
    if (!letter) return null

    return (
        <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-calpop-navy/15 bg-calpop-panel">
                <h3 className="text-lg font-semibold text-calpop-ink">Letter Journey</h3>
                <p className="text-xs text-calpop-navy/60">
                    Every touchpoint from your paper checklist, in order. Blue = you enter it; green = the app tracks it automatically.
                </p>
            </div>

            <div className="px-6 divide-y divide-calpop-navy/10">
                <EditableDateRow
                    icon={PenLine}
                    label="Letter written"
                    sourceNote="Manual -- the date on the letter itself, not the envelope's postmark"
                    value={dates.letter_written_at}
                    onSet={(v) => setJourneyField('letter_written_at', v)}
                    onClear={() => setJourneyField('letter_written_at', null)}
                    saving={saving}
                />
                <EditableDateRow
                    icon={Mail}
                    label="Letter postmarked"
                    sourceNote="Auto -- best-effort OCR guess at scan, correctable here"
                    value={dates.postmarked_at}
                    onSet={(v) => setJourneyField('postmarked_at', v)}
                    onClear={() => setJourneyField('postmarked_at', null)}
                    saving={saving}
                />
                <EditableDateRow
                    icon={Inbox}
                    label="PO box pickup"
                    sourceNote="Manual -- entered at scan intake, correctable here"
                    value={dates.picked_up_at}
                    onSet={(v) => setJourneyField('picked_up_at', v)}
                    onClear={() => setJourneyField('picked_up_at', null)}
                    saving={saving}
                />
                <AutoRow icon={ScanLine} label="Envelope scanned" sourceNote="Auto -- set the moment the envelope is scanned" value={dates.scanned_at} />
                <AutoRow
                    icon={MapPin}
                    label="Address change"
                    sourceNote="Auto -- set at scan-confirm if an address correction was entered"
                    value={dates.address_change_confirmed ? dates.scanned_at : null}
                    extra={dates.address_change_confirmed === false
                        ? <div className="text-[11px] text-calpop-navy/40 mt-0.5">No change at last scan-confirm</div> : null}
                />
                <AutoRow icon={Upload} label="Uploaded to sponsor's portal" sourceNote="Auto -- set when this letter is filed to the sponsor's OneDrive" value={dates.uploaded_at} />

                <ManualRow
                    icon={UserCheck}
                    label="Informed sponsor"
                    sourceNote="Manual -- future: could move to automated text (Telnyx)"
                    value={dates.informed_sponsor_at}
                    onSet={(v) => setJourneyField('informed_sponsor_at', v)}
                    onClear={() => setJourneyField('informed_sponsor_at', null)}
                    saving={saving}
                />

                {/* Sponsor writing letter -- visit stats, on-demand check */}
                <div className="flex items-start gap-3 py-2.5">
                    <Eye className="w-5 h-5 text-calpop-navy/40 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-calpop-ink">Sponsor folder visits</span>
                            <button
                                onClick={checkVisits}
                                disabled={checkingVisits || !dates.sponsor_reply_item_id}
                                className="flex items-center gap-1 text-xs px-2 py-1 bg-calpop-blue/10 text-calpop-blue rounded hover:bg-calpop-blue/20 disabled:opacity-40 font-medium"
                                title={!dates.sponsor_reply_item_id ? "Not uploaded yet -- nothing to check" : "Query OneDrive for real visit stats"}
                            >
                                <RefreshCw className={`w-3 h-3 ${checkingVisits ? 'animate-spin' : ''}`} />
                                Check now
                            </button>
                        </div>
                        <div className="text-[11px] text-calpop-navy/50 mb-1">
                            Auto, on-demand -- real OneDrive traffic on this sponsor's unique link, but not real-time (can lag).
                        </div>
                        {dates.sponsor_visit_checked_at ? (
                            <div className="text-xs text-calpop-navy flex items-center gap-3">
                                <span className="font-mono">{dates.sponsor_visit_count ?? 0} visit{(dates.sponsor_visit_count ?? 0) === 1 ? '' : 's'}</span>
                                <span className="font-mono">{dates.sponsor_visit_actor_count ?? 0} visitor{(dates.sponsor_visit_actor_count ?? 0) === 1 ? '' : 's'}</span>
                                <span className="text-calpop-navy/50">as of {fmt(dates.sponsor_visit_checked_at)}</span>
                            </div>
                        ) : (
                            <div className="text-xs text-calpop-navy/40 italic">Not checked yet</div>
                        )}
                    </div>
                </div>

                {/* Reminders -- log, not a single field */}
                <div className="py-2.5">
                    <div className="flex items-center gap-3 mb-1">
                        <Bell className="w-5 h-5 text-calpop-navy/40 shrink-0" />
                        <span className="text-sm font-medium text-calpop-ink">Reminders sent to sponsor</span>
                    </div>
                    <div className="text-[11px] text-calpop-navy/50 mb-2 ml-8">Manual log -- future: could move to automated text (Telnyx)</div>
                    <div className="ml-8 space-y-1.5">
                        {reminders.map(r => (
                            <div key={r.id} className="flex items-center justify-between text-xs bg-calpop-panel rounded px-2 py-1.5">
                                <span className="text-calpop-ink">
                                    <span className="font-mono">{fmt(r.reminded_at)}</span>
                                    {r.note && <span className="text-calpop-navy/70"> -- {r.note}</span>}
                                </span>
                                <button onClick={() => deleteReminder(r.id)} className="text-calpop-navy/40 hover:text-red-600">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={reminderNote}
                                onChange={e => setReminderNote(e.target.value)}
                                placeholder="Optional note..."
                                className="flex-1 text-xs border border-calpop-navy/25 rounded px-2 py-1"
                            />
                            <button
                                onClick={addReminder}
                                className="text-xs px-2 py-1 bg-calpop-blue/10 text-calpop-blue rounded hover:bg-calpop-blue/20 font-medium whitespace-nowrap"
                            >
                                + Log reminder now
                            </button>
                        </div>
                    </div>
                </div>

                <ManualRow
                    icon={PenLine}
                    label="Sponsor finished letter"
                    sourceNote="Manual -- sponsor texts you when done; future: automated text (Telnyx)"
                    value={dates.sponsor_finished_at}
                    onSet={(v) => setJourneyField('sponsor_finished_at', v)}
                    onClear={() => setJourneyField('sponsor_finished_at', null)}
                    saving={saving}
                />
                <ManualRow
                    icon={ClipboardCheck}
                    label="Admin review"
                    sourceNote="Manual -- reviewed before printing"
                    value={dates.admin_reviewed_at}
                    onSet={(v) => setJourneyField('admin_reviewed_at', v)}
                    onClear={() => setJourneyField('admin_reviewed_at', null)}
                    saving={saving}
                />
                <ManualRow
                    icon={Printer}
                    label="Printed"
                    sourceNote="Manual -- not reliably auto-detectable, confirmed live 29Sep2026"
                    value={dates.printed_at}
                    onSet={(v) => setJourneyField('printed_at', v)}
                    onClear={() => setJourneyField('printed_at', null)}
                    saving={saving}
                />
                <ManualRow
                    icon={Send}
                    label="Mailed"
                    sourceNote="Manual"
                    value={dates.mailed_at}
                    onSet={(v) => setJourneyField('mailed_at', v)}
                    onClear={() => setJourneyField('mailed_at', null)}
                    saving={saving}
                />
            </div>
        </div>
    )
}
