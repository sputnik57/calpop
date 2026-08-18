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

    if (loading) return <div className="animate-pulse h-32 bg-white border border-calpop-navy/15 rounded-xl"></div>;
    if (!data) return null;

    return (
        <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6 text-calpop-blue">
                <Users className="w-6 h-6" />
                <h2 className="text-xl font-semibold text-calpop-ink">Program Summary</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-calpop-blue/10 rounded-lg text-calpop-blue">
                        <UserCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-calpop-ink">{data.active_sponsors_count}</div>
                        <div className="text-sm text-calpop-navy">Active Sponsors</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-calpop-olive/10 rounded-lg text-calpop-olive">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-calpop-ink">{data.active_sponsees_count}</div>
                        <div className="text-sm text-calpop-navy">Active Sponsees (Stage 12)</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-calpop-navy/10 rounded-lg text-calpop-navy">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-calpop-ink">{data.unique_sponsors_count || 0}</div>
                        <div className="text-sm text-calpop-navy">Unique Sponsors (Stage 2-89)</div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-3 bg-calpop-accent/10 rounded-lg text-calpop-accent">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-3xl font-bold text-calpop-ink">{data.total_prisoners || 0}</div>
                        <div className="text-sm text-calpop-navy">Total Prisoners Serviced</div>
                    </div>
                </div>
            </div>

            {/* Breakdown Table Preview */}
            <div className="mt-6 pt-6 border-t border-calpop-navy/15">
                <h3 className="text-sm font-medium text-calpop-navy mb-3">Top Sponsors</h3>
                <div className="space-y-2">
                    {data.sponsors_breakdown.map((sponsor, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-calpop-ink">{sponsor.name}</span>
                            <span className="px-2 py-1 bg-calpop-bg rounded text-calpop-navy text-xs">
                                {sponsor.count} sponsees
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
