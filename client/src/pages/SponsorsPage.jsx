import { useState, useEffect } from 'react'
import { Users, Loader2, Mail, Phone, ExternalLink } from 'lucide-react'
import { SubTabs } from '../components/SubTabs'

const inputClass = "w-full bg-calpop-bg border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
const labelClass = "text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2"

const EMPTY_FORM = {
    name: '', pseudonym: '', email: '', phone: '', sponsor_type: 'individual', onedrive_folder_link: '',
}

function SponsorDirectory({ refreshKey }) {
    const [sponsors, setSponsors] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        setLoading(true)
        fetch('/api/sponsor-directory', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load sponsors (${res.status})`)
                return res.json()
            })
            .then(data => { setSponsors(data || []); setLoading(false) })
            .catch(err => { setError(err.message); setLoading(false) })
    }, [refreshKey])

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-calpop-navy text-sm py-12 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading sponsors...
            </div>
        )
    }

    if (error) {
        return <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
    }

    if (sponsors.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm p-12 text-center">
                <p className="text-calpop-navy text-sm">No sponsors in the directory yet. Use "Add Sponsor" to create one.</p>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-calpop-bg text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Name</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Type</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Contact</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Sponsees</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">OneDrive</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sponsors.map(s => (
                            <tr key={s.id} className="border-b border-calpop-navy/10 last:border-0 hover:bg-calpop-blue/5 transition-colors">
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <span className="text-calpop-ink">{s.name}</span>
                                    {s.pseudonym && <span className="text-calpop-navy text-xs"> (aka {s.pseudonym})</span>}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${s.sponsor_type === 'course' ? 'bg-calpop-blue/10 text-calpop-blue border-calpop-blue/25' : 'bg-calpop-olive/10 text-calpop-olive border-calpop-olive/25'}`}>
                                        {s.sponsor_type === 'course' ? 'Course' : 'Individual'}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-calpop-navy whitespace-nowrap">
                                    {s.email && <span className="inline-flex items-center gap-1 mr-3"><Mail className="w-3 h-3" />{s.email}</span>}
                                    {s.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                                    {!s.email && !s.phone && '—'}
                                </td>
                                <td className="px-4 py-2 text-calpop-ink whitespace-nowrap">{s.sponsee_count}</td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    {s.onedrive_folder_link ? (
                                        <a href={s.onedrive_folder_link} target="_blank" rel="noreferrer" className="text-calpop-blue hover:underline inline-flex items-center gap-1">
                                            Open <ExternalLink className="w-3 h-3" />
                                        </a>
                                    ) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function AddSponsorForm({ onAdded }) {
    const [form, setForm] = useState(EMPTY_FORM)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)

    const setField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

    const handleSubmit = async () => {
        setSubmitting(true)
        setResult(null)
        try {
            const res = await fetch('/api/sponsor-directory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...form,
                    pseudonym: form.pseudonym || null,
                    email: form.email || null,
                    phone: form.phone || null,
                    onedrive_folder_link: form.onedrive_folder_link || null,
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.detail || `Failed to add sponsor (${res.status})`)
            }
            setResult({ ok: true, message: `Added "${form.name}" to the sponsor directory.` })
            setForm(EMPTY_FORM)
            onAdded?.()
        } catch (err) {
            setResult({ ok: false, message: err.message })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm max-w-2xl">
            {result && (
                <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-calpop-olive/10 text-calpop-olive' : 'bg-red-50 text-red-700'}`}>
                    {result.message}
                </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelClass}>Name</label><input className={inputClass} value={form.name} onChange={setField('name')} /></div>
                <div><label className={labelClass}>Pseudonym</label><input className={inputClass} value={form.pseudonym} onChange={setField('pseudonym')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelClass}>Email</label><input className={inputClass} value={form.email} onChange={setField('email')} type="email" /></div>
                <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={setField('phone')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className={labelClass}>Type</label>
                    <select className={inputClass} value={form.sponsor_type} onChange={setField('sponsor_type')}>
                        <option value="individual">Individual</option>
                        <option value="course">Course</option>
                    </select>
                </div>
                <div><label className={labelClass}>OneDrive Folder Link</label><input className={inputClass} value={form.onedrive_folder_link} onChange={setField('onedrive_folder_link')} placeholder="https://..." /></div>
            </div>
            <button
                onClick={handleSubmit}
                disabled={submitting || !form.name}
                className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${submitting || !form.name ? 'bg-calpop-navy/40' : 'bg-calpop-accent hover:brightness-95'}`}
            >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Adding...' : 'Add Sponsor'}
            </button>
        </div>
    )
}

export function SponsorsPage() {
    const [refreshKey, setRefreshKey] = useState(0)

    return (
        <div>
            <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3 mb-1">
                <Users className="w-7 h-7 text-calpop-blue" />
                Sponsors
            </h2>
            <p className="text-calpop-navy text-sm mb-6">Sponsor roster and onboarding.</p>

            <SubTabs
                tabs={[
                    { key: 'directory', label: 'Directory', content: <SponsorDirectory refreshKey={refreshKey} /> },
                    { key: 'add', label: 'Add Sponsor', content: <AddSponsorForm onAdded={() => setRefreshKey(k => k + 1)} /> },
                ]}
            />
        </div>
    )
}
