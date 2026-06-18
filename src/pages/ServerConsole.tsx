import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Terminal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type ServerJob = {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
}

function getServerId(job: ServerJob) {
  const value = job.payload?.server_id ?? job.result?.serverId
  return typeof value === 'string' ? value : null
}

function getLines(job: ServerJob | null) {
  const lines = job?.result?.lines
  return typeof lines === 'string' ? lines : ''
}

export default function ServerConsole() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [jobs, setJobs] = useState<ServerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const latestConsoleJob = useMemo(
    () => jobs.find(job => job.type === 'get_server_logs' && getServerId(job) === id) ?? null,
    [jobs, id],
  )

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status)')
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
      .select('id, type, status, payload, result, error, created_at')
      .eq('user_id', user.id)
      .eq('type', 'get_server_logs')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) console.error(error)
    setJobs((data ?? []) as ServerJob[])
  }

  async function refreshLogs() {
    if (!user || !server) return
    setSending(true)

    const { error } = await supabase.from('jobs').insert({
      node_id: server.node_id,
      user_id: user.id,
      type: 'get_server_logs',
      status: 'pending',
      payload: {
        requested_at: new Date().toISOString(),
        server_id: server.id,
        name: server.name,
        slug: server.slug,
        game: server.game,
        installPath: server.install_path,
        lines: 150,
      },
    })

    if (error) alert(error.message)
    await fetchJobs()
    setSending(false)
  }

  useEffect(() => {
    fetchServer()
    fetchJobs()
    if (!user) return

    const channel = supabase
      .channel(`server-console-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, id])

  if (loading) {
    return <div className="p-8 text-slate-400">Loading console...</div>
  }

  if (!server) {
    return <div className="p-8 text-slate-400">Server not found.</div>
  }

  const output = getLines(latestConsoleJob)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to server
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-brand-400" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Console</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">{server.name} on {server.nodes?.name ?? 'Unknown node'}</p>
        </div>

        <button onClick={refreshLogs} disabled={sending || latestConsoleJob?.status === 'pending' || latestConsoleJob?.status === 'running'} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <RefreshCw className={sending ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          Refresh Logs
        </button>
      </div>

      {latestConsoleJob && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">Latest console job: <span className="text-slate-200 font-mono">{latestConsoleJob.status}</span></p>
          <p className="text-xs text-slate-500 font-mono">{latestConsoleJob.error ?? String(latestConsoleJob.result?.message ?? '')}</p>
        </div>
      )}

      <pre className="min-h-[32rem] max-h-[40rem] overflow-auto rounded-xl bg-slate-950 border border-slate-800 p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap">
        {output || 'No console output loaded yet. Click Refresh Logs.'}
      </pre>
    </div>
  )
}
