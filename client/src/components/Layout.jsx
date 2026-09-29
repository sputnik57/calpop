import { useState, useRef, useEffect } from 'react'
import { Shield, LayoutDashboard, Mail, FileText, Database, Users, LogIn, Languages, PenSquare, ChevronDown } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard, match: (path) => path === '/' },
    { label: 'Envelope Mgt', to: '/envelope', icon: Mail, match: (path) => path.startsWith('/envelope') || path === '/scantron' },
    {
        label: 'Letters', icon: FileText,
        match: (path) => path.startsWith('/inbox') || path.startsWith('/translate') || path.startsWith('/letters'),
        children: [
            { label: 'Letter Writing', to: '/inbox', match: (path) => path.startsWith('/inbox') },
            { label: 'Translation', to: '/translate', match: (path) => path.startsWith('/translate') },
            { label: 'Letter Mgt', to: '/letters', match: (path) => path.startsWith('/letters') && !path.startsWith('/letters/upload-to-sponsor') },
            { label: 'Upload to Sponsor', to: '/letters/upload-to-sponsor', match: (path) => path.startsWith('/letters/upload-to-sponsor') },
        ],
    },
    {
        label: 'People', icon: Users,
        match: (path) => path.startsWith('/prisoners') || path.startsWith('/sponsors'),
        children: [
            { label: 'Sponsees', to: '/prisoners', match: (path) => path.startsWith('/prisoners') },
            { label: 'Sponsors', to: '/sponsors', match: (path) => path.startsWith('/sponsors') },
        ],
    },
]

function NavDropdown({ item, active }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    const location = useLocation()

    useEffect(() => {
        const onClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    active ? 'bg-calpop-blue text-white' : 'text-white/65 hover:bg-white/10'
                }`}
            >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 min-w-[180px] bg-calpop-navy border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                    {item.children.map(child => {
                        const childActive = child.match(location.pathname)
                        return (
                            <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => setOpen(false)}
                                className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                                    childActive ? 'bg-calpop-blue text-white' : 'text-white/65 hover:bg-white/10'
                                }`}
                            >
                                {child.label}
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export function Layout() {
    const location = useLocation()

    return (
        <div className="min-h-screen bg-calpop-bg text-calpop-ink">
            <header className="bg-calpop-navy">
                <div className="max-w-[1600px] mx-auto px-8 py-7 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-8 h-8 text-calpop-accent" />
                        <div>
                            <h1 className="text-2xl font-extrabold text-white">CalPOP</h1>
                            <p className="text-white/55 text-[11px] tracking-wider">SECURE COMMAND CENTER</p>
                        </div>
                    </div>

                    <nav className="flex gap-2 items-center">
                        {NAV_ITEMS.map((item) => {
                            const active = item.match(location.pathname)
                            if (item.children) {
                                return <NavDropdown key={item.label} item={item} active={active} />
                            }
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                                        active ? 'bg-calpop-blue text-white' : 'text-white/65 hover:bg-white/10'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                        <a
                            href="/api/auth/dev-login?role=admin"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-amber-300 hover:bg-white/10 transition-colors"
                        >
                            <LogIn className="w-4 h-4" />
                            <span>Dev Login</span>
                        </a>
                    </nav>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-8 py-8">
                <Outlet />
            </main>
        </div>
    )
}
