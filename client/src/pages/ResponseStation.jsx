import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, Send, Loader2, Library, X, Mail, User, Building2, MapPin, FileText, Image as ImageIcon, Copy, Check } from 'lucide-react'
import ReferenceLibrary from '../components/ReferenceLibrary'

// Strips markdown syntax down to plain text, for cutting/pasting straight into Word.
const stripMarkdown = (text) => {
    if (!text) return "";
    return text
        .replace(/^#{1,6}\s+/gim, '')
        .replace(/\*\*\*(.*?)\*\*\*/gim, '$1')
        .replace(/\*\*(.*?)\*\*/gim, '$1')
        .replace(/\*(.*?)\*/gim, '$1')
        .replace(/^>\s?/gim, '')
        .replace(/^[\*\-]\s+/gim, '');
};

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
    const [localQueue, setLocalQueue] = useState([])
    const [transQueue, setTransQueue] = useState([])
    const [courseQueue, setCourseQueue] = useState([])
    const [activeQueuePath, setActiveQueuePath] = useState(null)
    const [previewContent, setPreviewContent] = useState({})

    const [pdfUrl, setPdfUrl] = useState(null)
    const [envelopeUrl, setEnvelopeUrl] = useState(null)
    const [copied, setCopied] = useState(false)

    const handleCopyClean = async () => {
        try {
            await navigator.clipboard.writeText(stripMarkdown(content))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            alert('Copy failed: ' + err.message)
        }
    }

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

    if (loading) return <div className="p-12 text-center text-calpop-navy font-mono text-xl animate-pulse">Initializing Response Area...</div>
    if (!assignment) return <div className="p-12 text-center text-red-400">Assignment Not Found</div>

    const displayName = prisonerDetails ? `${prisonerDetails.first_name || ''} ${prisonerDetails.last_name || ''}`.trim() : assignment.prisoner_cpid

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <button
                onClick={() => navigate('/inbox')}
                className="flex items-center gap-2 text-calpop-navy/70 hover:text-calpop-navy transition-colors text-sm font-mono uppercase tracking-tighter"
            >
                <ArrowLeft className="w-4 h-4" />
                Return to Work Queue
            </button>

            {/* REVISION FEEDBACK BANNER */}
            {assignment.active_submission?.status === 'revisions_requested' && (
                <div className="bg-calpop-accent/10 border border-calpop-accent/50 p-4 rounded-xl flex items-start gap-4 animate-in slide-in-from-top-2">
                    <div className="p-2 bg-calpop-accent/20 rounded-lg text-calpop-accent">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-calpop-accent font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                            Action Required: Revisions Requested
                        </h3>
                        <p className="text-calpop-navy mt-1 text-sm leading-relaxed">
                            {assignment.active_submission.revision_comment || "No specific feedback provided. Please review the facility guidelines and resubmit."}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-calpop-navy/15 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-calpop-blue to-calpop-navy rounded-xl flex items-center justify-center shadow-lg text-white shrink-0">
                        <User className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-calpop-ink flex items-center gap-3">
                            {displayName}
                            <div className="flex flex-wrap gap-2">
                                <span className="text-[10px] font-mono px-2 py-1 bg-calpop-panel rounded-md text-calpop-blue border border-calpop-blue/20" title="Archive CPID">
                                    REF: {prisonerDetails?.cpid || assignment.prisoner_cpid}
                                </span>
                                {prisonerDetails?.cdcr_number && prisonerDetails.cdcr_number !== (prisonerDetails?.cpid || assignment.prisoner_cpid) && (
                                    <span className="text-[10px] font-mono px-2 py-1 bg-calpop-panel rounded-md text-calpop-navy border border-calpop-navy/15" title="CDCR Number">
                                        CDCR: {prisonerDetails.cdcr_number}
                                    </span>
                                )}
                            </div>
                        </h2>
                        <div className="flex items-center gap-4 mt-1 text-calpop-navy">
                            <span className="flex items-center gap-1.5 text-sm uppercase tracking-wider font-semibold">
                                <Building2 className="w-3.5 h-3.5 text-calpop-navy/70" /> {prisonerDetails?.facility || 'Unknown Facility'}
                            </span>
                            <span className="text-calpop-navy/70">|</span>
                            <span className="flex items-center gap-1.5 text-sm uppercase tracking-wider font-semibold">
                                <MapPin className="w-3.5 h-3.5 text-calpop-navy/70" /> {prisonerDetails?.housing || 'Housing TBD'}
                            </span>

                            {/* Autosave Status Indicator */}
                            <span className="text-xs font-mono text-calpop-navy/70 ml-4 flex items-center gap-2">
                                {autosaving ? (
                                    <span className="text-calpop-blue animate-pulse">Syncing...</span>
                                ) : lastSaved ? (
                                    <span className="text-calpop-olive">Autosaved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                ) : null}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        className="px-5 py-2.5 text-calpop-navy hover:bg-calpop-panel rounded-xl transition-all flex items-center gap-2 border border-calpop-navy/15"
                        disabled={saving || pdfUrl}
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    {(!pdfUrl && !envelopeUrl) ? (
                        <button
                            onClick={() => handleSave(true)}
                            className="px-6 py-2.5 bg-calpop-blue hover:bg-calpop-navy text-white rounded-xl transition-all shadow-lg flex items-center gap-2 font-bold"
                            disabled={saving || generating}
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Finalize & Archive
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-calpop-olive/10 p-1.5 rounded-xl border border-calpop-olive/20">
                            <span className="text-[10px] text-calpop-olive font-bold px-3 uppercase tracking-widest hidden md:block">Finished</span>
                            {pdfUrl && (
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    className="px-4 py-2 bg-calpop-blue hover:bg-calpop-navy text-white rounded-lg transition-all shadow-lg flex items-center gap-2 text-sm font-bold"
                                >
                                    <FileText className="w-4 h-4" /> Letter PDF
                                </a>
                            )}
                            {envelopeUrl && (
                                <a
                                    href={envelopeUrl}
                                    target="_blank"
                                    className="px-4 py-2 bg-calpop-accent hover:bg-[#d9662f] text-white rounded-lg transition-all shadow-lg flex items-center gap-2 text-sm font-bold"
                                >
                                    <Mail className="w-4 h-4" /> Envelope
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex bg-white p-1 rounded-xl border border-calpop-navy/15 w-fit">
                {[
                    { id: 'compose', label: 'Compose', icon: <Mail className="w-4 h-4" /> },
                    { id: 'library', label: 'Reference Hub', icon: <Library className="w-4 h-4" /> },
                    { id: 'source', label: 'Incoming Letter', icon: <FileText className="w-4 h-4" />, badge: !assignment.letter?.original_file_path ? 'No scan' : null }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-calpop-blue text-white shadow-lg'
                            : 'text-calpop-navy hover:text-calpop-ink hover:bg-calpop-panel'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-calpop-navy/10 text-calpop-navy/70 font-normal normal-case">
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* FULL-WIDTH WORKSPACE AREA */}
            <div className="bg-white rounded-2xl border border-calpop-navy/15 min-h-[700px] shadow-2xl overflow-hidden mb-20 flex flex-col">
                {activeTab === 'compose' && (
                    <div className="flex flex-col h-full min-h-[700px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="p-5 bg-calpop-panel border-b border-calpop-navy/15 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-calpop-blue animate-pulse"></div>
                                <span className="text-xs font-bold uppercase tracking-widest text-calpop-blue">Response Composer</span>
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`ml-4 px-3 py-1 rounded text-[10px] uppercase font-bold tracking-tighter transition-all border ${showPreview ? 'bg-calpop-blue border-calpop-blue text-white' : 'bg-white border-calpop-navy/15 text-calpop-navy/70 hover:text-calpop-navy'}`}
                                >
                                    {showPreview ? 'Edit Source' : 'Check Preview'}
                                </button>
                                <button
                                    onClick={handleCopyClean}
                                    disabled={!content}
                                    className={`px-3 py-1 rounded text-[10px] uppercase font-bold tracking-tighter transition-all border flex items-center gap-1.5 disabled:opacity-30 ${copied ? 'bg-calpop-olive border-calpop-olive text-white' : 'bg-white border-calpop-navy/15 text-calpop-navy/70 hover:text-calpop-navy'}`}
                                    title="Copy plain text (markdown symbols stripped) for pasting into Word"
                                >
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copied ? 'Copied' : 'Copy Clean Text'}
                                </button>
                            </div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-white px-4 py-1.5 rounded-lg border border-calpop-navy/15 text-xs text-calpop-navy focus:border-calpop-blue outline-none text-right font-mono w-96 transition-all"
                                placeholder="Response Title"
                            />
                        </div>

                        <div className="flex flex-1 min-h-[600px]">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Share your thoughts here... Use markdown for formatting."
                                className={`flex-1 p-10 bg-transparent text-calpop-ink font-sans text-2xl leading-relaxed outline-none resize-none placeholder:text-calpop-navy/70 transition-all ${showPreview ? 'border-r border-calpop-navy/15' : ''}`}
                            />
                            {showPreview && (
                                <div className="flex-1 p-10 bg-calpop-panel overflow-auto prose prose-2xl max-w-none">
                                    <div
                                        className="font-serif text-calpop-ink leading-relaxed whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) || "Nothing to preview yet." }}
                                    />
                                    <div className="mt-8 pt-8 border-t border-calpop-navy/10 text-calpop-navy/70 text-[10px] uppercase font-mono tracking-widest italic">
                                        Live Digital Simulation
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-calpop-panel border-t border-calpop-navy/15 flex justify-between items-center px-8 text-[10px] font-mono uppercase tracking-widest">
                            <div className="flex items-center gap-6 text-calpop-navy/70">
                                <span className="flex items-center gap-1.5"><Save className="w-3 h-3" /> Secure Draft Active</span>
                                <span className="text-calpop-accent border border-calpop-accent/20 bg-calpop-accent/10 px-2 py-0.5 rounded italic">
                                    Note: Rendering may vary. Proofread carefully before printing.
                                </span>
                            </div>
                            <div className="text-calpop-navy bg-white px-3 py-1 rounded-full border border-calpop-navy/15">
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
                                localQueue, setLocalQueue,
                                transQueue, setTransQueue,
                                courseQueue, setCourseQueue,
                                activeQueuePath, setActiveQueuePath,
                                previewContent, setPreviewContent
                            }}
                        />
                    </div>
                )}

                {activeTab === 'source' && (
                    assignment.letter?.original_file_path ? (
                        <div className="flex h-full min-h-[700px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Left Side: Original Scan (Bigger) */}
                            <div className="w-2/3 border-r border-calpop-navy/15 bg-calpop-panel p-6 flex items-start justify-center overflow-y-auto">
                                <div className="w-full">
                                    <div className="mb-4 flex items-center gap-2 text-[10px] font-bold text-calpop-navy/70 uppercase tracking-widest">
                                        <ImageIcon className="w-3 h-3" /> Original Scan Artifact
                                    </div>
                                    <img
                                        src={getImageUrl(assignment.letter?.original_file_path)}
                                        className="w-full h-auto rounded-lg shadow-2xl border border-calpop-navy/15 object-contain"
                                        alt="Incoming Letter"
                                    />
                                </div>
                            </div>

                            {/* Right Side: Transcription (Smaller Sidebar) */}
                            <div className="w-1/3 bg-calpop-panel p-8 overflow-y-auto">
                                <div className="mb-8 flex items-center gap-4 p-4 bg-white rounded-xl border border-calpop-navy/15 font-mono text-[10px] text-calpop-navy/70 uppercase tracking-widest">
                                    <FileText className="w-4 h-4 text-calpop-accent" />
                                    <span>OCR Reconstruction</span>
                                </div>
                                <div className="font-mono text-sm leading-relaxed text-calpop-navy whitespace-pre-wrap select-all px-4">
                                    {assignment.letter?.latest_version?.content || "No transcription data available for this record."}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[700px] text-center px-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <ImageIcon className="w-10 h-10 text-calpop-navy/70 mb-4" />
                            <h3 className="text-calpop-navy font-bold uppercase tracking-wider text-sm mb-2">No Scan On File</h3>
                            <p className="text-calpop-navy/70 text-sm max-w-md leading-relaxed">
                                This letter wasn't digitized — write your response from the physical copy in hand.
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    )
}
