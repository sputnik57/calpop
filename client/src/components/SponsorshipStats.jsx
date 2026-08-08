import { useState, useEffect } from 'react';
import { Users, UserCheck } from 'lucide-react';

export function SponsorshipStats() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/dashboard/program-summary')
            .then(res => res.json())
            .then(data => {
                setData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch sponsorship stats", err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="animate-pulse h-32 bg-slate-800 rounded-xl"></div>;
    if (!data) return null;

    return (
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6 text-blue-400">
                <Users className="w-6 h-6" />
                <h2 className="text-xl font-semibold">Program Summary</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
                        <UserCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-slate-100">{data.active_sponsors_count}</div>
                        <div className="text-sm text-slate-400">Active Sponsors</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-slate-100">{data.active_sponsees_count}</div>
                        <div className="text-sm text-slate-400">Active Sponsees (Stage 12)</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-lg text-purple-400">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-slate-100">{data.unique_sponsors_count || 0}</div>
                        <div className="text-sm text-slate-400">Unique Sponsors (Stage 2-89)</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-lg text-orange-400">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-slate-100">{data.total_prisoners || 0}</div>
                        <div className="text-sm text-slate-400">Total Prisoners Serviced</div>
                    </div>
                </div>
            </div>

            {/* Breakdown Table Preview */}
            <div className="mt-6 pt-6 border-t border-slate-700">
                <h3 className="text-sm font-medium text-slate-400 mb-3">Top Sponsors</h3>
                <div className="space-y-2">
                    {data.sponsors_breakdown.map((sponsor, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-slate-300">{sponsor.name}</span>
                            <span className="px-2 py-1 bg-slate-700 rounded text-slate-300 text-xs">
                                {sponsor.count} sponsees
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
