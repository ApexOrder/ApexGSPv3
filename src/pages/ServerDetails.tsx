import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, RefreshCw, RotateCw, Square, Terminal, Folder, Archive, Settings, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'
import type { GameServer } from '@/lib/types'

type JobAction = 'start_server' | 'stop_server' | 'restart_server' | 'refresh_server_status'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

type ServerJob = {
  id: string
  node_id: string
  type: string
  status: JobStatus
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  updated_at: string
}

type ServerWithNode = GameServer & {
  nodes?: {
    name: string | null
    status: string | null
    hostname: string | null
    ip_address: string | null
  } | null
}

const statusClass: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stopped: 'bg-slate-700/40 text-slate-300 border-slate-600/30',
  starting: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  stopping: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  installing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const jobStatusClass: Record<JobStatus, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

function getServerIdFromJob(job: ServerJob) {
  const value = job.payload?.server_id ?? job.result?.serverId
  return typeof value === 'string' ? value : null
}

function getJobMessage(job: ServerJob) {
  const resultMessage = job.result?.message
  if (typeof resultMessage === 'string') return resultMessage
  if (job.error) return job.error
  return job.status === 'pending' ? 'Queued and waiting for daemon' : 'Processing job'
}

function getJobProgress(job: ServerJob) {
  const progress = job.result?.progress
  return typeof progress === 'number' ? Math.min(100, Math.max(0, progress)) : null
}

export default function ServerDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [jobs, setJobs] = useState<ServerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const latestJob = useMemo(() => jobs.find(job => getServerIdFromJob(job) === id) ?? null, [jobs, id])
  const jobBusy = latestJob?.status === 'pending' || latestJob?.status === 'running'
  const progress = latestJob ? getJobProgress(latestJob) : null

  async function fetchServer() {
    if (!user || !id) return

    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status, hostname, ip_address)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error(error)
    setServer((data ?? null) as ServerWithNode | null)
    setLoading(false)
  }

  async function fetchJobs() {
    if (!user) return

    const { data, error } = await supabase
      .from('jobs')
      .select('id, node_id, type, status, payload, result, error, created_at, updated_at')
      .eq('user_id', user.id)
      .in('type', ['start_server', 'stop_server', 'restart_server', 'refresh_server_status'])
      .order('created_at', { ascending: false })
      .limit(25)

    if (error) {
      console.error(error)
      return
    }

    setJobs((data ?? []) as ServerJob[])
  }

  async function refreshAll() {
    await Promise.all([fetchServer(), fetchJobs()])
  }

  useEffect(() => {
    refreshAll()
    if (!user) return

    const serverChannel = supabase
      .channel(`server-details-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `user_id=eq.${user.id}` }, refreshAll)
      .subscribe()

    const jobChannel = supabase
      .channel(`server-details-jobs-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(serverChannel)
      supabase.removeChannel(jobChannel)
    }
  }, [user, id])

  async function queueServerJob(type: JobAction) {
    if (!user || !server) return

    setSendingId(`${server.id}:${type}`)

    const { error } = await supabase.from('jobs').insert({
      node_id: server.node_id,
      user_id: user.id,
      type,
      status: 'pending',
      payload: {
        requested_at: new Date().toISOString(),
        server_id: server.id,
        name: server.name,
        slug: server.slug,
        game: server.game,
        installPath: server.install_path,
        executablePath: server.executable_path,
      },
    })

    if (error) alert(error.message)
    await fetchJobs()
    setSendingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!server) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <button onClick={() => navigate('/servers')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to servers
        </button>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-slate-300 font-semibold">Server not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate('/servers')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to servers
      </button>

      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">{server.name}</h1>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize', statusClass[server.status] ?? statusClass.stopped)}>{server.status}</span>
          </div>
          <p className="text-slate-400 text-sm">7 Days To Die on {server.nodes?.name ?? 'Unknown node'}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => queueServerJob('refresh_server_status')} disabled={sendingId !== null || jobBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sendingId === `${server.id}:refresh_server_status` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            Refresh Status
          </button>
          <button onClick={() => queueServerJob('start_server')} disabled={server.status === 'running' || sendingId !== null || jobBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sendingId === `${server.id}:start_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start
          </button>
          <button onClick={() => queueServerJob('restart_server')} disabled={sendingId !== null || jobBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/15 text-blue-300 border border-blue-500/20 hover:bg-blue-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sendingId === `${server.id}:restart_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Restart
          </button>
          <button onClick={() => queueServerJob('stop_server')} disabled={server.status === 'stopped' || sendingId !== null || jobBusy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-600/15 text-red-300 border border-red-500/20 hover:bg-red-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {sendingId === `${server.id}:stop_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
            Stop
          </button>
        </div>
      </div>

      {latestJob && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Latest job: <span className="text-slate-200 font-mono">{latestJob.type}</span></p>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full border capitalize', jobStatusClass[latestJob.status])}>{latestJob.status}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-mono truncate">{getJobMessage(latestJob)}</p>
          {(progress !== null || jobBusy) && <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress ?? (latestJob.status === 'pending' ? 12 : 50)}%` }} /></div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Node</p><p className="text-sm text-slate-200 font-medium">{server.nodes?.name ?? 'Unknown'}</p><p className="text-xs text-slate-500 mt-1 capitalize">{server.nodes?.status ?? 'unknown'}</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Install path</p><p className="text-xs text-slate-300 font-mono truncate">{server.install_path}</p></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-500 mb-1">Created</p><p className="text-sm text-slate-200 font-medium">{timeAgo(server.created_at)}</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Link to={`/servers/${server.id}/console`} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-brand-500/40 transition-colors"><Terminal className="w-5 h-5 text-brand-400 mb-3" /><p className="text-sm text-slate-200 font-semibold">Console</p><p className="text-xs text-slate-500 mt-1">View server output logs</p><p className="text-[11px] text-brand-400 mt-3">Open console</p></Link>
        <Link to={`/servers/${server.id}/files`} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-brand-500/40 transition-colors"><Folder className="w-5 h-5 text-brand-400 mb-3" /><p className="text-sm text-slate-200 font-semibold">Files</p><p className="text-xs text-slate-500 mt-1">Browse and edit server files</p><p className="text-[11px] text-brand-400 mt-3">Open files</p></Link>
        <Link to={`/servers/${server.id}/settings`} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-brand-500/40 transition-colors"><Settings className="w-5 h-5 text-brand-400 mb-3" /><p className="text-sm text-slate-200 font-semibold">Settings</p><p className="text-xs text-slate-500 mt-1">Edit server configuration</p><p className="text-[11px] text-brand-400 mt-3">Open settings</p></Link>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 opacity-60"><Archive className="w-5 h-5 text-brand-400 mb-3" /><p className="text-sm text-slate-200 font-semibold">Backups</p><p className="text-xs text-slate-500 mt-1">Create and restore backups</p><p className="text-[11px] text-slate-600 mt-3">Coming next</p></div>
      </div>
    </div>
  )
}
