import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, Search, Mail, ExternalLink, Pencil, ArrowLeft, Loader2, Upload, Columns, ChevronUp, ChevronDown, ChevronsUpDown, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import ExcelUploader from '../components/ExcelUploader'

// Mirrors docs/status_workflow.md's "Main sequence" and "Terminal / exception
// codes" -- kept here as a quick-reference legend since Stage is just a bare
// number in the roster with no explanation next to it otherwise. Update this
// alongside that doc if the taxonomy ever changes again.
const STAGE_LEGEND = [
    { code: '1', label: 'ISO or CalPOP Received' },
    { code: '2', label: 'Review for response' },
    { code: '3', label: 'Responded to prisoner' },
    { code: '4', label: 'Send ISO literature request' },
    { code: '5', label: 'Contract letter received back' },
    { code: '6', label: 'Contract letter reviewed' },
    { code: '7', label: 'Sponsor assigned' },
    { code: '8', label: 'Forwarded to sponsor or course' },
    { code: '9', label: 'Returned from sponsor or course' },
    { code: '10', label: 'Process first letter' },
    { code: '11', label: 'Mailed first letter' },
    { code: '12', label: 'Dialogue (active, ongoing exchange)' },
    { code: '90', label: "Literature request only, doesn't ask for sponsor" },
    { code: '91', label: 'No response, silence for at least 60 days' },
    { code: '92', label: 'Sponsee dropped out of program themselves' },
    { code: '93', label: 'Not in CDCR database / released / died? No contact' },
    { code: '94', label: 'Tradition 3 prevents service — does not identify as addict' },
    { code: '95', label: 'Other, (e.g., admin)' },
]

// Date fields (date_of_contract, date_sponsor_assigned, bph_date) are plain
// Text/EncryptedString columns holding whatever Excel handed over -- usually
// a pandas-style "2022-03-25 00:00:00" string (see the diff preview in
// ExcelUploader). Displayed as "30-Aug-2026" instead. Falls back to the raw
// value for anything that doesn't parse as a real date (blank, free text)
// rather than showing "Invalid Date".
function formatDateDisplay(value) {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    const day = String(d.getDate()).padStart(2, '0')
    const month = d.toLocaleString('en-US', { month: 'short' })
    return `${day}-${month}-${d.getFullYear()}`
}

// Table columns beyond CPID (pinned first, always visible -- see below --
// kept there deliberately for easy row identification, unlike everything
// else here) and Actions (an app-only trailing column, not in the sheet at
// all). Ordered to match the real roster's actual column sequence in
// active_map.xlsx (Intake#, Stage, fName, lName, Unsafe?, CDCRno, housing,
// address, city, state, zip, Prison, CDCR db verif, contract, Date of
// contract, Needs Green book?, language, Review notes, Sponsor, Date
// Sponsor assigned, CPID, letter exchange, Step, BPH DATE) so enabling
// several columns lines up with what Rey already expects from the
// spreadsheet, not an arbitrary order. `locked: true` columns (First/Last
// Name, same reasoning as CPID) are always shown and excluded from the
// Columns picker's checkboxes since they can't be hidden; everything else
// is optional and user-toggleable.
const ALL_COLUMNS = [
    { key: 'intake_number', label: 'Intake #', render: p => p.intake_number ?? '—' },
    { key: 'stage', label: 'Stage', render: p => p.stage ?? '—' },
    { key: 'first_name', label: 'First Name', locked: true, render: p => p.first_name || '—' },
    { key: 'last_name', label: 'Last Name', locked: true, render: p => p.last_name || '—' },
    {
        key: 'safety_classification', label: 'Safety', render: p => (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                p.safety_classification === 'safe'
                    ? 'bg-calpop-olive/10 text-calpop-olive border-calpop-olive/25'
                    : 'bg-calpop-accent/10 text-calpop-accent border-calpop-accent/25'
            }`}>
                {p.safety_classification === 'safe' ? 'Safe' : 'Unsafe'}
            </span>
        ),
    },
    { key: 'cdcr_number', label: 'CDCR #', render: p => p.cdcr_number || '—' },
    { key: 'housing', label: 'Housing', render: p => p.housing || '—' },
    { key: 'address', label: 'Address', render: p => p.address || '—' },
    { key: 'city', label: 'City', render: p => p.city || '—' },
    { key: 'state', label: 'State', render: p => p.state || '—' },
    { key: 'zip', label: 'Zip', render: p => p.zip || '—' },
    { key: 'facility', label: 'Facility', render: p => p.facility || '—' },
    { key: 'cdcr_db_verified', label: 'CDCR DB Verified', render: p => p.cdcr_db_verified || '—' },
    { key: 'contract_status', label: 'Contract', render: p => p.contract_status || '—' },
    { key: 'date_of_contract', label: 'Date of Contract', render: p => formatDateDisplay(p.date_of_contract) || '—' },
    { key: 'needs_green_book', label: 'Needs Green Book?', render: p => p.needs_green_book || '—' },
    { key: 'language', label: 'Language', render: p => p.language || '—' },
    { key: 'review_notes', label: 'Review Notes', render: p => p.review_notes || '—' },
    { key: 'sponsor_name', label: 'Sponsor', render: p => p.sponsor_name || '—' },
    { key: 'date_sponsor_assigned', label: 'Date Sponsor Assigned', render: p => formatDateDisplay(p.date_sponsor_assigned) || '—' },
    { key: 'letter_exchange_count', label: 'Letter Exchange Count', render: p => p.letter_exchange_count ?? '—' },
    { key: 'step_received_count', label: 'Step Received Count', render: p => p.step_received_count ?? '—' },
    { key: 'bph_date', label: 'BPH Date', render: p => formatDateDisplay(p.bph_date) || '—' },
    // Not in the Excel roster at all -- app-only/computed fields, kept at the end.
    { key: 'letters_received_count', label: 'Letters (in app)', render: p => p.letters_received_count ?? 0 },
    { key: 'literature_only', label: 'Literature Only', render: p => p.literature_only ? 'Yes' : 'No' },
]

const DEFAULT_VISIBLE_COLUMNS = ['sponsor_name', 'facility', 'housing', 'safety_classification', 'stage', 'letters_received_count']
const COLUMNS_STORAGE_KEY = 'calpop_prisoners_visible_columns'

function loadVisibleColumns() {
    try {
        const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
        if (!raw) return DEFAULT_VISIBLE_COLUMNS
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : DEFAULT_VISIBLE_COLUMNS
    } catch {
        return DEFAULT_VISIBLE_COLUMNS
    }
}

const EDITABLE_FIELDS = [
    ['first_name', 'First Name'],
    ['last_name', 'Last Name'],
    ['cdcr_number', 'CDCR #'],
    ['facility', 'Facility'],
    ['housing', 'Housing'],
    ['address', 'Address'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip', 'Zip'],
    ['safety_classification', 'Safety Classification'],
    ['sponsor_name', 'Sponsor'],
    ['stage', 'Stage'],
    ['cdcr_db_verified', 'CDCR DB Verified'],
    ['contract_status', 'Contract'],
    ['date_of_contract', 'Date of Contract'],
    ['needs_green_book', 'Needs Green Book?'],
    ['language', 'Language'],
    ['review_notes', 'Review Notes'],
    ['date_sponsor_assigned', 'Date Sponsor Assigned'],
    ['letter_exchange_count', 'Letter Exchange Count'],
    ['step_received_count', 'Step Received Count'],
    ['bph_date', 'BPH Date'],
]

// Date-ish fields come from Excel as pandas-style "2022-03-25 00:00:00"
// strings -- the time portion is never meaningful for these (date-only
// facts), so it's dropped when the edit form loads. Saving without editing
// these fields also normalizes the stored value going forward, which is a
// harmless side effect, not silent data loss.
const DATE_FIELDS = new Set(['date_of_contract', 'date_sponsor_assigned', 'bph_date'])

function UpdatePersonPanel({ prisoner, onDone }) {
    const [form, setForm] = useState(() =>
        Object.fromEntries(EDITABLE_FIELDS.map(([key]) => {
            // Numeric fields (stage, letter_exchange_count, step_received_count)
            // come back from GET /api/prisoners as real JSON numbers, not
            // strings -- `raw || ''` doesn't stringify those, so an untouched
            // numeric field stayed a raw number in form state and got PATCHed
            // back as JSON int, which the backend's Optional[str] schema
            // rejects outright with a 422 before any of the endpoint's own
            // coercion logic runs. String(...) here guarantees every field is
            // actually a string, matching what the backend always expects.
            const raw = prisoner[key]
            const str = raw == null ? '' : String(raw)
            return [key, DATE_FIELDS.has(key) ? str.split(' ')[0] : str]
        }))
    )
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState(null)

    const setField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const handleSave = async () => {
        setSaving(true)
        setResult(null)
        try {
            const res = await fetch(`/api/prisoners/${prisoner.cpid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(form),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                // FastAPI's own validation errors (422, before this endpoint's
                // code even runs) put an array of {loc, msg, ...} objects in
                // `detail`, not a string -- rendering that directly produced
                // "[object Object]". Format it into something readable instead.
                let message = `Save failed (${res.status})`
                if (typeof data.detail === 'string') {
                    message = data.detail
                } else if (Array.isArray(data.detail)) {
                    message = data.detail.map(e => `${(e.loc || []).slice(-1)[0] || 'field'}: ${e.msg}`).join('; ')
                }
                throw new Error(message)
            }
            setResult({ ok: true, message: 'Saved.' })
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSaving(false)
        }
    }

    const inputClass = "w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
    const labelClass = "text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2"

    return (
        <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm max-w-2xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="font-bold text-calpop-ink">{prisoner.first_name} {prisoner.last_name}</h3>
                    <span className="text-xs font-mono text-calpop-blue">{prisoner.cpid}</span>
                </div>
                <button onClick={onDone} className="flex items-center gap-2 text-sm text-calpop-navy hover:text-calpop-ink">
                    <ArrowLeft className="w-4 h-4" /> Back to Search / Review
                </button>
            </div>

            {result && (
                <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
                {EDITABLE_FIELDS.map(([field, label]) => (
                    <div key={field} className={field === 'review_notes' ? 'col-span-2' : undefined}>
                        <label className={labelClass}>{label}</label>
                        {field === 'review_notes' ? (
                            <textarea
                                className={`${inputClass} min-h-[6rem] resize-y`}
                                value={form[field]}
                                onChange={setField(field)}
                            />
                        ) : (
                            <input className={inputClass} value={form[field]} onChange={setField(field)} />
                        )}
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${saving ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
                >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={onDone} className="flex items-center gap-2 text-sm text-calpop-navy hover:text-calpop-ink">
                    <ArrowLeft className="w-4 h-4" /> Back to Search / Review
                </button>
            </div>

            {/* Duplicated below the button too -- with a long form, the top
                banner scrolls out of view before Save is even clicked, so the
                immediate result of clicking it wasn't visible without
                scrolling back up. */}
            {result && (
                <div className={`mt-4 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}
        </div>
    )
}

export function PrisonersPage() {
    const [prisoners, setPrisoners] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState(null)
    const [editing, setEditing] = useState(null) // the prisoner object being edited, or null
    const [showUpload, setShowUpload] = useState(false)
    const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns)
    const [showColumnPicker, setShowColumnPicker] = useState(false)
    const columnPickerRef = useRef(null)
    const [showStageLegend, setShowStageLegend] = useState(false)
    const stageLegendRef = useRef(null)

    useEffect(() => {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns))
    }, [visibleColumns])

    useEffect(() => {
        if (!showColumnPicker && !showStageLegend) return
        const onClickOutside = (e) => {
            if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) {
                setShowColumnPicker(false)
            }
            if (stageLegendRef.current && !stageLegendRef.current.contains(e.target)) {
                setShowStageLegend(false)
            }
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [showColumnPicker, showStageLegend])

    const toggleColumn = (key) => {
        setVisibleColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    }

    const [sortKey, setSortKey] = useState(null) // null = insertion order (CPID, as returned by the API)
    const [sortDir, setSortDir] = useState('asc')

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('asc')
        }
    }

    // Sorts on the raw underlying value, not rendered JSX (safety_classification
    // renders a badge, but still sorts on the plain string).
    const getSortValue = (p, key) => {
        const v = p[key]
        if (v == null) return null
        return typeof v === 'string' ? v.toLowerCase() : v
    }

    // Was fetching /api/excel/status and reading `recent_records`, a field
    // that never existed in that endpoint's response -- this list silently
    // rendered empty. /api/prisoners is the real listing endpoint, reading
    // the full (decrypted) Postgres roster. Pulled into its own function so
    // it can also re-run after an Excel upload is applied, not just on mount.
    const loadPrisoners = useCallback(() => {
        setLoading(true)
        fetch('/api/prisoners', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load prisoners (${res.status})`)
                return res.json()
            })
            .then(data => {
                setPrisoners(data || [])
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

    useEffect(() => { loadPrisoners() }, [loadPrisoners])

    const filtered = prisoners.filter(p =>
        p.cpid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const sorted = sortKey ? [...filtered].sort((a, b) => {
        const av = getSortValue(a, sortKey)
        const bv = getSortValue(b, sortKey)
        if (av == null && bv == null) return 0
        if (av == null) return 1 // blanks sort last regardless of direction
        if (bv == null) return -1
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
    }) : filtered

    const SortIcon = ({ colKey }) => {
        if (sortKey !== colKey) return <ChevronsUpDown className="w-3 h-3 text-calpop-navy/30" />
        return sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-current" />
            : <ChevronDown className="w-3 h-3 text-current" />
    }

    if (loading) return <div className="p-12 text-center text-calpop-navy font-mono animate-pulse">Consulting Perimeter Records...</div>

    if (editing) {
        return (
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3">
                    <Pencil className="w-7 h-7 text-calpop-blue" />
                    Update Person
                </h2>
                <UpdatePersonPanel prisoner={editing} onDone={() => setEditing(null)} />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3">
                        <Users className="w-8 h-8 text-calpop-blue" />
                        Prisoner Directory
                    </h2>
                    <p className="text-calpop-navy text-sm mt-1">Authorized View: Full Population Lookup</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowUpload(v => !v)}
                        className={`px-4 py-2 rounded-lg font-bold border flex items-center gap-2 text-sm transition-colors ${
                            showUpload
                                ? 'bg-calpop-blue text-white border-calpop-blue'
                                : 'bg-white hover:bg-calpop-bg text-calpop-navy border-calpop-navy/15'
                        }`}
                    >
                        <Upload className="w-4 h-4" /> Upload Excel
                    </button>
                    <a
                        href="/api/prisoners/export"
                        className="bg-white hover:bg-calpop-bg text-calpop-navy px-4 py-2 rounded-lg font-bold border border-calpop-navy/15 flex items-center gap-2 text-sm"
                    >
                        <ExternalLink className="w-4 h-4" /> Download Excel
                    </a>
                    <div className="bg-white px-4 py-2 rounded-lg border border-calpop-navy/15 text-xs text-calpop-navy font-mono uppercase">
                        Total Population: {prisoners.length}
                    </div>
                </div>
            </div>

            {showUpload && (
                <ExcelUploader onUploadSuccess={loadPrisoners} />
            )}

            <div className="bg-white p-3 rounded-xl border border-calpop-navy/15 shadow-sm flex items-center justify-between gap-3">
                <div className="relative w-[36rem]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-calpop-navy" />
                    <input
                        type="text"
                        placeholder="Search CPID or name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg pl-9 pr-3 py-2 text-sm text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all font-mono"
                    />
                </div>

                <div className="relative" ref={columnPickerRef}>
                    <button
                        onClick={() => setShowColumnPicker(v => !v)}
                        className={`px-3 py-2 rounded-lg font-bold border flex items-center gap-2 text-sm transition-colors ${
                            showColumnPicker
                                ? 'bg-calpop-blue text-white border-calpop-blue'
                                : 'bg-white hover:bg-calpop-bg text-calpop-navy border-calpop-navy/15'
                        }`}
                    >
                        <Columns className="w-4 h-4" /> Columns ({visibleColumns.length})
                    </button>
                    {showColumnPicker && (
                        <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white border border-calpop-navy/15 rounded-lg shadow-xl z-20 p-2">
                            {ALL_COLUMNS.filter(col => !col.locked).map(col => (
                                <label
                                    key={col.key}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-calpop-bg cursor-pointer text-sm text-calpop-ink"
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns.includes(col.key)}
                                        onChange={() => toggleColumn(col.key)}
                                        className="w-4 h-4"
                                    />
                                    {col.label}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm overflow-hidden pb-20">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-calpop-bg text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">
                                    <button onClick={() => toggleSort('cpid')} className="flex items-center gap-1 hover:text-calpop-ink">
                                        CPID <SortIcon colKey="cpid" />
                                    </button>
                                </th>
                                {ALL_COLUMNS.filter(col => col.locked || visibleColumns.includes(col.key)).map(col => (
                                    <th key={col.key} className="text-left font-bold px-4 py-2.5 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-calpop-ink">
                                                {col.label} <SortIcon colKey={col.key} />
                                            </button>
                                            {col.key === 'stage' && (
                                                <div className="relative" ref={stageLegendRef}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowStageLegend(v => !v)}
                                                        className="text-calpop-navy/50 hover:text-calpop-navy"
                                                        title="Show stage legend"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                    </button>
                                                    {showStageLegend && (
                                                        <div className="absolute left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white border border-calpop-navy/15 rounded-lg shadow-xl z-30 p-3 normal-case tracking-normal font-normal text-xs">
                                                            <div className="font-bold text-calpop-ink uppercase tracking-widest text-[10px] mb-2">Stage Legend</div>
                                                            <div className="space-y-1">
                                                                {STAGE_LEGEND.map(s => (
                                                                    <div key={s.code} className="flex gap-2">
                                                                        <span className="font-mono font-bold text-calpop-blue w-6 shrink-0">{s.code}</span>
                                                                        <span className="text-calpop-navy">{s.label}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                <th className="text-right font-bold px-4 py-2.5 whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((p, idx) => (
                                <tr
                                    key={idx}
                                    className="border-b border-calpop-navy/10 last:border-0 hover:bg-calpop-blue/5 transition-colors"
                                >
                                    <td className="px-4 py-2 font-mono text-xs text-calpop-blue whitespace-nowrap">{p.cpid}</td>
                                    {ALL_COLUMNS.filter(col => col.locked || visibleColumns.includes(col.key)).map(col => (
                                        <td key={col.key} className="px-4 py-2 text-calpop-navy whitespace-nowrap max-w-xs truncate" title={typeof col.render(p) === 'string' ? col.render(p) : undefined}>
                                            {col.render(p)}
                                        </td>
                                    ))}
                                    <td className="px-4 py-2 text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1">
                                            <Link
                                                to={`/letters/new?cpid=${p.cpid}`}
                                                title="Individual Letter"
                                                className="p-1.5 rounded text-calpop-olive hover:bg-calpop-olive hover:text-white transition-colors"
                                            >
                                                <Mail className="w-3.5 h-3.5" />
                                            </Link>
                                            <button
                                                onClick={() => setEditing(p)}
                                                title="Edit"
                                                className="p-1.5 rounded text-calpop-blue hover:bg-calpop-blue hover:text-white transition-colors"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length === 0 && (
                    <div className="py-20 text-center">
                        <Users className="w-12 h-12 mx-auto mb-4 text-calpop-navy" />
                        <h3 className="text-lg font-medium text-calpop-navy">No matches found in the Secure Vault</h3>
                        <p className="text-calpop-navy text-sm">Try searching by CPID or check if the Excel map is uploaded.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
