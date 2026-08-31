import { useState, useEffect } from 'react'
import { Plus, Search, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LettersPage() {
    const [letters, setLetters] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
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
    }, [])

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
                <Link
                    to="/letters/new"
                    className="flex items-center gap-2 bg-calpop-accent hover:brightness-95 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Letter</span>
                </Link>
            </div>

            {/* Filters / Search Bar placeholder */}
            <div className="bg-white p-4 rounded-lg border border-calpop-navy/15 shadow-sm mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-calpop-navy" />
                    <input
                        type="text"
                        placeholder="Search by prisoner ID or title..."
                        className="w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg pl-10 pr-4 py-2 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-colors"
                    />
                </div>
            </div>

            {/* Letters Table */}
            <div className="bg-white rounded-xl border border-calpop-navy/15 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-calpop-bg text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Status</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Title</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Prisoner ID</th>
                                <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Updated</th>
                                <th className="text-right font-bold px-4 py-2.5 whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {letters.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-8 text-center text-calpop-navy">
                                        No letters found. Create one to get started.
                                    </td>
                                </tr>
                            ) : (
                                letters.map(letter => (
                                    <tr key={letter.id} className="border-b border-calpop-navy/10 last:border-0 hover:bg-calpop-blue/5 transition-colors group">
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <div className={`flex items-center gap-1.5 ${getStatusColor(letter.status)}`}>
                                                {getStatusIcon(letter.status)}
                                                <span className="capitalize font-medium">{letter.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-calpop-ink whitespace-nowrap">{letter.title || "Untitled Draft"}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-calpop-blue whitespace-nowrap">{letter.prisoner_cpid}</td>
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
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
