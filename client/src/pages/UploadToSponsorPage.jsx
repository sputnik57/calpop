import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, FileText, Loader2 } from 'lucide-react'
import { PrisonerCombobox } from '../components/PrisonerCombobox'

// A direct nav entry for "upload a redacted letter to a sponsor's OneDrive"
// -- added 29Sep2026 because the only way in before this was Letter Mgt's
// table, finding the right row, and clicking its small "Scan" link. This
// page just picks the person, lists their letters, and hands off to the
// existing /letters/:id/scan flow (ScanLetterUpload.jsx) unchanged.
export function UploadToSponsorPage() {
    const navigate = useNavigate()
    const [cpid, setCpid] = useState('')
    const [selectedPrisoner, setSelectedPrisoner] = useState(null)
    const [letters, setLetters] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const loadLetters = async (prisoner) => {
        setSelectedPrisoner(prisoner)
        setCpid(prisoner.cpid)
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`/api/letters?prisoner_cpid=${encodeURIComponent(prisoner.cpid)}`, { credentials: 'include' })
            if (!res.ok) throw new Error(`Failed to load letters (${res.status})`)
            setLetters(await res.json())
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3">
                    <UploadCloud className="w-7 h-7 text-calpop-blue" /> Upload to Sponsor
                </h2>
                <p className="text-calpop-navy text-sm mt-1">
                    Pick a person, then pick which of their letters to redact and upload to their sponsor's OneDrive.
                </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <label className="text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2">Sponsee</label>
                <PrisonerCombobox
                    value={cpid}
                    onChange={setCpid}
                    onSelect={loadLetters}
                    placeholder="Search by name or CPID..."
                    className="w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink outline-none focus:border-calpop-blue transition-all"
                />
            </div>

            {loading && (
                <div className="text-center py-8 text-calpop-navy"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            )}

            {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
            )}

            {letters && !loading && (
                <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-calpop-navy/15 bg-calpop-panel text-xs font-bold text-calpop-navy uppercase tracking-widest">
                        {selectedPrisoner?.first_name} {selectedPrisoner?.last_name} ({cpid}) — {letters.length} letter{letters.length === 1 ? '' : 's'}
                    </div>
                    {letters.length === 0 ? (
                        <div className="p-8 text-center text-calpop-navy text-sm">No letters on file for this person yet.</div>
                    ) : (
                        <div className="divide-y divide-calpop-navy/10">
                            {letters.map(letter => (
                                <button
                                    key={letter.id}
                                    onClick={() => navigate(`/letters/${letter.id}/scan`)}
                                    className="w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-calpop-panel transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <FileText className="w-4 h-4 text-calpop-blue shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-calpop-ink truncate">{letter.title || 'Untitled'}</div>
                                            <div className="text-[11px] text-calpop-navy font-mono">
                                                {letter.status} • updated {new Date(letter.updated_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-calpop-blue shrink-0">Scan &amp; Upload &rarr;</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
