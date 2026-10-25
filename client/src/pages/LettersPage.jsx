import { useState, useEffect } from 'react'
import { Plus, Search, FileText, AlertCircle, CheckCircle, Clock, Printer, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getLetterStage, shortDate } from '../utils/letterStage'

export function LettersPage() {
    const [letters, setLetters] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [printing, setPrinting] = useState(false)

    const loadLetters = () =>
        fetch('/api/letters')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch letters')
                return res.json()
            })
            .then(data => {
                setLetters(data)
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setError(err.message)
                setLoading(false)
            })

    useEffect(() => { loadLetters() }, [])

    // The stored status stops at intake/redacted for letters whose reply is
    // written in OneDrive, so the Status column shows the Letter Journey
    // stage instead, same as the Work Queue (utils/letterStage.js).
    // Replaced the mailed/printed-only version (11Oct2026) on 25Oct2026.
    const getDisplayStatus = (letter) => {
        const stage = getLetterStage(letter)
        const key = stage.done ? 'completed' : ['written', 'reviewed', 'printed'].includes(stage.key) ? 'review' : 'drafting'
        return { key, label: `${stage.label}${stage.date ? ` ${shortDate(stage.date)}` : ''}` }
    }

    // Sponsor finished (or admin reviewed) with a reply doc, not yet printed.
    const readyToPrint = letters.filter(l =>
        l.dates?.sponsor_reply_item_id && ['written', 'reviewed'].includes(getLetterStage(l).key)
    )

    // One combined PDF of every ready reply, in list order, opened in a new
    // tab to print; then optionally mark them all printed today.
    const printReadyReplies = async () => {
        const tab = window.open('', '_blank') // opened now so the popup blocker allows it
        setPrinting(true)
        try {
            const res = await fetch(`/api/letters/replies/pdf?ids=${readyToPrint.map(l => l.id).join(',')}`)
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Could not build the PDF (${res.status})`)
            const url = URL.createObjectURL(await res.blob())
            if (tab) tab.location = url
            else window.open(url, '_blank')
            if (window.confirm(`Mark these ${readyToPrint.length} replies as printed today?`)) {
                const now = new Date().toISOString()
                await Promise.all(readyToPrint.map(l => fetch(`/api/letters/${l.id}/journey`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ printed_at: now }),
                })))
                loadLetters()
            }
        } catch (err) {
            if (tab) tab.close()
            alert('Error: ' + err.message)
        } finally {
            setPrinting(false)
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'text-calpop-olive'
            case 'review': return 'text-calpop-accent'
            case 'drafting': return 'text-calpop-blue'
            default: return 'text-calpop-navy'
        }
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckCircle className="w-4 h-4" />
            case 'review': return <AlertCircle className="w-4 h-4" />
            case 'drafting': return <FileText className="w-4 h-4" />
            default: return <Clock className="w-4 h-4" />
        }
    }

    if (loading) return <div className="text-center p-12 text-calpop-navy">Loading letters...</div>
    if (error) return <div className="text-center p-12 text-red-600">Error: {error}</div>

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-calpop-ink">
                    Letter Management
                </h2>
                <div className="flex items-center gap-3">
                <button
                    onClick={printReadyReplies}
                    disabled={printing || readyToPrint.length === 0}
                    title={readyToPrint.length === 0 ? 'No finished replies waiting to be printed' : 'One PDF of every finished reply, in list order'}
                    className="flex items-center gap-2 bg-calpop-blue hover:bg-calpop-navy disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                >
                    {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    <span>Print ready replies ({readyToPrint.length})</span>
                </button>
                <Link
                    to="/letters/new"
                    className="flex items-center gap-2 bg-calpop-accent hover:brightness-95 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Letter</span>
                </Link>
                </div>
            </div>

            {/* Filters / Search Bar placeholder */}
            <div className="bg-white p-4 rounded-lg border border-calpop-navy/15 shadow-sm mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-calpop-navy" />
                    <input
                        type="text"
                        placeholder="Search by prisoner ID or title..."
                        className="w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg pl-10 pr-4 py-2 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-colors"
                    />
                </div>
            </div>

            {/* Letters Table */}
            <div className="bg-white rounded-xl border border-calpop-navy/15 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-calpop-panel text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap" title="Written on the bottom-right corner of the envelope">Letter #</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Status</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Title</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Prisoner ID</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Reply</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Updated</th>
                                <th className="text-right font-bold px-4 py-2.5 whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {letters.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-calpop-navy">
                                        No letters found. Create one to get started.
                                    </td>
                                </tr>
                            ) : (
                                letters.map(letter => {
                                    const display = getDisplayStatus(letter)
                                    return (
                                    <tr key={letter.id} className="border-b border-calpop-navy/10 last:border-0 hover:bg-calpop-blue/5 transition-colors group">
                                        <td className="px-4 py-2 font-mono font-bold text-calpop-ink whitespace-nowrap">#{letter.id}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <div className={`flex items-center gap-1.5 ${getStatusColor(display.key)}`}>
                                                {getStatusIcon(display.key)}
                                                <span className="capitalize font-medium">{display.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-calpop-ink whitespace-nowrap">{letter.title || "Untitled Draft"}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-calpop-blue whitespace-nowrap">{letter.prisoner_cpid}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                                            {letter.dates?.sponsor_reply_item_id ? (
                                                <div className="flex items-center gap-3">
                                                    <a href={`/api/letters/${letter.id}/reply/open`} target="_blank" rel="noreferrer" className="text-calpop-blue hover:underline font-medium">Open</a>
                                                    <a href={`/api/letters/replies/pdf?ids=${letter.id}`} target="_blank" rel="noreferrer" className="text-calpop-blue hover:underline font-medium">PDF</a>
                                                    {letter.dates.sponsor_last_save_at && (
                                                        <span className="text-calpop-navy/70">
                                                            saved {shortDate(letter.dates.sponsor_last_save_at)} ({letter.dates.sponsor_save_count})
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-calpop-navy/40">No reply doc</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-calpop-navy whitespace-nowrap">
                                            {new Date(letter.updated_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-2 text-right whitespace-nowrap">
                                            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link
                                                    to={`/letters/${letter.id}/scan`}
                                                    className="text-calpop-navy hover:text-calpop-ink font-medium"
                                                >
                                                    Scan &rarr;
                                                </Link>
                                                <Link
                                                    to={`/letters/${letter.id}`}
                                                    className="text-calpop-blue hover:brightness-90 font-medium"
                                                >
                                                    Edit &rarr;
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
