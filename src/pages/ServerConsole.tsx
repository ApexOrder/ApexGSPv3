import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Terminal } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
}

type LogsResult = {
  message?: string
  lines?: string
  logFile?: string | null
}

export default function ServerConsole() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [output, setOutput] = useState('')

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

  async function refreshLogs() {
    if (!server) return
    setSending(true)
    setMessage('Loading logs...')

    try {
      const result = await callNodeApi<LogsResult>(session, 'logs', {
        server_id: server.id,
        installPath: server.install_path,
        lines: 150,
      })
      setOutput(result.lines || '')
      setMessage(result.message || 'Logs loaded')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    fetchServer()
  }, [user, id])

  if (loading) return <div className="p-8 text-slate-400">Loading console...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

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

        <button onClick={refreshLogs} disabled={sending} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <RefreshCw className={sending ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          Refresh Logs
        </button>
      </div>

      {message && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">Direct API</p>
          <p className="text-xs text-slate-500 font-mono">{message}</p>
        </div>
      )}

      <pre className="min-h-[32rem] max-h-[40rem] overflow-auto rounded-xl bg-slate-950 border border-slate-800 p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap">
        {output || 'No console output loaded yet. Click Refresh Logs.'}
      </pre>
    </div>
  )
}
