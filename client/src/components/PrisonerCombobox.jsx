import { useState, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { usePrisonerDirectory } from '../hooks/usePrisonerDirectory'

// Compact "type to search, click to select" CPID/name lookup -- an inline
// input + dropdown, meant for a single-field slot in a toolbar (as opposed
// to Inbox's Start New Letter modal, which wants a full browsable list; that
// one still uses usePrisonerDirectory directly for its bigger list UI).
export function PrisonerCombobox({ value, onChange, onSelect, placeholder = 'CPID or name...', className = '', title }) {
    const { loading, ensureLoaded, search } = usePrisonerDirectory()
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const onClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    const results = open ? search(value).slice(0, 8) : []

    return (
        <div className="relative" ref={ref}>
            <input
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true) }}
                onFocus={() => { ensureLoaded(); setOpen(true) }}
                placeholder={placeholder}
                title={title}
                className={className}
            />
            {open && (loading || results.length > 0) && (
                <div className="absolute left-0 top-full mt-1 min-w-[220px] max-h-64 overflow-y-auto bg-white border border-calpop-navy/15 rounded-lg shadow-xl z-50">
                    {loading ? (
                        <div className="p-3 text-center text-calpop-navy/70"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
                    ) : (
                        results.map(p => (
                            <button
                                key={p.cpid}
                                type="button"
                                onClick={() => { onSelect(p); setOpen(false) }}
                                className="w-full text-left px-3 py-2 flex items-center justify-between text-sm text-calpop-navy hover:bg-calpop-panel transition-colors"
                            >
                                <span className="font-medium">{p.first_name} {p.last_name}</span>
                                <span className="text-xs font-mono text-calpop-navy/70 ml-3">{p.cpid}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
