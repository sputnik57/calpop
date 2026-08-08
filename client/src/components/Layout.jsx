import { Shield, LayoutDashboard, Mail, LogIn, Inbox, Camera, Users } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function Layout() {
    const location = useLocation()

    const isActive = (path) => {
        return location.pathname === path ? "bg-slate-700 text-emerald-400" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
            <header className="max-w-6xl mx-auto mb-8 border-b border-slate-700 pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield className="w-8 h-8 text-emerald-400" />
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                                CalPOP
                            </h1>
                            <p className="text-slate-400 text-xs tracking-wider">SECURE COMMAND CENTER</p>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex gap-2">
                        <Link
                            to="/"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/')}`}
                            title="Command Center Overview: System telemetry and security vault status."
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            <span className="font-medium">Dashboard</span>
                        </Link>
                        <Link
                            to="/inbox"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/inbox')}`}
                            title="Work Queue: View and process active response assignments."
                        >
                            <Inbox className="w-4 h-4" />
                            <span className="font-medium">Work Queue</span>
                        </Link>
                        <Link
                            to="/scantron"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/scantron')}`}
                            title="Intake Area: AI-powered scanner and ID detection for new letters."
                        >
                            <Camera className="w-4 h-4" />
                            <span className="font-medium">Intake Area</span>
                        </Link>
                        <Link
                            to="/prisoners"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/prisoners')}`}
                            title="Directory: Search the secure database of prisoners and sponsors."
                        >
                            <Users className="w-4 h-4" />
                            <span className="font-medium">Directory</span>
                        </Link>
                        <Link
                            to="/letters"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/letters')}`}
                            title="Archives: Historical record of all processed correspondence."
                        >
                            <Mail className="w-4 h-4" />
                            <span className="font-medium">Archives</span>
                        </Link>
                        <a
                            href="/api/auth/dev-login?role=admin"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors"
                        >
                            <LogIn className="w-4 h-4" />
                            <span className="font-medium">Dev Login</span>
                        </a>
                    </nav>
                </div>
            </header>

            <main className="max-w-6xl mx-auto">
                <Outlet />
            </main>
        </div>
    )
}
