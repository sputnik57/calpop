import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Inbox as InboxIcon, MessageSquare, Clock, AlertCircle, CheckCircle2, FileText, ChevronRight } from 'lucide-react'

export function Inbox() {
    const [assignments, setAssignments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

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
            case 'pending': return { icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', label: 'In Queue' }
            case 'replied': return { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400', label: 'Responded' }
            case 'overdue': return { icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-400', label: 'Overdue' }
            default: return { icon: <MessageSquare className="w-4 h-4" />, color: 'text-slate-400', label: 'Assigned' }
        }
    }

    if (loading) return <div className="text-center p-12 text-slate-400 font-mono animate-pulse">Scanning Communications...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <InboxIcon className="w-8 h-8 text-emerald-400" />
                        Work Queue
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Assignments across scans and digital channels</p>
                </div>
                <div className="flex gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-slate-300">{assignments.length} Tasks</span>
                    </div>
                </div>
            </div>

            {error ? (
                <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Connectivity Error</p>
                    <p className="text-sm opacity-80 mt-1">{error}</p>
                </div>
            ) : assignments.length === 0 ? (
                <div className="p-16 bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl text-center">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-500/20" />
                    <h3 className="text-lg font-semibold text-slate-200">Inbox Zero Reached</h3>
                    <p className="text-slate-500 mt-1">All communications have been processed or assigned.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {assignments.map((task) => {
                        const status = getStatusInfo(task.status || 'active')
                        return (
                            <Link
                                key={task.id}
                                to={`/inbox/respond/${task.id}`}
                                className="group bg-slate-800/80 hover:bg-slate-800 p-5 rounded-xl border border-slate-700 hover:border-emerald-500/50 transition-all shadow-lg hover:shadow-emerald-500/5 flex items-center gap-6"
                            >
                                <div className={`p-3 rounded-lg bg-slate-900 border border-slate-700 group-hover:border-emerald-500/30 transition-colors ${status.color}`}>
                                    {status.icon}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-mono text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                            {task.prisoner?.cpid || 'ID PROTECTED'}
                                        </span>
                                        <span className="text-xs text-slate-500">•</span>
                                        <span className="text-xs text-slate-500 font-medium">Updated 2d ago</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-100 truncate group-hover:text-emerald-400 transition-colors">
                                        Letter from {task.prisoner?.first_name || 'Inmate'} {task.prisoner?.last_name || ''}
                                    </h3>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
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
                                        <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-tight">Status</span>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transform group-hover:translate-x-1 transition-all" />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
