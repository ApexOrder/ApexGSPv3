import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Server, User, Settings, LogOut, Activity, ChevronRight, Gamepad2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/nodes', label: 'Nodes', icon: Server },
  { to: '/servers', label: 'Servers', icon: Gamepad2 },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const licenceBadgeClass: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  trial:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  inactive: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function Layout() {
  const { profile, licence, signOut } = useAuth()

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-slate-900 border-r border-slate-800 shrink-0">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-100 text-sm tracking-tight leading-none block">ApexGSP</span>
              <span className="text-slate-500 text-xs leading-none mt-0.5 block">Panel</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0 transition-colors', isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-400')} />
                  {label}
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto text-brand-500" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-800 space-y-3">
          {licence && (
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium', licenceBadgeClass[licence.status])}>
              <Activity className="w-3 h-3 shrink-0" />
              <span className="capitalize">{licence.status} licence</span>
              <span className="ml-auto opacity-60">{licence.max_nodes} nodes</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username ?? 'User'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                  {(profile?.username ?? 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 text-xs font-medium truncate">{profile?.username ?? 'Loading...'}</p>
              <p className="text-slate-500 text-xs">Discord</p>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
