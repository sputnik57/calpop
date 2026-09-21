import React, { useState, useEffect } from 'react'
import { Book, History, FileText, ChevronRight, Download, Eye, X, Loader2, Folder, ChevronLeft, HardDrive, Languages, Copy, Check, FolderSync } from 'lucide-react'

const WORKBENCH_LIMITS = { curriculum: 6, history: 4, local: 6, translations: 4, course_students: 6 }

const ReferenceLibrary = ({ onInsert, initialCpid, ocrText, workbenchState }) => {
    const {
        currQueue, setCurrQueue,
        histQueue, setHistQueue,
        localQueue, setLocalQueue,
        transQueue, setTransQueue,
        courseQueue, setCourseQueue,
        activeQueuePath, setActiveQueuePath,
        previewContent, setPreviewContent
    } = workbenchState;

    const [category, setCategory] = useState('curriculum') // 'curriculum', 'history', 'local', 'translations', or 'course_students'
    const [subpath, setSubpath] = useState('')
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('')
    const [manualCpid, setManualCpid] = useState('')
    const [hostPaths, setHostPaths] = useState({})
    const [pathCopied, setPathCopied] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [translatingDoc, setTranslatingDoc] = useState(false)
    const [winPathCopied, setWinPathCopied] = useState(false)
    const fileInputRef = React.useRef(null)

    useEffect(() => {
        fetch('/api/library/host-paths', { credentials: 'include' })
            .then(res => res.ok ? res.json() : {})
            .then(setHostPaths)
            .catch(() => {})
    }, [])

    const copyHostPath = () => {
        const path = hostPaths[category]
        if (!path) return
        navigator.clipboard.writeText(path).then(() => {
            setPathCopied(true)
            setTimeout(() => setPathCopied(false), 2000)
        })
    }

    const queueByCategory = { curriculum: [currQueue, setCurrQueue], history: [histQueue, setHistQueue], local: [localQueue, setLocalQueue], translations: [transQueue, setTransQueue], course_students: [courseQueue, setCourseQueue] };
    const [queuedFiles, setQueuedFiles] = queueByCategory[category];
    const workbenchLimit = WORKBENCH_LIMITS[category];

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
        if ((category === 'history' || category === 'translations') && activeCpid) {
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

    // No in-app editor: documents are edited in Word. This copies the
    // \\wsl.localhost\... path so it can be pasted into Word's File > Open (Word
    // then saves straight back to the file). Refuses for Local Files, which
    // is an in-container cache with no host path.
    const handleCopyWindowsPath = async (path) => {
        try {
            const res = await fetch(`/api/library/windows-path?path=${encodeURIComponent(path)}`, { credentials: 'include' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Couldn't get the Windows path (${res.status})`)
            await navigator.clipboard.writeText(data.windows_path)
            setWinPathCopied(true)
            setTimeout(() => setWinPathCopied(false), 2500)
        } catch (err) {
            alert(err.message)
        }
    }

    // Adds a Spanish paragraph after every English one (Rey's curriculum ships
    // bilingual) via Google Cloud Translate, saved to data/course_students. The
    // window.confirm is the deliberate act the server also insists on
    // (no_personal_info_confirmed) -- this sends the document's text to Google.
    const handleTranslateToSpanish = async (path) => {
        const ok = window.confirm(
            'Send this document\'s text to Google Translate to add a Spanish version after each paragraph?\n\n' +
            'Only do this for public curriculum/worksheets -- nothing with names, addresses, or other personal details.'
        )
        if (!ok) return
        setTranslatingDoc(true)
        try {
            const res = await fetch('/api/library/translate-to-spanish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ path, no_personal_info_confirmed: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Translation failed (${res.status})`)
            // Output goes to data/course_students, not a library tab, so there's
            // nothing to open in the workbench -- download it (into the browser's
            // normal Downloads folder, from where it's moved to a Windows folder)
            // and say where the durable copy is.
            const a = document.createElement('a')
            a.href = `/api/library/file?path=${encodeURIComponent(data.path)}&download=true`
            a.download = data.name
            document.body.appendChild(a)
            a.click()
            a.remove()
            alert(`Saved ${data.name}\n\nOn disk: data/course_students/${data.name}\nA copy is downloading to your browser's Downloads folder.`)
        } catch (err) {
            alert(err.message)
        } finally {
            setTranslatingDoc(false)
        }
    }

    // Opens the browser's native OS file picker (no server-side desktop
    // access needed -- the browser does this itself) and uploads the picked
    // file into the Local Files ephemeral cache. A copy, not a move: the
    // original on the uploader's Windows drive is untouched.
    const handleFileSelected = async (e) => {
        const picked = Array.from(e.target.files || [])
        e.target.value = '' // allow re-selecting the same file later
        if (!picked.length) return
        setUploading(true)
        const failed = []
        try {
            // One request per file, in order -- simple and keeps a single bad
            // file from sinking the rest of a batch.
            for (const file of picked) {
                try {
                    const formData = new FormData()
                    formData.append('file', file)
                    const res = await fetch(`/api/library/upload?category=${category}`, {
                        method: 'POST',
                        credentials: 'include',
                        body: formData,
                    })
                    if (!res.ok) failed.push(file.name)
                } catch (err) {
                    failed.push(file.name)
                }
            }
            await fetchFiles()
            if (failed.length) alert(`Couldn't upload: ${failed.join(', ')}`)
        } finally {
            setUploading(false)
        }
    }

    const addToQueue = async (file) => {
        const [currentQueue, setter] = queueByCategory[category];
        const limit = WORKBENCH_LIMITS[category];

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

    // Drops a document from the workbench; if it was the one on screen, goes
    // back to the file list.
    const closeDocument = (path) => {
        const [, setter] = queueByCategory[category];
        setter(prev => prev.filter(f => f.path !== path))
        if (activeQueuePath === path) setActiveQueuePath(null)
    }

    const removeFromQueue = (e, path) => {
        e.stopPropagation()
        closeDocument(path)
    }

    return (
        <div className="flex flex-col h-full bg-calpop-panel rounded-xl border border-calpop-navy/15 overflow-hidden relative">
            {/* Main Tabs */}
            <div className="flex border-b border-calpop-navy/15 bg-white">
                <button
                    onClick={() => { setCategory('curriculum'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'curriculum' ? 'text-calpop-blue bg-calpop-blue/10' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                >
                    <Book size={14} /> Curriculum
                </button>
                <button
                    onClick={() => { setCategory('history'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'history' ? 'text-calpop-blue bg-calpop-blue/10' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                >
                    <History size={14} /> Letter Exchange History
                </button>
                <button
                    onClick={() => { setCategory('local'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'local' ? 'text-calpop-blue bg-calpop-blue/10' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                    title="Files migrated from Rey's own Windows drives"
                >
                    <HardDrive size={14} /> Local Files
                </button>
                <button
                    onClick={() => { setCategory('translations'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'translations' ? 'text-calpop-blue bg-calpop-blue/10' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                    title="Letters saved from the Translate tool"
                >
                    <Languages size={14} /> Translations
                </button>
                <button
                    onClick={() => { setCategory('course_students'); setSubpath(''); setActiveQueuePath(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${category === 'course_students' ? 'text-calpop-blue bg-calpop-blue/10' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                    title="The single exchange folder with Windows: Add Spanish output lands here, and you upload/download to sync"
                >
                    <FolderSync size={14} /> Course Students
                </button>
            </div>

            {/* CPID BADGE */}
            <div className="px-4 py-3 bg-white border-b border-calpop-navy/15 flex items-center justify-between">
                <div className="flex flex-col flex-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-calpop-navy/70 font-mono uppercase tracking-tighter">
                            Prisoner Sponsee (searchable)
                        </span>
                        {manualCpid !== null && (
                            <button
                                onClick={() => setManualCpid(null)}
                                className="text-[10px] text-calpop-blue hover:text-calpop-navy font-mono uppercase tracking-tighter flex items-center gap-1"
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
                        className={`bg-transparent text-sm font-bold font-mono outline-none border-b border-transparent focus:border-calpop-blue/40 py-1 transition-all ${manualCpid !== null ? 'text-calpop-accent' : 'text-calpop-blue'}`}
                        title="ID used to filter the History tab"
                    />
                </div>
                {(category === 'history' || category === 'translations') && <span className="text-[10px] text-calpop-navy/70 font-mono italic">Exchange Matching Active</span>}
            </div>

            {/* WORKBENCH TAB BAR */}
            <div className="flex bg-calpop-panel border-b border-calpop-navy/10 overflow-x-auto h-12 shrink-0 no-scrollbar">
                <button
                    onClick={() => setActiveQueuePath(null)}
                    className={`px-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 border-r border-calpop-navy/10 ${!activeQueuePath ? 'text-calpop-blue bg-white' : 'text-calpop-navy/70 hover:text-calpop-navy'}`}
                >
                    <Folder size={12} /> Library
                </button>
                {queuedFiles.map(file => (
                    <div
                        key={file.path}
                        onClick={() => setActiveQueuePath(file.path)}
                        className={`px-4 flex items-center gap-3 cursor-pointer border-r border-calpop-navy/10 transition-all shrink-0 group ${activeQueuePath === file.path ? 'bg-white text-calpop-blue' : 'text-calpop-navy/70 hover:bg-white'}`}
                    >
                        <span className="text-[10px] font-bold truncate max-w-[120px]">{file.name}</span>
                        <button onClick={(e) => removeFromQueue(e, file.path)} title="Close this document" className="text-calpop-navy/70 hover:text-red-500 p-0.5 rounded hover:bg-calpop-navy/10">
                            <X size={14} />
                        </button>
                    </div>
                ))}
                {queuedFiles.length < workbenchLimit && (
                    <div className="px-4 flex items-center text-[10px] text-calpop-navy/70 font-mono italic shrink-0">
                        {workbenchLimit - queuedFiles.length} Slots Open
                    </div>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {activeQueuePath ? (
                    /* WORKBENCH PREVIEW */
                    <div className="flex-1 flex flex-col bg-calpop-panel animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {/* Top bar, always at the top of the open document -- the
                            footer below can end up off-screen on a long document,
                            so closing shouldn't depend on scrolling to it. */}
                        <div className="px-4 py-2 bg-white border-b border-calpop-navy/15 flex items-center justify-between gap-3">
                            <button
                                onClick={() => setActiveQueuePath(null)}
                                className="flex items-center gap-1.5 text-[11px] font-bold text-calpop-blue hover:text-calpop-navy"
                                title="Back to the file list -- keeps this document open in its tab"
                            >
                                <ChevronLeft size={14} /> Back to files
                            </button>
                            <span className="text-[11px] font-mono text-calpop-navy/75 truncate">{activeQueuePath.split('/').pop()}</span>
                            <button
                                onClick={() => closeDocument(activeQueuePath)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded border border-calpop-navy/25 hover:bg-calpop-navy/10 text-[11px] font-bold text-calpop-navy shrink-0"
                                title="Close this document"
                            >
                                <X size={13} /> Close
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            {!previewContent[activeQueuePath] ? (
                                <div className="flex flex-col items-center justify-center h-full text-calpop-navy/70 gap-3">
                                    <Loader2 className="animate-spin" size={24} />
                                    <span className="text-[10px] uppercase font-mono tracking-widest">Hydrating Workbench...</span>
                                </div>
                            ) : activeQueuePath.toLowerCase().endsWith('.pdf') ? (
                                <iframe src={`${previewContent[activeQueuePath]}#toolbar=0`} className="w-full h-full border-none rounded shadow-2xl" />
                            ) : previewContent[activeQueuePath]?.startsWith('__IMAGE__:') ? (
                                <div className="flex items-center justify-center min-h-full">
                                    <img
                                        src={`/api/library/file?path=${encodeURIComponent(previewContent[activeQueuePath].split('__IMAGE__:')[1])}`}
                                        className="max-w-full h-auto rounded shadow-2xl border border-calpop-navy/15"
                                        alt="Archival Scan"
                                    />
                                </div>
                            ) : activeQueuePath.toLowerCase().endsWith('.docx') ? (
                                <div
                                    className="font-sans text-calpop-navy leading-relaxed text-sm bg-white p-8 rounded-xl border border-calpop-navy/15 min-h-full docx-preview-container"
                                    dangerouslySetInnerHTML={{ __html: previewContent[activeQueuePath] }}
                                />
                            ) : (
                                <div className="font-sans text-calpop-navy leading-relaxed text-sm bg-white p-8 rounded-xl border border-calpop-navy/15 min-h-full whitespace-pre-wrap">
                                    {previewContent[activeQueuePath]}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t border-calpop-navy/15 flex justify-between items-center">
                            <span className="text-[10px] text-calpop-navy/70 font-mono truncate max-w-md">{activeQueuePath}</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => closeDocument(activeQueuePath)}
                                    className="px-4 py-2 bg-white border border-calpop-navy/25 hover:bg-calpop-navy/10 text-calpop-navy text-[10px] font-bold uppercase tracking-widest rounded flex items-center gap-1.5"
                                    title="Close this document and go back to the file list"
                                >
                                    <X size={12} /> Close
                                </button>
                                {/\.(docx|txt)$/i.test(activeQueuePath) && !/_bilingual/i.test(activeQueuePath) && (
                                    <button
                                        onClick={() => handleTranslateToSpanish(activeQueuePath)}
                                        disabled={translatingDoc}
                                        className="px-4 py-2 bg-calpop-accent hover:brightness-95 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-widest rounded flex items-center gap-1.5"
                                        title="Adds a Spanish translation after each English paragraph -- saved as a new _bilingual copy in data/course_students and downloaded"
                                    >
                                        {translatingDoc ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
                                        {translatingDoc ? 'Translating...' : 'Add Spanish'}
                                    </button>
                                )}
                                {onInsert && activeQueuePath.toLowerCase().endsWith('.docx') && (
                                    <button
                                        onClick={() => onInsert(previewContent[activeQueuePath])}
                                        className="px-4 py-2 bg-calpop-blue hover:bg-calpop-navy text-white text-[10px] font-bold uppercase tracking-widest rounded"
                                    >
                                        Insert into Response
                                    </button>
                                )}
                                <button
                                    onClick={() => handleCopyWindowsPath(activeQueuePath)}
                                    className="px-4 py-2 bg-calpop-panel hover:bg-calpop-navy/10 text-calpop-navy text-[10px] font-bold uppercase tracking-widest rounded flex items-center gap-1.5"
                                    title="Copies this file's FOLDER path -- paste it into Word's File > Open, then pick the file to edit it in place"
                                >
                                    {winPathCopied ? <Check size={11} /> : <Copy size={11} />}
                                    {winPathCopied ? 'Folder path copied' : 'Copy folder path'}
                                </button>
                                <button
                                    onClick={() => window.open(`/api/library/file?path=${encodeURIComponent(activeQueuePath)}&download=true`, '_blank')}
                                    className="px-4 py-2 bg-calpop-panel hover:bg-calpop-navy/10 text-calpop-navy text-[10px] font-bold uppercase tracking-widest rounded"
                                >
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* BROWSER / LIST VIEW */
                    <div className="flex flex-col h-full">
                        <div className="px-4 py-2 border-b border-calpop-navy/10 bg-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Filter files..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="bg-calpop-panel border-none rounded px-3 py-1 text-[10px] text-calpop-navy focus:ring-1 focus:ring-calpop-blue/50 w-48 font-mono outline-none"
                                />
                                {subpath && (
                                    <button onClick={handleBackClick} className="p-1 text-calpop-navy/70 hover:text-calpop-blue"><ChevronLeft size={14} /></button>
                                )}
                            </div>
                            <div className="flex items-center gap-3 ml-4 shrink-0">
                                {(category === 'local' || category === 'course_students') && (
                                    <>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            onChange={handleFileSelected}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-calpop-blue text-white hover:bg-calpop-navy disabled:opacity-50"
                                        >
                                            {uploading ? <Loader2 size={11} className="animate-spin" /> : <HardDrive size={11} />}
                                            {uploading ? 'Uploading...' : 'Upload'}
                                        </button>
                                    </>
                                )}
                                <div className="text-[10px] font-mono text-calpop-navy/70 uppercase tracking-widest truncate">
                                    Root / {subpath || category}
                                </div>
                            </div>
                        </div>

                        {category === 'local' ? (
                            <div className="px-4 py-1.5 border-b border-calpop-navy/10 bg-calpop-panel">
                                <span className="text-[10px] text-calpop-navy/75" title="Uploaded files are a temporary copy for this session only -- cleared on every app restart. Your Windows/WSL folder stays the real source of truth.">
                                    Session cache only -- cleared on restart. Upload a copy of a curriculum or past-letter file from your computer's native file picker.
                                </span>
                            </div>
                        ) : category === 'course_students' ? (
                            <div className="px-4 py-1.5 border-b border-calpop-navy/10 bg-calpop-panel flex items-center justify-between gap-2">
                                <span className="text-[10px] text-calpop-navy/75" title="Files here are kept (not wiped on restart). Upload copies files in from Windows; Download copies them out.">
                                    Exchange folder with Windows -- kept, not wiped. Upload copies files in; open a file and Download to copy it out.
                                    {hostPaths.course_students && <span className="font-mono ml-2">{hostPaths.course_students}</span>}
                                </span>
                            </div>
                        ) : hostPaths[category] && (
                            <div className="px-4 py-1.5 border-b border-calpop-navy/10 bg-calpop-panel flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono text-calpop-navy/75 truncate" title="This is where files for this tab actually live on disk -- add/remove them here, outside the app">
                                    {hostPaths[category]}
                                </span>
                                <button
                                    onClick={copyHostPath}
                                    className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-calpop-blue hover:text-calpop-navy"
                                    title="Copy this path"
                                >
                                    {pathCopied ? <Check size={11} /> : <Copy size={11} />}
                                    {pathCopied ? 'Copied' : 'Copy path'}
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40 text-calpop-navy/70 gap-2">
                                    <Loader2 className="animate-spin" size={20} />
                                    <span className="text-[10px] font-mono">Syncing Vault...</span>
                                </div>
                            ) : files.length === 0 ? (
                                <div className="text-center py-20 text-calpop-navy/70 text-[10px] uppercase font-mono italic">Void Entry</div>
                            ) : (
                                files.filter(f => !filter || f.name.toLowerCase().includes(filter.toLowerCase())).map((file, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => file.is_dir ? setSubpath(subpath ? `${subpath}/${file.name}` : file.name) : addToQueue(file)}
                                        className={`group flex items-center gap-3 p-2 rounded transition-all cursor-pointer ${file.is_dir ? 'hover:bg-calpop-accent/5' : 'hover:bg-calpop-blue/5'}`}
                                    >
                                        <div className={`p-1.5 rounded shrink-0 ${file.is_dir ? 'bg-calpop-accent/10 text-calpop-accent' : 'bg-calpop-panel text-calpop-navy'}`}>
                                            {file.is_dir ? <Folder size={14} /> : <FileText size={14} />}
                                        </div>

                                        <div className="truncate text-xs text-calpop-navy font-medium group-hover:text-calpop-ink transition-colors max-w-[250px] shrink-0">
                                            {file.name}
                                        </div>

                                        {!file.is_dir && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); addToQueue(file); }}
                                                className="p-1 px-2 opacity-0 group-hover:opacity-100 bg-calpop-blue text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-lg active:scale-95 transition-all shrink-0 ml-2"
                                            >
                                                <Eye size={10} /> Workbench
                                            </button>
                                        )}

                                        {file.is_dir && <ChevronRight size={12} className="text-calpop-navy/70 group-hover:text-calpop-accent ml-auto" />}
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
