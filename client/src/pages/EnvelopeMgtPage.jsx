import { useState, useEffect } from 'react'
import { Mail, CheckCircle2, Loader2, Send, X, ExternalLink, Printer } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SubTabs } from '../components/SubTabs'
import { IntakeArea } from './ScantronStation'
import { usePrisonerDirectory } from '../hooks/usePrisonerDirectory'

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
    // People already on file who may be this person (same CDCR # or name),
    // returned by the server before it creates a duplicate (25Oct2026).
    const [duplicates, setDuplicates] = useState(null)

    const setField = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }))
        setDuplicates(null)
    }

    const handleSubmit = async (confirmNew = false) => {
        setSubmitting(true)
        setResult(null)
        try {
            const res = await fetch(`/api/prisoners${confirmNew ? '?confirm_new=true' : ''}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(form),
            })
            if (res.status === 409) {
                const data = await res.json().catch(() => ({}))
                setDuplicates(data.detail?.possible_duplicates || [])
                return
            }
            if (!res.ok) throw new Error(`Failed to add person (${res.status})`)
            const data = await res.json()
            setResult({ ok: true, message: `Added to roster with CPID ${data.cpid}.` })
            setDuplicates(null)
            setForm(EMPTY_FORM)
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    const inputClass = "w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
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
            {duplicates && duplicates.length > 0 && (
                <div className="mb-6 p-4 rounded-lg border-2 border-calpop-accent bg-calpop-accent/10">
                    <div className="text-sm font-bold text-calpop-ink mb-2">This may be someone already on file. Nothing was added.</div>
                    <div className="space-y-1.5 mb-3">
                        {duplicates.map(d => (
                            <div key={d.cpid} className="text-sm text-calpop-ink bg-white rounded px-3 py-2 border border-calpop-navy/10">
                                <b>{d.first_name} {d.last_name}</b>
                                <span className="ml-2 font-mono text-calpop-blue text-xs">{d.cpid}</span>
                                <span className="ml-2 text-xs text-calpop-navy">CDCR {d.cdcr_number || '—'} · {d.sponsor_name ? `sponsor ${d.sponsor_name}` : 'no sponsor'} · stage {d.stage ?? '—'}</span>
                                <span className="ml-2 text-xs font-bold text-calpop-accent">{d.reasons.join(', ')}</span>
                            </div>
                        ))}
                    </div>
                    <div className="text-xs text-calpop-navy mb-3">If this is the same person, use their existing CPID when you scan. If it's someone different, add them anyway.</div>
                    <button
                        onClick={() => handleSubmit(true)}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-white text-calpop-accent border border-calpop-accent hover:bg-calpop-accent hover:text-white transition-colors"
                    >
                        Different person -- add anyway
                    </button>
                </div>
            )}
            <button
                onClick={() => handleSubmit(false)}
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
    const { ensureLoaded: ensurePrisonersLoaded, search: searchPrisoners } = usePrisonerDirectory()
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
        if (value.trim()) ensurePrisonersLoaded()
    }

    const searchResults = searchTerm.trim()
        ? searchPrisoners(searchTerm)
            .filter(p => !queue.some(q => q.cpid === p.cpid))
            .slice(0, 8)
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

    // Envelopes only -- creates no letters (added 25Oct2026). For printing
    // envelopes ahead of the reply, or for mail that isn't a reply.
    const handleEnvelopesOnly = async () => {
        if (!window.confirm(`Print envelopes only for ${selectedCpids.length} ${selectedCpids.length === 1 ? 'person' : 'people'}? No letters are created.`)) return
        setIsProcessing(true)
        try {
            const res = await fetch('/api/batch/envelopes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ prisoner_cpids: selectedCpids }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Could not make envelopes (${res.status})`)
            setBatchResult(data)
            setSelectedCpids([])
            loadQueue()
        } catch (err) {
            alert('Error: ' + err.message)
        } finally {
            setIsProcessing(false)
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
                            <h3 className="text-xl font-bold text-calpop-ink">{batchResult.merged_pdf_url ? 'Batch Processed!' : 'Envelopes Ready'}</h3>
                            <p className="text-calpop-navy mt-2">
                                {batchResult.merged_pdf_url
                                    ? `Created a new letter, letter PDF and envelope for ${batchResult.processed_count} ${batchResult.processed_count === 1 ? 'person' : 'people'}.`
                                    : `Envelopes for ${batchResult.processed_count} ${batchResult.processed_count === 1 ? 'person' : 'people'}. No letters were created.`}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {batchResult.merged_pdf_url && (
                                <a href={batchResult.merged_pdf_url} target="_blank" rel="noreferrer"
                                   className="w-full py-3 bg-calpop-blue hover:brightness-95 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                    <ExternalLink className="w-4 h-4" /> Download Letters PDF
                                </a>
                            )}
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
                                className="w-full py-2 bg-calpop-panel hover:bg-calpop-navy/10 text-calpop-navy rounded-lg text-sm font-bold border border-calpop-navy/15">
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
                                <span className="bg-calpop-panel text-calpop-blue px-3 py-1 rounded-full text-xs font-bold font-mono border border-calpop-navy/15">
                                    Recipients: {selectedCpids.length}
                                </span>
                                <button onClick={() => setShowBatchModal(false)} className="text-calpop-navy hover:text-calpop-ink">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                        <div className="text-sm text-calpop-navy bg-calpop-panel border border-calpop-navy/15 rounded-lg p-4 space-y-2">
                            <p><b className="text-calpop-ink">What this does:</b> sends the same message to everyone selected. For each person it creates a <b>new letter</b> in Letter Management, a letter PDF with the message below, and an envelope. You get one combined letters PDF and separate SAFE and UNSAFE envelope PDFs.</p>
                            <p><b className="text-calpop-ink">Use it for</b> mass mailings, such as wait letters or newsletters.</p>
                            <p><b className="text-calpop-ink">Don't use it</b> to mail a sponsor's reply to a letter you already scanned: it would create a duplicate letter. For that, close this and use <b>Envelopes Only</b>, then print the reply from Letter Management.</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2">Subject / Batch Title</label>
                                <input
                                    type="text"
                                    className="w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg px-4 py-3 text-calpop-ink focus:border-calpop-blue outline-none"
                                    placeholder="e.g. Monthly Newsletter - January"
                                    value={batchData.title}
                                    onChange={e => setBatchData({ ...batchData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2">Message Content (Markdown Supported)</label>
                                <textarea
                                    className="w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg px-4 py-3 text-calpop-ink focus:border-calpop-blue outline-none h-60 font-mono text-sm leading-relaxed"
                                    placeholder="Type your unified message here..."
                                    value={batchData.content}
                                    onChange={e => setBatchData({ ...batchData, content: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-calpop-navy/10">
                            <button onClick={() => setShowBatchModal(false)}
                                    className="flex-1 py-3 bg-calpop-panel hover:bg-calpop-navy/10 text-calpop-navy rounded-xl font-bold border border-calpop-navy/15">
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
                            <div key={p.cpid} className="flex items-center gap-4 px-5 py-3.5 hover:bg-calpop-panel/60">
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
                <div className="flex items-center gap-3">
                <button
                    onClick={handleEnvelopesOnly}
                    disabled={selectedCpids.length === 0 || isProcessing}
                    title="Envelopes for the selected people. Creates no letters."
                    className={`px-6 py-2.5 rounded-lg font-bold text-white flex items-center gap-2 transition-all ${
                        selectedCpids.length === 0 ? 'bg-calpop-navy/25 cursor-not-allowed' : 'bg-calpop-blue hover:bg-calpop-navy'
                    }`}
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Envelopes Only
                </button>
                <button
                    onClick={() => setShowBatchModal(true)}
                    title="Same message to everyone selected: creates a new letter, letter PDF and envelope per person."
                    disabled={selectedCpids.length === 0}
                    className={`px-6 py-2.5 rounded-lg font-bold text-white flex items-center gap-2 transition-all ${
                        selectedCpids.length === 0 ? 'bg-calpop-navy/25 cursor-not-allowed' : 'bg-calpop-accent hover:brightness-95'
                    }`}
                >
                    <Printer className="w-4 h-4" /> Batch Letter + Envelopes
                </button>
                </div>
            </div>
        </div>
    )
}

export function EnvelopeMgtPage() {
    const [searchParams] = useSearchParams()
    // ScantronStation.jsx's "This is a new person" branch (no scan match)
    // links here as /envelope?tab=add so it lands directly on the form.
    // SubTabs only reads defaultTab on initial mount, which is exactly what
    // a fresh navigation is -- no extra wiring needed beyond this.
    const requestedTab = searchParams.get('tab')
    const validTabs = ['scan', 'add', 'print', 'update']
    const defaultTab = validTabs.includes(requestedTab) ? requestedTab : 'scan'

    return (
        <div>
            <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3 mb-1">
                <Mail className="w-7 h-7 text-calpop-blue" />
                Envelope Mgt
            </h2>
            <p className="text-calpop-navy text-sm mb-6">Intake, roster additions, and batch envelope printing.</p>

            <SubTabs
                key={defaultTab}
                defaultTab={defaultTab}
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
