import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Terminal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'

type Job = {
  id: string
  node_id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: { message?: string; progress?: number; console?: Array<{ ts: string; level: string; message: string }> } | null
  error: string | null
  created_at: string
  updated_at: string
}

const statusClass = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  running: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-300 border-red-500/20',
}

export default function Jobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchJobs() {
    if (!user) return
    const { data } = await supabase
      .from('jobs')
      .select('id,node_id,type,status,result,error,created_at,updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setJobs((data ?? []) as Job[])
    setLoading(false)
  }

  useEffect(() => {
    fetchJobs()
    if (!user) return
    const channel = supabase
      .channel('jobs-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Jobs</h1>
          <p className="text-slate-400 text-sm mt-1">Installer and daemon task history</p>
        </div>
        <button onClick={fetchJobs} className="apex-button-muted"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      {loading ? <div className="py-20 text-center text-slate-500">Loading jobs...</div> : jobs.length === 0 ? (
        <div className="apex-card p-14 text-center text-slate-500">No jobs yet.</div>
      ) : (
        <div className="apex-card overflow-hidden divide-y divide-white/10">
          {jobs.map(job => {
            const progress = typeof job.result?.progress === 'number' ? job.result.progress : null
            const message = job.result?.message || job.error || job.result?.console?.at(-1)?.message || 'Waiting for output'
            return (
              <Link key={job.id} to={`/jobs/${job.id}`} className="block p-4 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-center shrink-0"><Terminal className="w-4 h-4 text-emerald-300" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="text-sm font-black text-slate-100 font-mono truncate">{job.type}</p>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full border capitalize', statusClass[job.status])}>{job.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate font-mono">{message}</p>
                    <p className="text-xs text-slate-600 mt-1">Created {timeAgo(job.created_at)}. Updated {timeAgo(job.updated_at)}.</p>
                    {progress !== null && job.status === 'running' && <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
