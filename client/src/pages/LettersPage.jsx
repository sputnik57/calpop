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
                <table className="w-full text-left">
                    <thead className="bg-calpop-bg text-calpop-navy text-sm uppercase tracking-wider">
                        <tr>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium">Title</th>
                            <th className="p-4 font-medium">Prisoner ID</th>
                            <th className="p-4 font-medium">Updated</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-calpop-navy/10">
                        {letters.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-calpop-navy">
                                    No letters found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            letters.map(letter => (
                                <tr key={letter.id} className="hover:bg-calpop-bg/60 transition-colors group">
                                    <td className="p-4">
                                        <div className={`flex items-center gap-2 ${getStatusColor(letter.status)}`}>
                                            {getStatusIcon(letter.status)}
                                            <span className="capitalize font-medium">{letter.status}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-calpop-ink">{letter.title || "Untitled Draft"}</td>
                                    <td className="p-4 font-mono text-calpop-navy">{letter.prisoner_cpid}</td>
                                    <td className="p-4 text-calpop-navy text-sm">
                                        {new Date(letter.updated_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right space-x-4">
                                        <Link
                                            to={`/letters/${letter.id}/scan`}
                                            className="text-calpop-navy hover:text-calpop-ink font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Scan &rarr;
                                        </Link>
                                        <Link
                                            to={`/letters/${letter.id}`}
                                            className="text-calpop-blue hover:brightness-90 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Edit &rarr;
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
