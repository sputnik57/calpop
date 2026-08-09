import { useState, useEffect } from 'react'
import { Users, Search, Mail, ExternalLink, MapPin, Building2, User, CheckCircle2, Loader2, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PrisonersPage() {
    const [prisoners, setPrisoners] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState(null)

    const [selectedCpids, setSelectedCpids] = useState([])
    const [showBatchModal, setShowBatchModal] = useState(false)
    const [batchData, setBatchData] = useState({ title: '', content: '' })
    const [isProcessing, setIsProcessing] = useState(false)
    const [batchResult, setBatchResult] = useState(null)

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

    const toggleSelection = (cpid) => {
        setSelectedCpids(prev =>
            prev.includes(cpid) ? prev.filter(c => c !== cpid) : [...prev, cpid]
        )
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
                    content: batchData.content
                })
            })
            if (res.ok) {
                const data = await res.json()
                setBatchResult(data)
                setShowBatchModal(false)
                setSelectedCpids([])
            }
        } catch (err) {
            console.error(err)
        } finally {
            setIsProcessing(false)
        }
    }

    if (loading) return <div className="p-12 text-center text-slate-400 font-mono animate-pulse">Consulting Perimeter Records...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Users className="w-8 h-8 text-cyan-400" />
                        Prisoner Directory
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Authorized View: Full Population Lookup</p>
                </div>
                <div className="flex items-center gap-4">
                    <a
                        href="/api/prisoners/export"
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-bold border border-slate-700 flex items-center gap-2 text-sm"
                    >
                        <ExternalLink className="w-4 h-4" /> Download Excel
                    </a>
                    {selectedCpids.length > 0 && (
                        <button
                            onClick={() => setShowBatchModal(true)}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-cyan-500/20 animate-in zoom-in-95 duration-200"
                        >
                            Batch Write ({selectedCpids.length})
                        </button>
                    )}
                    <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 font-mono uppercase">
                        Total Population: {prisoners.length}
                    </div>
                </div>
            </div>

            {/* BATCH SUCCESS MODAL */}
            {batchResult && (
                <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center space-y-6 animate-in fade-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-100">Batch Processed!</h3>
                            <p className="text-slate-400 mt-2">Successfully created correspondence for {batchResult.processed_count} prisoners.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <a
                                href={batchResult.merged_pdf_url}
                                target="_blank"
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/10"
                            >
                                <ExternalLink className="w-4 h-4" /> Download Letters PDF
                            </a>

                            {/* Deliberately two separate downloads, never merged -- these use
                                different sender addresses on the envelope and must never be
                                printed as one combined run. */}
                            {batchResult.merged_envelope_url_safe && (
                                <a
                                    href={batchResult.merged_envelope_url_safe}
                                    target="_blank"
                                    className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
                                >
                                    <ExternalLink className="w-4 h-4" /> Download SAFE Envelopes PDF
                                </a>
                            )}
                            {batchResult.merged_envelope_url_unsafe && (
                                <a
                                    href={batchResult.merged_envelope_url_unsafe}
                                    target="_blank"
                                    className="w-full py-3 bg-red-800 hover:bg-red-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-500/10"
                                >
                                    <ExternalLink className="w-4 h-4" /> Download UNSAFE Envelopes PDF
                                </a>
                            )}
                            {!batchResult.merged_envelope_url_safe && !batchResult.merged_envelope_url_unsafe && (
                                <p className="text-xs text-slate-500 italic">No envelope PDFs were generated for this batch.</p>
                            )}
                        </div>

                        <button
                            onClick={() => setBatchResult(null)}
                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-sm font-bold border border-slate-700"
                        >
                            Back to Directory
                        </button>
                    </div>
                </div>
            )}

            {/* BATCH WRITING MODAL */}
            {showBatchModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-2xl w-full shadow-2xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                                <Mail className="w-6 h-6 text-cyan-400" />
                                Batch Correspondence
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="bg-slate-800 text-cyan-400 px-3 py-1 rounded-full text-xs font-bold font-mono border border-slate-700">
                                    Recipients: {selectedCpids.length}
                                </span>
                                <button onClick={() => setShowBatchModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Subject / Batch Title</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:border-cyan-500 outline-none transition-all"
                                    placeholder="e.g. Monthly Newsletter - January"
                                    value={batchData.title}
                                    onChange={e => setBatchData({ ...batchData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Message Content (Markdown Supported)</label>
                                <textarea
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:border-cyan-500 outline-none h-60 font-mono text-sm leading-relaxed"
                                    placeholder="Type your unified message here..."
                                    value={batchData.content}
                                    onChange={e => setBatchData({ ...batchData, content: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => setShowBatchModal(false)}
                                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all border border-slate-700"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleBatchSubmit}
                                disabled={isProcessing || !batchData.content}
                                className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-3 ${isProcessing ? 'bg-slate-700' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20'}`}
                            >
                                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                {isProcessing ? 'PROCESSING BATCH...' : 'START MASS INGESTION'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by CPID, First Name, or Last Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500 transition-all font-mono"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                {filtered.map((p, idx) => {
                    const isSelected = selectedCpids.includes(p.cpid)
                    return (
                        <div
                            key={idx}
                            onClick={() => toggleSelection(p.cpid)}
                            className={`cursor-pointer bg-slate-800/50 hover:bg-slate-800 rounded-xl border p-6 flex flex-col gap-4 group transition-all shadow-lg relative ${isSelected ? 'border-cyan-500 ring-1 ring-cyan-500/50 transform scale-[1.02]' : 'border-slate-700 hover:border-cyan-500/30'}`}
                        >
                            {isSelected && (
                                <div className="absolute -top-2 -right-2 bg-cyan-500 text-white p-1 rounded-full shadow-lg border-2 border-slate-900 animate-in zoom-in duration-200">
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                            )}

                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded border transition-colors ${isSelected ? 'bg-cyan-500/20 border-cyan-500/30' : 'bg-slate-900 border-slate-700 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20'}`}>
                                        <User className={`w-5 h-5 ${isSelected ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'}`} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-100">{p.first_name} {p.last_name}</h3>
                                        <span className="text-xs font-mono text-cyan-500">{p.cpid}</span>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                    p.safety_classification === 'safe'
                                        ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800'
                                        : 'bg-red-900/30 text-red-400 border-red-800'
                                }`}>
                                    {p.safety_classification === 'safe' ? 'Safe' : 'Unsafe'}
                                </div>
                            </div>

                            <div className="space-y-2 py-4 border-y border-slate-700/50">
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Building2 className="w-3.5 h-3.5" />
                                    <span>{p.facility || 'Facility Protected'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <MapPin className="w-3.5 h-3.5" />
                                    <span>{p.housing || 'Housing TBD'}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                <Link
                                    to={`/letters/new?cpid=${p.cpid}`}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg text-sm font-bold transition-all border border-emerald-600/20"
                                >
                                    <Mail className="w-4 h-4" />
                                    Individual
                                </Link>
                                <button className={`p-2 rounded-lg transition-colors ${isSelected ? 'bg-cyan-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
                                    <ExternalLink className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )
                })}

                {filtered.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
                        <Users className="w-12 h-12 mx-auto mb-4 text-slate-600 opacity-20" />
                        <h3 className="text-lg font-medium text-slate-400">No matches found in the Secure Vault</h3>
                        <p className="text-slate-500 text-sm">Try searching by CPID or check if the Excel map is uploaded.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
