import { useState } from 'react'

const FIELD_LABELS = {
    first_name: 'First name',
    last_name: 'Last name',
    facility: 'Facility',
    housing: 'Housing',
    address: 'Address',
    city: 'City',
    state: 'State',
    zip: 'Zip',
    cdcr_number: 'CDCR #',
    safety_classification: 'Safety',
    intake_number: 'Intake #',
    stage: 'Stage',
    cdcr_db_verified: 'CDCR DB Verified',
    contract_status: 'Contract',
    date_of_contract: 'Date of Contract',
    needs_green_book: 'Needs Green Book?',
    language: 'Language',
    review_notes: 'Review Notes',
    date_sponsor_assigned: 'Date Sponsor Assigned',
    letter_exchange_count: 'Letter Exchange Count',
    step_received_count: 'Step Received Count',
    bph_date: 'BPH Date',
}

function ExcelUploader({ onUploadSuccess }) {
    const [uploading, setUploading] = useState(false)
    const [applying, setApplying] = useState(false)
    const [error, setError] = useState(null)
    const [status, setStatus] = useState(null)
    const [preview, setPreview] = useState(null) // { staging_token, diff }

    const handleFileUpload = async (event) => {
        const file = event.target.files[0]
        if (!file) return

        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            setError('Please select an Excel file (.xlsx or .xls)')
            return
        }

        setUploading(true)
        setError(null)
        setStatus(null)
        setPreview(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/excel/upload/preview', {
                method: 'POST',
                credentials: 'include',
                body: formData,
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Preview failed')
            }

            const result = await response.json()
            setPreview(result)
        } catch (err) {
            setError(err.message)
        } finally {
            setUploading(false)
            event.target.value = ''
        }
    }

    const handleApply = async () => {
        if (!preview) return
        setApplying(true)
        setError(null)

        try {
            const response = await fetch('/api/excel/upload/apply', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staging_token: preview.staging_token }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Apply failed')
            }

            const result = await response.json()
            setStatus(result)
            setPreview(null)

            if (onUploadSuccess) onUploadSuccess(result)
        } catch (err) {
            setError(err.message)
        } finally {
            setApplying(false)
        }
    }

    const diff = preview?.diff
    const hasChanges = diff && (diff.new.length > 0 || diff.changed.length > 0)

    return (
        <div className="bg-white border border-calpop-navy/15 shadow-sm p-6 rounded-xl">
            <h3 className="text-lg font-bold text-calpop-ink mb-4">
                Excel Roster Upload
            </h3>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-calpop-navy mb-2">
                        Upload Prisoner Excel File
                    </label>
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        disabled={uploading || applying}
                        className="block w-full text-sm text-calpop-navy
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-calpop-blue file:text-white
                     hover:file:brightness-95
                     disabled:opacity-50"
                    />
                    <p className="mt-1 text-xs text-calpop-navy">
                        The database is the source of truth -- this only stages
                        changes for review. Nothing is applied until you confirm below.
                    </p>
                </div>

                {uploading && (
                    <div className="flex items-center space-x-2 text-calpop-blue">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-calpop-blue"></div>
                        <span className="text-sm">Comparing against the database...</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <h4 className="text-sm font-medium text-red-700">Error</h4>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                )}

                {diff && (
                    <div className="bg-calpop-bg border border-calpop-navy/15 rounded-lg p-4 space-y-4">
                        <div className="flex items-center gap-4 text-xs font-mono uppercase">
                            <span className="text-calpop-olive">{diff.new.length} new</span>
                            <span className="text-calpop-accent">{diff.changed.length} changed</span>
                            <span className="text-calpop-navy">{diff.unchanged_count} unchanged</span>
                            {diff.missing_from_file.length > 0 && (
                                <span className="text-calpop-navy">{diff.missing_from_file.length} in DB, not in file</span>
                            )}
                        </div>

                        {diff.new.length > 0 && (
                            <div>
                                <h5 className="text-xs font-bold text-calpop-olive uppercase mb-2">New records</h5>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {diff.new.map(r => (
                                        <div key={r.cpid} className="text-xs font-mono text-calpop-ink bg-calpop-olive/10 border border-calpop-olive/25 rounded px-2 py-1">
                                            {r.cpid} — {r.first_name} {r.last_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {diff.changed.length > 0 && (
                            <div>
                                <h5 className="text-xs font-bold text-calpop-accent uppercase mb-2">Changed records</h5>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {diff.changed.map(r => (
                                        <div key={r.cpid} className="text-xs bg-calpop-accent/10 border border-calpop-accent/25 rounded px-2 py-2">
                                            <div className="font-mono text-calpop-ink mb-1">{r.cpid}</div>
                                            {Object.entries(r.changes).map(([field, { old, new: newVal }]) => (
                                                <div key={field} className="text-calpop-navy pl-2">
                                                    {FIELD_LABELS[field] || field}:{' '}
                                                    <span className="text-red-600 line-through">{old || '(blank)'}</span>
                                                    {' → '}
                                                    <span className="text-calpop-olive">{newVal || '(blank)'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {diff.missing_from_file.length > 0 && (
                            <p className="text-xs text-calpop-navy">
                                {diff.missing_from_file.length} record(s) in the database aren't in this file.
                                They will NOT be deleted or modified -- only new/changed records above will be applied.
                            </p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleApply}
                                disabled={applying || !hasChanges}
                                className="bg-calpop-accent hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold"
                            >
                                {applying ? 'Applying...' : hasChanges ? 'Apply changes' : 'Nothing to apply'}
                            </button>
                            <button
                                onClick={() => setPreview(null)}
                                disabled={applying}
                                className="bg-calpop-bg hover:bg-calpop-navy/10 text-calpop-navy px-4 py-2 rounded-lg text-sm font-bold border border-calpop-navy/15"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {status && (
                    <div className="bg-calpop-olive/10 border border-calpop-olive/25 rounded-md p-3">
                        <h4 className="text-sm font-medium text-calpop-olive">Applied successfully</h4>
                        <p className="text-sm text-calpop-ink mt-1">{status.message}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ExcelUploader
