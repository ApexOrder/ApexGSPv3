import { useState } from 'react'
import { Clock, Cpu, Globe, Info, Save } from 'lucide-react'
import { formatTimeZoneLabel, getPanelTimeZone, setPanelTimeZone, TIME_ZONES } from '@/lib/timezone'

export default function Settings() {
  const panelUrl = window.location.origin
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/node-api`
  const [timeZone, setTimeZone] = useState(getPanelTimeZone())
  const [message, setMessage] = useState('')

  function saveTimeZone() {
    setPanelTimeZone(timeZone)
    setMessage(`Timezone saved: ${formatTimeZoneLabel(timeZone)}`)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Panel configuration and endpoint references</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Authentication</h2>
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400">The panel uses email and password authentication. Create an account on the login page — no email confirmation is required.</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Timezone</h2>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5"><Clock className="w-3.5 h-3.5 text-slate-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-1">Panel scheduler timezone</p>
            <select value={timeZone} onChange={event => setTimeZone(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand-500">
              {TIME_ZONES.map(zone => <option key={zone} value={zone}>{formatTimeZoneLabel(zone)}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-2">Scheduler times will be sent to the daemon using this timezone.</p>
            {message && <p className="text-xs text-emerald-400 mt-2">{message}</p>}
            <button onClick={saveTimeZone} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500"><Save className="w-4 h-4" /> Save timezone</button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Panel</h2>
        <div className="space-y-4">
          <SettingRow icon={Globe} label="Panel URL" value={panelUrl} />
          <SettingRow icon={Cpu} label="Node API Endpoint" value={apiUrl} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Daemon Endpoints</h2>
        <div className="bg-slate-950/60 rounded-lg p-4 space-y-2 font-mono text-xs">
          {[{ method: 'POST', path: '/register' }, { method: 'POST', path: '/heartbeat' }, { method: 'GET', path: '/health' }].map(({ method, path }) => (
            <div key={path} className="flex gap-3"><span className={`shrink-0 w-10 text-right font-semibold ${method === 'POST' ? 'text-brand-400' : 'text-emerald-400'}`}>{method}</span><span className="text-slate-300">{apiUrl}{path}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingRow({ icon: Icon, label, value }: { icon: typeof Globe; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5 text-slate-400" /></div>
      <div className="flex-1 min-w-0"><p className="text-xs text-slate-500 mb-0.5">{label}</p><p className="text-xs font-mono text-slate-300 break-all">{value}</p></div>
    </div>
  )
}
