import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gamepad2, Plus, RefreshCw, Play, Square, RotateCw, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'
import type { GameServer } from '@/lib/types'

type JobAction = 'start_server' | 'stop_server' | 'restart_server'
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
  } | null
}

const statusClass: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  stopped: 'bg-slate-700/40 text-slate-300 border-slate-600/30',
  starting: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  stopping: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  installing: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
  error: 'bg-red-500/10 text-red-300 border-red-500/25',
}

const jobStatusClass: Record<JobStatus, string> = {
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-300 border-red-500/20',
  running: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
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

export default function Servers() {
  const { user } = useAuth()
  const [servers, setServers] = useState<ServerWithNode[]>([])
  const [jobs, setJobs] = useState<ServerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const latestJobByServerId = useMemo(() => {
    const latest: Record<string, ServerJob | undefined> = {}

    for (const job of jobs) {
      const serverId = getServerIdFromJob(job)
      if (serverId && !latest[serverId]) latest[serverId] = job
    }

    return latest
  }, [jobs])

  async function fetchServers() {
    if (!user) return

    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    setServers((data ?? []) as ServerWithNode[])
    setLoading(false)
  }

  async function fetchJobs() {
    if (!user) return

    const { data, error } = await supabase
      .from('jobs')
      .select('id, node_id, type, status, payload, result, error, created_at, updated_at')
      .eq('user_id', user.id)
      .in('type', ['start_server', 'stop_server', 'restart_server'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
      return
    }

    setJobs((data ?? []) as ServerJob[])
  }

  async function refreshAll() {
    await Promise.all([fetchServers(), fetchJobs()])
  }

  useEffect(() => {
    refreshAll()
    if (!user) return

    const serverChannel = supabase
      .channel('servers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `user_id=eq.${user.id}` }, refreshAll)
      .subscribe()

    const jobChannel = supabase
      .channel('servers-page-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(serverChannel)
      supabase.removeChannel(jobChannel)
    }
  }, [user])

  async function queueServerJob(server: GameServer, type: JobAction) {
    if (!user) return

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

  return (
    <div className="relative p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200 mb-3">
            <Gamepad2 className="w-3.5 h-3.5" /> Server Fleet
          </div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Servers</h1>
          <p className="text-slate-400 text-sm mt-1">Manage game servers provisioned on your nodes</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refreshAll} className="apex-button-muted p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link to="/servers/new" className="apex-button-primary">
            <Plus className="w-4 h-4" />
            Create Server
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="inline-block w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <div className="apex-card border-dashed p-16 text-center">
          <Gamepad2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-300 font-bold mb-2">No servers yet</p>
          <p className="text-slate-500 text-sm mb-6">Create your first 7 Days To Die server to start managing it here.</p>
          <Link to="/servers/new" className="apex-button-primary">
            <Plus className="w-4 h-4" />
            Create Server
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map(server => {
            const latestJob = latestJobByServerId[server.id]
            const jobBusy = latestJob?.status === 'pending' || latestJob?.status === 'running'
            const progress = latestJob ? getJobProgress(latestJob) : null

            return (
              <div key={server.id} className="apex-card apex-card-hover p-5">
                <div className="flex items-start gap-4">
                  <Link to={`/servers/${server.id}`} className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 border border-emerald-400/20 flex items-center justify-center shrink-0 hover:border-emerald-400/40 transition-colors">
                    <Gamepad2 className="w-5 h-5 text-emerald-300" />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link to={`/servers/${server.id}`} className="text-slate-50 hover:text-emerald-300 font-black text-base truncate inline-flex items-center gap-1.5 transition-colors">
                        {server.name}
                        <ExternalLink className="w-3 h-3 text-slate-600" />
                      </Link>
                      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border capitalize', statusClass[server.status] ?? statusClass.stopped)}>
                        {server.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-1.5 mt-3">
                      <div>
                        <p className="text-slate-600 text-xs">Game</p>
                        <p className="text-slate-300 text-xs font-semibold">7 Days To Die</p>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs">Node</p>
                        <p className="text-slate-300 text-xs font-semibold truncate">{server.nodes?.name ?? 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs">Node status</p>
                        <p className="text-slate-300 text-xs font-semibold capitalize">{server.nodes?.status ?? 'unknown'}</p>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs">Created</p>
                        <p className="text-slate-300 text-xs font-semibold">{timeAgo(server.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600 text-xs">Path</p>
                        <p className="text-slate-300 text-xs font-mono truncate">{server.install_path}</p>
                      </div>
                    </div>

                    {latestJob && (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-400">
                            Latest job: <span className="text-slate-100 font-mono">{latestJob.type}</span>
                          </p>
                          <span className={cn('text-[11px] px-2 py-0.5 rounded-full border capitalize', jobStatusClass[latestJob.status])}>
                            {latestJob.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-mono truncate">{getJobMessage(latestJob)}</p>
                        {(progress !== null || jobBusy) && (
                          <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
                              style={{ width: `${progress ?? (latestJob.status === 'pending' ? 12 : 50)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => queueServerJob(server, 'start_server')}
                      disabled={server.status === 'running' || sendingId !== null || jobBusy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sendingId === `${server.id}:start_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      Start
                    </button>
                    <button
                      onClick={() => queueServerJob(server, 'restart_server')}
                      disabled={sendingId !== null || jobBusy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sendingId === `${server.id}:restart_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                      Restart
                    </button>
                    <button
                      onClick={() => queueServerJob(server, 'stop_server')}
                      disabled={server.status === 'stopped' || sendingId !== null || jobBusy}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sendingId === `${server.id}:stop_server` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                      Stop
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
