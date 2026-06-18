import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, RefreshCw, RotateCw, Square, Terminal, Folder, Archive, Settings, Activity } from 'lucide-react'
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

const statusClass: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stopped: 'bg-slate-700/40 text-slate-300 border-slate-600/30',
  starting: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  stopping: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  installing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function ServerDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState('')

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

  useEffect(() => {
    fetchServer()
  }, [user, id])

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
        setServer(prev => prev ? { ...prev, status: nextStatus } : prev)
        await supabase.from('servers').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', server.id).eq('user_id', user?.id)
      }

      setMessage(result.message || `${nextAction} completed`)
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-slate-300 font-semibold">Server not found</p>
        </div>
      </div>
    )
  }

  const busy = action !== null

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate('/servers')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to servers
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
          <button onClick={() => runDirect('status')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {action === 'status' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />} Refresh Status
          </button>
          <button onClick={() => runDirect('start')} disabled={server.status === 'running' || busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {action === 'start' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Start
          </button>
          <button onClick={() => runDirect('restart')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/15 text-blue-300 border border-blue-500/20 hover:bg-blue-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {action === 'restart' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />} Restart
          </button>
          <button onClick={() => runDirect('stop')} disabled={server.status === 'stopped' || busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-600/15 text-red-300 border border-red-500/20 hover:bg-red-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {action === 'stop' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />} Stop
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
          <p className="text-xs text-slate-400">Direct API: <span className="text-slate-200 font-mono">{message}</span></p>
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
        <Link to={`/servers/${server.id}/backups`} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-brand-500/40 transition-colors"><Archive className="w-5 h-5 text-brand-400 mb-3" /><p className="text-sm text-slate-200 font-semibold">Backups</p><p className="text-xs text-slate-500 mt-1">Create and delete backups</p><p className="text-[11px] text-brand-400 mt-3">Open backups</p></Link>
      </div>
    </div>
  )
}
