import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Server, User, Settings, LogOut, Activity, ChevronRight, Gamepad2, Sparkles, Terminal } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/nodes', label: 'Nodes', icon: Server },
  { to: '/jobs', label: 'Jobs', icon: Terminal },
  { to: '/servers', label: 'Servers', icon: Gamepad2 },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const licenceBadgeClass: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25 shadow-emerald-950/20',
  trial: 'bg-amber-500/10 text-amber-300 border-amber-400/25',
  inactive: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  suspended: 'bg-red-500/10 text-red-300 border-red-400/25',
}

export default function Layout() {
  const { profile, licence, signOut } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-transparent text-slate-100">
      <aside className="relative w-72 shrink-0 overflow-hidden border-r border-white/10 bg-slate-950/80 backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/15 to-transparent" />
        <div className="relative flex h-full flex-col">
          <div className="px-5 py-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-slate-900 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/40">
                <Server className="w-5 h-5 text-slate-950" />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-300 shadow-lg shadow-emerald-400/60" />
              </div>
              <div>
                <span className="font-black text-slate-100 text-base tracking-tight leading-none block">ApexGSP</span>
                <span className="text-emerald-300/80 text-xs leading-none mt-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Command Centre</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-1.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-all duration-200', isActive ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/10 text-emerald-100 ring-1 ring-emerald-400/25 shadow-lg shadow-emerald-950/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}>
                {({ isActive }) => <><span className={cn('flex h-8 w-8 items-center justify-center rounded-xl border transition-all', isActive ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/5 bg-white/[0.03] group-hover:border-white/10')}><Icon className={cn('w-4 h-4 shrink-0 transition-colors', isActive ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300')} /></span><span>{label}</span>{isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-300" />}</>}
              </NavLink>
            ))}
          </nav>

          <div className="px-4 py-5 border-t border-white/10 space-y-4">
            {licence && <div className={cn('flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-xs font-bold backdrop-blur', licenceBadgeClass[licence.status])}><Activity className="w-3.5 h-3.5 shrink-0" /><span className="capitalize">{licence.status} licence</span><span className="ml-auto opacity-70">{licence.max_nodes} nodes</span></div>}
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden shrink-0 ring-1 ring-white/10">{profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.username ?? 'User'} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-bold">{(profile?.username ?? 'U')[0].toUpperCase()}</div>}</div>
              <div className="flex-1 min-w-0"><p className="text-slate-100 text-xs font-bold truncate">{profile?.username ?? 'Loading...'}</p><p className="text-slate-500 text-xs">Operator</p></div>
              <button onClick={signOut} className="p-2 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0" title="Sign out"><LogOut className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </aside>
      <main className="relative flex-1 overflow-y-auto"><div className="pointer-events-none fixed right-8 top-8 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" /><Outlet /></main>
    </div>
  )
}
