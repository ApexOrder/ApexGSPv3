import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Terminal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'

type ConsoleLine = { ts: string; level: 'info' | 'success' | 'warning' | 'error' | string; message: string; progress?: number | null }
type Job = { id: string; node_id: string; type: string; status: 'pending' | 'running' | 'completed' | 'failed'; result: { message?: string; progress?: number; console?: ConsoleLine[] } | null; error: string | null; created_at: string; updated_at: string }

const statusClass = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  running: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-300 border-red-500/20',
}

const levelClass: Record<string, string> = {
  info: 'text-slate-300',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-red-300',
}

function formatTime(value: string) {
  try { return new Date(value).toLocaleTimeString() } catch { return '--:--:--' }
}

export default function JobConsole() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  async function fetchJob() {
    if (!user || !id) return
    const { data } = await supabase
      .from('jobs')
      .select('id,node_id,type,status,result,error,created_at,updated_at')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()
    setJob((data ?? null) as Job | null)
    setLoading(false)
  }

  useEffect(() => {
    fetchJob()
    if (!user || !id) return
    const channel = supabase
      .channel(`job-console-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `id=eq.${id}` }, fetchJob)
      .subscribe()
    const timer = window.setInterval(fetchJob, 3000)
    return () => { supabase.removeChannel(channel); window.clearInterval(timer) }
  }, [user, id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [job?.result?.console?.length])

  if (loading) return <div className="p-8 text-slate-400">Loading job console...</div>
  if (!job) return <div className="p-8 text-slate-400">Job not found.</div>

  const lines = job.result?.console || []
  const progress = typeof job.result?.progress === 'number' ? job.result.progress : null

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate('/jobs')} className="apex-button-muted mb-8"><ArrowLeft className="w-4 h-4" /> Back to jobs</button>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200 mb-3"><Terminal className="w-3.5 h-3.5" /> Job Console</div>
          <h1 className="text-2xl font-black text-slate-100 font-mono">{job.type}</h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">{job.id}</p>
          <p className="text-xs text-slate-600 mt-1">Created {timeAgo(job.created_at)}. Updated {timeAgo(job.updated_at)}.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-3 py-1 rounded-full border capitalize', statusClass[job.status])}>{job.status}</span>
          <button onClick={fetchJob} className="apex-button-muted"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {progress !== null && <div className="apex-card p-4 mb-5"><div className="flex items-center justify-between text-xs text-slate-400 mb-2"><span>Progress</span><span>{Math.round(progress)}%</span></div><div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div></div>}

      <div className="apex-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between"><p className="text-sm font-bold text-slate-200">Live output</p><p className="text-xs text-slate-500">{lines.length} lines</p></div>
        <div className="h-[620px] overflow-y-auto bg-slate-950/80 p-4 font-mono text-xs leading-6">
          {lines.length === 0 ? <p className="text-slate-600">Waiting for job output...</p> : lines.map((line, index) => (
            <div key={`${line.ts}-${index}`} className="grid grid-cols-[80px_80px_1fr] gap-3 border-b border-white/[0.03] py-1">
              <span className="text-slate-600">{formatTime(line.ts)}</span>
              <span className={cn('uppercase font-bold', levelClass[line.level] || 'text-slate-400')}>{line.level}</span>
              <span className={levelClass[line.level] || 'text-slate-300'}>{line.message}</span>
            </div>
          ))}
          {job.error && <div className="grid grid-cols-[80px_80px_1fr] gap-3 py-1"><span className="text-slate-600">error</span><span className="text-red-300 uppercase font-bold">error</span><span className="text-red-300">{job.error}</span></div>}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
