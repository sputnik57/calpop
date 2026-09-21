import { useState, useCallback, useRef } from 'react'

// Shared "look up a sponsee by name or CPID" data layer -- fetches
// /api/prisoners once and caches it, so every picker (Translate's CPID
// search, Inbox's Start New Letter modal, anywhere else this comes up)
// filters the same in-memory list instead of each rolling its own fetch.
export function usePrisonerDirectory() {
    const [prisoners, setPrisoners] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const loadedRef = useRef(false)

    const ensureLoaded = useCallback(() => {
        if (loadedRef.current) return
        loadedRef.current = true
        setLoading(true)
        fetch('/api/prisoners', { credentials: 'include' })
            .then(res => res.json())
            .then(data => setPrisoners(Array.isArray(data) ? data : data.items || []))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false))
    }, [])

    const search = useCallback((query) => {
        if (!query) return prisoners
        const q = query.toLowerCase()
        return prisoners.filter(p => `${p.cpid || ''} ${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(q))
    }, [prisoners])

    return { prisoners, loading, error, ensureLoaded, search }
}
