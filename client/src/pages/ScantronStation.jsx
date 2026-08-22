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
    const [ingestResult, setIngestResult] = useState(null) // holds the returned letter after a successful confirm, so the exchange-count note stays on screen until staff dismisses it
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

    // Scan-confirm address verification (added 18Aug2026). addressVerified
    // is the actual gate the backend checks before incrementing
    // letter_exchange_count / adding to the print queue -- the automated
    // address_score on each candidate (see MatchingService) is advisory
    // only, never applied on its own. Reset whenever the confirmed person
    // changes, since verification is per-person, not per-scan.
    const [addressVerified, setAddressVerified] = useState(false)
    const [addressEditing, setAddressEditing] = useState(false)
    const [correctedAddress, setCorrectedAddress] = useState({ address: '', city: '', state: '', zip: '' })

    // Full roster, fetched once, keyed by CPID -- the fallback source for
    // the address-verification panel below when the confirmed person isn't
    // in analysis.candidates (a manually-typed CPID, or OCR/matching
    // returned nothing at all, e.g. no candidates matched or OCR failed).
    // Without this the panel only ever worked when picked from the
    // candidate list, which turned out to be far too narrow a condition.
    const [rosterByCpid, setRosterByCpid] = useState({})
    useEffect(() => {
        fetch('/api/prisoners', { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                const byCpid = {}
                for (const p of data || []) byCpid[p.cpid] = p
                setRosterByCpid(byCpid)
            })
            .catch(() => {})
    }, [])

    const confirmedFromCandidates = analysis?.candidates?.find(c => c.cpid && c.cpid === confirmedCpid) || null
    const confirmedFromRoster = confirmedCpid && rosterByCpid[confirmedCpid]
        ? { ...rosterByCpid[confirmedCpid], address_score: null } // no OCR-based score when this came from the roster, not a candidate
        : null
    const confirmedCandidate = confirmedFromCandidates || confirmedFromRoster

    // Routing (added 22Aug2026) -- replaces the old automatic
    // sponsor_name-based routing entirely, per an explicit decision: staff
    // now always pick the next queue by hand instead of the system
    // inferring it. addToDb defaults true (the common case is a real
    // sponsee); routingChoice has no default -- it's a required pick
    // before a scan can be confirmed, since there's no automatic fallback
    // to fall back on anymore. addToPrintQueue can only take effect once
    // addressVerified is true (also enforced server-side).
    const [addToDb, setAddToDb] = useState(true)
    const [addToPrintQueue, setAddToPrintQueue] = useState(false)
    const [routingChoice, setRoutingChoice] = useState('') // 'queued_for_writing' | 'queued_for_letter_scan'

    const resetAddressVerification = (cpid) => {
        setConfirmedCpid(cpid)
        setAddressVerified(false)
        setAddressEditing(false)
        setCorrectedAddress({ address: '', city: '', state: '', zip: '' })
        setAddToPrintQueue(false) // depends on a fresh addressVerified for this specific person
    }

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
                // resetAddressVerification (not a bare setConfirmedCpid('')) so a
                // fresh capture doesn't inherit the previous scan's verified/queued
                // state for a different person.
                resetAddressVerification('')
                setAddToDb(true)
                setRoutingChoice('')
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
                    prisoner_cpid: confirmedCpid || null,
                    address_verified: addressVerified,
                    add_to_db: addToDb,
                    add_to_print_queue: addToPrintQueue,
                    routing_status_override: routingChoice || null,
                    ...(addressEditing ? {
                        corrected_address: correctedAddress.address || null,
                        corrected_city: correctedAddress.city || null,
                        corrected_state: correctedAddress.state || null,
                        corrected_zip: correctedAddress.zip || null,
                    } : {}),
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

            // Success! Show the exchange-count note on screen (staff needs
            // to physically write it on the envelope) instead of an alert()
            // that's easy to dismiss without reading, then hold here until
            // they explicitly continue.
            setIngestResult(data)

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
                    <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3">
                        <Camera className="w-8 h-8 text-calpop-blue" />
                        Intake Area
                    </h2>
                </div>
                {actualRes.w > 0 && (
                    <div className="bg-white px-4 py-2 rounded-full border border-calpop-navy/15 text-xs font-mono text-calpop-blue">
                        {actualRes.w}x{actualRes.h} SOURCE ACTIVE
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Control Panel */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="p-4 bg-white rounded-xl border border-calpop-navy/15 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-calpop-navy uppercase flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Config
                        </h3>
                        <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="w-full bg-calpop-bg border border-calpop-navy/25 text-calpop-ink text-sm p-2 rounded outline-none"
                        >
                            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
                        </select>
                        <button onClick={startCamera} className="w-full py-3 bg-calpop-blue hover:brightness-95 text-white rounded-lg font-bold">
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
                                className="w-full py-3 bg-calpop-bg hover:bg-calpop-navy/10 text-calpop-ink rounded-lg font-bold flex items-center justify-center gap-2 border border-calpop-navy/15"
                            >
                                <Upload className="w-4 h-4" /> Upload Image
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-calpop-navy/15 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-calpop-navy uppercase flex items-center gap-2">
                            <Sliders className="w-4 h-4" /> Image Tuning
                        </h3>
                        <div className="space-y-1">
                            <label className="text-[10px] text-calpop-navy font-mono">CONTRAST: {contrast}</label>
                            <input type="range" min="0.5" max="3" step="0.1" value={contrast} onChange={e => setContrast(e.target.value)} className="w-full h-1 bg-calpop-navy/15 rounded-lg appearance-none cursor-pointer accent-calpop-blue" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-calpop-navy font-mono">BRIGHTNESS: {brightness}</label>
                            <input type="range" min="0.5" max="2" step="0.1" value={brightness} onChange={e => setBrightness(e.target.value)} className="w-full h-1 bg-calpop-navy/15 rounded-lg appearance-none cursor-pointer accent-calpop-blue" />
                        </div>
                    </div>

                    <button
                        onClick={captureAndRedact}
                        className="w-full py-5 bg-calpop-accent hover:brightness-95 text-white rounded-2xl font-black text-xl shadow-xl shadow-calpop-accent/20 disabled:opacity-50 transition-all active:scale-95"
                        disabled={(!stream && !uploadedImage) || isCapturing}
                    >
                        {isCapturing ? <Loader2 className="w-7 h-7 animate-spin" /> : 'INGEST & OCR'}
                    </button>

                    {lastCapture && !showPreview && (
                        <button onClick={() => setShowPreview(true)} className="w-full py-2 text-calpop-blue text-xs flex items-center justify-center gap-2 hover:bg-calpop-blue/10 rounded border border-dashed border-calpop-blue/30">
                            <Eye className="w-3 h-3" /> Review Last Scan
                        </button>
                    )}
                </div>

                {/* Stage Console. Only goes black once there's real video/image content
                    to show -- an empty black box otherwise had no design purpose and
                    read as a jarring dark panel against the light UI. */}
                <div id="stage-console" className={`lg:col-span-3 relative rounded-3xl border overflow-hidden aspect-video select-none ${
                    (stream || uploadedImage) ? 'bg-black border-calpop-navy/15 shadow-2xl' : 'bg-calpop-bg border-2 border-dashed border-calpop-navy/25'
                }`}>
                    {!stream && !uploadedImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-calpop-navy">
                            <Camera className="w-10 h-10" />
                            <p className="text-sm">Start the camera or upload an image to begin</p>
                        </div>
                    )}
                    {uploadedImage && (
                        <img
                            src={uploadedImage}
                            alt="Uploaded"
                            className="w-full h-full object-contain"
                            style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
                        />
                    )}
                    {/* Always mounted (never conditional on `stream`) -- startCamera()
                        attaches the media stream to this element via videoRef right after
                        getUserMedia resolves, before the state update that would otherwise
                        gate its render, so it must already exist in the DOM. */}
                    <video
                        ref={videoRef}
                        autoPlay
                        className={`w-full h-full object-contain ${uploadedImage ? 'hidden' : ''}`}
                        style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
                    />

                    {/* The Crop Box (Cyan) - Resizable. Kept as an overlay on the video
                        stage itself, not a themed panel -- needs strong contrast against
                        arbitrary camera footage, so it stays outside the light palette. */}
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

                    {(stream || uploadedImage) && (
                        <div className="absolute bottom-4 left-4 flex gap-2">
                            <button onClick={() => setMasks([...masks, { id: Date.now(), x: crop.x + 10, y: crop.y + 10, w: 150, h: 40 }])} className="bg-slate-900/95 text-white px-4 py-2 rounded-lg text-xs border border-slate-700 flex items-center gap-2 shadow-xl hover:bg-slate-900">
                                <Square className="w-3 h-3 text-cyan-400" /> Add Redaction
                            </button>
                        </div>
                    )}

                    <canvas ref={canvasRef} className="hidden" />
                </div>
            </div>

            {/* EXCHANGE-COUNT NOTE -- shown after a successful confirm, held
                on screen until staff dismisses it (not a browser alert()
                that's easy to click past without reading). */}
            {ingestResult && (
                <div className="fixed inset-0 z-[110] bg-calpop-navy/70 flex items-center justify-center p-6 backdrop-blur-sm">
                    <div className="bg-white border border-calpop-navy/15 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6">
                        <CheckCircle2 className="w-14 h-14 text-calpop-olive mx-auto" />
                        <div>
                            <h3 className="text-xl font-bold text-calpop-ink">Letter #{ingestResult.id} Created</h3>
                        </div>
                        {ingestResult.letter_exchange_count != null && (
                            <div className="bg-calpop-accent/10 border-2 border-calpop-accent rounded-xl p-5">
                                <div className="text-xs font-bold text-calpop-accent uppercase tracking-widest mb-1">Exchange #</div>
                                <div className="text-5xl font-black text-calpop-ink font-mono">{ingestResult.letter_exchange_count}</div>
                                <div className="text-sm font-bold text-calpop-accent mt-3">
                                    NOTE: write this exchange number on front of physical envelope.
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => { setIngestResult(null); setShowPreview(false); navigate('/inbox') }}
                            className="w-full py-3 bg-calpop-accent hover:brightness-95 text-white rounded-xl font-bold"
                        >
                            Continue to Work Queue
                        </button>
                    </div>
                </div>
            )}

            {/* PREVIEW MODAL */}
            {showPreview && lastCapture && (
                <div className="fixed inset-0 z-[100] bg-calpop-navy/70 flex flex-col items-center p-6 backdrop-blur-sm overflow-hidden">
                    <div className="w-full max-w-6xl flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-calpop-olive" />
                                AI Perimeter Analysis
                            </h3>
                            <p className="text-white/60 text-xs font-mono uppercase tracking-widest mt-1">Status: {analysis ? 'Scan Complete' : 'Calculating Vectors...'}</p>
                        </div>
                        <button onClick={() => setShowPreview(false)} className="bg-white hover:bg-calpop-bg text-calpop-ink p-2 rounded-full border border-calpop-navy/15">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                        {/* Image Preview */}
                        <div className="bg-white rounded-2xl border border-calpop-navy/15 shadow-sm flex items-center justify-center p-4 overflow-auto">
                            <img
                                src={lastCapture.dataUrl}
                                alt="Capture"
                                className="shadow-md rounded max-w-full h-auto border border-calpop-navy/10"
                            />
                        </div>

                        {/* Analysis Panel */}
                        <div className="flex flex-col gap-4 overflow-hidden">
                            <div className="bg-white rounded-xl border border-calpop-navy/15 p-5 flex flex-col h-full overflow-hidden shadow-sm">
                                <div className="flex items-center justify-between mb-4 border-b border-calpop-navy/15 pb-3">
                                    <h4 className="text-xs font-bold text-calpop-blue uppercase tracking-widest">Extracted Intelligence</h4>
                                    {analysis && (
                                        <div className="flex items-center gap-2">
                                            <div className="h-1 w-20 bg-calpop-navy/15 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${analysis.confidence > 0.8 ? 'bg-calpop-olive' : 'bg-calpop-accent'}`}
                                                    style={{ width: `${analysis.confidence * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-calpop-navy">{Math.round(analysis.confidence * 100)}% Conf.</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto font-mono text-sm text-calpop-ink bg-calpop-bg p-4 rounded-lg border border-calpop-navy/15 whitespace-pre-wrap leading-relaxed">
                                    {analysis?.text || "Analyzing text structure..."}
                                </div>

                                <div className="mt-4 pt-4 border-t border-calpop-navy/15 space-y-4">
                                    <div className="bg-calpop-bg rounded-lg p-4 border border-calpop-navy/15">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Users className="w-5 h-5 text-calpop-olive" />
                                            <h5 className="text-sm font-bold text-calpop-ink uppercase tracking-tight">Candidate Matches</h5>
                                        </div>

                                        <div className="text-xs text-calpop-accent mb-3 italic">
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
                                                            onClick={() => resetAddressVerification(c.cpid || '')}
                                                            className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                                                selected
                                                                    ? 'bg-calpop-olive/10 border-calpop-olive/50'
                                                                    : 'bg-white border-calpop-navy/15 hover:border-calpop-navy/30'
                                                            }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-bold text-calpop-ink truncate">
                                                                    {c.first_name} {c.last_name}
                                                                </div>
                                                                <div className="text-[11px] text-calpop-navy font-mono truncate">
                                                                    {c.cpid || '—'} {c.cdcr_number ? `• CDCR ${c.cdcr_number}` : ''} {c.facility ? `• ${c.facility}` : ''}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <div className="h-1 w-12 bg-calpop-navy/15 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full ${c.score > 80 ? 'bg-calpop-olive' : c.score > 60 ? 'bg-calpop-accent' : 'bg-calpop-navy/30'}`}
                                                                        style={{ width: `${c.score}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] font-mono text-calpop-navy w-8 text-right">{Math.round(c.score)}%</span>
                                                                {selected && <CheckCircle2 className="w-4 h-4 text-calpop-olive" />}
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="text-xs text-calpop-navy italic">
                                                    No candidates matched the OCR text. Assign manually below, or --
                                                </div>
                                                {/* Not a queue -- a branch. Nobody matched, so rather than force a
                                                    confirm against the wrong person (or a manually-typed guess),
                                                    jump straight to Add New Person. */}
                                                <button
                                                    type="button"
                                                    onClick={() => navigate('/envelope?tab=add')}
                                                    className="text-xs font-bold text-calpop-blue hover:brightness-90"
                                                >
                                                    This is a new person &rarr; Add New Person
                                                </button>
                                            </div>
                                        )}

                                        <div className="mt-3">
                                            <label className="text-[10px] text-calpop-navy uppercase font-bold tracking-widest block mb-1">Confirmed CPID</label>
                                            <input
                                                type="text"
                                                value={confirmedCpid}
                                                onChange={(e) => resetAddressVerification(e.target.value.toUpperCase())}
                                                className="w-full bg-white border border-calpop-navy/25 rounded px-3 py-2 text-calpop-ink font-mono text-sm focus:border-calpop-blue outline-none"
                                                placeholder="e.g. ABC123"
                                            />
                                        </div>

                                        {confirmedCandidate && (
                                            <div className="mt-4 pt-4 border-t border-calpop-navy/15">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h5 className="text-xs font-bold text-calpop-ink uppercase tracking-tight">Address Verification</h5>
                                                    {confirmedCandidate.address_score != null && (
                                                        <span className="text-[10px] font-mono text-calpop-navy">
                                                            automated match: {Math.round(confirmedCandidate.address_score)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-calpop-accent mb-3 italic">
                                                    Automated, not applied on its own -- confirm or correct it yourself.
                                                </div>

                                                <div className="bg-white border border-calpop-navy/15 rounded-lg p-3 mb-3 text-xs text-calpop-ink font-mono">
                                                    {confirmedCandidate.address || '(no address on file)'}<br />
                                                    {[confirmedCandidate.city, confirmedCandidate.state, confirmedCandidate.zip].filter(Boolean).join(', ') || '—'}
                                                </div>

                                                {addressVerified && !addressEditing ? (
                                                    <div className="flex items-center gap-2 text-xs font-bold text-calpop-olive">
                                                        <CheckCircle2 className="w-4 h-4" /> Address verified
                                                    </div>
                                                ) : addressEditing ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            className="w-full bg-white border border-calpop-navy/25 rounded px-3 py-2 text-calpop-ink text-sm focus:border-calpop-blue outline-none"
                                                            placeholder="Corrected street address"
                                                            value={correctedAddress.address}
                                                            onChange={(e) => setCorrectedAddress({ ...correctedAddress, address: e.target.value })}
                                                        />
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <input
                                                                className="bg-white border border-calpop-navy/25 rounded px-3 py-2 text-calpop-ink text-sm focus:border-calpop-blue outline-none"
                                                                placeholder="City"
                                                                value={correctedAddress.city}
                                                                onChange={(e) => setCorrectedAddress({ ...correctedAddress, city: e.target.value })}
                                                            />
                                                            <input
                                                                className="bg-white border border-calpop-navy/25 rounded px-3 py-2 text-calpop-ink text-sm focus:border-calpop-blue outline-none"
                                                                placeholder="State"
                                                                value={correctedAddress.state}
                                                                onChange={(e) => setCorrectedAddress({ ...correctedAddress, state: e.target.value })}
                                                            />
                                                            <input
                                                                className="bg-white border border-calpop-navy/25 rounded px-3 py-2 text-calpop-ink text-sm focus:border-calpop-blue outline-none"
                                                                placeholder="Zip"
                                                                value={correctedAddress.zip}
                                                                onChange={(e) => setCorrectedAddress({ ...correctedAddress, zip: e.target.value })}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAddressVerified(true)}
                                                            disabled={!correctedAddress.address}
                                                            className="w-full py-2 bg-calpop-accent hover:brightness-95 disabled:opacity-40 text-white rounded-lg text-sm font-bold"
                                                        >
                                                            Save Correction &amp; Verify
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setAddressVerified(true)}
                                                            className="flex-1 py-2 bg-calpop-olive/10 hover:bg-calpop-olive text-calpop-olive hover:text-white rounded-lg text-sm font-bold border border-calpop-olive/25 transition-colors"
                                                        >
                                                            Matches
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setAddressEditing(true)
                                                                setCorrectedAddress({
                                                                    address: confirmedCandidate.address || '',
                                                                    city: confirmedCandidate.city || '',
                                                                    state: confirmedCandidate.state || '',
                                                                    zip: confirmedCandidate.zip || '',
                                                                })
                                                            }}
                                                            className="flex-1 py-2 bg-calpop-accent/10 hover:bg-calpop-accent text-calpop-accent hover:text-white rounded-lg text-sm font-bold border border-calpop-accent/25 transition-colors"
                                                        >
                                                            Doesn't Match
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Routing (added 22Aug2026) -- replaces the old automatic
                        sponsor_name-based routing entirely. Every box here is an
                        explicit staff decision, none of it inferred. */}
                    <div className="mt-6 w-full max-w-6xl bg-white rounded-2xl border border-calpop-navy/15 shadow-sm p-5">
                        <h4 className="text-xs font-bold text-calpop-blue uppercase tracking-widest mb-4">Routing</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={addToDb}
                                    onChange={(e) => setAddToDb(e.target.checked)}
                                    className="mt-0.5 w-4 h-4"
                                />
                                <div>
                                    <div className="text-sm font-bold text-calpop-ink">Add to Database</div>
                                    <div className="text-xs text-calpop-navy">Uncheck for literature-only requests -- still logged, but not added as a sponsee.</div>
                                </div>
                            </label>

                            <label className={`flex items-start gap-3 ${addressVerified ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                                <input
                                    type="checkbox"
                                    checked={addToPrintQueue}
                                    disabled={!addressVerified}
                                    onChange={(e) => setAddToPrintQueue(e.target.checked)}
                                    className="mt-0.5 w-4 h-4"
                                />
                                <div>
                                    <div className="text-sm font-bold text-calpop-ink">Print Envelope Queue</div>
                                    <div className="text-xs text-calpop-navy">{addressVerified ? 'Send to Envelope Mgt’s print queue.' : 'Verify the address above first.'}</div>
                                </div>
                            </label>

                            <div>
                                <div className="text-sm font-bold text-calpop-ink mb-2">Next Step (pick one)</div>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="routingChoice"
                                            checked={routingChoice === 'queued_for_writing'}
                                            onChange={() => setRoutingChoice('queued_for_writing')}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm text-calpop-ink">Letter Writing Queue</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="routingChoice"
                                            checked={routingChoice === 'queued_for_letter_scan'}
                                            onChange={() => setRoutingChoice('queued_for_letter_scan')}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm text-calpop-ink">Assign Sponsor Queue</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-4">
                        <button
                            onClick={() => setShowPreview(false)}
                            className="px-8 py-3 bg-white hover:bg-calpop-bg text-calpop-navy rounded-xl font-bold transition-all border border-calpop-navy/15"
                        >
                            RETAKE
                        </button>
                        <button
                            onClick={handleIngest}
                            disabled={ingesting || !analysis || !routingChoice}
                            title={!routingChoice ? 'Pick a Next Step above first' : undefined}
                            className={`px-10 py-3 rounded-xl font-bold shadow-lg flex items-center gap-3 transition-all ${(ingesting || !routingChoice) ? 'bg-calpop-navy/25 opacity-50' : 'bg-calpop-accent hover:brightness-95 text-white shadow-calpop-accent/20'}`}
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
