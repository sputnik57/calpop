import { useState, useRef } from 'react'
import { X, Square, Check } from 'lucide-react'

// Redacts an already-captured static page image -- draggable/resizable black
// boxes over a still frame, burned in on Apply. Added 30Aug2026 alongside
// RedactionCaptureStage's pre-capture redaction (crop stage + masks before
// the shutter): holding a webcam by hand makes precisely dragging boxes
// *before* capture impractical, so this covers the same need after the
// fact, on a frozen frame instead of a live feed. Both stay available --
// pre-capture still makes sense for a camera mounted on a stand.
export function PageRedactionEditor({ imageDataUrl, onSave, onCancel }) {
    const stageRef = useRef(null)
    const canvasRef = useRef(null)
    const imgRef = useRef(null)
    const [masks, setMasks] = useState([])
    const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })

    const updateMask = (id, delta) => {
        setMasks(prev => prev.map(m => m.id === id ? { ...m, ...delta } : m))
    }

    const handleImgLoad = (e) => {
        setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })
    }

    const applyRedaction = () => {
        const img = imgRef.current
        const stage = stageRef.current
        const canvas = canvasRef.current
        if (!img || !stage || !naturalSize.w) return

        const rect = stage.getBoundingClientRect()
        const displayW = rect.width
        const displayH = rect.height
        const sw = naturalSize.w
        const sh = naturalSize.h

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

        canvas.width = sw
        canvas.height = sh
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, sw, sh)
        ctx.fillStyle = 'black'
        masks.forEach(m => {
            const relX = (m.x - offsetX) * scaleX
            const relY = (m.y - offsetY) * scaleY
            ctx.fillRect(relX, relY, m.w * scaleX, m.h * scaleY)
        })

        onSave(canvas.toDataURL('image/jpeg', 0.95))
    }

    return (
        <div className="fixed inset-0 z-[120] bg-calpop-navy/80 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-5">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-calpop-ink">Redact Page</h3>
                    <button onClick={onCancel} className="text-calpop-navy hover:text-calpop-ink">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div
                    ref={stageRef}
                    className="relative bg-black rounded-lg overflow-hidden select-none"
                    style={{ aspectRatio: naturalSize.w && naturalSize.h ? `${naturalSize.w}/${naturalSize.h}` : '3/4', maxHeight: '65vh' }}
                >
                    <img
                        ref={imgRef}
                        src={imageDataUrl}
                        onLoad={handleImgLoad}
                        alt="Captured page"
                        className="w-full h-full object-contain"
                        draggable={false}
                    />
                    {masks.map(m => (
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
                </div>

                <div className="flex justify-between items-center mt-4">
                    <button
                        onClick={() => setMasks([...masks, { id: Date.now(), x: 40, y: 40, w: 150, h: 40 }])}
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs border border-slate-700 flex items-center gap-2 shadow hover:bg-slate-800"
                    >
                        <Square className="w-3 h-3 text-cyan-400" /> Add Redaction
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onCancel} className="px-5 py-2 rounded-lg font-bold text-calpop-navy border border-calpop-navy/15 hover:bg-calpop-bg">
                            Cancel
                        </button>
                        <button onClick={applyRedaction} className="px-5 py-2 rounded-lg font-bold text-white bg-calpop-accent hover:brightness-95 flex items-center gap-2">
                            <Check className="w-4 h-4" /> Apply & Save
                        </button>
                    </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    )
}
