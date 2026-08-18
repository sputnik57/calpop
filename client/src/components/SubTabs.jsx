import { useState } from 'react'

/**
 * tabs: [{ key, label, content }]
 * Internal tab-switcher used within a top-level nav section (e.g. Envelope
 * Mgt's Scan / Add Person / Print Envelopes sub-areas). Distinct from the
 * top-level route-based nav in Layout.jsx -- these don't have their own URLs,
 * they're just panels within one page.
 */
export function SubTabs({ tabs, defaultTab }) {
    const [active, setActive] = useState(defaultTab || tabs[0]?.key)
    const activeTab = tabs.find(t => t.key === active)

    return (
        <div>
            <div className="flex gap-1 border-b border-calpop-navy/15 mb-6 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActive(tab.key)}
                        className={`px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${
                            active === tab.key
                                ? 'border-calpop-accent text-calpop-accent'
                                : 'border-transparent text-calpop-navy hover:text-calpop-ink'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div>{activeTab?.content}</div>
        </div>
    )
}
