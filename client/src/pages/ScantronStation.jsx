import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ShieldAlert, Square, Trash2, CameraOff, Upload, Settings, Loader2, Maximize, Sliders, X, Eye, CheckCircle2, Inbox, Users } from 'lucide-react'

export function IntakeArea() {
    const navigate = useNavigate()
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [stream, setStream] = useState(null)
    const [devices, setDevices] = useState([])
    const [selectedDeviceId, setSelectedDeviceId] = useState('')
    const [masks, setMasks] = useState([])
    const [crop, setCrop] = useState({ x: 100, y: 50, w: 400, h: 250 })

    // IMAGE TUNING CONTROLS (Restored to last configuration)
    const [brightness, setBrightness] = useState(1)
    const [contrast, setContrast] = useState(1.2)

    const [isCapturing, setIsCapturing] = useState(false)
    const [actualRes, setActualRes] = useState({ w: 0, h: 0 })
    const [error, setError] = useState(null)
    const [lastCapture, setLastCapture] = useState(null)
    const [showPreview, setShowPreview] = useState(false)
    const [ingesting, setIngesting] = useState(false)
    const [uploadedImage, setUploadedImage] = useState(null)
    const fileInputRef = useRef(null)

    const getDevices = async () => {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
            setDevices(videoDevices)
            if (videoDevices.length > 0 && !selectedDeviceId) setSelectedDeviceId(videoDevices[0].deviceId)
        } catch (err) { console.error(err) }
    }

    const startCamera = async () => {
        if (stream) stopCamera()
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                    width: { ideal: 3840 }, height: { ideal: 2160 }
                }
            })
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
                const settings = mediaStream.getVideoTracks()[0].getSettings()
                setActualRes({ w: settings.width, h: settings.height })
            }
            setError(null)
        } catch (err) { setError(`Error: ${err.message}`) }
    }

    const stopCamera = () => {
        if (stream) stream.getTracks().forEach(t => t.stop())
        setStream(null)
        setActualRes({ w: 0, h: 0 })
    }

    const updateMask = (id, delta) => {
        setMasks(prev => prev.map(m => m.id === id ? { ...m, ...delta } : m))
    }

    const handleFileUpload = (e) => {
        const file = e.target.files[0]
        if (!file) return
        stopCamera()
        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
                setUploadedImage(event.target.result)
                setActualRes({ w: img.width, h: img.height })
            }
            img.src = event.target.result
        }
        reader.readAsDataURL(file)
    }

    const [analysis, setAnalysis] = useState(null)
    const [confirmedCpid, setConfirmedCpid] = useState('')

    const captureAndRedact = async () => {
        const canvas = canvasRef.current
        const video = videoRef.current

        let source = null
        let sw, sh

        if (uploadedImage) {
            const img = new Image()
            img.src = uploadedImage
            await new Promise(r => img.onload = r)
            source = img
            sw = img.width
            sh = img.height
        } else if (videoRef.current && stream) {
            source = video
            sw = video.videoWidth
            sh = video.videoHeight
        }

        if (!source) return
        setIsCapturing(true)

        const container = document.getElementById('stage-console')
        const rect = container.getBoundingClientRect()
        const displayW = rect.width
        const displayH = rect.height

        const sourceAspect = sw / sh
        const containerAspect = displayW / displayH

        let renderedW, renderedH, offsetX = 0, offsetY = 0

        if (sourceAspect > containerAspect) {
            renderedW = displayW
            renderedH = displayW / sourceAspect
            offsetY = (displayH - renderedH) / 2
        } else {
            renderedH = displayH
            renderedW = displayH * sourceAspect
            offsetX = (displayW - renderedW) / 2
        }

        const scaleX = sw / renderedW
        const scaleY = sh / renderedH

        const adjX = (crop.x - offsetX) * scaleX
        const adjY = (crop.y - offsetY) * scaleY

        canvas.width = crop.w * scaleX
        canvas.height = crop.h * scaleY

        const ctx = canvas.getContext('2d')
        ctx.filter = `brightness(${brightness}) contrast(${contrast})`

        ctx.drawImage(
            source,
            adjX, adjY, crop.w * scaleX, crop.h * scaleY,
            0, 0, canvas.width, canvas.height
        )

        ctx.filter = 'none'
        ctx.fillStyle = 'black'
        masks.forEach(mask => {
            const relX = (mask.x - crop.x) * scaleX
            const relY = (mask.y - crop.y) * scaleY
            ctx.fillRect(relX, relY, mask.w * scaleX, mask.h * scaleY)
        })

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
        setLastCapture({ dataUrl, w: canvas.width, h: canvas.height })

        // --- NEW: Perform AI Analysis ---
        try {
            const res = await fetch('/api/letters/scan/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ image_data: dataUrl })
            })
            if (res.ok) {
                const data = await res.json()
                setAnalysis(data)
                // Do NOT pre-select a candidate -- OCR/fuzzy matching is wrong often
                // enough that staff must explicitly pick the right person below.
                setConfirmedCpid('')
            }
        } catch (err) {
            console.error("Analysis Failed:", err)
        }

        setShowPreview(true)
        setIsCapturing(false)
    }

    const handleIngest = async () => {
        if (!lastCapture) return
        setIngesting(true)
        try {
            const res = await fetch('/api/letters/scan/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    image_data: lastCapture.dataUrl,
                    filename: `scan_${Date.now()}.jpg`,
                    prisoner_cpid: confirmedCpid || null
                })
            })

            if (!res.ok) {
                const text = await res.text()
                let errorMessage = `Server Error ${res.status}`
                try {
                    const err = JSON.parse(text)
                    const detail = typeof err.detail === 'object' ? JSON.stringify(err.detail) : err.detail
                    errorMessage = `Error ${res.status}: ${detail || JSON.stringify(err)}`
                } catch (e) {
                    errorMessage = `Error ${res.status}: ${text || 'Empty Response'}`
                }
                throw new Error(errorMessage)
            }

            let data
            const text = await res.text()
            try {
                data = JSON.parse(text)
            } catch (e) {
                console.error('Failed to parse success JSON:', text)
                throw new Error(`Invalid server response: ${text.substring(0, 100)}`)
            }

            // Success!
            alert(`Success! Letter #${data.id} created from scan.`)
            navigate('/inbox')

        } catch (err) {
            console.error(err)
            alert(`Ingest Error: ${err.message}`)
        } finally {
            setIngesting(false)
        }
    }

    useEffect(() => {
        getDevices()
        return () => stopCamera()
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                        <Camera className="w-8 h-8 text-emerald-400" />
                        Intake Area
                    </h2>
                </div>
                {actualRes.w > 0 && (
                    <div className="bg-slate-800 px-4 py-2 rounded-full border border-slate-700 text-xs font-mono text-cyan-400">
                        {actualRes.w}x{actualRes.h} SOURCE ACTIVE
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Control Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Config
                        </h3>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm p-2 rounded outline-none"
                        >
                            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                        </select>
                        <button onClick={startCamera} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold">
                            {stream ? 'Reconnect' : 'Start Camera'}
                        </button>
                        <div className="relative">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept="image/*"
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current.click()}
                                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold flex items-center justify-center gap-2"
                            >
                                <Upload className="w-4 h-4" /> Upload Image
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Sliders className="w-4 h-4" /> Image Tuning
                        </h3>
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-mono">CONTRAST: {contrast}</label>
                            <input type="range" min="0.5" max="3" step="0.1" value={contrast} onChange={e => setContrast(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-mono">BRIGHTNESS: {brightness}</label>
                            <input type="range" min="0.5" max="2" step="0.1" value={brightness} onChange={e => setBrightness(e.target.value)} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                        </div>
                    </div>

                    <button
                        onClick={captureAndRedact}
                        className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xl shadow-xl shadow-emerald-500/20 disabled:opacity-50 transition-all active:scale-95"
                        disabled={(!stream && !uploadedImage) || isCapturing}
                    >
                        {isCapturing ? <Loader2 className="w-7 h-7 animate-spin" /> : 'INGEST & OCR'}
                    </button>

                    {lastCapture && !showPreview && (
                        <button onClick={() => setShowPreview(true)} className="w-full py-2 text-cyan-400 text-xs flex items-center justify-center gap-2 hover:bg-cyan-400/10 rounded border border-dashed border-cyan-400/30">
                            <Eye className="w-3 h-3" /> Review Last Scan
                        </button>
                    )}
                </div>

                {/* Stage Console */}
                <div id="stage-console" className="lg:col-span-3 relative bg-black rounded-3xl border-4 border-slate-800 overflow-hidden shadow-2xl aspect-video select-none">
                    {uploadedImage ? (
                        <img
                            src={uploadedImage}
                            alt="Uploaded"
                            className="w-full h-full object-contain"
                            style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
                        />
                    ) : (
                        <video ref={videoRef} autoPlay className="w-full h-full object-contain" style={{ filter: `brightness(${brightness}) contrast(${contrast})` }} />
                    )}

                    {/* The Crop Box (Cyan) - Resizable */}
                    {(stream || uploadedImage) && (
                        <div
                            style={{
                                position: 'absolute', border: '2px solid #00ffff',
                                outline: '2px dashed rgba(0, 255, 255, 0.4)',
                                left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                                cursor: 'move', backgroundColor: 'transparent', zIndex: 10
                            }}
                            onMouseDown={(e) => {
                                const startX = e.clientX - crop.x; const startY = e.clientY - crop.y
                                const onM = (mm) => setCrop(c => ({ ...c, x: mm.clientX - startX, y: mm.clientY - startY }))
                                const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
                                window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
                            }}
                        >
                            <div className="absolute top-0 left-0 bg-cyan-400 text-slate-900 text-[10px] font-bold px-1 flex items-center gap-1 shadow-md">
                                <Maximize className="w-3 h-3" /> CROP REGION
                            </div>
                            <div
                                className="absolute bottom-0 right-0 w-6 h-6 bg-cyan-400 cursor-nwse-resize shadow-lg flex items-center justify-center rounded-tl-md"
                                onMouseDown={(e) => {
                                    e.stopPropagation(); const sw = crop.w; const sh = crop.h; const sx = e.clientX; const sy = e.clientY
                                    const onM = (mm) => setCrop(c => ({ ...c, w: sw + (mm.clientX - sx), h: sh + (mm.clientY - sy) }))
                                    const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
                                    window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
                                }}
                            >
                                <div className="w-3 h-3 border-r-2 border-b-2 border-slate-900 opacity-50" />
                            </div>
                        </div>
                    )}

                    {/* Redactions (Black) - Resizable */}
                    {(stream || uploadedImage) && masks.map(m => (
                        <div
                            key={m.id}
                            style={{
                                position: 'absolute', background: 'black',
                                border: '1px solid rgba(34, 211, 238, 0.5)',
                                left: m.x, top: m.y, width: m.w, height: m.h, zIndex: 20,
                                cursor: 'move'
                            }}
                            onMouseDown={(e) => {
                                const startX = e.clientX - m.x; const startY = e.clientY - m.y
                                const onM = (mm) => updateMask(m.id, { x: mm.clientX - startX, y: mm.clientY - startY })
                                const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
                                window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
                            }}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); setMasks(masks.filter(mask => mask.id !== m.id)) }}
                                className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-500"
                            >
                                <X className="w-3 h-3" />
                            </button>

                            <div
                                className="absolute bottom-0 right-0 w-4 h-4 bg-cyan-600/50 cursor-nwse-resize hover:bg-cyan-400"
                                onMouseDown={(e) => {
                                    e.stopPropagation(); const sw = m.w; const sh = m.h; const sx = e.clientX; const sy = e.clientY
                                    const onM = (mm) => updateMask(m.id, { w: Math.max(20, sw + (mm.clientX - sx)), h: Math.max(10, sh + (mm.clientY - sy)) })
                                    const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
                                    window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
                                }}
                            />
                        </div>
                    ))}

                    <div className="absolute bottom-4 left-4 flex gap-2">
                        <button onClick={() => setMasks([...masks, { id: Date.now(), x: crop.x + 10, y: crop.y + 10, w: 150, h: 40 }])} className="bg-slate-900/95 text-white px-4 py-2 rounded-lg text-xs border border-slate-700 flex items-center gap-2 shadow-xl hover:bg-slate-900">
                            <Square className="w-3 h-3 text-cyan-400" /> Add Redaction
                        </button>
                    </div>

                    <canvas ref={canvasRef} className="hidden" />
                </div>
            </div>

            {/* PREVIEW MODAL */}
            {showPreview && lastCapture && (
                <div className="fixed inset-0 z-[100] bg-slate-950/98 flex flex-col items-center p-6 backdrop-blur-xl overflow-hidden">
                    <div className="w-full max-w-6xl flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                AI Perimeter Analysis
                            </h3>
                            <p className="text-slate-400 text-xs font-mono uppercase tracking-widest mt-1">Status: {analysis ? 'Scan Complete' : 'Calculating Vectors...'}</p>
                        </div>
                        <button onClick={() => setShowPreview(false)} className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-full border border-slate-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                        {/* Image Preview */}
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-inner flex items-center justify-center p-4 overflow-auto">
                            <img
                                src={lastCapture.dataUrl}
                                alt="Capture"
                                className="shadow-2xl rounded max-w-full h-auto border border-white/10"
                            />
                        </div>

                        {/* Analysis Panel */}
                        <div className="flex flex-col gap-4 overflow-hidden">
                            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 flex flex-col h-full overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Extracted Intelligence</h4>
                                    {analysis && (
                                        <div className="flex items-center gap-2">
                                            <div className="h-1 w-20 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${analysis.confidence > 0.8 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                    style={{ width: `${analysis.confidence * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-500">{Math.round(analysis.confidence * 100)}% Conf.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto font-mono text-sm text-slate-300 bg-black/30 p-4 rounded-lg border border-black/20 whitespace-pre-wrap leading-relaxed">
                                    {analysis?.text || "Analyzing text structure..."}
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                                    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Users className="w-5 h-5 text-emerald-400" />
                                            <h5 className="text-sm font-bold text-slate-200 uppercase tracking-tight">Candidate Matches</h5>
                                        </div>

                                        <div className="text-xs text-amber-400/80 mb-3 italic">
                                            Nothing is auto-selected. Compare each candidate against the scan on the left, then pick one.
                                        </div>

                                        {analysis?.candidates?.length > 0 ? (
                                            <div className="space-y-2">
                                                {analysis.candidates.map((c) => {
                                                    const selected = confirmedCpid && c.cpid === confirmedCpid
                                                    return (
                                                        <button
                                                            key={c.cpid || `${c.first_name}-${c.last_name}`}
                                                            type="button"
                                                            onClick={() => setConfirmedCpid(c.cpid || '')}
                                                            className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                                                selected
                                                                    ? 'bg-emerald-500/10 border-emerald-500/50'
                                                                    : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                                                            }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-bold text-slate-100 truncate">
                                                                    {c.first_name} {c.last_name}
                                                                </div>
                                                                <div className="text-[11px] text-slate-400 font-mono truncate">
                                                                    {c.cpid || '—'} {c.cdcr_number ? `• CDCR ${c.cdcr_number}` : ''} {c.facility ? `• ${c.facility}` : ''}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <div className="h-1 w-12 bg-slate-700 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full ${c.score > 80 ? 'bg-emerald-500' : c.score > 60 ? 'bg-amber-500' : 'bg-slate-500'}`}
                                                                        style={{ width: `${c.score}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{Math.round(c.score)}%</span>
                                                                {selected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-500 italic">
                                                No candidates matched the OCR text. Assign manually below.
                                            </div>
                                        )}

                                        <div className="mt-3">
                                            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block mb-1">Confirmed CPID</label>
                                            <input
                                                type="text"
                                                value={confirmedCpid}
                                                onChange={(e) => setConfirmedCpid(e.target.value.toUpperCase())}
                                                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100 font-mono text-sm focus:border-cyan-500 outline-none"
                                                placeholder="e.g. ABC123"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-4">
                        <button
                            onClick={() => setShowPreview(false)}
                            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all border border-slate-700"
                        >
                            RETAKE
                        </button>
                        <button
                            onClick={handleIngest}
                            disabled={ingesting || !analysis}
                            className={`px-10 py-3 rounded-xl font-bold shadow-lg flex items-center gap-3 transition-all ${ingesting ? 'bg-slate-700 opacity-50' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'}`}
                        >
                            {ingesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Inbox className="w-5 h-5" />}
                            {ingesting ? 'INGESTING...' : 'CONFIRM & COMMIT TO VAULT'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
