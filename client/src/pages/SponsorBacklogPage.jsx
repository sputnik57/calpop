import { useState, useEffect } from 'react'
import { Hourglass } from 'lucide-react'

// People > Sponsor Backlog (added 25Oct2026): everyone active with no
// sponsor yet. Organic writers and people from the original outreach list
// are both here; which comes first is Rey's call, so the source is shown
// and can be filtered rather than ranked for him.
// "Needs attention" comes first: active (Stage 10-12) with no sponsor, which
// shouldn't happen and needs Rey's judgment to clear (25Oct2026).
const SOURCES = ['All', 'Needs attention', 'Organic', 'Original list', 'Sponsor dropped', 'Referred']
const groupOf = (r) => (r.stage >= 10 && r.stage <= 12) ? 'Needs attention' : r.source

// letter_received is a plain date ("2026-08-17"), read at local noon so it
// never shifts a day; oldest_waiting_scan is a UTC timestamp without a "Z".
function fmtDate(iso) {
    if (!iso) return null
    const d = new Date(iso.includes('T') ? iso + 'Z' : iso + 'T12:00:00')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function SponsorBacklogPage() {
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [source, setSource] = useState('All')

    useEffect(() => {
        fetch('/api/prisoners/backlog', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load the backlog (${res.status})`)
                return res.json()
            })
            .then(data => { setRows(data); setLoading(false) })
            .catch(err => { setError(err.message); setLoading(false) })
    }, [])

    // Grouped: needs attention, organic requests, the original list, then
    // the rest -- and by date received within each (25Oct2026, Rey).
    const order = (r) => { const i = SOURCES.indexOf(groupOf(r)); return i < 0 ? SOURCES.length : i }
    const sorted = [...rows].sort((a, b) =>
        order(a) - order(b)
        || (a.letter_received || '9999').localeCompare(b.letter_received || '9999')
        || (a.first_name || '').localeCompare(b.first_name || '')
    )
    const shown = source === 'All' ? sorted : sorted.filter(r => groupOf(r) === source)
    const count = (s) => s === 'All' ? rows.length : rows.filter(r => groupOf(r) === s).length

    return (
        <div>
            <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3 mb-1">
                <Hourglass className="w-7 h-7 text-calpop-blue" />
                Sponsor Backlog
            </h2>
            <p className="text-calpop-navy text-sm mb-6">
                Everyone active with no sponsor yet: organic requests (they wrote to us) and people from the original list.
                To take someone off the list, assign a sponsor on Sponsees.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
                {SOURCES.map(s => (
                    <button
                        key={s}
                        onClick={() => setSource(s)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            source === s
                                ? (s === 'Needs attention' ? 'bg-red-600 text-white border-red-600' : 'bg-calpop-blue text-white border-calpop-blue')
                                : (s === 'Needs attention' ? 'bg-white text-red-700 border-red-300 font-bold hover:bg-red-50' : 'bg-white text-calpop-navy border-calpop-navy/15 hover:bg-calpop-panel')
                        }`}
                    >
                        {s} ({count(s)})
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="p-12 text-center text-calpop-navy">Loading backlog...</div>
            ) : error ? (
                <div className="p-12 text-center text-red-600">{error}</div>
            ) : (
                <div className="bg-white rounded-xl border border-calpop-navy/15 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-calpop-panel text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                                    <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Name</th>
                                    <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">CPID</th>
                                    <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Organic or list</th>
                                    <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Letter received</th>
                                    <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Exchanges</th>
                                    <th className="text-left font-bold px-4 py-2.5">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.length === 0 ? (
                                    <tr><td colSpan="6" className="px-4 py-8 text-center text-calpop-navy">No one in this group.</td></tr>
                                ) : shown.map(r => (
                                    <tr key={r.cpid} className={`border-b border-calpop-navy/10 last:border-0 ${groupOf(r) === 'Needs attention' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-2 font-semibold text-calpop-ink whitespace-nowrap">{r.first_name} {r.last_name}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-calpop-blue whitespace-nowrap">{r.cpid}</td>
                                        <td className={`px-4 py-2 whitespace-nowrap ${r.source === 'Organic' ? 'font-bold text-calpop-accent' : 'text-calpop-navy'}`}>
                                            {groupOf(r) === 'Needs attention' && (
                                                <div className="text-xs font-bold text-red-700">Active (stage {r.stage}), no sponsor</div>
                                            )}
                                            {r.source === 'Organic' ? 'Organic request' : r.source}
                                        </td>
                                        <td className="px-4 py-2 text-calpop-navy whitespace-nowrap">{fmtDate(r.letter_received) || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-calpop-navy whitespace-nowrap">{r.letter_exchange_count ?? '—'}</td>
                                        <td className="px-4 py-2 text-xs text-calpop-navy/80 min-w-[260px]">{r.review_notes || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
