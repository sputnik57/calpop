import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, Archive, Clock, UserX } from 'lucide-react';

// Rewritten 29Sep2026 into two separate cards (was one combined "Program
// Summary" card) per Rey: a Sponsors card (active/archived, from the real
// Sponsor directory table) and a Sponsees card with the same three-bucket
// Stage breakdown as the Prisoner Directory's filter toggle.
export function SponsorshipStats() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    // Sponsor backlog (people with no sponsor yet), shown inside this card
    // as "no sponsor yet" lines under Pending and Active rather than as its
    // own card -- it's nearly all Pending, with a few Active (25Oct2026).
    const [backlog, setBacklog] = useState(null);

    useEffect(() => {
        fetch('/api/prisoners/backlog', { credentials: 'include' })
            .then(res => res.ok ? res.json() : Promise.reject(res.status))
            .then(setBacklog)
            .catch(err => console.error("Failed to fetch sponsor backlog", err));

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

    // Same Stage buckets as the rows below: Active 10-12, Pending 1-9.
    const backlogIn = (bucket) => (backlog || []).filter(r =>
        bucket === 'active' ? r.stage >= 10 && r.stage <= 12 : (r.stage == null || r.stage < 10)
    ).length;

    if (loading) {
        return (
            <>
                <div className="animate-pulse h-40 bg-white border border-calpop-navy/15 rounded-xl"></div>
                <div className="animate-pulse h-40 bg-white border border-calpop-navy/15 rounded-xl"></div>
            </>
        );
    }
    if (!data) return null;

    const { sponsors, sponsees, sponsors_breakdown } = data;

    return (
        <>
            {/* Sponsors card */}
            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-calpop-blue">
                    <UserCheck className="w-6 h-6" />
                    <h2 className="text-xl font-semibold text-calpop-ink">Sponsors</h2>
                </div>
                <div className="flex items-end gap-2 mb-1">
                    <div className="text-4xl font-bold text-calpop-ink">{sponsors.active}</div>
                    <div className="text-2xl font-bold text-calpop-navy/40">/</div>
                    <div className="text-4xl font-bold text-calpop-navy/40">{sponsors.archived}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-calpop-navy/70 mb-4">
                    <UserCheck className="w-3.5 h-3.5 text-calpop-blue" /> active
                    <span className="mx-0.5">/</span>
                    <Archive className="w-3.5 h-3.5" /> archived
                </div>
                <div className="pt-4 border-t border-calpop-navy/15">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-calpop-navy uppercase tracking-widest">By Sponsor</h3>
                        <span className="text-[10px] font-mono text-calpop-navy/50" title="Active (Stage 10-12) / Dropped (90+)">active/dropped</span>
                    </div>
                    <div className="space-y-2">
                        {sponsors_breakdown.length === 0 ? (
                            <p className="text-sm text-calpop-navy/70 italic">No active sponsees yet.</p>
                        ) : sponsors_breakdown.map((sponsor, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                                <span className="text-calpop-ink truncate">{sponsor.name}</span>
                                <span className="px-2 py-1 bg-calpop-panel rounded text-calpop-navy text-xs font-mono shrink-0 ml-2">
                                    {sponsor.active}/{sponsor.dropped}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Sponsees card -- active/pending/dropped breakdown, same
                taxonomy as PrisonersPage.jsx's STATUS_FILTERS toggle. */}
            <div className="bg-white p-6 rounded-xl border border-calpop-navy/15 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-calpop-olive">
                    <Users className="w-6 h-6" />
                    <h2 className="text-xl font-semibold text-calpop-ink">Sponsees</h2>
                </div>
                <div className="flex items-end gap-3 mb-5">
                    <div className="text-4xl font-bold text-calpop-ink">{sponsees.total}</div>
                    <div className="text-sm text-calpop-navy pb-1">total</div>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-calpop-ink">
                            <span className="w-2 h-2 rounded-full bg-calpop-olive"></span>
                            Active <span className="text-calpop-navy/70 text-xs">(Stage 10-12)</span>
                        </span>
                        <span className="font-mono font-bold text-calpop-ink">{sponsees.active}</span>
                    </div>
                    {/* Active with no sponsor shouldn't happen -- flagged in red so it
                        gets cleared first (25Oct2026). */}
                    {backlog && backlogIn('active') > 0 && (
                        <Link to="/backlog" className="flex items-center justify-between pl-6 -mt-1.5 text-xs font-bold text-red-700 hover:underline">
                            <span>active with no sponsor -- needs attention</span>
                            <span className="font-mono">{backlogIn('active')}</span>
                        </Link>
                    )}
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-calpop-ink">
                            <span className="w-2 h-2 rounded-full bg-calpop-accent"></span>
                            Pending <span className="text-calpop-navy/70 text-xs">(Stage 1-9)</span>
                        </span>
                        <span className="font-mono font-bold text-calpop-ink">{sponsees.pending}</span>
                    </div>
                    {backlog && backlogIn('pending') > 0 && (
                        <Link to="/backlog" className="flex items-center justify-between pl-6 -mt-1.5 text-xs text-calpop-navy hover:text-calpop-blue">
                            <span>no sponsor yet (backlog)</span>
                            <span className="font-mono">{backlogIn('pending')}</span>
                        </Link>
                    )}
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-calpop-ink">
                            <span className="w-2 h-2 rounded-full bg-calpop-navy/40"></span>
                            Dropped <span className="text-calpop-navy/70 text-xs">(Stage 90+)</span>
                        </span>
                        <span className="font-mono font-bold text-calpop-ink">{sponsees.dropped}</span>
                    </div>
                </div>
                {/* Simple proportion bar, active/pending/dropped left to right */}
                <div className="mt-5 h-2 rounded-full overflow-hidden flex bg-calpop-panel">
                    {sponsees.total > 0 && (
                        <>
                            <div className="bg-calpop-olive" style={{ width: `${(sponsees.active / sponsees.total) * 100}%` }} />
                            <div className="bg-calpop-accent" style={{ width: `${(sponsees.pending / sponsees.total) * 100}%` }} />
                            <div className="bg-calpop-navy/40" style={{ width: `${(sponsees.dropped / sponsees.total) * 100}%` }} />
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
