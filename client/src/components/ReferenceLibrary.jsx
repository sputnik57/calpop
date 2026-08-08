import React, { useState, useEffect } from 'react'
import { Book, History, FileText, ChevronRight, Download, Eye, X, Loader2, Folder, ChevronLeft } from 'lucide-react'

const ReferenceLibrary = ({ onInsert, initialCpid, ocrText, workbenchState }) => {
    const {
        currQueue, setCurrQueue,
        histQueue, setHistQueue,
        activeQueuePath, setActiveQueuePath,
        previewContent, setPreviewContent
    } = workbenchState;

    const [category, setCategory] = useState('curriculum') // 'curriculum' or 'history'
    const [subpath, setSubpath] = useState('')
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('')
    const [manualCpid, setManualCpid] = useState('')

    const queuedFiles = category === 'curriculum' ? currQueue : histQueue;
    const workbenchLimit = category === 'curriculum' ? 6 : 4;

    // Identify the best CPID factor (Smart Research Context)
    const getBestCpid = () => {
        if (manualCpid) return manualCpid.toUpperCase();
        if (!ocrText) return initialCpid;

        const clean = ocrText.toUpperCase();
        const rawMatches = clean.match(/[A-Z]{1,5}[\s-]?\d{2,6}/g) || [];
        const candidates = rawMatches.map(m => m.replace(/[\s-]/g, ''));

        // Filter out common false positives from OCR (like P.O. BOX 123)
        const blacklist = ['BOX', 'POB', 'APT', 'STE', 'UNIT', 'BLDG'];
        const validCandidates = candidates.filter(c => {
            const prefix = c.match(/^[A-Z]+/)?.[0];
            return prefix && !blacklist.includes(prefix);
        });

        // Priority 1: 3-Letter Filings (Archive Standard: ABC123)
        const archiveId = validCandidates.find(c => /^[A-Z]{3}\d{3,4}$/.test(c));
        if (archiveId) return archiveId;

        // Priority 2: 4-Letter IDs (System Standard: TEST-001)
        const systemId = validCandidates.find(c => /^[A-Z]{4}\d{3,4}$/.test(c));
        if (systemId) return systemId;

        return initialCpid;
    };

    const activeCpid = getBestCpid();

    useEffect(() => {
        if (category === 'history' && activeCpid) {
            setFilter(activeCpid);
        } else {
            setFilter('');
        }
    }, [category, activeCpid]);

    useEffect(() => {
        fetchFiles()
    }, [category, subpath])

    const fetchFiles = async () => {
        setLoading(true)
        setFiles([])
        try {
            let url = `/api/library/list?category=${category}`
            if (subpath) {
                const cleanSubpath = subpath.split('/').filter(p => !!p).join('/')
                if (cleanSubpath) url += `&subpath=${encodeURIComponent(cleanSubpath)}`
            }
            const res = await fetch(url)
            if (res.ok) {
                const data = await res.json()
                setFiles(data)
            }
        } catch (err) {
            console.error('Failed to fetch library files', err)
        } finally {
            setLoading(false)
        }
    }

    const handleBackClick = () => {
        const parts = subpath.split('/')
        parts.pop()
        setSubpath(parts.join('/'))
    }

    const addToQueue = async (file) => {
        const currentQueue = category === 'curriculum' ? currQueue : histQueue;
        const setter = category === 'curriculum' ? setCurrQueue : setHistQueue;
        const limit = category === 'curriculum' ? 6 : 4;

        if (currentQueue.find(f => f.path === file.path)) {
            setActiveQueuePath(file.path)
            return
        }
        if (currentQueue.length >= limit) {
            alert(`Workbench Limit: Please remove a document before adding a new one (Max ${limit} for ${category}).`)
            return
        }

        setter([...currentQueue, file])
        setActiveQueuePath(file.path)

        // Fetch content if not cached
        if (!previewContent[file.path]) {
            try {
                if (file.extension === 'pdf') {
                    const res = await fetch(`/api/library/file?path=${encodeURIComponent(file.path)}`)
                    if (res.ok) {
                        const blob = await res.blob()
                        setPreviewContent(prev => ({ ...prev, [file.path]: URL.createObjectURL(blob) }))
                    }
                } else {
                    const metaRes = await fetch(`/api/library/file-info?path=${encodeURIComponent(file.path)}`)
                    if (metaRes.ok) {
                        const meta = await metaRes.json()
                        setPreviewContent(prev => ({ ...prev, [file.path]: meta.preview || 'No text content available.' }))
                    }
                }
            } catch (err) { console.error(err) }
        }
    }

    const removeFromQueue = (e, path) => {
        e.stopPropagation()
        if (category === 'curriculum') {
            setCurrQueue(prev => prev.filter(f => f.path !== path))
        } else {
            setHistQueue(prev => prev.filter(f => f.path !== path))
        }
        if (activeQueuePath === path) setActiveQueuePath(null)
    }

    return (
        <div className="flex flex-col h-full bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden relative">
            {/* Main Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-900/80">
                <button
                    onClick={() => { setCategory('curriculum'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'curriculum' ? 'text-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Book size={14} /> Curriculum
                </button>
                <button
                    onClick={() => { setCategory('history'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'history' ? 'text-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <History size={14} /> Letter Exchange History
                </button>
            </div>

            {/* CPID BADGE */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
                <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">
                            Prisoner Sponsee (searchable)
                        </span>
                        {manualCpid !== null && (
                            <button
                                onClick={() => setManualCpid(null)}
                                className="text-[10px] text-emerald-500 hover:text-emerald-400 font-mono uppercase tracking-tighter flex items-center gap-1"
                            >
                                <X size={10} /> Reset to Auto
                            </button>
                        )}
                    </div>
                    <input
                        type="text"
                        value={manualCpid !== null ? manualCpid : activeCpid}
                        onChange={(e) => setManualCpid(e.target.value)}
                        placeholder="Search IDs..."
                        className={`bg-transparent text-sm font-bold font-mono outline-none border-b border-transparent focus:border-emerald-500/30 py-1 transition-all ${manualCpid !== null ? 'text-amber-400' : 'text-emerald-400'}`}
                        title="ID used to filter the History tab"
                    />
                </div>
                {category === 'history' && <span className="text-[10px] text-slate-500 font-mono italic">Exchange Matching Active</span>}
            </div>

            {/* WORKBENCH TAB BAR */}
            <div className="flex bg-slate-950/50 border-b border-slate-800 overflow-x-auto h-12 shrink-0 no-scrollbar">
                <button
                    onClick={() => setActiveQueuePath(null)}
                    className={`px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 border-r border-slate-800 ${!activeQueuePath ? 'text-emerald-400 bg-slate-900' : 'text-slate-600 hover:text-slate-400'}`}
                >
                    <Folder size={12} /> Library
                </button>
                {queuedFiles.map(file => (
                    <div
                        key={file.path}
                        onClick={() => setActiveQueuePath(file.path)}
                        className={`px-4 flex items-center gap-3 cursor-pointer border-r border-slate-800 transition-all shrink-0 group ${activeQueuePath === file.path ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:bg-slate-900'}`}
                    >
                        <span className="text-[10px] font-bold truncate max-w-[120px]">{file.name}</span>
                        <button onClick={(e) => removeFromQueue(e, file.path)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                        </button>
                    </div>
                ))}
                {queuedFiles.length < workbenchLimit && (
                    <div className="px-4 flex items-center text-[10px] text-slate-700 font-mono italic shrink-0">
                        {workbenchLimit - queuedFiles.length} Slots Open
                    </div>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {activeQueuePath ? (
                    /* WORKBENCH PREVIEW */
                    <div className="flex-1 flex flex-col bg-slate-950 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="flex-1 overflow-auto p-6">
                            {!previewContent[activeQueuePath] ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                                    <Loader2 className="animate-spin" size={24} />
                                    <span className="text-[10px] uppercase font-mono tracking-widest">Hydrating Workbench...</span>
                                </div>
                            ) : activeQueuePath.toLowerCase().endsWith('.pdf') ? (
                                <iframe src={`${previewContent[activeQueuePath]}#toolbar=0`} className="w-full h-full border-none rounded shadow-2xl" />
                            ) : previewContent[activeQueuePath]?.startsWith('__IMAGE__:') ? (
                                <div className="flex items-center justify-center min-h-full">
                                    <img
                                        src={`/api/library/file?path=${encodeURIComponent(previewContent[activeQueuePath].split('__IMAGE__:')[1])}`}
                                        className="max-w-full h-auto rounded shadow-2xl border border-slate-800"
                                        alt="Archival Scan"
                                    />
                                </div>
                            ) : activeQueuePath.toLowerCase().endsWith('.docx') ? (
                                <div
                                    className="font-sans text-slate-300 leading-relaxed text-sm bg-slate-900/30 p-8 rounded-xl border border-slate-800 min-h-full docx-preview-container"
                                    dangerouslySetInnerHTML={{ __html: previewContent[activeQueuePath] }}
                                />
                            ) : (
                                <div className="font-sans text-slate-300 leading-relaxed text-sm bg-slate-900/30 p-8 rounded-xl border border-slate-800 min-h-full whitespace-pre-wrap">
                                    {previewContent[activeQueuePath]}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono truncate max-w-md">{activeQueuePath}</span>
                            <div className="flex gap-2">
                                {onInsert && activeQueuePath.toLowerCase().endsWith('.docx') && (
                                    <button
                                        onClick={() => onInsert(previewContent[activeQueuePath])}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-400 text-white text-[10px] font-bold uppercase tracking-widest rounded"
                                    >
                                        Insert into Response
                                    </button>
                                )}
                                <button
                                    onClick={() => window.open(`/api/library/file?path=${encodeURIComponent(activeQueuePath)}&download=true`, '_blank')}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded"
                                >
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* BROWSER / LIST VIEW */
                    <div className="flex flex-col h-full">
                        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Filter files..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="bg-slate-800 border-none rounded px-3 py-1 text-[10px] text-slate-300 focus:ring-1 focus:ring-emerald-500/50 w-48 font-mono outline-none"
                                />
                                {subpath && (
                                    <button onClick={handleBackClick} className="p-1 text-slate-500 hover:text-emerald-400"><ChevronLeft size={14} /></button>
                                )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest truncate ml-4">
                                Root / {subpath || category}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-700 gap-2">
                                    <Loader2 className="animate-spin" size={20} />
                                    <span className="text-[10px] font-mono">Syncing Vault...</span>
                                </div>
                            ) : files.length === 0 ? (
                                <div className="text-center py-20 text-slate-700 text-[10px] uppercase font-mono italic">Void Entry</div>
                            ) : (
                                files.filter(f => !filter || f.name.toLowerCase().includes(filter.toLowerCase())).map((file, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => file.is_dir && setSubpath(subpath ? `${subpath}/${file.name}` : file.name)}
                                        className={`group flex items-center gap-3 p-2 rounded transition-all cursor-pointer ${file.is_dir ? 'hover:bg-amber-500/5' : 'hover:bg-emerald-500/5'}`}
                                    >
                                        <div className={`p-1.5 rounded shrink-0 ${file.is_dir ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
                                            {file.is_dir ? <Folder size={14} /> : <FileText size={14} />}
                                        </div>

                                        <div className="truncate text-xs text-slate-400 font-medium group-hover:text-slate-200 transition-colors max-w-[250px] shrink-0">
                                            {file.name}
                                        </div>

                                        {!file.is_dir && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); addToQueue(file); }}
                                                className="p-1 px-2 opacity-0 group-hover:opacity-100 bg-emerald-600 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all shrink-0 ml-2"
                                            >
                                                <Eye size={10} /> Workbench
                                            </button>
                                        )}

                                        {file.is_dir && <ChevronRight size={12} className="text-slate-700 group-hover:text-amber-500 ml-auto" />}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ReferenceLibrary
