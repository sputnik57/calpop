import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, Send, Loader2, Library, X, Mail, User, Building2, MapPin, FileText, Image as ImageIcon } from 'lucide-react'
import ReferenceLibrary from '../components/ReferenceLibrary'

const parseMarkdown = (text) => {
    if (!text) return "";
    let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold/Italic
        .replace(/\*\*\*(.*)\*\*\*/gim, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        // Blockquotes
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        // Lists
        .replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>')
        // Fix duplicate <ul> tags
        .replace(/<\/ul>\s?<ul>/gim, '')
        // Clean line breaks
        .replace(/\n$/gim, '<br />');

    return html;
};

export function ResponseStation() {
    const { assignmentId } = useParams()
    const navigate = useNavigate()

    const [assignment, setAssignment] = useState(null)
    const [prisonerDetails, setPrisonerDetails] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [content, setContent] = useState('')
    const [title, setTitle] = useState('')
    const [activeTab, setActiveTab] = useState('compose')
    const [showPreview, setShowPreview] = useState(false)

    // Lifted Workbench State
    const [currQueue, setCurrQueue] = useState([])
    const [histQueue, setHistQueue] = useState([])
    const [activeQueuePath, setActiveQueuePath] = useState(null)
    const [previewContent, setPreviewContent] = useState({})

    const [pdfUrl, setPdfUrl] = useState(null)
    const [envelopeUrl, setEnvelopeUrl] = useState(null)

    useEffect(() => {
        fetch(`/api/assignments/${assignmentId}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setAssignment(data)
                setTitle(`Response to ${data.prisoner?.cpid || 'Letter'}`)
                if (data.active_submission) {
                    setContent(data.active_submission.content || '')
                    setTitle(data.active_submission.title || title)

                    if (data.active_submission.artifacts) {
                        const pdfArt = data.active_submission.artifacts.find(a => a.artifact_type === 'pdf')
                        if (pdfArt) setPdfUrl(`/api/static/data/submissions/${pdfArt.file_name}`)

                        const envArt = data.active_submission.artifacts.find(a => a.artifact_type === 'envelope')
                        if (envArt) setEnvelopeUrl(`/api/static/data/submissions/${envArt.file_name}`)
                    }
                }

                fetch(`/api/prisoners/${data.prisoner_cpid}/details`, { credentials: 'include' })
                    .then(res => res.json())
                    .then(details => setPrisonerDetails(details))
                    .catch(console.error)

                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }, [assignmentId])

    const getImageUrl = (path) => {
        if (!path) return null
        const parts = path.split(/data[\\/]/)
        const relative = parts.length > 1 ? parts.slice(1).join('data/') : path
        return `/api/static/data/${relative.replace(/\\/g, '/')}`
    }

    const handleSave = async (isFinal = false) => {
        setSaving(true)
        try {
            const submissionId = assignment.active_submission?.id
            const url = submissionId ? `/api/submissions/${submissionId}` : `/api/submissions`
            const method = submissionId ? 'PUT' : 'POST'

            // For PUT, the backend expects 'updates' wrapper or direct fields depending on schema.
            // Our Schema (SubmissionUpdate) accepts { title, content, status }.
            const payload = {
                letter_id: assignment.letter_id, // Ignored by PUT but needed by POST
                title: title,
                content: content,
                content_format: 'markdown',
                status: isFinal ? 'submitted' : 'draft'
            }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })
            if (!res.ok) throw new Error('Failed to save message')

            // Update local state with the saved submission to ensure subsequent saves use PUT
            const savedSubmission = await res.json()
            setAssignment(prev => ({
                ...prev,
                active_submission: savedSubmission
            }))

            if (isFinal) {
                setGenerating(true)
                const sub = await res.json()

                const pdfRes = await fetch(`/api/submissions/${sub.id}/artifacts/pdf`, { method: 'POST', credentials: 'include' })
                if (pdfRes.ok) {
                    const pdfData = await pdfRes.json()
                    setPdfUrl(`/api/static/data/submissions/${pdfData.file_name}`)
                }

                const envRes = await fetch(`/api/submissions/${sub.id}/artifacts/envelope`, { method: 'POST', credentials: 'include' })
                if (envRes.ok) {
                    const envData = await envRes.json()
                    setEnvelopeUrl(`/api/static/data/submissions/${envData.file_name}`)
                }
            }
        } catch (err) {
            alert(err.message)
        } finally {
            setSaving(false)
            setGenerating(false)
        }
    }

    const [lastSaved, setLastSaved] = useState(null)
    const [autosaving, setAutosaving] = useState(false)

    // Autosave Hook
    useEffect(() => {
        if (!assignment?.active_submission?.id || !content) return

        const timer = setTimeout(async () => {
            setAutosaving(true)
            try {
                const res = await fetch(`/api/submissions/${assignment.active_submission.id}/autosave`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        content: content,
                        content_format: 'markdown',
                        autosave: true
                    })
                })
                if (res.ok) {
                    setLastSaved(new Date())
                }
            } catch (error) {
                console.error("Autosave failed", error)
            } finally {
                setAutosaving(false)
            }
        }, 3000) // 3 second debounce

        return () => clearTimeout(timer)
    }, [content, assignment?.active_submission?.id])

    if (loading) return <div className="p-12 text-center text-slate-400 font-mono text-xl animate-pulse">Initializing Response Area...</div>
    if (!assignment) return <div className="p-12 text-center text-red-400">Assignment Not Found</div>

    const displayName = prisonerDetails ? `${prisonerDetails.first_name || ''} ${prisonerDetails.last_name || ''}`.trim() : assignment.prisoner_cpid

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <button
                onClick={() => navigate('/inbox')}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors text-sm font-mono uppercase tracking-tighter"
            >
                <ArrowLeft className="w-4 h-4" />
                Return to Work Queue
            </button>

            {/* REVISION FEEDBACK BANNER */}
            {assignment.active_submission?.status === 'revisions_requested' && (
                <div className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-xl flex items-start gap-4 animate-in slide-in-from-top-2">
                    <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-orange-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                            Action Required: Revisions Requested
                        </h3>
                        <p className="text-slate-300 mt-1 text-sm leading-relaxed">
                            {assignment.active_submission.revision_comment || "No specific feedback provided. Please review the facility guidelines and resubmit."}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between bg-slate-800/80 p-6 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white shrink-0">
                        <User className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                            {displayName}
                            <div className="flex flex-wrap gap-2">
                                <span className="text-[10px] font-mono px-2 py-1 bg-slate-900 rounded-md text-cyan-400 border border-cyan-500/20" title="Archive CPID">
                                    REF: {prisonerDetails?.cpid || assignment.prisoner_cpid}
                                </span>
                                {prisonerDetails?.cdcr_number && prisonerDetails.cdcr_number !== (prisonerDetails?.cpid || assignment.prisoner_cpid) && (
                                    <span className="text-[10px] font-mono px-2 py-1 bg-slate-900/50 rounded-md text-slate-400 border border-slate-700" title="CDCR Number">
                                        CDCR: {prisonerDetails.cdcr_number}
                                    </span>
                                )}
                            </div>
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-slate-400">
                            <span className="flex items-center gap-1.5 text-sm uppercase tracking-wider font-semibold">
                                <Building2 className="w-3.5 h-3.5 text-slate-500" /> {prisonerDetails?.facility || 'Unknown Facility'}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="flex items-center gap-1.5 text-sm uppercase tracking-wider font-semibold">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" /> {prisonerDetails?.housing || 'Housing TBD'}
                            </span>

                            {/* Autosave Status Indicator */}
                            <span className="text-xs font-mono text-slate-600 ml-4 flex items-center gap-2">
                                {autosaving ? (
                                    <span className="text-cyan-500 animate-pulse">Syncing...</span>
                                ) : lastSaved ? (
                                    <span className="text-emerald-600">Autosaved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                ) : null}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        className="px-5 py-2.5 text-slate-300 hover:bg-slate-700 rounded-xl transition-all flex items-center gap-2 border border-slate-700"
                        disabled={saving || pdfUrl}
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    {(!pdfUrl && !envelopeUrl) ? (
                        <button
                            onClick={() => handleSave(true)}
                            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center gap-2 font-bold"
                            disabled={saving || generating}
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Finalize & Archive
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20">
                            <span className="text-[10px] text-emerald-400 font-bold px-3 uppercase tracking-widest hidden md:block">Finished</span>
                            {pdfUrl && (
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg flex items-center gap-2 text-sm font-bold"
                                >
                                    <FileText className="w-4 h-4" /> Letter PDF
                                </a>
                            )}
                            {envelopeUrl && (
                                <a
                                    href={envelopeUrl}
                                    target="_blank"
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-all shadow-lg flex items-center gap-2 text-sm font-bold"
                                >
                                    <Mail className="w-4 h-4" /> Envelope
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700 w-fit">
                {[
                    { id: 'compose', label: 'Compose', icon: <Mail className="w-4 h-4" /> },
                    { id: 'library', label: 'Reference Hub', icon: <Library className="w-4 h-4" /> },
                    { id: 'source', label: 'Incoming Letter', icon: <FileText className="w-4 h-4" /> }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-cyan-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* FULL-WIDTH WORKSPACE AREA */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 min-h-[700px] shadow-2xl overflow-hidden mb-20 flex flex-col">
                {activeTab === 'compose' && (
                    <div className="flex flex-col h-full min-h-[700px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="p-5 bg-slate-900/80 border-b border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Response Composer</span>
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`ml-4 px-3 py-1 rounded text-[10px] uppercase font-bold tracking-tighter transition-all border ${showPreview ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                                >
                                    {showPreview ? 'Edit Source' : 'Check Preview'}
                                </button>
                            </div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-slate-950/50 px-4 py-1.5 rounded-lg border border-slate-700/50 text-xs text-slate-300 focus:border-cyan-500/50 outline-none text-right font-mono w-96 transition-all"
                                placeholder="Response Title"
                            />
                        </div>

                        <div className="flex flex-1 min-h-[600px]">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Share your thoughts here... Use markdown for formatting."
                                className={`flex-1 p-10 bg-transparent text-slate-100 font-sans text-2xl leading-relaxed outline-none resize-none placeholder:text-slate-700 transition-all ${showPreview ? 'border-r border-slate-700' : ''}`}
                            />
                            {showPreview && (
                                <div className="flex-1 p-10 bg-slate-900/10 overflow-auto prose prose-invert prose-2xl max-w-none">
                                    <div
                                        className="font-serif text-slate-200 leading-relaxed whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) || "Nothing to preview yet." }}
                                    />
                                    <div className="mt-8 pt-8 border-t border-slate-800 text-slate-600 text-[10px] uppercase font-mono tracking-widest italic">
                                        Live Digital Simulation
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-between items-center px-8 text-[10px] font-mono uppercase tracking-widest">
                            <div className="flex items-center gap-6 text-slate-500">
                                <span className="flex items-center gap-1.5"><Save className="w-3 h-3" /> Secure Draft Active</span>
                                <span className="text-amber-500/80 border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 rounded italic">
                                    Note: Rendering may vary. Proofread carefully before printing.
                                </span>
                            </div>
                            <div className="text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                                {content.split(/\s+/).filter(Boolean).length} words / {content.length} characters
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'library' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
                        <ReferenceLibrary
                            initialCpid={prisonerDetails?.cpid || assignment.prisoner_cpid}
                            ocrText={assignment.letter?.latest_version?.content}
                            onInsert={(text) => {
                                setContent(prev => prev + '\n\n' + text)
                                setActiveTab('compose')
                            }}
                            workbenchState={{
                                currQueue, setCurrQueue,
                                histQueue, setHistQueue,
                                activeQueuePath, setActiveQueuePath,
                                previewContent, setPreviewContent
                            }}
                        />
                    </div>
                )}

                {activeTab === 'source' && (
                    <div className="flex h-full min-h-[700px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Left Side: Original Scan (Bigger) */}
                        <div className="w-2/3 border-r border-slate-700 bg-slate-950 p-6 flex items-start justify-center overflow-y-auto">
                            <div className="w-full">
                                <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <ImageIcon className="w-3 h-3" /> Original Scan Artifact
                                </div>
                                <img
                                    src={getImageUrl(assignment.letter?.original_file_path)}
                                    className="w-full h-auto rounded-lg shadow-2xl border border-slate-800 object-contain"
                                    alt="Incoming Letter"
                                />
                            </div>
                        </div>

                        {/* Right Side: Transcription (Smaller Sidebar) */}
                        <div className="w-1/3 bg-slate-900/30 p-8 overflow-y-auto">
                            <div className="mb-8 flex items-center gap-4 p-4 bg-slate-900/80 rounded-xl border border-slate-700 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                                <FileText className="w-4 h-4 text-amber-500" />
                                <span>OCR Reconstruction</span>
                            </div>
                            <div className="font-mono text-sm leading-relaxed text-slate-400 whitespace-pre-wrap select-all px-4">
                                {assignment.letter?.latest_version?.content || "No transcription data available for this record."}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
