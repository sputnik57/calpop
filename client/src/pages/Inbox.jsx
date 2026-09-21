import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox as InboxIcon, MessageSquare, Clock, AlertCircle, CheckCircle2, FileText, ChevronRight, PenSquare, X, Loader2, Search } from 'lucide-react'
import { usePrisonerDirectory } from '../hooks/usePrisonerDirectory'

function StartLetterModal({ onClose, onCreated }) {
    const { loading: loadingPrisoners, ensureLoaded, search: searchPrisoners } = usePrisonerDirectory()
    const [search, setSearch] = useState('')
    const [selectedCpid, setSelectedCpid] = useState(null)
    const [title, setTitle] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => { ensureLoaded() }, [ensureLoaded])

    const filtered = searchPrisoners(search)

    const handleStart = async () => {
        if (!selectedCpid) return
        setSubmitting(true)
        setError(null)
        try {
            const res = await fetch('/api/assignments/start-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ prisoner_cpid: selectedCpid, title: title || null }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Could not start the letter (${res.status})`)
            onCreated(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-calpop-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
            <div
                className="bg-white border border-calpop-navy/15 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-calpop-navy/15 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-calpop-ink flex items-center gap-2">
                        <PenSquare className="w-5 h-5 text-calpop-blue" /> Start New Letter
                    </h3>
                    <button onClick={onClose} className="text-calpop-navy/70 hover:text-calpop-navy"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-hidden flex flex-col flex-1">
                    <p className="text-sm text-calpop-navy">
                        No scan needed — pick who you're writing to and this'll open straight in Compose, same as any other assignment.
                    </p>

                    <div className="relative">
                        <Search className="w-4 h-4 text-calpop-navy/70 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or CPID..."
                            className="w-full bg-white border border-calpop-navy/25 rounded-lg pl-9 pr-3 py-2 text-sm text-calpop-ink outline-none focus:border-calpop-blue"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto border border-calpop-navy/15 rounded-lg divide-y divide-calpop-navy/10">
                        {loadingPrisoners ? (
                            <div className="p-8 text-center text-calpop-navy/70"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-calpop-navy/70 text-sm">No matches</div>
                        ) : (
                            filtered.slice(0, 100).map(p => (
                                <button
                                    key={p.cpid}
                                    onClick={() => setSelectedCpid(p.cpid)}
                                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${selectedCpid === p.cpid ? 'bg-calpop-blue/10 text-calpop-blue' : 'text-calpop-navy hover:bg-calpop-panel'}`}
                                >
                                    <span className="text-sm font-medium">{p.first_name} {p.last_name}</span>
                                    <span className="text-xs font-mono text-calpop-navy/70">{p.cpid}</span>
                                </button>
                            ))
                        )}
                    </div>

                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title (optional)"
                        className="w-full bg-white border border-calpop-navy/25 rounded-lg px-3 py-2 text-sm text-calpop-ink outline-none focus:border-calpop-blue"
                    />

                    {error && <div className="text-sm text-red-400">{error}</div>}
                </div>

                <div className="p-5 border-t border-calpop-navy/15 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-calpop-navy hover:text-calpop-ink text-sm font-medium">Cancel</button>
                    <button
                        onClick={handleStart}
                        disabled={!selectedCpid || submitting}
                        className="px-5 py-2 bg-calpop-blue hover:bg-calpop-navy disabled:opacity-40 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenSquare className="w-4 h-4" />}
                        Start Writing
                    </button>
                </div>
            </div>
        </div>
    )
}

export function Inbox() {
    const navigate = useNavigate()
    const [assignments, setAssignments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showStartModal, setShowStartModal] = useState(false)

    useEffect(() => {
        // We fetch assignments for the current user
        // In the future, this endpoint will aggregate both scans and API emails
        fetch('/api/assignments', { credentials: 'include' })
            .then(res => {
                if (res.status === 401) throw new Error('Authentication required (Session Expired)')
                if (!res.ok) throw new Error('Failed to fetch inbox tasks')
                return res.json()
            })
            .then(data => {
                setAssignments(data)
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [])

    const getStatusInfo = (status) => {
        switch (status) {
            case 'pending': return { icon: <Clock className="w-4 h-4" />, color: 'text-calpop-accent', label: 'In Queue' }
            case 'replied': return { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-calpop-olive', label: 'Responded' }
            case 'overdue': return { icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-400', label: 'Overdue' }
            default: return { icon: <MessageSquare className="w-4 h-4" />, color: 'text-calpop-navy', label: 'Assigned' }
        }
    }

    if (loading) return <div className="text-center p-12 text-calpop-navy font-mono animate-pulse">Scanning Communications...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3">
                        <InboxIcon className="w-8 h-8 text-calpop-blue" />
                        Work Queue
                    </h2>
                    <p className="text-calpop-navy text-sm mt-1">Assignments across scans and digital channels</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowStartModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-calpop-blue hover:bg-calpop-navy text-white rounded-lg text-sm font-bold transition-colors"
                    >
                        <PenSquare className="w-4 h-4" /> Start New Letter
                    </button>
                    <div className="flex gap-4 text-xs font-mono">
                        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-calpop-navy/15">
                            <span className="w-2 h-2 rounded-full bg-calpop-blue"></span>
                            <span className="text-calpop-navy">{assignments.length} Tasks</span>
                        </div>
                    </div>
                </div>
            </div>

            {showStartModal && (
                <StartLetterModal
                    onClose={() => setShowStartModal(false)}
                    onCreated={(assignment) => navigate(`/inbox/respond/${assignment.id}`)}
                />
            )}

            {error ? (
                <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Connectivity Error</p>
                    <p className="text-sm opacity-80 mt-1">{error}</p>
                </div>
            ) : assignments.length === 0 ? (
                <div className="p-16 bg-white border border-dashed border-calpop-navy/15 rounded-2xl text-center">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-calpop-olive/20" />
                    <h3 className="text-lg font-semibold text-calpop-ink">Inbox Zero Reached</h3>
                    <p className="text-calpop-navy/70 mt-1">All communications have been processed or assigned.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {assignments.map((task) => {
                        const status = getStatusInfo(task.status || 'active')
                        return (
                            <Link
                                key={task.id}
                                to={`/inbox/respond/${task.id}`}
                                className="group bg-white hover:bg-calpop-panel p-5 rounded-xl border border-calpop-navy/15 hover:border-calpop-blue/50 transition-all shadow-lg flex items-center gap-6"
                            >
                                <div className={`p-3 rounded-lg bg-calpop-panel border border-calpop-navy/15 group-hover:border-calpop-blue/30 transition-colors ${status.color}`}>
                                    {status.icon}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-mono text-xs text-calpop-navy/70 bg-calpop-panel px-2 py-0.5 rounded border border-calpop-navy/10">
                                            {task.prisoner?.cpid || 'ID PROTECTED'}
                                        </span>
                                        <span className="text-xs text-calpop-navy/70">•</span>
                                        <span className="text-xs text-calpop-navy/70 font-medium">Updated 2d ago</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-calpop-ink truncate group-hover:text-calpop-blue transition-colors">
                                        Letter from {task.prisoner?.first_name || 'Inmate'} {task.prisoner?.last_name || ''}
                                    </h3>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div className="flex items-center gap-1.5 text-xs text-calpop-navy">
                                            <FileText className="w-3 h-3" />
                                            <span>{task.letter?.title || 'Untitled Intake'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="hidden md:flex flex-col items-end">
                                        <span className={`text-xs font-bold uppercase tracking-wider ${status.color}`}>
                                            {status.label}
                                        </span>
                                        <span className="text-[10px] text-calpop-navy/70 mt-1 uppercase tracking-tight">Status</span>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-calpop-navy/70 group-hover:text-calpop-blue transform group-hover:translate-x-1 transition-all" />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
