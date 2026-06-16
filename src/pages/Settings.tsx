import { Cpu, Globe, Info } from 'lucide-react'

export default function Settings() {
  const panelUrl = window.location.origin
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/node-api`

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Panel configuration and endpoint references</p>
      </div>

      {/* Auth info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Authentication</h2>
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400">
            The panel uses email and password authentication. Create an account on the login page — no email confirmation is required.
          </p>
        </div>
      </div>

      {/* Panel endpoints */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Panel</h2>
        <div className="space-y-4">
          <SettingRow icon={Globe} label="Panel URL" value={panelUrl} />
          <SettingRow icon={Cpu}   label="Node API Endpoint" value={apiUrl} />
        </div>
      </div>

      {/* Daemon endpoints */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Daemon Endpoints</h2>
        <div className="bg-slate-950/60 rounded-lg p-4 space-y-2 font-mono text-xs">
          {[
            { method: 'POST', path: '/register' },
            { method: 'POST', path: '/heartbeat' },
            { method: 'GET',  path: '/health' },
          ].map(({ method, path }) => (
            <div key={path} className="flex gap-3">
              <span className={`shrink-0 w-10 text-right font-semibold ${method === 'POST' ? 'text-brand-400' : 'text-emerald-400'}`}>
                {method}
              </span>
              <span className="text-slate-300">{apiUrl}{path}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingRow({ icon: Icon, label, value }: { icon: typeof Globe; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-xs font-mono text-slate-300 break-all">{value}</p>
      </div>
    </div>
  )
}
