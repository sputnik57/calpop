import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Loader2, X, Eye, CheckCircle2, Inbox, Users } from 'lucide-react'
import { RedactionCaptureStage } from '../components/RedactionCaptureStage'

export function IntakeArea() {
    const navigate = useNavigate()

    const [actualRes, setActualRes] = useState({ w: 0, h: 0 })
    const [analyzing, setAnalyzing] = useState(false) // blocks a second capture while the previous one's OCR/matching call is still in flight
    const [lastCapture, setLastCapture] = useState(null)
    const [showPreview, setShowPreview] = useState(false)
    const [ingesting, setIngesting] = useState(false)
    const [ingestResult, setIngestResult] = useState(null) // holds the returned letter after a successful confirm, so the exchange-count note stays on screen until staff dismisses it

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

    // Called by RedactionCaptureStage once it's produced a redacted image --
    // the capture/crop/mask mechanism itself now lives entirely in that
    // shared component (consolidated 31Aug2026); this is just the
    // envelope-specific step on top of it (OCR + candidate matching).
    const handleCaptured = async (dataUrl) => {
        setLastCapture({ dataUrl })
        setAnalyzing(true)

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
        setAnalyzing(false)
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

            <RedactionCaptureStage
                onCapture={handleCaptured}
                captureLabel="INGEST & OCR"
                onSourceInfo={setActualRes}
                disabled={analyzing}
                busy={analyzing}
            >
                {lastCapture && !showPreview && (
                    <button onClick={() => setShowPreview(true)} className="w-full py-2 text-calpop-blue text-xs flex items-center justify-center gap-2 hover:bg-calpop-blue/10 rounded border border-dashed border-calpop-blue/30 mt-2">
                        <Eye className="w-3 h-3" /> Review Last Scan
                    </button>
                )}
            </RedactionCaptureStage>

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
