import { useState, useEffect } from 'react'
import { Lock, FileText, Activity } from 'lucide-react'
import { SponsorshipStats } from '../components/SponsorshipStats'
import ExcelUploader from '../components/ExcelUploader'

export function Dashboard() {
    const [stats, setStats] = useState({ total_letters: 0, pending_action: 0, completed: 0 })
    const [status, setStatus] = useState('Checking connection...')

    useEffect(() => {
        // Check Health
        fetch('/api/health')
            .then(res => res.json())
            .then(data => setStatus(`System Online: ${data.status}`))
            .catch(err => setStatus('System Offline: Backend not reachable'))

        // Fetch Stats
        fetch('/api/stats')
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(console.error)
    }, [])

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Status Card */}
            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-calpop-blue">
                    <Activity className="w-6 h-6" />
                    <h2 className="text-xl font-semibold text-calpop-ink">System Status</h2>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${status.includes('Online') ? 'bg-calpop-olive' : 'bg-red-500'}`}></div>
                    <span className="font-mono text-sm">{status}</span>
                </div>
            </div>

            {/* Security Card */}
            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-calpop-olive">
                    <Lock className="w-6 h-6" />
                    <h2 className="text-xl font-semibold text-calpop-ink">Security Vault</h2>
                </div>
                <p className="text-calpop-navy text-sm mb-4">
                    Local encryption active. PII is isolated.
                </p>
                <div className="flex justify-between items-center mt-4">
                    <span className="text-2xl font-bold text-calpop-ink">{stats.total_letters}</span>
                    <span className="text-xs text-calpop-navy uppercase tracking-wider">Total Records</span>
                </div>
            </div>

            {/* Workflow Card */}
            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-calpop-accent">
                    <FileText className="w-6 h-6" />
                    <h2 className="text-xl font-semibold text-calpop-ink">Pending Letters</h2>
                </div>
                <div className="text-3xl font-bold mb-2 text-calpop-ink">{stats.pending_action}</div>
                <p className="text-calpop-navy text-xs">Awaiting synchronization</p>
            </div>

            {/* New Sponsorship Stats Component */}
            <SponsorshipStats key={stats.total_letters} />

            {/* Excel Upload Section */}
            <div className="md:col-span-3 mt-6">
                <ExcelUploader onUploadSuccess={() => {
                    // Refresh stats after successful upload
                    fetch('/api/stats')
                        .then(res => res.json())
                        .then(data => setStats(data))
                        .catch(console.error)

                    // Force re-render of SponsorshipStats by updating stats
                    setStats(prev => ({ ...prev, total_letters: prev.total_letters + 1 }))
                }} />
            </div>
        </div>
    )
}
