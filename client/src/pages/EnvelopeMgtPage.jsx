import { useState, useEffect } from 'react'
import { Mail, CheckCircle2, Loader2, Send, X, ExternalLink, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SubTabs } from '../components/SubTabs'
import { IntakeArea } from './ScantronStation'

// Address/info corrections for an EXISTING person happen in DB Mgt's Update
// Person tab, not here. This tab is a redirect, not a panel -- it exists in
// the strip so people looking for "update address" find it, then bounces
// straight to DB Mgt as soon as it's selected.
function RedirectToDbMgt() {
    const navigate = useNavigate()
    useEffect(() => { navigate('/prisoners') }, [navigate])
    return null
}

const EMPTY_FORM = {
    first_name: '', last_name: '', cdcr_number: '', facility: '', housing: '',
    address: '', city: '', state: '', zip: '',
}

function AddNewPersonForm() {
    const [form, setForm] = useState(EMPTY_FORM)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null) // { ok: bool, message: string }

    const setField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const handleSubmit = async () => {
        setSubmitting(true)
        setResult(null)
        try {
            const res = await fetch('/api/prisoners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(`Failed to add person (${res.status})`)
            const data = await res.json()
            setResult({ ok: true, message: `Added to roster with CPID ${data.cpid}.` })
            setForm(EMPTY_FORM)
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    const inputClass = "w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
    const labelClass = "text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2"

    return (
        <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm max-w-2xl">
            {result && (
                <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelClass}>First Name</label><input className={inputClass} value={form.first_name} onChange={setField('first_name')} /></div>
                <div><label className={labelClass}>Last Name</label><input className={inputClass} value={form.last_name} onChange={setField('last_name')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelClass}>CDCR #</label><input className={inputClass} value={form.cdcr_number} onChange={setField('cdcr_number')} placeholder="X99999" /></div>
                <div><label className={labelClass}>Facility</label><input className={inputClass} value={form.facility} onChange={setField('facility')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelClass}>Housing</label><input className={inputClass} value={form.housing} onChange={setField('housing')} /></div>
                <div><label className={labelClass}>Address</label><input className={inputClass} value={form.address} onChange={setField('address')} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div><label className={labelClass}>City</label><input className={inputClass} value={form.city} onChange={setField('city')} /></div>
                <div><label className={labelClass}>State</label><input className={inputClass} value={form.state} onChange={setField('state')} placeholder="CA" /></div>
                <div><label className={labelClass}>Zip</label><input className={inputClass} value={form.zip} onChange={setField('zip')} /></div>
            </div>
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${submitting ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
            >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Adding...' : 'Add to Roster'}
            </button>
        </div>
    )
}

function PrintEnvelopesPanel() {
    // The print QUEUE, not the full roster -- people land here either
    // automatically (a confirmed scan with a verified address, see
    // ScantronStation.jsx) or manually via the search box below. The full
    // roster is never displayed as a browsable list here; it's only ever
    // fetched (lazily, on first search) to power that search.
    const [queue, setQueue] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedCpids, setSelectedCpids] = useState([])
    const [showBatchModal, setShowBatchModal] = useState(false)
    const [batchData, setBatchData] = useState({ title: '', content: '' })
    const [isProcessing, setIsProcessing] = useState(false)
    const [batchResult, setBatchResult] = useState(null)

    const [searchTerm, setSearchTerm] = useState('')
    const [allPrisoners, setAllPrisoners] = useState(null) // lazily loaded, search-only
    const [addingCpid, setAddingCpid] = useState(null)

    const loadQueue = () => {
        setLoading(true)
        fetch('/api/prisoners/print-queue', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load print queue (${res.status})`)
                return res.json()
            })
            .then(data => { setQueue(data || []); setLoading(false) })
            .catch(err => { setError(err.message); setLoading(false) })
    }

    useEffect(() => { loadQueue() }, [])

    const toggleSelection = (cpid) => {
        setSelectedCpids(prev => prev.includes(cpid) ? prev.filter(c => c !== cpid) : [...prev, cpid])
    }

    const handleSearchChange = (value) => {
        setSearchTerm(value)
        if (allPrisoners === null && value.trim()) {
            fetch('/api/prisoners', { credentials: 'include' })
                .then(res => res.json())
                .then(data => setAllPrisoners(data || []))
                .catch(() => setAllPrisoners([]))
        }
    }

    const searchResults = (searchTerm.trim() && allPrisoners)
        ? allPrisoners.filter(p => {
            const term = searchTerm.toLowerCase()
            const alreadyQueued = queue.some(q => q.cpid === p.cpid)
            if (alreadyQueued) return false
            return p.cpid?.toLowerCase().includes(term)
                || p.first_name?.toLowerCase().includes(term)
                || p.last_name?.toLowerCase().includes(term)
        }).slice(0, 8)
        : []

    const addToQueue = async (cpid) => {
        setAddingCpid(cpid)
        try {
            const res = await fetch(`/api/prisoners/${cpid}/queue-for-printing`, {
                method: 'POST',
                credentials: 'include',
            })
            if (res.ok) {
                setSearchTerm('')
                loadQueue()
            }
        } catch (err) {
            console.error(err)
        } finally {
            setAddingCpid(null)
        }
    }

    const removeFromQueue = async (cpid) => {
        try {
            await fetch(`/api/prisoners/${cpid}/queue-for-printing`, {
                method: 'DELETE',
                credentials: 'include',
            })
            setSelectedCpids(prev => prev.filter(c => c !== cpid))
            loadQueue()
        } catch (err) {
            console.error(err)
        }
    }

    const handleBatchSubmit = async () => {
        setIsProcessing(true)
        try {
            const res = await fetch('/api/batch/letters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    prisoner_cpids: selectedCpids,
                    title: batchData.title || 'Batch Update',
                    content: batchData.content,
                }),
            })
            if (res.ok) {
                const data = await res.json()
                setBatchResult(data)
                setShowBatchModal(false)
                setSelectedCpids([])
                loadQueue() // successfully-printed prisoners were just cleared server-side
            }
        } catch (err) {
            console.error(err)
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="space-y-4">
            {batchResult && (
                <div className="fixed inset-0 z-50 bg-calpop-navy/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-white border border-calpop-navy/15 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center space-y-6">
                        <div className="w-20 h-20 bg-calpop-olive/10 rounded-full flex items-center justify-center mx-auto border border-calpop-olive/20">
                            <CheckCircle2 className="w-10 h-10 text-calpop-olive" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-calpop-ink">Batch Processed!</h3>
                            <p className="text-calpop-navy mt-2">Successfully created correspondence for {batchResult.processed_count} prisoners.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <a href={batchResult.merged_pdf_url} target="_blank" rel="noreferrer"
                               className="w-full py-3 bg-calpop-blue hover:brightness-95 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                <ExternalLink className="w-4 h-4" /> Download Letters PDF
                            </a>
                            {/* Deliberately two separate downloads, never merged -- these use
                                different sender addresses on the envelope and must never be
                                printed as one combined run. */}
                            {batchResult.merged_envelope_url_safe && (
                                <a href={batchResult.merged_envelope_url_safe} target="_blank" rel="noreferrer"
                                   className="w-full py-3 bg-calpop-olive hover:brightness-110 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                    <ExternalLink className="w-4 h-4" /> Download SAFE Envelopes PDF
                                </a>
                            )}
                            {batchResult.merged_envelope_url_unsafe && (
                                <a href={batchResult.merged_envelope_url_unsafe} target="_blank" rel="noreferrer"
                                   className="w-full py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                    <ExternalLink className="w-4 h-4" /> Download UNSAFE Envelopes PDF
                                </a>
                            )}
                            {!batchResult.merged_envelope_url_safe && !batchResult.merged_envelope_url_unsafe && (
                                <p className="text-xs text-calpop-navy italic">No envelope PDFs were generated for this batch.</p>
                            )}
                        </div>
                        <button onClick={() => setBatchResult(null)}
                                className="w-full py-2 bg-calpop-bg hover:bg-calpop-navy/10 text-calpop-navy rounded-lg text-sm font-bold border border-calpop-navy/15">
                            Back to List
                        </button>
                    </div>
                </div>
            )}

            {showBatchModal && (
                <div className="fixed inset-0 z-50 bg-calpop-navy/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-white border border-calpop-navy/15 p-8 rounded-2xl max-w-2xl w-full shadow-2xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-calpop-ink flex items-center gap-3">
                                <Mail className="w-6 h-6 text-calpop-blue" /> Batch Correspondence
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="bg-calpop-bg text-calpop-blue px-3 py-1 rounded-full text-xs font-bold font-mono border border-calpop-navy/15">
                                    Recipients: {selectedCpids.length}
                                </span>
                                <button onClick={() => setShowBatchModal(false)} className="text-calpop-navy hover:text-calpop-ink">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2">Subject / Batch Title</label>
                                <input
                                    type="text"
                                    className="w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg px-4 py-3 text-calpop-ink focus:border-calpop-blue outline-none"
                                    placeholder="e.g. Monthly Newsletter - January"
                                    value={batchData.title}
                                    onChange={e => setBatchData({ ...batchData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2">Message Content (Markdown Supported)</label>
                                <textarea
                                    className="w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg px-4 py-3 text-calpop-ink focus:border-calpop-blue outline-none h-60 font-mono text-sm leading-relaxed"
                                    placeholder="Type your unified message here..."
                                    value={batchData.content}
                                    onChange={e => setBatchData({ ...batchData, content: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-calpop-navy/10">
                            <button onClick={() => setShowBatchModal(false)}
                                    className="flex-1 py-3 bg-calpop-bg hover:bg-calpop-navy/10 text-calpop-navy rounded-xl font-bold border border-calpop-navy/15">
                                CANCEL
                            </button>
                            <button
                                onClick={handleBatchSubmit}
                                disabled={isProcessing || !batchData.content}
                                className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-3 ${isProcessing ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
                            >
                                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                {isProcessing ? 'PROCESSING BATCH...' : 'START BATCH'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Search to manually add someone who needs an envelope without
                having come through a scan. Not a roster browser -- results
                only ever show up here after typing, and never anyone
                already queued. */}
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Find a person to add to the print queue..."
                    className="w-full bg-white border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
                />
                {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-calpop-navy/15 rounded-lg shadow-lg divide-y divide-calpop-navy/10 max-h-64 overflow-y-auto">
                        {searchResults.map(p => (
                            <div key={p.cpid} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="flex-1">
                                    <b className="text-calpop-ink text-sm">{p.first_name} {p.last_name}</b>
                                    <span className="ml-2 font-mono text-calpop-blue text-xs">{p.cpid}</span>
                                </div>
                                <button
                                    onClick={() => addToQueue(p.cpid)}
                                    disabled={addingCpid === p.cpid}
                                    className="px-3 py-1 bg-calpop-accent hover:brightness-95 disabled:opacity-50 text-white rounded text-xs font-bold"
                                >
                                    {addingCpid === p.cpid ? '...' : 'Add to Queue'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="p-12 text-center text-calpop-navy font-mono animate-pulse">Loading print queue...</div>
            ) : error ? (
                <div className="p-12 text-center text-red-600">{error}</div>
            ) : (
                <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm divide-y divide-calpop-navy/10">
                    {queue.map((p) => {
                        const isSelected = selectedCpids.includes(p.cpid)
                        return (
                            <div key={p.cpid} className="flex items-center gap-4 px-5 py-3.5 hover:bg-calpop-bg/60">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(p.cpid)}
                                    className="w-4 h-4 cursor-pointer"
                                />
                                <div className="flex-1 cursor-pointer" onClick={() => toggleSelection(p.cpid)}>
                                    <b className="text-calpop-ink">{p.first_name} {p.last_name}</b>
                                </div>
                                <span className="font-mono text-calpop-blue text-xs">{p.cpid}</span>
                                <span className="text-calpop-navy text-xs">{p.facility || 'Facility Protected'}</span>
                                <button
                                    onClick={() => removeFromQueue(p.cpid)}
                                    className="text-calpop-navy hover:text-calpop-accent"
                                    title="Remove from queue"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                    {queue.length === 0 && (
                        <div className="py-16 text-center text-calpop-navy text-sm">
                            Nothing in the print queue. Confirm a scan with a verified address, or search above to add someone manually.
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between pt-2">
                <span className="text-calpop-navy text-sm">{selectedCpids.length} selected</span>
                <button
                    onClick={() => setShowBatchModal(true)}
                    disabled={selectedCpids.length === 0}
                    className={`px-6 py-2.5 rounded-lg font-bold text-white flex items-center gap-2 transition-all ${
                        selectedCpids.length === 0 ? 'bg-calpop-navy/25 cursor-not-allowed' : 'bg-calpop-accent hover:brightness-95'
                    }`}
                >
                    <Printer className="w-4 h-4" /> Batch Print
                </button>
            </div>
        </div>
    )
}

export function EnvelopeMgtPage() {
    return (
        <div>
            <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3 mb-1">
                <Mail className="w-7 h-7 text-calpop-blue" />
                Envelope Mgt
            </h2>
            <p className="text-calpop-navy text-sm mb-6">Intake, roster additions, and batch envelope printing.</p>

            <SubTabs
                defaultTab="scan"
                tabs={[
                    { key: 'scan', label: 'Scan & Find Person', content: <IntakeArea /> },
                    { key: 'add', label: 'Add New Person', content: <AddNewPersonForm /> },
                    { key: 'print', label: 'Print Envelopes', content: <PrintEnvelopesPanel /> },
                    { key: 'update', label: 'Update Address (DB Mgt)', content: <RedirectToDbMgt /> },
                ]}
            />
        </div>
    )
}
