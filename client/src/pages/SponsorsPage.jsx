import { Users } from 'lucide-react'

export function SponsorsPage() {
    return (
        <div>
            <h2 className="text-2xl font-bold text-calpop-ink flex items-center gap-3 mb-1">
                <Users className="w-7 h-7 text-calpop-blue" />
                Sponsors
            </h2>
            <p className="text-calpop-navy text-sm mb-6">Sponsor roster and onboarding.</p>

            <div className="bg-white rounded-xl border border-calpop-navy/15 shadow-sm p-12 text-center">
                <p className="text-calpop-navy text-sm">
                    Not built yet -- Sponsors directory and "Add Sponsor" need backend
                    endpoints that don't exist yet.
                </p>
            </div>
        </div>
    )
}
