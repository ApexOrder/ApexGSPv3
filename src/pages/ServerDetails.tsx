import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, RefreshCw, RotateCw, Square, Terminal, Folder, Archive, Settings, Activity, Cpu, HardDrive, MemoryStick, Clock, CalendarClock, Gamepad2 } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'
import type { GameServer } from '@/lib/types'

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null; hostname: string | null; ip_address: string | null } | null
}

type DirectResult = {
  message?: string
  serverId?: string
  status?: string
  pid?: number | null
}

type ServerMetrics = {
  message: string
  serverId: string
  status: string
  pid: number | null
  cpuPercent: number
  memoryBytes: number
  uptimeSeconds: number
  installSizeBytes: number | null
  disk: { totalBytes: number; usedBytes: number; freeBytes: number; usedPercent: number } | null
  collectedAt: string
}

const statusClass: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  stopped: 'bg-slate-700/40 text-slate-300 border-slate-600/30',
  starting: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  stopping: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  installing: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
  error: 'bg-red-500/10 text-red-300 border-red-500/25',
}

function formatBytes(value?: number | null) {
  if (!value) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function formatUptime(seconds?: number | null) {
  if (!seconds) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map(value => String(value).padStart(2, '0')).join(':')
}

export default function ServerDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [lastLiveUpdate, setLastLiveUpdate] = useState<string | null>(null)
  const serverRef = useRef<ServerWithNode | null>(null)
  const fetchingLiveRef = useRef(false)

  function applyServer(next: ServerWithNode | null) {
    serverRef.current = next
    setServer(next)
  }

  async function fetchServer(silent = false) {
    if (!user || !id) return null

    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status, hostname, ip_address)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error(error)
      if (!silent) setMessage(error.message)
      return null
    }

    const next = (data ?? null) as ServerWithNode | null
    applyServer(next)
    setLoading(false)
    return next
  }

  async function syncStatusToDatabase(serverId: string, status: string) {
    if (!user) return
    await supabase
      .from('servers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', serverId)
      .eq('user_id', user.id)
  }

  async function fetchMetrics(targetServer = serverRef.current) {
    if (!targetServer) return null
    try {
      const result = await callNodeApi<ServerMetrics>(session, 'metrics', {
        server_id: targetServer.id,
        installPath: targetServer.install_path,
      })

      setMetrics(result)
      setLastLiveUpdate(new Date().toLocaleTimeString())

      if (result.status && result.status !== targetServer.status) {
        const nextServer = { ...targetServer, status: result.status }
        applyServer(nextServer)
        await syncStatusToDatabase(targetServer.id, result.status)
      }

      return result
    } catch (error) {
      setMessage((error as Error).message)
      return null
    }
  }

  async function refreshLive() {
    if (fetchingLiveRef.current) return
    fetchingLiveRef.current = true

    try {
      const latestServer = await fetchServer(true)
      await fetchMetrics(latestServer ?? serverRef.current)
    } finally {
      fetchingLiveRef.current = false
    }
  }

  useEffect(() => {
    fetchServer()
  }, [user, id])

  useEffect(() => {
    if (!server?.id) return
    refreshLive()
    const timer = window.setInterval(refreshLive, 5000)
    return () => window.clearInterval(timer)
  }, [server?.id, session?.access_token])

  async function runDirect(nextAction: 'status' | 'start' | 'stop' | 'restart') {
    if (!server) return

    setAction(nextAction)
    setMessage(`${nextAction} requested...`)

    try {
      const result = await callNodeApi<DirectResult>(session, nextAction, {
        server_id: server.id,
        installPath: server.install_path,
        executablePath: server.executable_path,
      })

      const nextStatus = result.status
      if (nextStatus) {
        const nextServer = { ...server, status: nextStatus }
        applyServer(nextServer)
        await syncStatusToDatabase(server.id, nextStatus)
      }

      setMessage(result.message || `${nextAction} completed`)
      window.setTimeout(refreshLive, 800)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setAction(null)
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading server...</div>

  if (!server) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button onClick={() => navigate('/servers')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to servers
        </button>
        <div className="apex-card p-10 text-center">
          <p className="text-slate-300 font-semibold">Server not found</p>
        </div>
      </div>
    )
  }

  const busy = action !== null
  const cpuPercent = Math.max(0, Math.min(100, metrics?.cpuPercent ?? 0))
  const diskPercent = Math.max(0, Math.min(100, metrics?.disk?.usedPercent ?? 0))

  return (
    <div className="p-8 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/servers')} className="apex-button-muted">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={() => runDirect('status')} disabled={busy} className="apex-button-muted">
          {action === 'status' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />} Refresh
        </button>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-black text-slate-50 tracking-tight">{server.name}</h1>
            <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border capitalize', statusClass[server.status] ?? statusClass.stopped)}>{server.status}</span>
          </div>
          <p className="text-slate-400 text-sm">7 Days To Die • {server.nodes?.name ?? 'Unknown node'}{metrics?.pid ? ` • PID ${metrics.pid}` : ''}{lastLiveUpdate ? ` • updated ${lastLiveUpdate}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 mb-5">
        <div className="apex-card overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.9fr]">
            <div className="relative min-h-[330px] overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10 bg-slate-950">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(34,211,238,0.35),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.28),transparent_30%),linear-gradient(135deg,#0f172a,#062f3d_48%,#020617)]" />
              <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent" />
              <div className="absolute left-10 top-8 h-56 w-56 rounded-full border border-cyan-300/30 bg-cyan-300/5 blur-sm" />
              <div className="absolute right-10 bottom-16 h-36 w-36 rounded-full bg-emerald-400/10 blur-2xl" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-32 w-32 rounded-full border-4 border-cyan-300/40 bg-slate-950/50 flex items-center justify-center shadow-2xl shadow-cyan-950/50">
                    <Gamepad2 className="w-14 h-14 text-cyan-200" />
                  </div>
                  <p className="text-6xl font-black tracking-[0.18em] text-white drop-shadow">7DTD</p>
                  <p className="mt-2 text-sm font-bold tracking-[0.35em] text-cyan-200">SURVIVAL SERVER</p>
                </div>
              </div>
              <div className="absolute left-6 bottom-6 right-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200 mb-3">
                  <Gamepad2 className="w-3.5 h-3.5" /> Game Artwork
                </div>
                <p className="text-sm text-slate-300">ApexGSP managed game instance with live daemon controls.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <DetailRow label="Game" value="7 Days To Die" />
              <DetailRow label="Server Name" value={server.name} />
              <DetailRow label="Node" value={server.nodes?.name ?? 'Unknown'} />
              <DetailRow label="Status" value={server.status} valueClass="capitalize text-emerald-300" />
              <DetailRow label="Uptime" value={formatUptime(metrics?.uptimeSeconds)} />
              <DetailRow label="Install Size" value={formatBytes(metrics?.installSizeBytes)} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="apex-card p-4 space-y-2">
            <button onClick={() => runDirect('start')} disabled={server.status === 'running' || busy} className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
              {action === 'start' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start
            </button>
            <button onClick={() => runDirect('restart')} disabled={busy} className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed">
              {action === 'restart' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />} Restart
            </button>
            <button onClick={() => runDirect('stop')} disabled={server.status === 'stopped' || busy} className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 py-3 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
              {action === 'stop' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} Stop
            </button>
          </div>

          <div className="apex-card p-5 space-y-4">
            <Metric label="CPU Usage" value={`${cpuPercent.toFixed(1)}%`} percent={cpuPercent} />
            <Metric label="Memory" value={formatBytes(metrics?.memoryBytes)} percent={Math.min(100, ((metrics?.memoryBytes ?? 0) / (16 * 1024 ** 3)) * 100)} />
            <Metric label="Disk Usage" value={metrics?.disk ? `${formatBytes(metrics.disk.usedBytes)} / ${formatBytes(metrics.disk.totalBytes)}` : `${diskPercent}%`} percent={diskPercent} />
          </div>
        </div>
      </div>

      {message && (
        <div className="apex-card p-4 mb-5">
          <p className="text-xs text-slate-400">Direct API: <span className="text-slate-100 font-mono">{message}</span></p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <InfoPanel title="Server Information">
          <DetailRow label="Server ID" value={server.id} mono />
          <DetailRow label="Hostname" value={server.nodes?.hostname ?? server.nodes?.ip_address ?? 'Unknown'} />
          <DetailRow label="Install Path" value={server.install_path} mono />
          <DetailRow label="Added" value={timeAgo(server.created_at)} />
        </InfoPanel>

        <InfoPanel title="Resource Snapshot">
          <DetailRow label="CPU" value={`${cpuPercent.toFixed(1)}%`} />
          <DetailRow label="Memory" value={formatBytes(metrics?.memoryBytes)} />
          <DetailRow label="Disk Free" value={metrics?.disk ? `${formatBytes(metrics.disk.freeBytes)} free` : 'Unknown'} />
          <DetailRow label="Status Poll" value={lastLiveUpdate ?? 'Waiting'} />
        </InfoPanel>

        <InfoPanel title="Quick Actions">
          <QuickLink to={`/servers/${server.id}/console`} icon={Terminal} title="Console" desc="Open server console" />
          <QuickLink to={`/servers/${server.id}/files`} icon={Folder} title="Files" desc="Manage server files" />
          <QuickLink to={`/servers/${server.id}/backups`} icon={Archive} title="Backups" desc="View and restore backups" />
          <QuickLink to={`/servers/${server.id}/scheduler`} icon={CalendarClock} title="Scheduler" desc="Scheduled backups" />
          <QuickLink to={`/servers/${server.id}/settings`} icon={Settings} title="Settings" desc="Server configuration" />
        </InfoPanel>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0"><span className="text-sm text-slate-400">{label}</span><span className={cn('text-sm font-semibold text-slate-100 text-right truncate', mono && 'font-mono text-xs', valueClass)}>{value}</span></div>
}

function Metric({ label, value, percent }: { label: string; value: string; percent: number }) {
  return <div><div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-slate-200">{label}</span><span className="text-sm text-slate-300">{value}</span></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} /></div></div>
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="apex-card p-5"><h3 className="text-lg font-black text-slate-100 mb-4">{title}</h3><div className="space-y-3">{children}</div></div>
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: typeof Terminal; title: string; desc: string }) {
  return <Link to={to} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 hover:border-emerald-400/30 hover:bg-emerald-400/10 transition-colors"><span className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center"><Icon className="w-4 h-4 text-emerald-300" /></span><span className="flex-1"><span className="block text-sm font-bold text-slate-100">{title}</span><span className="block text-xs text-slate-500">{desc}</span></span><span className="text-slate-500">›</span></Link>
}
