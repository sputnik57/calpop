import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Save, ArrowLeft, Loader2 } from 'lucide-react'

export function LetterEditor() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const isNew = !id || id === 'new'

    const [loading, setLoading] = useState(!isNew)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({
        title: '',
        prisoner_cpid: new URLSearchParams(location.search).get('cpid') || '',
        status: 'drafting',
        content: '',
        content_format: 'markdown'
    })

    useEffect(() => {
        if (!isNew) {
            fetch(`/api/letters/${id}`)
                .then(res => res.json())
                .then(data => {
                    setFormData({
                        title: data.title || '',
                        prisoner_cpid: data.prisoner_cpid || '',
                        status: data.status,
                        content: data.latest_version?.content || '',
                        content_format: data.content_format || 'markdown'
                    })
                    setLoading(false)
                })
                .catch(console.error)
        }
    }, [id, isNew])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)

        try {
            const url = isNew ? '/api/letters' : `/api/letters/${id}`
            const method = isNew ? 'POST' : 'PATCH'

            // For updates, we might need a specific endpoint to add a version or update metadata
            // But for this prototype, let's assume PATCH updates metadata and we might need separate call for content
            // Actually, let's check the API...
            // The python service has update_letter (metadata) and add_version (content)
            // Ideally the UI handles this gracefully.
            // For "Create", we send everything.
            // For "Update", if content changed, we might want to Add Version.

            // Simplified logic: 
            // 1. Create/Update metadata
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title,
                    prisoner_cpid: formData.prisoner_cpid,
                    status: formData.status,
                    content_format: formData.content_format
                })
            })

            if (!res.ok) throw new Error('Failed to save metadata')
            const letter = await res.json()

            // 2. If content present (and creating OR content changed), save version
            // For simplicity, always save new version on edit for now if content exists
            if (formData.content) {
                const versionRes = await fetch(`/api/letters/${letter.id}/versions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: formData.content,
                        version_label: 'Draft via UI'
                    })
                })
                if (!versionRes.ok) throw new Error('Failed to save content')
            }

            navigate('/letters')
        } catch (err) {
            alert('Error saving: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-12 text-center text-slate-400">Loading editor...</div>

    return (
        <div className="max-w-4xl mx-auto">
            <button
                onClick={() => navigate('/letters')}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Letters
            </button>

            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-100">
                        {isNew ? 'New Letter' : 'Edit Letter'}
                    </h2>
                    <span className="text-xs font-mono text-slate-500 uppercase">
                        {isNew ? 'Drafting' : `ID: ${id}`}
                    </span>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Title</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                                placeholder="e.g. November Newsletter"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Prisoner CPID</label>
                            <input
                                type="text"
                                value={formData.prisoner_cpid}
                                onChange={e => setFormData({ ...formData, prisoner_cpid: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none font-mono"
                                placeholder="e.g. ABC123"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300 flex justify-between">
                            <span>Content (Markdown)</span>
                            <span className="text-slate-500 text-xs font-normal">Supports basic formatting</span>
                        </label>
                        <textarea
                            value={formData.content}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                            className="w-full h-96 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-100 font-mono text-sm focus:border-emerald-500 focus:outline-none resize-y"
                            placeholder="# Dear [Name]..."
                        />
                    </div>

                    <div className="pt-4 border-t border-slate-700 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Saving...' : 'Save Letter'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
