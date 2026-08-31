import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { UploadCloud, Loader2, ArrowLeft, FolderCheck, Camera, FileUp, X, Pencil, ShieldAlert, ShieldCheck, AlertTriangle, FolderTree, Languages, Download } from 'lucide-react'
import { RedactionCaptureStage } from '../components/RedactionCaptureStage'
import { PageRedactionEditor } from '../components/PageRedactionEditor'

// Redacts letter content pages (webcam or an uploaded image, crop + draggable
// black-box masks burned into the canvas before anything leaves the browser)
// and uploads the result to the sponsor's OneDrive folder via the existing
// upload-redacted endpoint. Reuses ScantronStation.jsx's capture mechanism
// through the extracted RedactionCaptureStage component -- see that file's
// header comment for why it's a separate copy rather than a shared refactor
// of the already-verified envelope-scan flow.
//
// A plain "already redacted file" upload mode is kept alongside Capture mode
// for PDFs and anything redacted outside the app -- the capture stage only
// ever produces JPEG pages, since it works off a live camera frame or a
// browser-decoded image.
export function ScanLetterUpload() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [mode, setMode] = useState('capture') // 'capture' | 'file'

    const [capturedPages, setCapturedPages] = useState([]) // [{ id, dataUrl, redacted }]
    const [files, setFiles] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null) // { ok: bool, message, folder_path? }
    const [editingPageId, setEditingPageId] = useState(null)
    const [showConfirmModal, setShowConfirmModal] = useState(false)
    const [preview, setPreview] = useState(null) // resolved destination from the backend, shown for verification before upload
    const [previewLoading, setPreviewLoading] = useState(false)
    const [exchangeInput, setExchangeInput] = useState('') // editable copy of preview.exchange_label -- the auto-guess is per-sponsee unreliable (see LetterService.resolve_upload_destination), so it must be correctable, not just displayed
    const [rechecking, setRechecking] = useState(false)
    const [sponsors, setSponsors] = useState([]) // real Sponsor directory, for the override dropdown
    const [sponsorIdInput, setSponsorIdInput] = useState('') // '' = no override, use prisoner.sponsor_name's automatic match
    const [previewError, setPreviewError] = useState(null) // shown inside the modal when resolution fails -- e.g. a mismatched sponsor_name (see the FON949/"Matt" vs "Matt E" incident, 30Aug2026)

    // Spanish-language letter workflow, added 31Aug2026. Opt-in (an explicit
    // button), not automatic on every capture -- most letters are English
    // and OCR+translate is real compute time on the local Ollama model.
    // Scoped to capturedPages only (not file-mode uploads) -- the main real
    // use case is a physical letter under the webcam, same as everywhere
    // else in this screen.
    const [translating, setTranslating] = useState(false)
    const [translations, setTranslations] = useState({}) // { [pageId]: { original_text, translation, detected_language, confidence } }
    const [downloadingDraft, setDownloadingDraft] = useState(false)
    const [correctedTranslationFile, setCorrectedTranslationFile] = useState(null) // set once a reviewer's corrected .docx is picked back in

    useEffect(() => {
        fetch('/api/sponsor-directory', { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => setSponsors(data || []))
            .catch(() => {})
    }, [])

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
    })

    const addCapturedPage = (dataUrl) => {
        // redacted starts false -- RedactionCaptureStage's masks are added
        // before capture, but since holding a handheld camera makes that
        // impractical in practice, most real pages land here unredacted and
        // get fixed up via the post-capture editor instead. The badge below
        // exists so an unredacted page never silently slips through to
        // upload unnoticed.
        setCapturedPages(prev => [...prev, { id: Date.now(), dataUrl, redacted: false }])
    }

    const removeCapturedPage = (pageId) => {
        setCapturedPages(prev => prev.filter(p => p.id !== pageId))
    }

    const savePageRedaction = (pageId, newDataUrl) => {
        setCapturedPages(prev => prev.map(p => p.id === pageId ? { ...p, dataUrl: newDataUrl, redacted: true } : p))
        setEditingPageId(null)
    }

    const editingPage = capturedPages.find(p => p.id === editingPageId) || null
    const unredactedCount = capturedPages.filter(p => !p.redacted).length

    const totalCount = capturedPages.length + files.length

    // Runs OCR+translate on every captured page, local-only (see
    // OCRService.translate_image) -- a first-pass draft, always shown
    // editable, never sent anywhere until either corrected inline or
    // round-tripped through a bilingual reviewer outside the app.
    const translatePages = async () => {
        if (capturedPages.length === 0) return
        setTranslating(true)
        try {
            const results = await Promise.all(capturedPages.map(async (p) => {
                const res = await fetch('/api/letters/translate-page', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ image_data: p.dataUrl }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.detail || `Translation failed (${res.status})`)
                return [p.id, data]
            }))
            setTranslations(prev => ({ ...prev, ...Object.fromEntries(results) }))
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setTranslating(false)
        }
    }

    const setTranslationField = (pageId, field) => (e) => {
        setTranslations(prev => ({ ...prev, [pageId]: { ...prev[pageId], [field]: e.target.value } }))
    }

    // Bundles the current draft translations into a downloadable .docx,
    // clearly labeled as needing review -- meant to be sent to a bilingual
    // reviewer OUTSIDE the app (email/text), corrected, then picked back in
    // via the file input below (no in-app reviewer role, 31Aug2026 decision).
    const downloadTranslationDraft = async () => {
        setDownloadingDraft(true)
        try {
            const pages = capturedPages
                .filter(p => translations[p.id])
                .map(p => translations[p.id])
            const res = await fetch('/api/letters/translation-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ pages }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.detail || `Could not build draft (${res.status})`)
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'translation_draft_for_review.docx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setDownloadingDraft(false)
        }
    }

    // Single fetch path for both the initial destination check and any
    // manual recheck against a corrected exchange number / sponsor -- always
    // opens the modal, success or failure, so a failed resolution (e.g. a
    // mismatched sponsor_name, the real FON949/"Matt" vs "Matt E" incident,
    // 30Aug2026) isn't a dead-end error banner but a recoverable state with
    // the sponsor picker right there.
    const fetchPreview = async ({ exchangeOverride, sponsorIdOverride } = {}) => {
        const params = new URLSearchParams()
        if (exchangeOverride) params.set('exchange_override', exchangeOverride)
        if (sponsorIdOverride) params.set('sponsor_id_override', sponsorIdOverride)
        const qs = params.toString()
        const res = await fetch(`/api/letters/${id}/upload-preview${qs ? `?${qs}` : ''}`, { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || `Could not resolve destination (${res.status})`)
        return data
    }

    const requestSubmit = async () => {
        if (totalCount === 0) return
        // Always confirm the resolved destination before uploading, not just
        // when a page is unredacted -- the folder path is computed from
        // database state (sponsor_name lookup, letter_exchange_count) that's
        // usually right but isn't guaranteed to be (this exact upload hit a
        // real intro/exchange numbering bug earlier the same day). Fetching
        // a read-only preview and showing it, rather than trusting the
        // frontend's own guess, means what's confirmed is what the backend
        // will actually do. In-app modal, not window.confirm() -- matches
        // the rest of the app's convention (see ScantronStation.jsx's
        // exchange-count note) of not using native browser dialogs for
        // anything the operator needs to actually read.
        setPreviewLoading(true)
        setResult(null)
        setPreviewError(null)
        try {
            const data = await fetchPreview()
            setPreview(data)
            setExchangeInput(data.exchange_label)
            setSponsorIdInput('')
            setShowConfirmModal(true)
        } catch (err) {
            // Resolution failed before any destination could be shown at all
            // (e.g. no sponsor_name assigned, or no matching Sponsor row) --
            // still open the modal so the sponsor picker is available to fix
            // it, rather than leaving the operator at a dead end.
            setPreview(null)
            setPreviewError(err.message)
            setSponsorIdInput('')
            setShowConfirmModal(true)
        } finally {
            setPreviewLoading(false)
        }
    }

    // Re-resolves the destination against a corrected exchange number and/or
    // a manually picked sponsor, so what's confirmed on screen (folder path,
    // reply filename) reflects the actual override rather than the original
    // auto-guess or a broken automatic sponsor match.
    const recheckDestination = async () => {
        setRechecking(true)
        setPreviewError(null)
        try {
            const data = await fetchPreview({
                exchangeOverride: exchangeInput,
                sponsorIdOverride: sponsorIdInput || undefined,
            })
            setPreview(data)
        } catch (err) {
            setPreview(null)
            setPreviewError(err.message)
        } finally {
            setRechecking(false)
        }
    }

    const doUpload = async () => {
        setShowConfirmModal(false)
        setSubmitting(true)
        setResult(null)
        try {
            const capturedEncoded = capturedPages.map((p, i) => ({
                filename: `page${i + 1}.jpg`,
                content_base64: p.dataUrl.split(',')[1],
            }))
            const filesEncoded = await Promise.all(files.map(async (f) => ({
                filename: f.name,
                content_base64: await fileToBase64(f),
            })))

            // Translation file, if any -- prefers a corrected file picked
            // back in from a bilingual reviewer over the raw draft, since
            // the draft is explicitly a first pass, not meant to reach a
            // sponsor unreviewed if review was actually requested.
            let translationEncoded = []
            const translatedPageCount = Object.keys(translations).length
            const cpidForFilename = preview?.cpid || id
            const exchangeForFilename = exchangeInput || 'draft'
            if (correctedTranslationFile) {
                translationEncoded = [{
                    filename: `${cpidForFilename}_${exchangeForFilename}_translation.docx`,
                    content_base64: await fileToBase64(correctedTranslationFile),
                }]
            } else if (translatedPageCount > 0) {
                const pages = capturedPages.filter(p => translations[p.id]).map(p => translations[p.id])
                const docxRes = await fetch('/api/letters/translation-docx', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ pages }),
                })
                if (!docxRes.ok) throw new Error(`Could not build translation file (${docxRes.status})`)
                const docxBlob = await docxRes.blob()
                const docxBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result.split(',')[1])
                    reader.onerror = reject
                    reader.readAsDataURL(docxBlob)
                })
                translationEncoded = [{
                    filename: `${cpidForFilename}_${exchangeForFilename}_translation.docx`,
                    content_base64: docxBase64,
                }]
            }

            const res = await fetch(`/api/letters/${id}/upload-redacted`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    files: [...capturedEncoded, ...filesEncoded, ...translationEncoded],
                    exchange_override: exchangeInput,
                    sponsor_id_override: sponsorIdInput || null,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Upload failed (${res.status})`)
            setResult({ ok: true, message: 'Uploaded successfully.', folder_path: data.folder_path })
            setCapturedPages([])
            setFiles([])
            setTranslations({})
            setCorrectedTranslationFile(null)
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <button
                onClick={() => navigate('/letters')}
                className="flex items-center gap-2 text-calpop-navy hover:text-calpop-ink transition-colors text-sm"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Letters
            </button>

            <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm p-6">
                <h2 className="text-xl font-bold text-calpop-ink mb-1">Scan Letter — Redact & Upload</h2>
                <p className="text-calpop-navy text-sm mb-6">
                    Letter #{id}. Redact each page of the incoming letter before it goes to the sponsor.
                    A blank reply doc is added to the same OneDrive folder automatically.
                </p>

                <div className="flex gap-2 mb-6 border-b border-calpop-navy/15">
                    <button
                        onClick={() => setMode('capture')}
                        className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                            mode === 'capture' ? 'border-calpop-blue text-calpop-blue' : 'border-transparent text-calpop-navy hover:text-calpop-ink'
                        }`}
                    >
                        <Camera className="w-4 h-4" /> Capture & Redact
                    </button>
                    <button
                        onClick={() => setMode('file')}
                        className={`px-4 py-2 text-sm font-bold flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                            mode === 'file' ? 'border-calpop-blue text-calpop-blue' : 'border-transparent text-calpop-navy hover:text-calpop-ink'
                        }`}
                    >
                        <FileUp className="w-4 h-4" /> Upload Already-Redacted File
                    </button>
                </div>

                {result && (
                    <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                        {result.ok && <FolderCheck className="w-4 h-4 inline mr-2 -mt-1" />}
                        {result.message}
                        {result.folder_path && (
                            <div className="mt-1 font-mono text-xs opacity-80 break-all">{result.folder_path}</div>
                        )}
                    </div>
                )}

                {mode === 'capture' ? (
                    <div className="space-y-6">
                        <RedactionCaptureStage onCapture={addCapturedPage} />

                        {capturedPages.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold text-calpop-navy uppercase tracking-widest">
                                        Captured Pages ({capturedPages.length})
                                    </h4>
                                    {unredactedCount > 0 && (
                                        <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                                            <ShieldAlert className="w-3.5 h-3.5" /> {unredactedCount} not yet redacted
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {capturedPages.map((p, i) => (
                                        <div key={p.id} className="relative w-28 group">
                                            <img
                                                src={p.dataUrl}
                                                alt={`Page ${i + 1}`}
                                                className={`w-28 h-36 object-cover rounded-lg border shadow-sm ${p.redacted ? 'border-calpop-navy/15' : 'border-red-400'}`}
                                            />
                                            <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                                                {i + 1}
                                            </div>
                                            <div className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                                                p.redacted ? 'bg-calpop-olive/90 text-white' : 'bg-red-600/90 text-white'
                                            }`}>
                                                {p.redacted ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                                                {p.redacted ? 'Redacted' : 'Not redacted'}
                                            </div>
                                            <button
                                                onClick={() => setEditingPageId(p.id)}
                                                className="absolute -bottom-2 -right-2 bg-calpop-blue text-white rounded-full p-1.5 shadow-lg hover:brightness-95"
                                                title="Redact this page"
                                            >
                                                <Pencil className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => removeCapturedPage(p.id)}
                                                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-500"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {capturedPages.length > 0 && (
                            <div className="border-t border-calpop-navy/10 pt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold text-calpop-navy uppercase tracking-widest flex items-center gap-2">
                                        <Languages className="w-3.5 h-3.5" /> Translation (optional — Spanish-language letters)
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={translatePages}
                                        disabled={translating}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-blue border border-calpop-blue/30 hover:bg-calpop-blue/10 disabled:opacity-40 flex items-center gap-1.5"
                                    >
                                        {translating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        {translating ? 'Translating…' : 'Translate Pages'}
                                    </button>
                                </div>

                                {Object.keys(translations).length > 0 && (
                                    <div className="space-y-3">
                                        {capturedPages.map((p, i) => translations[p.id] && (
                                            <div key={p.id} className="bg-calpop-bg border border-calpop-navy/15 rounded-lg p-3">
                                                <div className="text-xs font-bold text-calpop-ink mb-2">
                                                    Page {i + 1}
                                                    {translations[p.id].detected_language && (
                                                        <span className="text-calpop-navy font-normal"> — detected: {translations[p.id].detected_language}</span>
                                                    )}
                                                </div>
                                                <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">Original</label>
                                                <textarea
                                                    value={translations[p.id].original_text || ''}
                                                    onChange={setTranslationField(p.id, 'original_text')}
                                                    className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-y mb-2"
                                                />
                                                <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">Draft English Translation — editable</label>
                                                <textarea
                                                    value={translations[p.id].translation || ''}
                                                    onChange={setTranslationField(p.id, 'translation')}
                                                    className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-y"
                                                />
                                            </div>
                                        ))}

                                        <div className="flex items-center gap-3 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={downloadTranslationDraft}
                                                disabled={downloadingDraft}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-bg disabled:opacity-40 flex items-center gap-1.5"
                                            >
                                                {downloadingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                Download for Review (.docx)
                                            </button>
                                            <label className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-bg cursor-pointer">
                                                Upload Corrected Translation
                                                <input
                                                    type="file"
                                                    accept=".docx"
                                                    className="hidden"
                                                    onChange={e => setCorrectedTranslationFile(e.target.files[0] || null)}
                                                />
                                            </label>
                                            {correctedTranslationFile && (
                                                <span className="text-xs text-calpop-olive font-bold flex items-center gap-1">
                                                    <ShieldCheck className="w-3.5 h-3.5" /> {correctedTranslationFile.name} will be used instead of the draft
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-calpop-navy italic mt-2">
                                            Send the downloaded draft to your bilingual reviewer however you normally reach them.
                                            Once corrected, upload their version above — otherwise the edited draft here is used as-is.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-calpop-navy/25 rounded-lg py-10 cursor-pointer hover:border-calpop-blue transition-colors mb-4">
                            <UploadCloud className="w-8 h-8 text-calpop-navy" />
                            <span className="text-sm text-calpop-navy">
                                {files.length > 0 ? `${files.length} file(s) selected` : 'Click to choose redacted file(s)'}
                            </span>
                            <input
                                type="file"
                                multiple
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={e => setFiles(Array.from(e.target.files))}
                            />
                        </label>

                        {files.length > 0 && (
                            <ul className="text-xs text-calpop-navy mb-4 list-disc list-inside">
                                {files.map((f, i) => <li key={i}>{f.name}</li>)}
                            </ul>
                        )}
                    </>
                )}

                <button
                    onClick={requestSubmit}
                    disabled={submitting || previewLoading || totalCount === 0}
                    className={`w-full mt-6 px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${(submitting || previewLoading || totalCount === 0) ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
                >
                    {(submitting || previewLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Uploading...' : previewLoading ? 'Checking destination...' : `Upload ${totalCount > 0 ? `${totalCount} Page(s) ` : ''}to Sponsor OneDrive`}
                </button>
            </div>

            {editingPage && (
                <PageRedactionEditor
                    imageDataUrl={editingPage.dataUrl}
                    onSave={(newDataUrl) => savePageRedaction(editingPage.id, newDataUrl)}
                    onCancel={() => setEditingPageId(null)}
                />
            )}

            {showConfirmModal && (() => {
                // Whatever's selected in the dropdown right now, resolved to a
                // display name -- used both for the "(corrected)" label and to
                // detect whether Recheck has anything new to do.
                const selectedSponsor = sponsors.find(s => String(s.id) === String(sponsorIdInput))
                const sponsorChanged = preview
                    ? (sponsorIdInput ? Number(sponsorIdInput) !== preview.sponsor_id : false)
                    : !!sponsorIdInput
                const exchangeChanged = preview ? exchangeInput !== preview.exchange_label : !!exchangeInput
                const hasUnrecheckedChanges = sponsorChanged || exchangeChanged

                return (
                <div className="fixed inset-0 z-[130] bg-calpop-navy/70 flex items-center justify-center p-6 backdrop-blur-sm">
                    <div className="bg-white border border-calpop-navy/15 rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-5">
                        <div className="flex items-center gap-3 text-calpop-ink">
                            <FolderTree className="w-8 h-8 shrink-0 text-calpop-blue" />
                            <h3 className="text-lg font-bold">Confirm Upload Destination</h3>
                        </div>

                        <p className="text-xs text-calpop-navy">
                            Resolved from current database records (sponsor assignment, letters
                            received count) — usually right, but verify before sending to a real sponsor.
                        </p>

                        {previewError && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-red-700 leading-relaxed">{previewError}</p>
                            </div>
                        )}

                        <div className="bg-calpop-bg border border-calpop-navy/15 rounded-lg p-4 text-sm space-y-1.5 font-mono">
                            <div>
                                <span className="text-calpop-navy">Prisoner:</span>{' '}
                                <span className="text-calpop-ink font-bold">{preview?.cpid || id}</span>
                            </div>

                            <div>
                                <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1 not-italic">
                                    Sponsor {preview?.sponsor_id_is_override ? '(corrected)' : preview ? '(from record)' : ''}
                                </label>
                                <select
                                    value={sponsorIdInput}
                                    onChange={(e) => setSponsorIdInput(e.target.value)}
                                    className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none"
                                >
                                    <option value="">
                                        {preview ? `Use match: ${preview.sponsor_name} (${preview.sponsor_pseudonym})` : 'Use automatic match (currently failing)'}
                                    </option>
                                    {sponsors.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.pseudonym || 'no pseudonym'})</option>
                                    ))}
                                </select>
                            </div>

                            {preview && (
                                <>
                                    <div><span className="text-calpop-navy">Letters received (physical count):</span> <span className="text-calpop-ink font-bold">{preview.received_count}</span></div>

                                    <div className="pt-1 border-t border-calpop-navy/10 mt-2">
                                        <div className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest mb-1">
                                            Existing Folders on OneDrive
                                        </div>
                                        {preview.existing_folders.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {preview.existing_folders.map(name => (
                                                    <span key={name} className="bg-white border border-calpop-navy/15 rounded px-1.5 py-0.5 text-[11px] text-calpop-ink">
                                                        {name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-calpop-navy italic">None yet — this would be the first letter on file for this sponsee.</span>
                                        )}
                                    </div>
                                </>
                            )}

                            <div className="pt-2 border-t border-calpop-navy/10 mt-2 flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1 not-italic">
                                        Exchange folder {preview ? (preview.exchange_label_is_override ? '(corrected)' : '(auto-guess — verify)') : ''}
                                    </label>
                                    <input
                                        value={exchangeInput}
                                        onChange={(e) => setExchangeInput(e.target.value)}
                                        className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink font-mono text-sm focus:border-calpop-blue outline-none"
                                        placeholder='e.g. "5" or "intro"'
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={recheckDestination}
                                    disabled={rechecking || !hasUnrecheckedChanges}
                                    className="px-3 py-1.5 rounded text-xs font-bold text-calpop-blue border border-calpop-blue/30 hover:bg-calpop-blue/10 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {rechecking ? 'Checking…' : 'Recheck'}
                                </button>
                            </div>
                            {preview && <div className="pt-1 text-xs break-all">{preview.folder_path}</div>}
                        </div>

                        {preview && hasUnrecheckedChanges && (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800 leading-relaxed">
                                    {sponsorChanged ? 'Sponsor' : 'Exchange number'} changed but not rechecked yet — the path above is still
                                    for {sponsorChanged && selectedSponsor ? `"${preview.sponsor_name}"` : `"${preview.exchange_label}"`}. Click Recheck to confirm.
                                </p>
                            </div>
                        )}

                        {unredactedCount > 0 && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-red-700 leading-relaxed">
                                    {unredactedCount} page{unredactedCount === 1 ? '' : 's'} not marked as redacted.
                                    This may be fine — no PII on that page, or it's already physically
                                    covered with paper before scanning — but double check if unsure.
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-bg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={doUpload}
                                disabled={!preview || hasUnrecheckedChanges}
                                title={!preview ? 'Resolve the destination first' : hasUnrecheckedChanges ? 'Recheck your changes first' : undefined}
                                className={`flex-1 py-3 rounded-xl font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${unredactedCount > 0 ? 'bg-red-600 hover:brightness-95' : 'bg-calpop-accent hover:brightness-95'}`}
                            >
                                {unredactedCount > 0 ? 'Upload Anyway' : 'Confirm & Upload'}
                            </button>
                        </div>
                    </div>
                </div>
                )
            })()}
        </div>
    )
}
