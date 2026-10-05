import { useState, useEffect, useRef } from 'react'
import { Languages, Loader2, Download, ShieldCheck, ArrowLeft, Maximize2, X, Pencil, ShieldAlert, ShieldCheck as ShieldCheckIcon, Cloud, CornerRightDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RedactionCaptureStage } from '../components/RedactionCaptureStage'
import { PageRedactionEditor } from '../components/PageRedactionEditor'
import { PrisonerCombobox } from '../components/PrisonerCombobox'

// Standalone translate-only tool, added 31Aug2026. Not part of the Letter
// Mgt scan/upload flow -- for the case Rey described: a letter from his own
// sponsee, in Spanish, that isn't going to a sponsor's OneDrive at all (no
// sponsor to upload to -- Rey IS the sponsor) and isn't being logged as a
// Letter record in Letter Mgt. Just capture -> translate -> read, nothing
// leaves the app. Reuses RedactionCaptureStage purely for its webcam/upload
// capture mechanism; redaction masks are optional for the local path (no
// export/upload happens either way) but REQUIRED for the Google Vision path
// added the same day -- see the redaction gate on translateAllCloud below.
export function TranslateLetter() {
    const navigate = useNavigate()
    const [pages, setPages] = useState([]) // [{ id, dataUrl, redacted }]
    const [editingPageId, setEditingPageId] = useState(null) // page currently open in PageRedactionEditor
    const [retakingPageId, setRetakingPageId] = useState(null) // page whose image the next capture should replace, not append (added 04Oct2026)
    const [translating, setTranslating] = useState(false)
    // { [pageId]: { local: {original_text, translation, detected_language, confidence} | null, google: {...} | null } }
    // Split into per-method slots 31Aug2026 at Rey's request -- previously
    // one shared slot per page meant running Google after Local silently
    // overwrote the local result with no way to get back to it without
    // re-running. Now both are kept; selectedMethod (below) just decides
    // which one is currently shown/edited.
    const [translations, setTranslations] = useState({})
    const [selectedMethod, setSelectedMethod] = useState({}) // { [pageId]: 'local' | 'google' } -- which slot is currently displayed/edited; set automatically to whichever method's Step 1 was most recently run for that page
    const [downloading, setDownloading] = useState(false)
    const [cpid, setCpid] = useState('') // optional -- files the saved translation into Reference Hub's per-CPID folder, matching History's convention
    const [savingToLibrary, setSavingToLibrary] = useState(false)
    const [savedToLibrary, setSavedToLibrary] = useState(null) // { filename, cpid } | null
    const [error, setError] = useState(null)
    const [viewingPageId, setViewingPageId] = useState(null) // page shown full-scale in the compare modal, so a bad transcription can be checked against the actual image detail rather than guessed at
    const [fullSizeZoom, setFullSizeZoom] = useState(false) // compare modal: false = fit-to-pane (correct aspect, whole page visible), true = native pixel size for close inspection
    const [elapsedSec, setElapsedSec] = useState(0) // translation is a slow local-model call (up to a few minutes) -- a visible timer beats a spinner that looks frozen with no feedback
    const [phases, setPhases] = useState({}) // { [pageId]: 'transcribing' | 'translating' } -- shows the two Ollama calls as genuinely distinct steps, not one opaque spinner
    const [currentAction, setCurrentAction] = useState('') // human label for the top "Working…" indicator -- which bulk action is running (was just "Working…" for all five, no way to tell OCR from translate from overlay)
    const panRef = useRef(null) // the scrollable image pane in the compare modal, for click-and-drag panning when zoomed to actual size
    const [overlayUrls, setOverlayUrls] = useState({}) // { [pageId]: data: URL of the composited PNG }
    const [overlayTexts, setOverlayTexts] = useState({}) // { [pageId]: { original_text, translation } } -- copy/paste source for replying to the sponsee
    const [copiedField, setCopiedField] = useState(null) // 'original' | 'translation' | null -- brief "Copied" feedback in the overlay modal
    const [viewingOverlayPageId, setViewingOverlayPageId] = useState(null)

    // Click-and-drag panning for the zoomed image -- a scrollbar alone isn't
    // an obvious way to move around a large, native-size image; grabbing and
    // dragging it (like a map) is the expected gesture. Plain <img> elements
    // don't support this natively (dragging one triggers the browser's own
    // "drag this image out" ghost instead), so it's wired up by hand here.
    const startPan = (e) => {
        const el = panRef.current
        if (!el) return
        const startX = e.clientX
        const startY = e.clientY
        const startScrollLeft = el.scrollLeft
        const startScrollTop = el.scrollTop
        const onMove = (mm) => {
            el.scrollLeft = startScrollLeft - (mm.clientX - startX)
            el.scrollTop = startScrollTop - (mm.clientY - startY)
        }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    // Custom vertical resize for the Original/Translation textareas below --
    // replaces the native CSS `resize` handle, which doesn't auto-scroll the
    // page as you drag past the viewport edge (a real browser limitation,
    // not something CSS can fix -- unlike text selection, native resize
    // handles just stop growing once your cursor leaves the window). Runs a
    // continuous requestAnimationFrame loop while dragging so the page keeps
    // scrolling smoothly the whole time the cursor sits near the top/bottom
    // edge, the same way drag-select already behaves.
    const startTextareaResize = (e, textareaEl) => {
        if (!textareaEl) return
        e.preventDefault()
        const startY = e.clientY
        const startHeight = textareaEl.offsetHeight
        const startScrollY = window.scrollY
        let lastClientY = startY
        let rafId = null

        const tick = () => {
            const edge = 60
            const maxSpeed = 6
            if (lastClientY > window.innerHeight - edge) {
                window.scrollBy(0, maxSpeed * (1 - (window.innerHeight - lastClientY) / edge))
            } else if (lastClientY < edge) {
                window.scrollBy(0, -maxSpeed * (1 - lastClientY / edge))
            }
            const scrolled = window.scrollY - startScrollY
            textareaEl.style.height = `${Math.max(64, startHeight + (lastClientY - startY) + scrolled)}px`
            rafId = requestAnimationFrame(tick)
        }

        const onMove = (mm) => { lastClientY = mm.clientY }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            if (rafId) cancelAnimationFrame(rafId)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        rafId = requestAnimationFrame(tick)
    }

    useEffect(() => {
        if (!translating) return
        setElapsedSec(0)
        const id = setInterval(() => setElapsedSec(s => s + 1), 1000)
        return () => clearInterval(id)
    }, [translating])

    const addPage = (dataUrl) => {
        setPages(prev => [...prev, { id: Date.now(), dataUrl, redacted: false }])
    }

    // Retake (added 04Oct2026, Rey processing a real letter): replaces a
    // specific page's image IN PLACE, preserving its position in the list --
    // previously the only option was remove + re-capture, which re-added
    // the replacement at the END of the list, reordering a multi-page
    // letter where physical page order matters. Stale per-page results tied
    // to the OLD image content are cleared, same fields removePage already
    // clears plus overlayUrls (a gap in removePage, not touched here since
    // that's a separate button's behavior).
    const replacePage = (pageId, newDataUrl) => {
        setPages(prev => prev.map(p => p.id === pageId ? { ...p, dataUrl: newDataUrl, redacted: false } : p))
        setTranslations(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        setSelectedMethod(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        setOverlayUrls(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        setRetakingPageId(null)
    }

    const removePage = (pageId) => {
        setPages(prev => prev.filter(p => p.id !== pageId))
        setTranslations(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
        setSelectedMethod(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
    }

    const savePageRedaction = (pageId, newDataUrl) => {
        setPages(prev => prev.map(p => p.id === pageId ? { ...p, dataUrl: newDataUrl, redacted: true } : p))
        setEditingPageId(null)
    }

    const editingPage = pages.find(p => p.id === editingPageId) || null

    // Transcribe and Translate are two separate, user-triggered steps (not
    // one auto-chained pipeline) -- deliberately, added 31Aug2026 at Rey's
    // request: translating a bad OCR transcription immediately just
    // translates the errors too. Splitting them means the Original box is
    // editable and actually gets edited before translation runs on it.
    const runTranscribePipeline = async (transcribeStep, phaseLabel, method) => {
        if (pages.length === 0) return
        setTranslating(true)
        setCurrentAction(phaseLabel)
        setError(null)
        try {
            for (const p of pages) {
                setPhases(prev => ({ ...prev, [p.id]: phaseLabel }))
                const tData = await transcribeStep(p)
                setTranslations(prev => ({
                    ...prev,
                    [p.id]: {
                        ...prev[p.id],
                        [method]: {
                            original_text: tData.original_text,
                            translation: prev[p.id]?.[method]?.translation || '',
                            detected_language: tData.detected_language,
                            confidence: tData.confidence,
                        },
                    },
                }))
                setSelectedMethod(prev => ({ ...prev, [p.id]: method }))
                setPhases(prev => ({ ...prev, [p.id]: null }))
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setTranslating(false)
            setPhases({})
        }
    }

    // Translates whatever is CURRENTLY in each page's Original box -- not
    // whatever transcribe originally produced -- so edits made there are
    // what actually gets translated. Splits on newlines for the line-array
    // APIs; blank lines are dropped since they carry nothing to translate.
    // Operates on the CURRENTLY SELECTED method's slot (selectedMethod) --
    // the translate engine (local/Google) doesn't have to match whichever
    // engine did the transcription; it just translates whatever's shown.
    const runTranslatePipeline = async (translateStep, phaseLabel) => {
        const eligible = pages.filter(p => translations[p.id]?.[selectedMethod[p.id]]?.original_text?.trim())
        if (eligible.length === 0) return
        setTranslating(true)
        setCurrentAction(phaseLabel)
        setError(null)
        try {
            for (const p of eligible) {
                const method = selectedMethod[p.id]
                const lines = translations[p.id][method].original_text.split('\n').filter(l => l.trim())
                if (lines.length === 0) continue
                setPhases(prev => ({ ...prev, [p.id]: phaseLabel }))
                const trData = await translateStep(lines)
                setTranslations(prev => ({
                    ...prev,
                    [p.id]: { ...prev[p.id], [method]: { ...prev[p.id][method], translation: trData.translation } },
                }))
                setPhases(prev => ({ ...prev, [p.id]: null }))
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setTranslating(false)
            setPhases({})
        }
    }

    // Local (Ollama) transcription. Pages run one at a time, not in
    // parallel -- Ollama processes one request at a time on this hardware
    // anyway, so parallel requests would just queue silently while making
    // per-page phase status meaningless.
    const transcribeAll = () => runTranscribePipeline(async (p) => {
        const res = await fetch('/api/letters/transcribe-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image_data: p.dataUrl }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || `Transcription failed (${res.status})`)
        return data
    }, 'transcribing', 'local')

    // Google Vision transcription -- opt-in, added 31Aug2026 after the
    // local model repeatedly misread a dense handwritten table (reading it
    // column-by-column instead of row-by-row). Hard-blocked client-side
    // unless every page has already been redacted (see the disabled state
    // on the button below); the backend independently refuses the request
    // too if redaction_confirmed isn't true, so this isn't just a UI-level
    // guard -- see /transcribe-page-cloud's docstring.
    const transcribeAllCloud = () => {
        if (pages.some(p => !p.redacted)) {
            setError('Redact every page first (pencil icon) before using Google Vision -- this app never sends unredacted letter content to a cloud service.')
            return
        }
        return runTranscribePipeline(async (p) => {
            const res = await fetch('/api/letters/transcribe-page-cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ image_data: p.dataUrl, redaction_confirmed: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Transcription failed (${res.status})`)
            return data
        }, 'transcribing-cloud', 'google')
    }

    // Local (Ollama) translation of whatever's currently in the Original box.
    const translateAll = () => runTranslatePipeline(async (lines) => {
        const res = await fetch('/api/letters/translate-lines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ lines }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || `Translation failed (${res.status})`)
        return data
    }, 'translating')

    // Google Cloud Translate -- added 31Aug2026 at Rey's request, so the
    // Google path can be used end-to-end (OCR + translation) instead of
    // handing off to the local model for this step. Same redaction gate as
    // the cloud transcribe step, even though this call is text-only.
    const translateAllCloud = () => {
        if (pages.some(p => !p.redacted)) {
            setError('Redact every page first (pencil icon) before using Google Translate -- this app never sends letter content to a cloud service from an unredacted page.')
            return
        }
        return runTranslatePipeline(async (lines) => {
            const res = await fetch('/api/letters/translate-lines-cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ lines, redaction_confirmed: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Translation failed (${res.status})`)
            return data
        }, 'translating-cloud')
    }

    // Image-overlay translation (added 31Aug2026) -- the real fix for the
    // formatting problems the flat-text pipeline above keeps hitting.
    // Detects text blocks with position and paints the translation back
    // onto the image in place, instead of ever linearizing into a
    // sequence -- same idea as the iPhone camera-translate overlay Rey
    // described. Google Vision + Translate only (no local equivalent --
    // Ollama's vision model has no bounding-box output), same redaction
    // gate as the other cloud paths.
    //
    // A third alternative to the Step 1/Step 2 split above, not a third
    // step -- one call does detection, translation, and compositing
    // together. Rey's call: put it in both button rows anyway, for the
    // same findability as Local/Google Vision/Google Translate, even
    // though it doesn't decompose into two steps the way they do. Runs
    // over all pages like the other bulk actions (not one page at a time),
    // and always regenerates -- no cache-and-reuse (a cached-result
    // shortcut here previously showed a stale overlay after a real backend
    // fix with no way to force a refresh short of losing the captured page).
    const fetchOverlayForPage = async (p) => {
        const res = await fetch('/api/letters/translate-overlay-cloud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image_data: p.dataUrl, redaction_confirmed: true }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || `Overlay translation failed (${res.status})`)
        setOverlayUrls(prev => ({ ...prev, [p.id]: `data:image/png;base64,${data.image_base64}` }))
        setOverlayTexts(prev => ({ ...prev, [p.id]: { original_text: data.original_text, translation: data.translation } }))
    }

    const overlayAllCloud = async () => {
        if (pages.length === 0) return
        if (pages.some(p => !p.redacted)) {
            setError('Redact every page first (pencil icon) before using the Google overlay -- this app never sends unredacted letter content to a cloud service.')
            return
        }
        setTranslating(true)
        setCurrentAction('overlay-cloud')
        setError(null)
        try {
            for (const p of pages) {
                setPhases(prev => ({ ...prev, [p.id]: 'overlay-cloud' }))
                await fetchOverlayForPage(p)
                setPhases(prev => ({ ...prev, [p.id]: null }))
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setTranslating(false)
            setPhases({})
        }
    }

    const setField = (pageId, field) => (e) => {
        const method = selectedMethod[pageId]
        setTranslations(prev => ({
            ...prev,
            [pageId]: { ...prev[pageId], [method]: { ...prev[pageId][method], [field]: e.target.value } },
        }))
    }

    // Falls back to the Overlay result when Step 1/2 were never run for this
    // page (a page translated via the bulk Overlay button alone has no entry
    // in `translations`, only in `overlayTexts`).
    const getPageDocContent = (p) => translations[p.id]?.[selectedMethod[p.id]] || overlayTexts[p.id] || null

    const downloadDocx = async () => {
        setDownloading(true)
        setError(null)
        try {
            const docPages = pages
                .filter(p => getPageDocContent(p))
                .map(p => getPageDocContent(p))
            const res = await fetch('/api/letters/translation-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ pages: docPages, personal_use: true }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.detail || `Could not build the document (${res.status})`)
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'letter_translation.docx'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            setError(err.message)
        } finally {
            setDownloading(false)
        }
    }

    const saveToLibrary = async () => {
        setSavingToLibrary(true)
        setError(null)
        try {
            const includedPages = pages.filter(p => getPageDocContent(p))
            const docPages = includedPages.map(p => getPageDocContent(p))
            const overlayImages = includedPages.map(p => overlayUrls[p.id] || null)
            const res = await fetch('/api/letters/translation-docx/save-to-library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ pages: docPages, personal_use: true, cpid: cpid || null, overlay_images: overlayImages }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Could not save the document (${res.status})`)
            setSavedToLibrary({ filename: data.filename, cpid: data.cpid, overlayCount: (data.overlay_filenames || []).length })
        } catch (err) {
            setError(err.message)
        } finally {
            setSavingToLibrary(false)
        }
    }

    const hasTranslations = Object.values(translations).some(t => t?.local || t?.google)
    // Broader than hasTranslations -- also true when a page was only ever run
    // through the bulk Overlay button (Step 1/2 skipped entirely), so the
    // Download/Save-to-Reference-Hub row still shows up for overlay-only results.
    const hasAnyDocContent = hasTranslations || Object.keys(overlayTexts).length > 0

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
                <h2 className="text-xl font-bold text-calpop-ink mb-1 flex items-center gap-2">
                    <Languages className="w-5 h-5" /> Translate a Letter
                </h2>
                <p className="text-calpop-navy text-sm mb-6">
                    For letters you're reading yourself — capture each page, translate, and read.
                    Nothing here is logged as a Letter record or uploaded anywhere; it stays on this screen
                    unless you download it below.
                </p>

                {error && (
                    <div className="mb-6 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700">
                        {error}
                    </div>
                )}

                {retakingPageId && (
                    <div className="mb-3 flex items-center justify-between px-4 py-2 bg-calpop-accent/10 border border-calpop-accent/30 rounded-lg">
                        <span className="text-sm font-bold text-calpop-accent">
                            Retaking Page {pages.findIndex(p => p.id === retakingPageId) + 1} -- next capture replaces it in place.
                        </span>
                        <button
                            onClick={() => setRetakingPageId(null)}
                            className="text-xs font-bold text-calpop-navy underline"
                        >
                            Cancel
                        </button>
                    </div>
                )}
                <RedactionCaptureStage
                    onCapture={retakingPageId ? (dataUrl) => replacePage(retakingPageId, dataUrl) : addPage}
                    captureLabel={retakingPageId ? `Capture Replacement for Page ${pages.findIndex(p => p.id === retakingPageId) + 1}` : undefined}
                />

                {pages.length > 0 && (
                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <h4 className="text-xs font-bold text-calpop-navy uppercase tracking-widest">
                                Pages ({pages.length})
                            </h4>
                            {translating && (
                                <span className="text-xs font-bold text-calpop-navy flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {{
                                        transcribing: 'Transcribing (local vision)…',
                                        'transcribing-cloud': 'Transcribing (Google Vision)…',
                                        translating: 'Translating (local text)…',
                                        'translating-cloud': 'Translating (Google Translate)…',
                                        'overlay-cloud': 'Overlay (Google Vision + Translate)…',
                                    }[currentAction] || 'Working…'}
                                    {' '}({elapsedSec}s — this can take a few minutes)
                                </span>
                            )}
                        </div>

                        {/* Step 1: Transcribe -- fills the editable Original box below, on
                            its own, without auto-translating. Fix any OCR errors there
                            before running Step 2, so translation runs on the corrected
                            text instead of on the mistakes too. */}
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-calpop-navy uppercase tracking-widest w-24 shrink-0">Step 1: Transcribe</span>
                            <button
                                type="button"
                                onClick={transcribeAll}
                                disabled={translating}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-blue border-calpop-blue/30 hover:bg-calpop-blue/10 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                Local
                            </button>
                            <button
                                type="button"
                                onClick={transcribeAllCloud}
                                disabled={translating}
                                title={pages.some(p => !p.redacted) ? 'Redact every page first (pencil icon)' : 'Only ever sends the already-redacted image'}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-navy border-calpop-navy/25 hover:bg-calpop-panel disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Cloud className="w-3.5 h-3.5" /> Google Vision (redacted only)
                            </button>
                            <button
                                type="button"
                                onClick={overlayAllCloud}
                                disabled={translating}
                                title={pages.some(p => !p.redacted) ? 'Redact every page first (pencil icon)' : 'Detect + translate + paint back in place -- one call, not a two-step split. Reads better on tables/paired layouts.'}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-navy border-calpop-navy/25 hover:bg-calpop-panel disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Cloud className="w-3.5 h-3.5" /> Overlay (redacted only)
                            </button>
                        </div>

                        {/* Step 2: Translate -- runs on whatever's CURRENTLY in each
                            page's Original box, i.e. your edits, not the raw transcription. */}
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-bold text-calpop-navy uppercase tracking-widest w-24 shrink-0">Step 2: Translate</span>
                            <button
                                type="button"
                                onClick={translateAll}
                                disabled={translating || !hasTranslations}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-blue border-calpop-blue/30 hover:bg-calpop-blue/10 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                Local
                            </button>
                            <button
                                type="button"
                                onClick={translateAllCloud}
                                disabled={translating || !hasTranslations}
                                title={pages.some(p => !p.redacted) ? 'Redact every page first (pencil icon)' : 'Text-only, but same redaction gate as the OCR step'}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-navy border-calpop-navy/25 hover:bg-calpop-panel disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Cloud className="w-3.5 h-3.5" /> Google Translate (redacted only)
                            </button>
                            {/* Same action as the Step 1 row's Overlay button -- shown here
                                too, at Rey's request, for consistent findability even though
                                overlay is one call, not really "this step." */}
                            <button
                                type="button"
                                onClick={overlayAllCloud}
                                disabled={translating}
                                title={pages.some(p => !p.redacted) ? 'Redact every page first (pencil icon)' : 'Detect + translate + paint back in place -- one call, not a two-step split.'}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border text-calpop-navy border-calpop-navy/25 hover:bg-calpop-panel disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Cloud className="w-3.5 h-3.5" /> Overlay (redacted only)
                            </button>
                        </div>
                        <p className="text-[11px] text-calpop-navy italic mb-3">
                            Local runs fully offline on your machine. Google reads dense/tabular handwriting more reliably
                            but is a cloud service -- it's only usable once every page below is redacted (pencil icon), and
                            only the redacted image/its transcription is ever sent.
                        </p>
                        <div className="flex flex-wrap gap-3 mb-4">
                            {pages.map((p, i) => (
                                <div key={p.id} className="flex items-start gap-14">
                                    <div className="relative group w-28">
                                        <img
                                            src={p.dataUrl}
                                            alt={`Page ${i + 1}`}
                                            onClick={() => setViewingPageId(p.id)}
                                            className={`w-28 h-auto rounded-lg border shadow-sm cursor-zoom-in ${p.redacted ? 'border-calpop-navy/15' : 'border-amber-400'}`}
                                            title="Click to view full size"
                                        />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingPageId(p.id) }}
                                            className="absolute -bottom-2 -right-2 bg-calpop-blue text-white rounded-full p-1.5 shadow-lg hover:brightness-95"
                                            title="Redact this page"
                                        >
                                            <Pencil className="w-3 h-3" />
                                        </button>
                                        <div className={`absolute bottom-1 left-1 right-6 flex items-center justify-center gap-1 text-[8px] font-bold uppercase px-1 py-0.5 rounded ${
                                            p.redacted ? 'bg-calpop-olive/90 text-white' : 'bg-amber-500/90 text-white'
                                        }`}>
                                            {p.redacted ? <ShieldCheckIcon className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                                            {p.redacted ? 'Redacted' : 'Not redacted'}
                                        </div>
                                        <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                                            {i + 1}
                                        </div>
                                        <button
                                            onClick={() => removePage(p.id)}
                                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-500 text-xs w-5 h-5 flex items-center justify-center"
                                        >
                                            ×
                                        </button>
                                        <button
                                            onClick={() => setRetakingPageId(p.id)}
                                            className="block w-full mt-1 text-[10px] font-bold text-calpop-accent hover:underline text-center"
                                            title="Replace this page's image in place -- keeps its position in the list, unlike remove + re-add"
                                        >
                                            ↻ Retake
                                        </button>
                                    </div>
                                    {/* Generated via the bulk "Overlay" button in the Step 1/2
                                        rows above -- this just opens the already-fetched result,
                                        no new call. Solid color + placed beside the thumbnail
                                        (not a faint link stacked underneath) so it doesn't get
                                        missed once an overlay actually exists. */}
                                    {overlayUrls[p.id] && (
                                        <button
                                            type="button"
                                            onClick={() => setViewingOverlayPageId(p.id)}
                                            title="View Overlay"
                                            className="self-stretch w-20 bg-calpop-blue text-white rounded-lg shadow-sm hover:brightness-95 flex flex-col items-center justify-center gap-1.5"
                                        >
                                            <Cloud className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide leading-tight text-center">View<br />Overlay</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {(hasAnyDocContent || translating) && (
                            <div className="space-y-3">
                                {pages.map((p, i) => {
                                    const pageResults = translations[p.id]
                                    if (!pageResults?.local && !pageResults?.google) return null
                                    const method = selectedMethod[p.id] || (pageResults.local ? 'local' : 'google')
                                    const current = pageResults[method]
                                    return (
                                    <div key={p.id} className="bg-calpop-panel border border-calpop-navy/15 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-xs font-bold text-calpop-ink flex items-center gap-2">
                                                <span>
                                                    Page {i + 1}
                                                    {current?.detected_language && (
                                                        <span className="text-calpop-navy font-normal"> — detected: {current.detected_language}</span>
                                                    )}
                                                </span>
                                                {phases[p.id] && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-calpop-accent flex items-center gap-1">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        {phases[p.id] === 'transcribing' && 'Transcribing (local vision)…'}
                                                        {phases[p.id] === 'transcribing-cloud' && 'Transcribing (Google Vision)…'}
                                                        {phases[p.id] === 'translating' && 'Translating (local text)…'}
                                                        {phases[p.id] === 'translating-cloud' && 'Translating (Google Translate)…'}
                                                        {phases[p.id] === 'overlay-cloud' && 'Overlay (Google)…'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingPageId(p.id)}
                                                    className="text-[10px] font-bold text-calpop-blue hover:brightness-90 flex items-center gap-1 uppercase tracking-wide"
                                                >
                                                    <Maximize2 className="w-3 h-3" /> View Full Size
                                                </button>
                                                {overlayUrls[p.id] && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewingOverlayPageId(p.id)}
                                                        className="text-[10px] font-bold text-calpop-olive hover:brightness-90 flex items-center gap-1 uppercase tracking-wide"
                                                    >
                                                        <Cloud className="w-3 h-3" /> View Overlay
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Switches which slot is displayed/edited below -- both
                                            Local and Google results are kept (see runTranscribePipeline),
                                            never overwritten by running the other method. */}
                                        {(pageResults.local || pageResults.google) && (
                                            <div className="flex items-center gap-1 mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedMethod(prev => ({ ...prev, [p.id]: 'local' }))}
                                                    disabled={!pageResults.local}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border disabled:opacity-30 disabled:cursor-not-allowed ${
                                                        method === 'local' ? 'bg-calpop-blue text-white border-calpop-blue' : 'text-calpop-navy border-calpop-navy/25 hover:bg-white'
                                                    }`}
                                                >
                                                    Local
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedMethod(prev => ({ ...prev, [p.id]: 'google' }))}
                                                    disabled={!pageResults.google}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border disabled:opacity-30 disabled:cursor-not-allowed ${
                                                        method === 'google' ? 'bg-calpop-blue text-white border-calpop-blue' : 'text-calpop-navy border-calpop-navy/25 hover:bg-white'
                                                    }`}
                                                >
                                                    Google
                                                </button>
                                            </div>
                                        )}
                                        <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">Original</label>
                                        <div className="relative mb-2">
                                            <textarea
                                                value={current?.original_text || ''}
                                                onChange={setField(p.id, 'original_text')}
                                                className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-none"
                                            />
                                            {/* Custom handle, not the native CSS resize corner -- see
                                                startTextareaResize's comment for why (page doesn't
                                                auto-scroll with a native drag past the viewport edge). */}
                                            <div
                                                onMouseDown={(e) => startTextareaResize(e, e.currentTarget.previousElementSibling)}
                                                className="absolute bottom-0.5 right-0.5 p-0.5 cursor-ns-resize text-calpop-navy/70 hover:text-calpop-navy"
                                                title="Drag to resize"
                                            >
                                                <CornerRightDown className="w-3 h-3" />
                                            </div>
                                        </div>
                                        <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">English Translation — editable</label>
                                        <div className="relative">
                                            <textarea
                                                value={current?.translation || ''}
                                                onChange={setField(p.id, 'translation')}
                                                className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-none"
                                            />
                                            <div
                                                onMouseDown={(e) => startTextareaResize(e, e.currentTarget.previousElementSibling)}
                                                className="absolute bottom-0.5 right-0.5 p-0.5 cursor-ns-resize text-calpop-navy/70 hover:text-calpop-navy"
                                                title="Drag to resize"
                                            >
                                                <CornerRightDown className="w-3 h-3" />
                                            </div>
                                        </div>
                                    </div>
                                    )
                                })}

                                <button
                                    type="button"
                                    onClick={downloadDocx}
                                    disabled={downloading}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-panel disabled:opacity-40 flex items-center gap-1.5"
                                >
                                    {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    Download as .docx
                                </button>

                                <div className="ml-2">
                                    <PrisonerCombobox
                                        value={cpid}
                                        onChange={(v) => { setCpid(v); setSavedToLibrary(null); }}
                                        onSelect={(p) => { setCpid(p.cpid); setSavedToLibrary(null); }}
                                        placeholder="CPID or name (optional)"
                                        title="Files the saved translation into Reference Hub under this prisoner's folder -- you don't need to leave this page to look someone up"
                                        className="w-40 bg-white border border-calpop-navy/15 rounded-lg px-2 py-1.5 text-xs text-calpop-ink outline-none focus:border-calpop-blue"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={saveToLibrary}
                                    disabled={savingToLibrary}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-calpop-blue hover:bg-calpop-navy disabled:opacity-40 flex items-center gap-1.5"
                                >
                                    {savingToLibrary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheckIcon className="w-3.5 h-3.5" />}
                                    Save to Reference Hub
                                </button>
                                {savedToLibrary && (
                                    <span className="text-xs text-calpop-olive font-bold ml-1">
                                        Saved as {savedToLibrary.cpid}/{savedToLibrary.filename}
                                        {savedToLibrary.overlayCount > 0 && ` (+ ${savedToLibrary.overlayCount} overlay image${savedToLibrary.overlayCount > 1 ? 's' : ''})`}
                                    </span>
                                )}

                                <span className="text-xs text-calpop-navy/70 ml-2 inline-flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Nothing is stored on the server unless you use Save to Reference Hub.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {editingPage && (
                <PageRedactionEditor
                    imageDataUrl={editingPage.dataUrl}
                    onSave={(newDataUrl) => savePageRedaction(editingPage.id, newDataUrl)}
                    onCancel={() => setEditingPageId(null)}
                />
            )}

            {/* Overlay view -- the translation painted back onto the image
                in place (see overlayAllCloud/fetchOverlayForPage above), not
                more flat text. Simple fit-width view for now; no separate
                zoom/pan yet (the Text compare modal already has that, this
                is deliberately a
                first version). */}
            {viewingOverlayPageId && overlayUrls[viewingOverlayPageId] && (() => {
                const t = overlayTexts[viewingOverlayPageId]
                const copy = (text) => {
                    navigator.clipboard?.writeText(text || '')
                    setCopiedField(text === t?.translation ? 'translation' : 'original')
                    setTimeout(() => setCopiedField(null), 1500)
                }
                return (
                <div className="fixed inset-0 z-[140] bg-calpop-navy/80 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-6xl flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-calpop-navy/15 shrink-0">
                            <h3 className="text-sm font-bold text-calpop-ink flex items-center gap-2">
                                <Cloud className="w-4 h-4" /> Overlay Translation (Google)
                            </h3>
                            <button
                                onClick={() => setViewingOverlayPageId(null)}
                                className="text-calpop-navy hover:text-calpop-ink p-1 rounded-full hover:bg-calpop-panel"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
                            <div className="min-w-0 min-h-0 overflow-auto bg-calpop-panel border-r border-calpop-navy/15 p-4">
                                <img src={overlayUrls[viewingOverlayPageId]} alt="Overlay translation" className="w-full h-auto rounded border border-calpop-navy/15" />
                            </div>
                            {/* Plain, copy-pasteable text -- the overlay image shows the
                                translation in place, but replying to the sponsee needs
                                actual text, not a picture. */}
                            <div className="min-w-0 min-h-0 overflow-auto p-4 space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest">Original</label>
                                        <button
                                            type="button"
                                            onClick={() => copy(t?.original_text)}
                                            className="text-[10px] font-bold text-calpop-blue hover:brightness-90 flex items-center gap-1 uppercase tracking-wide"
                                        >
                                            {copiedField === 'original' ? <ShieldCheckIcon className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                                            {copiedField === 'original' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="whitespace-pre-wrap text-sm text-calpop-ink bg-calpop-panel border border-calpop-navy/15 rounded p-3 select-text">
                                        {t?.original_text || '(none)'}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest">English Translation</label>
                                        <button
                                            type="button"
                                            onClick={() => copy(t?.translation)}
                                            className="text-[10px] font-bold text-calpop-blue hover:brightness-90 flex items-center gap-1 uppercase tracking-wide"
                                        >
                                            {copiedField === 'translation' ? <ShieldCheckIcon className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                                            {copiedField === 'translation' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="whitespace-pre-wrap text-sm text-calpop-ink bg-calpop-panel border border-calpop-navy/15 rounded p-3 select-text">
                                        {t?.translation || '(none)'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                )
            })()}

            {/* Full-scale compare modal -- lets a bad transcription be
                checked against the actual image detail (is this a focus/
                legibility problem, or the model getting it wrong on a clear
                image?) rather than guessed at from the small thumbnail.
                Image renders at its real native pixel size (no CSS scaling
                down), scrollable if it doesn't fit the viewport, alongside
                the transcription/translation for direct comparison. */}
            {viewingPageId && (() => {
                const page = pages.find(p => p.id === viewingPageId)
                const t = translations[viewingPageId]?.[selectedMethod[viewingPageId]]
                if (!page) return null
                return (
                    <div className="fixed inset-0 z-[140] bg-calpop-navy/80 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-7xl flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-calpop-navy/15 shrink-0">
                                <h3 className="text-sm font-bold text-calpop-ink">Compare — image vs. transcription</h3>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFullSizeZoom(z => !z)}
                                        className="text-xs font-bold text-calpop-blue border border-calpop-blue/30 rounded-lg px-3 py-1.5 hover:bg-calpop-blue/10"
                                    >
                                        {fullSizeZoom ? 'Fit to Pane' : 'Zoom to Actual Size'}
                                    </button>
                                    <button
                                        onClick={() => { setViewingPageId(null); setFullSizeZoom(false) }}
                                        className="text-calpop-navy hover:text-calpop-ink p-1 rounded-full hover:bg-calpop-panel"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0">
                                {/* min-w-0/min-h-0 on both panes -- grid items default to
                                    min-width/min-height:auto, which stops them shrinking below
                                    their content's natural size, so overflow-auto never actually
                                    engages and a native-size image just sits there uncroppable/
                                    unscrollable ("static, only see the left-hand side"). */}
                                <div
                                    ref={panRef}
                                    className={`min-w-0 min-h-0 overflow-auto bg-calpop-panel border-r border-calpop-navy/15 p-2 ${fullSizeZoom ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    onMouseDown={fullSizeZoom ? startPan : undefined}
                                >
                                    {/* Fit-to-pane (default) shows the whole page at its correct
                                        aspect ratio -- a native-size image cropped into a half-width
                                        pane looked "wrong," since only part of it was ever visible
                                        without scrolling. Zoom toggle switches to true pixel size for
                                        checking legibility/focus on a specific line up close --
                                        click-and-drag (via startPan above) to pan around it, not just
                                        the scrollbar. */}
                                    <img
                                        src={page.dataUrl}
                                        alt="Full size"
                                        draggable={false}
                                        className={fullSizeZoom ? 'max-w-none select-none' : 'w-full h-auto'}
                                    />
                                </div>
                                <div className="min-w-0 min-h-0 overflow-auto p-4 space-y-3">
                                    {t ? (
                                        <>
                                            <div>
                                                <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">Original</label>
                                                <div className="whitespace-pre-wrap text-sm text-calpop-ink bg-calpop-panel border border-calpop-navy/15 rounded p-2">
                                                    {t.original_text || '(none)'}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">English Translation</label>
                                                <div className="whitespace-pre-wrap text-sm text-calpop-ink bg-calpop-panel border border-calpop-navy/15 rounded p-2">
                                                    {t.translation || '(none)'}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-sm text-calpop-navy italic">Not translated yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
