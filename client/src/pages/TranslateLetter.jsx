import { useState } from 'react'
import { Languages, Loader2, Download, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { RedactionCaptureStage } from '../components/RedactionCaptureStage'

// Standalone translate-only tool, added 31Aug2026. Not part of the Letter
// Mgt scan/upload flow -- for the case Rey described: a letter from his own
// sponsee, in Spanish, that isn't going to a sponsor's OneDrive at all (no
// sponsor to upload to -- Rey IS the sponsor) and isn't being logged as a
// Letter record in Letter Mgt. Just capture -> translate -> read, nothing
// leaves the app. Reuses RedactionCaptureStage purely for its webcam/upload
// capture mechanism; redaction masks are available but not required since
// nothing here is ever exported anywhere sponsor-facing.
export function TranslateLetter() {
    const navigate = useNavigate()
    const [pages, setPages] = useState([]) // [{ id, dataUrl }]
    const [translating, setTranslating] = useState(false)
    const [translations, setTranslations] = useState({}) // { [pageId]: { original_text, translation, detected_language, confidence } }
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState(null)

    const addPage = (dataUrl) => {
        setPages(prev => [...prev, { id: Date.now(), dataUrl }])
    }

    const removePage = (pageId) => {
        setPages(prev => prev.filter(p => p.id !== pageId))
        setTranslations(prev => {
            const next = { ...prev }
            delete next[pageId]
            return next
        })
    }

    const translateAll = async () => {
        if (pages.length === 0) return
        setTranslating(true)
        setError(null)
        try {
            const results = await Promise.all(pages.map(async (p) => {
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
            setError(err.message)
        } finally {
            setTranslating(false)
        }
    }

    const setField = (pageId, field) => (e) => {
        setTranslations(prev => ({ ...prev, [pageId]: { ...prev[pageId], [field]: e.target.value } }))
    }

    const downloadDocx = async () => {
        setDownloading(true)
        setError(null)
        try {
            const docPages = pages.filter(p => translations[p.id]).map(p => translations[p.id])
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

    const hasTranslations = Object.keys(translations).length > 0

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

                <RedactionCaptureStage onCapture={addPage} />

                {pages.length > 0 && (
                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-calpop-navy uppercase tracking-widest">
                                Pages ({pages.length})
                            </h4>
                            <button
                                type="button"
                                onClick={translateAll}
                                disabled={translating}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-blue border border-calpop-blue/30 hover:bg-calpop-blue/10 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                {translating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {translating ? 'Translating…' : 'Translate Pages'}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-3 mb-4">
                            {pages.map((p, i) => (
                                <div key={p.id} className="relative w-28 group">
                                    <img
                                        src={p.dataUrl}
                                        alt={`Page ${i + 1}`}
                                        className="w-28 h-36 object-cover rounded-lg border border-calpop-navy/15 shadow-sm"
                                    />
                                    <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                                        {i + 1}
                                    </div>
                                    <button
                                        onClick={() => removePage(p.id)}
                                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-500 text-xs w-5 h-5 flex items-center justify-center"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>

                        {hasTranslations && (
                            <div className="space-y-3">
                                {pages.map((p, i) => translations[p.id] && (
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
                                            onChange={setField(p.id, 'original_text')}
                                            className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-y mb-2"
                                        />
                                        <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">English Translation — editable</label>
                                        <textarea
                                            value={translations[p.id].translation || ''}
                                            onChange={setField(p.id, 'translation')}
                                            className="w-full bg-white border border-calpop-navy/25 rounded px-2 py-1.5 text-calpop-ink text-sm focus:border-calpop-blue outline-none min-h-[4rem] resize-y"
                                        />
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={downloadDocx}
                                    disabled={downloading}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-bg disabled:opacity-40 flex items-center gap-1.5"
                                >
                                    {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    Download as .docx
                                </button>
                                <span className="text-xs text-calpop-olive font-bold ml-2 inline-flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Saved only when you download it — nothing is stored on the server.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
