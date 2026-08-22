import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { UploadCloud, Loader2, ArrowLeft, FolderCheck } from 'lucide-react'

// Simple file-picker stand-in for now -- the real webcam+crop+black-box
// redaction capture screen (reusing or paralleling ScantronStation.jsx's
// mechanism) is deliberately deferred, see implementation_plan.md. This
// page assumes the file(s) picked here are ALREADY redacted -- it does
// no redaction itself, it only files them into the sponsor's OneDrive
// (or local storage, if that's what's configured) via the new
// upload-redacted endpoint.
export function ScanLetterUpload() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [files, setFiles] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null) // { ok: bool, message, folder_path? }

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
    })

    const handleSubmit = async () => {
        if (files.length === 0) return
        setSubmitting(true)
        setResult(null)
        try {
            const encoded = await Promise.all(files.map(async (f) => ({
                filename: f.name,
                content_base64: await fileToBase64(f),
            })))
            const res = await fetch(`/api/letters/${id}/upload-redacted`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ files: encoded }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Upload failed (${res.status})`)
            setResult({ ok: true, message: 'Uploaded successfully.', folder_path: data.folder_path })
            setFiles([])
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto">
            <button
                onClick={() => navigate('/letters')}
                className="flex items-center gap-2 text-calpop-navy hover:text-calpop-ink mb-6 transition-colors text-sm"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Letters
            </button>

            <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm p-6">
                <h2 className="text-xl font-bold text-calpop-ink mb-1">Scan Letter — Upload Redacted Pages</h2>
                <p className="text-calpop-navy text-sm mb-6">
                    Letter #{id}. Select the already-redacted page image(s)/PDF for this letter.
                    A blank reply doc is added to the same folder automatically.
                </p>

                {result && (
                    <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                        {result.ok && <FolderCheck className="w-4 h-4 inline mr-2 -mt-1" />}
                        {result.message}
                        {result.folder_path && (
                            <div className="mt-1 font-mono text-xs opacity-80 break-all">{result.folder_path}</div>
                        )}
                    </div>
                )}

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

                <button
                    onClick={handleSubmit}
                    disabled={submitting || files.length === 0}
                    className={`w-full px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${submitting || files.length === 0 ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Uploading...' : 'Upload to Sponsor OneDrive'}
                </button>
            </div>
        </div>
    )
}
