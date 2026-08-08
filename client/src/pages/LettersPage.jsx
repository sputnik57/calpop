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
            case 'completed': return 'text-emerald-400'
            case 'review': return 'text-amber-400'
            case 'drafting': return 'text-blue-400'
            default: return 'text-slate-400'
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

    if (loading) return <div className="text-center p-12 text-slate-400">Loading letters...</div>
    if (error) return <div className="text-center p-12 text-red-400">Error: {error}</div>

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    Letter Management
                </h2>
                <Link
                    to="/letters/new"
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg hover:shadow-emerald-500/20"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Letter</span>
                </Link>
            </div>

            {/* Filters / Search Bar placeholder */}
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by prisoner ID or title..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>
            </div>

            {/* Letters Table */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
                <table className="w-full text-left">
                    <thead className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider">
                        <tr>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium">Title</th>
                            <th className="p-4 font-medium">Prisoner ID</th>
                            <th className="p-4 font-medium">Updated</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {letters.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-slate-500">
                                    No letters found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            letters.map(letter => (
                                <tr key={letter.id} className="hover:bg-slate-700/30 transition-colors group">
                                    <td className="p-4">
                                        <div className={`flex items-center gap-2 ${getStatusColor(letter.status)}`}>
                                            {getStatusIcon(letter.status)}
                                            <span className="capitalize font-medium">{letter.status}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-slate-200">{letter.title || "Untitled Draft"}</td>
                                    <td className="p-4 font-mono text-slate-400">{letter.prisoner_cpid}</td>
                                    <td className="p-4 text-slate-400 text-sm">
                                        {new Date(letter.updated_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right">
                                        <Link
                                            to={`/letters/${letter.id}`}
                                            className="text-cyan-400 hover:text-cyan-300 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity"
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
