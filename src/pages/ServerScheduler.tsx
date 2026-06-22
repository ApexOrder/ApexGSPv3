import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Play, RefreshCw, Save } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatTimeZoneLabel, formatTimeZoneTime, getPanelTimeZone } from '@/lib/timezone'
import type { GameServer } from '@/lib/types'

type BackupMode = 'full' | 'world'
type ScheduleFrequency = 'hourly' | 'daily' | 'weekly'
type BackupSchedule = { id: string; serverId: string; installPath: string; backupMode: BackupMode; enabled: boolean; frequency: ScheduleFrequency; time: string; dayOfWeek?: number; retention: number; lastRunAt?: string | null; nextRunAt: string; lastResult?: string | null; lastError?: string | null; timeZone?: string }
type DaemonTime = { iso: string; local: string; timeZone: string; offset: string }
type ScheduleResult = { message?: string; schedules?: BackupSchedule[]; schedule?: BackupSchedule; scheduleId?: string; daemonTime?: DaemonTime }

function formatDate(value?: string | null, timeZone = getPanelTimeZone()) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-GB', { timeZone })
}

export default function ServerScheduler() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<GameServer | null>(null)
  const [schedules, setSchedules] = useState<BackupSchedule[]>([])
  const [daemonTime, setDaemonTime] = useState<DaemonTime | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [backupMode, setBackupMode] = useState<BackupMode>('world')
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily')
  const [time, setTime] = useState('03:00')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [retention, setRetention] = useState(7)
  const [enabled, setEnabled] = useState(true)
  const [nowTick, setNowTick] = useState(Date.now())
  const panelTimeZone = getPanelTimeZone()

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase.from('servers').select('*').eq('user_id', user.id).eq('id', id).maybeSingle()
    if (error) setMessage(error.message)
    setServer((data ?? null) as GameServer | null)
    setLoading(false)
  }

  async function direct(action: 'schedule_list' | 'schedule_save' | 'schedule_delete' | 'schedule_run', extra: Record<string, unknown> = {}) {
    if (!server) return null
    const result = await callNodeApi<ScheduleResult>(session, action, { server_id: server.id, serverName: server.name, installPath: server.install_path, timeZone: panelTimeZone, ...extra })
    if (result.daemonTime) setDaemonTime(result.daemonTime)
    setMessage(result.message || 'Schedule action completed')
    return result
  }

  async function loadSchedules() {
    if (!server) return
    setBusy(true)
    try { const result = await direct('schedule_list'); setSchedules(result?.schedules || []) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function saveSchedule() {
    if (!server) return
    setBusy(true)
    try { const result = await direct('schedule_save', { backupMode, frequency, time, dayOfWeek, retention, enabled, timeZone: panelTimeZone }); if (result?.schedule) setSchedules(prev => [result.schedule as BackupSchedule, ...prev.filter(schedule => schedule.id !== result.schedule?.id)]) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function runNow(schedule: BackupSchedule) {
    setBusy(true)
    try { await direct('schedule_run', { scheduleId: schedule.id }); await loadSchedules() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function removeSchedule(schedule: BackupSchedule) {
    if (!confirm(`Remove ${schedule.backupMode} ${schedule.frequency} schedule?`)) return
    setBusy(true)
    try { await direct('schedule_delete', { scheduleId: schedule.id }); setSchedules(prev => prev.filter(item => item.id !== schedule.id)) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  useEffect(() => { fetchServer() }, [user, id])
  useEffect(() => { if (server) loadSchedules() }, [server?.id])
  useEffect(() => { const timer = window.setInterval(() => setNowTick(Date.now()), 1000); return () => window.clearInterval(timer) }, [])

  if (loading) return <div className="p-8 text-slate-400">Loading scheduler...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to server</button>
      <div className="flex items-center justify-between mb-6"><div><div className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-brand-400" /><h1 className="text-2xl font-bold text-slate-100 tracking-tight">Scheduler</h1></div><p className="text-slate-400 text-sm mt-1">Automated backups for {server.name}</p></div><button onClick={loadSchedules} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40"><RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh</button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-200 font-mono">{message || 'Ready'}</span></p></div><div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Current scheduler time</p><p className="text-2xl text-slate-100 font-semibold font-mono">{formatTimeZoneTime(panelTimeZone)}</p><p className="text-xs text-slate-500 mt-1">{formatTimeZoneLabel(panelTimeZone)}</p><p className="text-xs text-slate-600 mt-1">Daemon reports: {daemonTime ? `${daemonTime.timeZone} • ${daemonTime.offset}` : 'Loading...'}</p><span className="hidden">{nowTick}</span></div></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6"><div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-sm font-semibold text-slate-200 mb-3">Create schedule</p><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Mode<select value={backupMode} onChange={event => setBackupMode(event.target.value as BackupMode)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"><option value="world">World</option><option value="full">Full</option></select></label><label className="text-xs text-slate-400">Frequency<select value={frequency} onChange={event => setFrequency(event.target.value as ScheduleFrequency)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label className="text-xs text-slate-400">Time<input type="time" value={time} onChange={event => setTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200" /></label><label className="text-xs text-slate-400">Keep<input type="number" min={1} max={100} value={retention} onChange={event => setRetention(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200" /></label><label className="text-xs text-slate-400 col-span-2">Weekly day<select value={dayOfWeek} onChange={event => setDayOfWeek(Number(event.target.value))} disabled={frequency !== 'weekly'} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 disabled:opacity-40"><option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option></select></label></div><label className="flex items-center gap-2 text-sm text-slate-300 mt-4"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enabled</label><button onClick={saveSchedule} disabled={busy} className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40"><Save className="w-4 h-4" /> Save Schedule</button></div>
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"><div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500"><div className="col-span-2">Mode</div><div className="col-span-2">Frequency</div><div className="col-span-3">Next</div><div className="col-span-3">Last</div><div className="col-span-2 text-right">Actions</div></div>{schedules.length === 0 ? <p className="p-6 text-sm text-slate-500">No schedules yet.</p> : schedules.map(schedule => (<div key={schedule.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 last:border-b-0 items-center hover:bg-slate-800/40"><div className="col-span-2 text-xs capitalize text-slate-300">{schedule.backupMode}</div><div className="col-span-2 text-xs capitalize text-slate-400">{schedule.frequency}</div><div className="col-span-3 text-xs text-slate-400">{formatDate(schedule.nextRunAt, schedule.timeZone || panelTimeZone)}</div><div className="col-span-3 text-xs text-slate-500">{formatDate(schedule.lastRunAt, schedule.timeZone || panelTimeZone)}{schedule.lastError ? ` • ${schedule.lastError}` : ''}</div><div className="col-span-2 text-right flex justify-end gap-1"><button onClick={() => runNow(schedule)} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40"><Play className="w-3 h-3" /> Run</button><button onClick={() => removeSchedule(schedule)} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-300 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40">Remove</button></div></div>))}</div></div>
    </div>
  )
}
