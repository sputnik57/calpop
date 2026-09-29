import { useState, useEffect } from 'react'
import { Users, Loader2, Mail, Phone, ExternalLink, Archive, RotateCcw, Pencil, Check, X } from 'lucide-react'
import { SubTabs } from '../components/SubTabs'

const inputClass = "w-full bg-calpop-panel border border-calpop-navy/25 rounded-lg px-4 py-2.5 text-calpop-ink focus:outline-none focus:border-calpop-blue transition-all"
const labelClass = "text-xs font-bold text-calpop-navy uppercase tracking-widest block mb-2"

const EMPTY_FORM = {
    name: '', pseudonym: '', email: '', phone: '', sponsor_type: 'individual', onedrive_folder_link: '',
}

function SponsorDirectory({ refreshKey }) {
    const [sponsors, setSponsors] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [togglingId, setTogglingId] = useState(null)
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState(null)

    const load = () => {
        setLoading(true)
        fetch('/api/sponsor-directory', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to load sponsors (${res.status})`)
                return res.json()
            })
            .then(data => { setSponsors(data || []); setLoading(false) })
            .catch(err => { setError(err.message); setLoading(false) })
    }

    useEffect(load, [refreshKey])

    // Archive/reactivate -- a full-field PUT (this endpoint replaces every
    // field, no partial-update support), so send the sponsor back as-is
    // with just `active` flipped. Archiving is never a hard delete: contact
    // info and OneDrive link stay, and past uploads to them are untouched --
    // the only real effect is they stop showing up as a pickable
    // upload-destination sponsor going forward.
    const toggleActive = async (sponsor) => {
        setTogglingId(sponsor.id)
        try {
            const res = await fetch(`/api/sponsor-directory/${sponsor.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: sponsor.name,
                    pseudonym: sponsor.pseudonym,
                    email: sponsor.email,
                    phone: sponsor.phone,
                    sponsor_type: sponsor.sponsor_type,
                    onedrive_folder_link: sponsor.onedrive_folder_link,
                    active: !sponsor.active,
                }),
            })
            if (!res.ok) throw new Error(`Failed to update sponsor (${res.status})`)
            load()
        } catch (err) {
            alert(err.message)
        } finally {
            setTogglingId(null)
        }
    }

    const startEdit = (sponsor) => {
        setEditingId(sponsor.id)
        setSaveError(null)
        setEditForm({
            name: sponsor.name || '',
            pseudonym: sponsor.pseudonym || '',
            email: sponsor.email || '',
            phone: sponsor.phone || '',
            sponsor_type: sponsor.sponsor_type || 'individual',
            onedrive_folder_link: sponsor.onedrive_folder_link || '',
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditForm(null)
        setSaveError(null)
    }

    const saveEdit = async (sponsor) => {
        setSaving(true)
        setSaveError(null)
        try {
            const res = await fetch(`/api/sponsor-directory/${sponsor.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: editForm.name,
                    pseudonym: editForm.pseudonym || null,
                    email: editForm.email || null,
                    phone: editForm.phone || null,
                    sponsor_type: editForm.sponsor_type,
                    onedrive_folder_link: editForm.onedrive_folder_link || null,
                    active: sponsor.active, // editing never touches archive status -- use the Archive button for that
                }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.detail || `Failed to save (${res.status})`)
            }
            setEditingId(null)
            setEditForm(null)
            load()
        } catch (err) {
            setSaveError(err.message)
        } finally {
            setSaving(false)
        }
    }

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
                        <tr className="bg-calpop-panel text-calpop-navy text-xs uppercase tracking-wider border-b border-calpop-navy/15">
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Name</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Type</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Contact</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap" title="active (Stage 1-12) / dormant (Stage 90+)">Sponsees (active/dormant)</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">OneDrive</th>
                            <th className="text-left font-bold px-4 py-2.5 whitespace-nowrap">Status / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sponsors.map(s => {
                            const isEditing = editingId === s.id
                            const editInputClass = "w-full bg-white border border-calpop-navy/25 rounded px-2 py-1 text-calpop-ink text-xs focus:border-calpop-blue outline-none"
                            return (
                            <tr key={s.id} className={`border-b border-calpop-navy/10 last:border-0 transition-colors ${isEditing ? 'bg-calpop-blue/5' : 'hover:bg-calpop-blue/5'} ${!s.active && !isEditing ? 'opacity-50' : ''}`}>
                                {isEditing ? (
                                    <>
                                        <td className="px-4 py-2 align-top">
                                            <input className={editInputClass + ' mb-1'} placeholder="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                                            <input className={editInputClass} placeholder="Pseudonym" value={editForm.pseudonym} onChange={e => setEditForm({ ...editForm, pseudonym: e.target.value })} />
                                        </td>
                                        <td className="px-4 py-2 align-top">
                                            <select className={editInputClass} value={editForm.sponsor_type} onChange={e => setEditForm({ ...editForm, sponsor_type: e.target.value })}>
                                                <option value="individual">Individual</option>
                                                <option value="course">Course</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-2 align-top">
                                            <input className={editInputClass + ' mb-1'} placeholder="Email" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                                            <input className={editInputClass} placeholder="Phone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                                        </td>
                                        <td className="px-4 py-2 align-top text-calpop-ink text-xs" title="active / dormant (Stage 90+)">{s.sponsee_count_active}/{s.sponsee_count_dormant}</td>
                                        <td className="px-4 py-2 align-top">
                                            <input className={editInputClass + ' min-w-[260px]'} placeholder="OneDrive link" value={editForm.onedrive_folder_link} onChange={e => setEditForm({ ...editForm, onedrive_folder_link: e.target.value })} />
                                        </td>
                                        <td className="px-4 py-2 align-top whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] text-calpop-navy/70 italic">status unchanged</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => saveEdit(s)} disabled={saving || !editForm.name} title="Save" className="p-1.5 rounded bg-calpop-olive/10 text-calpop-olive hover:bg-calpop-olive hover:text-white disabled:opacity-40 transition-colors">
                                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                    </button>
                                                    <button onClick={cancelEdit} disabled={saving} title="Cancel" className="p-1.5 rounded bg-calpop-navy/10 text-calpop-navy hover:bg-calpop-navy hover:text-white disabled:opacity-40 transition-colors">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {saveError && <span className="text-[10px] text-red-600 max-w-[160px]">{saveError}</span>}
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
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
                                        <td className="px-4 py-2 text-calpop-ink whitespace-nowrap" title="active / dormant (Stage 90+)">{s.sponsee_count_active}/{s.sponsee_count_dormant}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            {s.onedrive_folder_link ? (
                                                <a href={s.onedrive_folder_link} target="_blank" rel="noreferrer" className="text-calpop-blue hover:underline inline-flex items-center gap-1">
                                                    Open <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => startEdit(s)} title="Edit" className="p-1.5 rounded border bg-calpop-blue/10 text-calpop-blue border-calpop-blue/25 hover:bg-calpop-blue hover:text-white transition-colors">
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => toggleActive(s)}
                                                    disabled={togglingId === s.id}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest border transition-colors disabled:opacity-40 ${
                                                        s.active
                                                            ? 'bg-calpop-olive/10 text-calpop-olive border-calpop-olive/25 hover:bg-calpop-accent/10 hover:text-calpop-accent hover:border-calpop-accent/25'
                                                            : 'bg-calpop-accent/10 text-calpop-accent border-calpop-accent/25 hover:bg-calpop-olive/10 hover:text-calpop-olive hover:border-calpop-olive/25'
                                                    }`}
                                                    title={s.active ? 'Stop offering this sponsor as an upload destination' : 'Make this sponsor selectable again'}
                                                >
                                                    {togglingId === s.id ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : s.active ? (
                                                        <><Archive className="w-3 h-3" /> Archive</>
                                                    ) : (
                                                        <><RotateCcw className="w-3 h-3" /> Reactivate</>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        )})}
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
