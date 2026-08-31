import { Shield, LayoutDashboard, Mail, FileText, Database, Users, LogIn, Languages } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard, match: (path) => path === '/' },
    { label: 'Envelope Mgt', to: '/envelope', icon: Mail, match: (path) => path.startsWith('/envelope') || path === '/scantron' },
    { label: 'Translate', to: '/translate', icon: Languages, match: (path) => path.startsWith('/translate') },
    { label: 'Letter Mgt', to: '/letters', icon: FileText, match: (path) => path.startsWith('/letters') || path.startsWith('/inbox') },
    { label: 'DB Mgt', to: '/prisoners', icon: Database, match: (path) => path.startsWith('/prisoners') },
    { label: 'Sponsors', to: '/sponsors', icon: Users, match: (path) => path.startsWith('/sponsors') },
]

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

                    <nav className="flex gap-2">
                        {NAV_ITEMS.map(({ label, to, icon: Icon, match }) => {
                            const active = match(location.pathname)
                            return (
                                <Link
                                    key={to}
                                    to={to}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                                        active ? 'bg-calpop-blue text-white' : 'text-white/65 hover:bg-white/10'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span>{label}</span>
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
