import { useState, useEffect } from 'react'
import { Users, Search, Mail, ExternalLink, MapPin, Building2, User, Pencil, ArrowLeft, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

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

function UpdatePersonPanel({ prisoner, onDone }) {
    const [form, setForm] = useState(() =>
        Object.fromEntries(EDITABLE_FIELDS.map(([key]) => [key, prisoner[key] || '']))
    )
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState(null)

    const setField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const handleSave = async () => {
        setSaving(true)
        setResult(null)
        try {
            // NOT WIRED YET -- there is no PATCH/PUT /api/prisoners/{cpid} endpoint
            // on the backend yet. This is the intended call shape for when that
            // endpoint exists; until then it fails and we say so plainly instead
            // of pretending the save worked.
            const res = await fetch(`/api/prisoners/${prisoner.cpid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(`Backend not wired up yet (got ${res.status}) -- this needs a PATCH /api/prisoners/{cpid} endpoint.`)
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
                    <div key={field}>
                        <label className={labelClass}>{label}</label>
                        <input className={inputClass} value={form[field]} onChange={setField(field)} />
                    </div>
                ))}
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${saving ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
            >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    )
}

export function PrisonersPage() {
    const [prisoners, setPrisoners] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState(null)
    const [editing, setEditing] = useState(null) // the prisoner object being edited, or null

    useEffect(() => {
        // Was fetching /api/excel/status and reading `recent_records`, a field
        // that field never existed in that endpoint's response -- this list
        // silently rendered empty. /api/prisoners is the real listing endpoint,
        // reading the full (decrypted) Postgres roster.
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

    const filtered = prisoners.filter(p =>
        p.cpid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )

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
                <div className="flex items-center gap-4">
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

            <div className="bg-white p-4 rounded-xl border border-calpop-navy/15 shadow-sm flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-calpop-navy" />
                    <input
                        type="text"
                        placeholder="Search by CPID, First Name, or Last Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg pl-10 pr-4 py-3 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all font-mono"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                {filtered.map((p, idx) => (
                    <div
                        key={idx}
                        className="bg-white hover:shadow-md rounded-xl border border-calpop-navy/15 hover:border-calpop-blue/40 p-6 flex flex-col gap-4 group transition-all shadow-sm"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded border bg-calpop-bg border-calpop-navy/15 group-hover:bg-calpop-blue/10 group-hover:border-calpop-blue/25 transition-colors">
                                    <User className="w-5 h-5 text-calpop-navy group-hover:text-calpop-blue" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-calpop-ink">{p.first_name} {p.last_name}</h3>
                                    <span className="text-xs font-mono text-calpop-blue">{p.cpid}</span>
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                p.safety_classification === 'safe'
                                    ? 'bg-calpop-olive/10 text-calpop-olive border-calpop-olive/25'
                                    : 'bg-calpop-accent/10 text-calpop-accent border-calpop-accent/25'
                            }`}>
                                {p.safety_classification === 'safe' ? 'Safe' : 'Unsafe'}
                            </div>
                        </div>

                        <div className="space-y-2 py-4 border-y border-calpop-navy/10">
                            <div className="flex items-center gap-2 text-xs text-calpop-navy">
                                <Building2 className="w-3.5 h-3.5" />
                                <span>{p.facility || 'Facility Protected'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-calpop-navy">
                                <MapPin className="w-3.5 h-3.5" />
                                <span>{p.housing || 'Housing TBD'}</span>
                            </div>
                            {(p.stage != null || p.language || p.bph_date) && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-calpop-navy pt-1">
                                    {p.stage != null && <span>Stage {p.stage}</span>}
                                    {p.language && <span>{p.language}</span>}
                                    {p.bph_date && <span>BPH {p.bph_date}</span>}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 mt-2">
                            <Link
                                to={`/letters/new?cpid=${p.cpid}`}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-calpop-olive/10 hover:bg-calpop-olive text-calpop-olive hover:text-white rounded-lg text-sm font-bold transition-all border border-calpop-olive/25"
                            >
                                <Mail className="w-4 h-4" />
                                Individual
                            </Link>
                            <button
                                onClick={() => setEditing(p)}
                                className="flex items-center justify-center gap-2 py-2 px-3 bg-calpop-blue/10 hover:bg-calpop-blue text-calpop-blue hover:text-white rounded-lg text-sm font-bold transition-all border border-calpop-blue/25"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit
                            </button>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white/50 rounded-2xl border border-dashed border-calpop-navy/20">
                        <Users className="w-12 h-12 mx-auto mb-4 text-calpop-navy" />
                        <h3 className="text-lg font-medium text-calpop-navy">No matches found in the Secure Vault</h3>
                        <p className="text-calpop-navy text-sm">Try searching by CPID or check if the Excel map is uploaded.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
