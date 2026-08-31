import { useState } from 'react'
import { Info } from 'lucide-react'

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
        <div className="bg-white border border-calpop-navy/15 shadow-sm p-4 rounded-xl">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    disabled={uploading || applying}
                    className="block text-xs text-calpop-navy
                     file:mr-3 file:py-1.5 file:px-3
                     file:rounded-full file:border-0
                     file:text-xs file:font-semibold
                     file:bg-calpop-blue file:text-white
                     hover:file:brightness-95
                     disabled:opacity-50"
                />
                <Info
                    className="w-4 h-4 text-calpop-navy/50 hover:text-calpop-navy cursor-help shrink-0"
                    title="The database is the source of truth -- this only stages changes for review. Nothing is applied until you confirm below."
                />
            </div>

            <div className="space-y-3 mt-3">
                {uploading && (
                    <div className="flex items-center space-x-2 text-calpop-blue">
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-calpop-blue"></div>
                        <span className="text-xs">Comparing against the database...</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-2.5">
                        <h4 className="text-xs font-medium text-red-700">Error</h4>
                        <p className="text-xs text-red-600 mt-1">{error}</p>
                    </div>
                )}

                {diff && (
                    <div className="bg-calpop-bg border border-calpop-navy/15 rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-4 text-xs font-mono uppercase flex-wrap">
                            <span className="text-calpop-olive">{diff.new.length} new</span>
                            <span className="text-calpop-accent">{diff.changed.length} changed</span>
                            <span className="text-calpop-navy">{diff.unchanged_count} unchanged</span>
                            {diff.missing_from_file.length > 0 && (
                                <span className="text-calpop-navy">{diff.missing_from_file.length} in DB, not in file</span>
                            )}
                            {diff.no_cpid_categorized?.length > 0 && (
                                <span className="text-calpop-navy/70">{diff.no_cpid_categorized.length} no CPID (categorized)</span>
                            )}
                            {diff.skipped_missing_cpid?.length > 0 && (
                                <span className="text-red-600">{diff.skipped_missing_cpid.length} no CPID (needs review)</span>
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

                        {diff.skipped_missing_cpid?.length > 0 && (
                            <div>
                                <h5 className="text-xs font-bold text-red-600 uppercase mb-2">No CPID — needs review</h5>
                                <p className="text-xs text-calpop-navy mb-2">
                                    Blank CPID and no recognized Stage — not new, not changed, not applied either way.
                                </p>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {diff.skipped_missing_cpid.map(r => (
                                        <div key={r.excel_row} className="text-xs font-mono text-calpop-ink bg-red-50 border border-red-200 rounded px-2 py-1">
                                            Row {r.excel_row} — {r.first_name} {r.last_name} {r.cdcr_number ? `(${r.cdcr_number})` : ''}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {diff.no_cpid_categorized?.length > 0 && (
                            <div>
                                <h5 className="text-xs font-bold text-calpop-navy uppercase mb-2">No CPID — categorized (expected)</h5>
                                <p className="text-xs text-calpop-navy mb-2">
                                    Blank CPID, but has a recognized Stage — not an error, just not tracked as an active sponsee.
                                </p>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {diff.no_cpid_categorized.map(r => (
                                        <div key={r.excel_row} className="text-xs font-mono text-calpop-navy bg-white border border-calpop-navy/15 rounded px-2 py-1">
                                            Row {r.excel_row} — {r.first_name} {r.last_name} — Stage {r.stage}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleApply}
                                disabled={applying || !hasChanges}
                                className="bg-calpop-accent hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                            >
                                {applying ? 'Applying...' : hasChanges ? 'Apply changes' : 'Nothing to apply'}
                            </button>
                            <button
                                onClick={() => setPreview(null)}
                                disabled={applying}
                                className="bg-calpop-bg hover:bg-calpop-navy/10 text-calpop-navy px-3 py-1.5 rounded-lg text-xs font-bold border border-calpop-navy/15"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {status && (
                    <div className="bg-calpop-olive/10 border border-calpop-olive/25 rounded-md p-2.5">
                        <h4 className="text-xs font-medium text-calpop-olive">Applied successfully</h4>
                        <p className="text-xs text-calpop-ink mt-1">{status.message}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ExcelUploader
