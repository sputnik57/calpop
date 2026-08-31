import { useState, useRef, useEffect } from 'react'
import { Camera, Square, Upload, Settings, Loader2, Maximize, Sliders, X } from 'lucide-react'

// Camera/upload + draggable crop box + draggable black-box redaction, burned
// into a canvas before the result ever leaves the browser. Originally
// extracted from ScantronStation.jsx's IntakeArea as an isolated copy (to
// avoid any refactor risk to that already-verified flow); consolidated
// 31Aug2026 into the single shared capture mechanism for both callers after
// the same letterbox-crop bug had to be fixed in both copies -- see the
// clampCrop comment below. IntakeArea now wraps this component and layers
// its own OCR/candidate-matching/routing UI on top via onCapture, rather
// than keeping a second copy of the capture mechanism itself.
//
// This component only ever produces a redacted image and hands it to the
// caller via onCapture -- no OCR/matching of its own, so callers that need
// that (IntakeArea) do it themselves in response to onCapture.
export function RedactionCaptureStage({ onCapture, captureLabel = 'Capture & Add Page', onSourceInfo, disabled = false, busy = false, children }) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const fileInputRef = useRef(null)
    const stageRef = useRef(null)

    const [stream, setStream] = useState(null)
    const [devices, setDevices] = useState([])
    const [selectedDeviceId, setSelectedDeviceId] = useState('')
    const [masks, setMasks] = useState([])
    const [crop, setCrop] = useState({ x: 100, y: 50, w: 400, h: 250 })
    const [brightness, setBrightness] = useState(1)
    const [contrast, setContrast] = useState(1.2)
    const [showTuning, setShowTuning] = useState(false)
    const [isCapturing, setIsCapturing] = useState(false)
    const [actualRes, setActualRes] = useState({ w: 0, h: 0 })
    const [error, setError] = useState(null)
    const [uploadedImage, setUploadedImage] = useState(null)

    const getDevices = async () => {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
            setDevices(videoDevices)
            if (videoDevices.length > 0 && !selectedDeviceId) setSelectedDeviceId(videoDevices[0].deviceId)
        } catch (err) { console.error(err) }
    }

    const stopCamera = () => {
        if (stream) stream.getTracks().forEach(t => t.stop())
        setStream(null)
        setActualRes({ w: 0, h: 0 })
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
            setUploadedImage(null)
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
                const settings = mediaStream.getVideoTracks()[0].getSettings()
                setActualRes({ w: settings.width, h: settings.height })
            }
            setError(null)
        } catch (err) { setError(`Error: ${err.message}`) }
    }

    const updateMask = (id, delta) => {
        setMasks(prev => prev.map(m => m.id === id ? { ...m, ...delta } : m))
    }

    // The video/photo is displayed inside a fixed-aspect (aspect-video)
    // container via object-contain, so unless the source happens to share
    // that exact aspect ratio, it's letterboxed -- real image content only
    // occupies a sub-rectangle of the container, not the whole thing (e.g.
    // a portrait letter-size photo shown inside a 16:9 box has big empty
    // bars left and right). Returns that sub-rectangle in the same
    // screen-pixel coordinate space the crop box is dragged in.
    const getRenderedBounds = () => {
        const container = stageRef.current
        if (!container || !actualRes.w || !actualRes.h) return null
        const rect = container.getBoundingClientRect()
        const displayW = rect.width
        const displayH = rect.height
        const sourceAspect = actualRes.w / actualRes.h
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
        return { offsetX, offsetY, renderedW, renderedH }
    }

    // Keeps the crop box inside the real image bounds above -- without this,
    // dragging or resizing it into the letterboxed area (easy to do, since
    // nothing visually marks where the real image stops) silently samples
    // from outside the source image in captureAndRedact, cutting off real
    // content at whichever edge crossed the boundary rather than including
    // it. This is the actual bug behind "I cropped a wide rectangle and it
    // came back missing words at the edge" -- the widened box extended past
    // the visible image into empty letterbox space.
    const clampCrop = (c) => {
        const b = getRenderedBounds()
        if (!b) return c
        let w = Math.min(Math.max(c.w, 20), b.renderedW)
        let h = Math.min(Math.max(c.h, 20), b.renderedH)
        const minX = b.offsetX
        const minY = b.offsetY
        const maxX = b.offsetX + b.renderedW - w
        const maxY = b.offsetY + b.renderedH - h
        const x = Math.min(Math.max(c.x, minX), maxX)
        const y = Math.min(Math.max(c.y, minY), maxY)
        return { x, y, w, h }
    }

    // Re-clamp whenever a new source loads (its aspect ratio, and therefore
    // the letterbox bounds, can be completely different from the last one).
    useEffect(() => {
        if (actualRes.w && actualRes.h) {
            setCrop(c => clampCrop(c))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actualRes.w, actualRes.h])

    // Optional -- lets a caller (IntakeArea's "SOURCE ACTIVE" badge) show the
    // native resolution without this component lifting all of its state up.
    useEffect(() => {
        onSourceInfo?.(actualRes)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actualRes.w, actualRes.h])

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

        const container = stageRef.current
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
        setIsCapturing(false)
        onCapture(dataUrl)
        // Redactions are page-specific -- clear them so the next page doesn't
        // silently inherit a black box positioned for the previous one. Crop
        // region is left as-is since consecutive pages are usually the same
        // physical framing.
        setMasks([])
    }

    useEffect(() => {
        getDevices()
        return () => stopCamera()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const hasSource = !!(stream || uploadedImage)

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                    {error && <div className="text-xs text-red-600">{error}</div>}
                </div>

                {/* Advanced/Image Tuning -- collapsed by default, per the
                    22Aug2026 note that this is rarely touched. */}
                <div className="p-4 bg-white rounded-xl border border-calpop-navy/15 shadow-sm">
                    <button
                        onClick={() => setShowTuning(v => !v)}
                        className="w-full flex items-center justify-between text-xs font-bold text-calpop-navy uppercase"
                    >
                        <span className="flex items-center gap-2"><Sliders className="w-4 h-4" /> Advanced</span>
                        <span className="text-calpop-navy/50">{showTuning ? 'Hide' : 'Show'}</span>
                    </button>
                    {showTuning && (
                        <div className="space-y-3 mt-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-calpop-navy font-mono">CONTRAST: {contrast}</label>
                                <input type="range" min="0.5" max="3" step="0.1" value={contrast} onChange={e => setContrast(e.target.value)} className="w-full h-1 bg-calpop-navy/15 rounded-lg appearance-none cursor-pointer accent-calpop-blue" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-calpop-navy font-mono">BRIGHTNESS: {brightness}</label>
                                <input type="range" min="0.5" max="2" step="0.1" value={brightness} onChange={e => setBrightness(e.target.value)} className="w-full h-1 bg-calpop-navy/15 rounded-lg appearance-none cursor-pointer accent-calpop-blue" />
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={captureAndRedact}
                    className="w-full py-4 bg-calpop-accent hover:brightness-95 text-white rounded-2xl font-black text-lg shadow-xl shadow-calpop-accent/20 disabled:opacity-50 transition-all active:scale-95"
                    disabled={!hasSource || isCapturing || disabled}
                >
                    {(isCapturing || busy) ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : captureLabel}
                </button>

                {children}
            </div>

            <div
                ref={stageRef}
                className={`lg:col-span-3 relative rounded-3xl border overflow-hidden aspect-video select-none ${
                    hasSource ? 'bg-black border-calpop-navy/15 shadow-2xl' : 'bg-calpop-bg border-2 border-dashed border-calpop-navy/25'
                }`}
            >
                {!hasSource && (
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
                <video
                    ref={videoRef}
                    autoPlay
                    className={`w-full h-full object-contain ${uploadedImage ? 'hidden' : ''}`}
                    style={{ filter: `brightness(${brightness}) contrast(${contrast})` }}
                />

                {/* Marks where the real image actually ends -- the stage
                    background is black and so is any letterbox bar around a
                    source whose aspect ratio doesn't match this box, so
                    without this outline the two are visually indistinguishable
                    and it's easy to drag the crop box past the real edge
                    without noticing (see clampCrop's comment above). */}
                {hasSource && (() => {
                    const b = getRenderedBounds()
                    if (!b) return null
                    // Letter-page (8.5x11 portrait) framing guide, centered
                    // and sized to fit within the real image bounds -- just
                    // an alignment aid for positioning the physical page
                    // under the camera before capture, not a constraint on
                    // the crop box itself (which stays freely adjustable).
                    const pageAspect = 8.5 / 11
                    let pw, ph
                    if (b.renderedW / b.renderedH > pageAspect) {
                        ph = b.renderedH
                        pw = ph * pageAspect
                    } else {
                        pw = b.renderedW
                        ph = pw / pageAspect
                    }
                    const px = b.offsetX + (b.renderedW - pw) / 2
                    const py = b.offsetY + (b.renderedH - ph) / 2
                    return (
                        <>
                            <div
                                className="absolute pointer-events-none border border-white/25"
                                style={{ left: b.offsetX, top: b.offsetY, width: b.renderedW, height: b.renderedH, zIndex: 5 }}
                            >
                                <span className="absolute -bottom-5 left-0 text-[10px] font-bold text-white/40 uppercase tracking-wide">
                                    Image bounds — nothing beyond this edge is captured
                                </span>
                            </div>
                            <div
                                className="absolute pointer-events-none border-2 border-dashed border-cyan-300/50"
                                style={{ left: px, top: py, width: pw, height: ph, zIndex: 5 }}
                            >
                                <span className="absolute -top-5 left-0 text-[10px] font-bold text-cyan-200/80 uppercase tracking-wide">
                                    Page guide (8.5×11)
                                </span>
                            </div>
                        </>
                    )
                })()}

                {hasSource && (
                    <div
                        style={{
                            position: 'absolute', border: '2px solid #00ffff',
                            outline: '2px dashed rgba(0, 255, 255, 0.4)',
                            left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                            cursor: 'move', backgroundColor: 'transparent', zIndex: 10
                        }}
                        onMouseDown={(e) => {
                            const startX = e.clientX - crop.x; const startY = e.clientY - crop.y
                            const onM = (mm) => setCrop(c => clampCrop({ ...c, x: mm.clientX - startX, y: mm.clientY - startY }))
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
                                const onM = (mm) => setCrop(c => clampCrop({ ...c, w: sw + (mm.clientX - sx), h: sh + (mm.clientY - sy) }))
                                const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
                                window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
                            }}
                        >
                            <div className="w-3 h-3 border-r-2 border-b-2 border-slate-900 opacity-50" />
                        </div>
                    </div>
                )}

                {hasSource && masks.map(m => (
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

                {hasSource && (
                    <div className="absolute bottom-4 left-4 flex gap-2">
                        <button onClick={() => setMasks([...masks, { id: Date.now(), x: crop.x + 10, y: crop.y + 10, w: 150, h: 40 }])} className="bg-slate-900/95 text-white px-4 py-2 rounded-lg text-xs border border-slate-700 flex items-center gap-2 shadow-xl hover:bg-slate-900">
                            <Square className="w-3 h-3 text-cyan-400" /> Add Redaction
                        </button>
                    </div>
                )}

                {actualRes.w > 0 && (
                    <div className="absolute top-4 right-4 bg-slate-900/95 px-3 py-1.5 rounded-full text-[10px] font-mono text-cyan-300 border border-slate-700">
                        {actualRes.w}x{actualRes.h}
                    </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    )
}
