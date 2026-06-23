import { useEffect, useState } from 'react'
import { Clock, Cpu, Globe, Info, KeyRound, Save } from 'lucide-react'
import { formatTimeZoneDateTime, formatTimeZoneLabel, formatTimeZoneTime, getPanelTimeZone, setPanelTimeZone, TIME_ZONES } from '@/lib/timezone'

const STEAM_SETTINGS_KEY = 'apexgsp_steam_credentials'

type SteamSettings = {
  username: string
  password: string
  guardCode?: string
  savedAt?: string
}

function loadSteamSettings(): SteamSettings {
  try {
    const raw = window.localStorage.getItem(STEAM_SETTINGS_KEY)
    return raw ? JSON.parse(raw) as SteamSettings : { username: '', password: '', guardCode: '' }
  } catch {
    return { username: '', password: '', guardCode: '' }
  }
}

function saveSteamSettings(settings: SteamSettings) {
  window.localStorage.setItem(STEAM_SETTINGS_KEY, JSON.stringify({ ...settings, savedAt: new Date().toISOString() }))
}

export default function Settings() {
  const panelUrl = window.location.origin
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/node-api`
  const [timeZone, setTimeZone] = useState(getPanelTimeZone())
  const [nowTick, setNowTick] = useState(Date.now())
  const [message, setMessage] = useState('')
  const [steam, setSteam] = useState<SteamSettings>(() => loadSteamSettings())
  const [steamMessage, setSteamMessage] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function saveTimeZone() {
    setPanelTimeZone(timeZone)
    setMessage(`Timezone saved: ${formatTimeZoneLabel(timeZone)}`)
  }

  function saveSteam() {
    if (!steam.username.trim() || !steam.password) {
      setSteamMessage('Enter Steam username and password first.')
      return
    }
    saveSteamSettings({ username: steam.username.trim(), password: steam.password, guardCode: steam.guardCode || '' })
    setSteamMessage('Steam credentials saved in this browser for DayZ installs.')
  }

  function clearSteam() {
    window.localStorage.removeItem(STEAM_SETTINGS_KEY)
    setSteam({ username: '', password: '', guardCode: '' })
    setSteamMessage('Steam credentials removed from this browser.')
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
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Integrations</h2>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5"><KeyRound className="w-3.5 h-3.5 text-slate-400" /></div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-200">Steam Account</p>
              <p className="text-xs text-slate-500 mt-1">Used for games such as DayZ that cannot install dedicated server files anonymously.</p>
            </div>
            <input value={steam.username} onChange={event => setSteam(previous => ({ ...previous, username: event.target.value }))} placeholder="Steam username" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" />
            <input value={steam.password} onChange={event => setSteam(previous => ({ ...previous, password: event.target.value }))} placeholder="Steam password" type="password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" />
            <input value={steam.guardCode || ''} onChange={event => setSteam(previous => ({ ...previous, guardCode: event.target.value }))} placeholder="Steam Guard code if requested" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" />
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">MVP note: credentials are saved in this browser and included with DayZ create jobs. Next step is encrypted account storage.</div>
            {steamMessage && <p className="text-xs text-emerald-400">{steamMessage}</p>}
            <div className="flex gap-2">
              <button onClick={saveSteam} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500"><Save className="w-4 h-4" /> Save Steam</button>
              <button onClick={clearSteam} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-700 text-slate-300 hover:bg-slate-800">Clear</button>
            </div>
          </div>
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
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-500 mb-1">Current time in selected timezone</p>
              <p className="text-2xl font-semibold text-slate-100 font-mono">{formatTimeZoneTime(timeZone)}</p>
              <p className="text-xs text-slate-500 mt-1">{formatTimeZoneDateTime(timeZone)} • {formatTimeZoneLabel(timeZone)}</p>
              <span className="hidden">{nowTick}</span>
            </div>
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
  return <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5 text-slate-400" /></div><div className="flex-1 min-w-0"><p className="text-xs text-slate-500 mb-0.5">{label}</p><p className="text-xs font-mono text-slate-300 break-all">{value}</p></div></div>
}
