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
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-calpop-bg border-b border-calpop-navy/15 text-left">
                        <th className="px-4 py-3 font-bold text-calpop-navy uppercase tracking-widest text-xs">Name</th>
                        <th className="px-4 py-3 font-bold text-calpop-navy uppercase tracking-widest text-xs">Type</th>
                        <th className="px-4 py-3 font-bold text-calpop-navy uppercase tracking-widest text-xs">Contact</th>
                        <th className="px-4 py-3 font-bold text-calpop-navy uppercase tracking-widest text-xs">Sponsees</th>
                        <th className="px-4 py-3 font-bold text-calpop-navy uppercase tracking-widest text-xs">OneDrive</th>
                    </tr>
                </thead>
                <tbody>
                    {sponsors.map(s => (
                        <tr key={s.id} className="border-b border-calpop-navy/10 last:border-0">
                            <td className="px-4 py-3">
                                <div className="font-medium text-calpop-ink">{s.name}</div>
                                {s.pseudonym && <div className="text-xs text-calpop-navy">aka {s.pseudonym}</div>}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.sponsor_type === 'course' ? 'bg-calpop-blue/15 text-calpop-blue' : 'bg-calpop-olive/15 text-calpop-olive'}`}>
                                    {s.sponsor_type === 'course' ? 'Course' : 'Individual'}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-calpop-navy">
                                {s.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{s.email}</div>}
                                {s.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{s.phone}</div>}
                                {!s.email && !s.phone && <span className="text-calpop-navy/40">—</span>}
                            </td>
                            <td className="px-4 py-3 text-calpop-ink font-medium">{s.sponsee_count}</td>
                            <td className="px-4 py-3">
                                {s.onedrive_folder_link ? (
                                    <a href={s.onedrive_folder_link} target="_blank" rel="noreferrer" className="text-calpop-blue hover:underline flex items-center gap-1">
                                        Open <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                ) : <span className="text-calpop-navy/40">—</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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
