import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Server, Wifi, WifiOff, Clock, Plus, Trash2, RefreshCw, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { timeAgo, cn } from '@/lib/utils'
import type { Node } from '@/lib/types'

type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

interface NodeJob {
  id: string
  node_id: string
  type: string
  status: JobStatus
  result: { message?: string } | null
  error: string | null
  created_at: string
  updated_at: string
}

export default function Nodes() {
  const { user, licence } = useAuth()
  const [nodes, setNodes] = useState<Node[]>([])
  const [jobs, setJobs] = useState<Record<string, NodeJob | null>>({})
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendingJobId, setSendingJobId] = useState<string | null>(null)

  async function fetchNodes() {
    if (!user) return
    const { data } = await supabase
      .from('nodes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (data) setNodes(data)
    setLoading(false)
  }

  async function fetchJobs() {
    if (!user) return
    const { data } = await supabase
      .from('jobs')
      .select('id, node_id, type, status, result, error, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!data) return

    const latestByNode: Record<string, NodeJob | null> = {}
    for (const job of data as NodeJob[]) {
      if (!latestByNode[job.node_id]) latestByNode[job.node_id] = job
    }
    setJobs(latestByNode)
  }

  useEffect(() => {
    fetchNodes()
    fetchJobs()
    if (!user) return

    const nodeChannel = supabase
      .channel('nodes-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `user_id=eq.${user.id}` }, fetchNodes)
      .subscribe()

    const jobChannel = supabase
      .channel('nodes-page-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(nodeChannel)
      supabase.removeChannel(jobChannel)
    }
  }, [user])

  async function deleteNode(id: string) {
    if (!confirm('Delete this node? This cannot be undone.')) return
    setDeletingId(id)
    await supabase.from('nodes').delete().eq('id', id)
    setNodes(prev => prev.filter(n => n.id !== id))
    setDeletingId(null)
  }

  async function sendTestJob(node: Node) {
    if (!user) return

    setSendingJobId(node.id)

    const { error } = await supabase.from('jobs').insert({
      node_id: node.id,
      user_id: user.id,
      type: 'test_ping',
      payload: { requested_at: new Date().toISOString() },
      status: 'pending',
    })

    if (error) alert(error.message)

    await fetchJobs()
    setSendingJobId(null)
  }

  const canAddNode = !licence || nodes.length < licence.max_nodes

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Nodes</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your registered daemon nodes</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { fetchNodes(); fetchJobs() }} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canAddNode ? (
            <Link to="/nodes/add" className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all duration-150 hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              Add Node
            </Link>
          ) : (
            <div className="flex items-center gap-2 bg-slate-800 text-slate-500 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed border border-slate-700">
              <Plus className="w-4 h-4" />
              Limit reached
            </div>
          )}
        </div>
      </div>

      {licence && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">Node usage</span>
              <span className="text-xs text-slate-400">{nodes.length} / {licence.max_nodes}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', nodes.length >= licence.max_nodes ? 'bg-red-500' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, (nodes.length / licence.max_nodes) * 100)}%` }}
              />
            </div>
          </div>
          <span className={cn(
            'text-xs font-medium px-2 py-1 rounded-full border capitalize',
            licence.status === 'active'    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            licence.status === 'trial'     ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            licence.status === 'suspended' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
            'bg-slate-700/50 text-slate-400 border-slate-600/30'
          )}>
            {licence.status}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : nodes.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 border-dashed rounded-xl p-16 text-center">
          <Server className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-300 font-semibold mb-2">No nodes yet</p>
          <p className="text-slate-500 text-sm mb-6">Add your first node to start managing game servers</p>
          <Link to="/nodes/add" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            Add your first node
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              latestJob={jobs[node.id] ?? null}
              onDelete={deleteNode}
              onSendTestJob={sendTestJob}
              deleting={deletingId === node.id}
              sendingJob={sendingJobId === node.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeCard({
  node,
  latestJob,
  onDelete,
  onSendTestJob,
  deleting,
  sendingJob,
}: {
  node: Node
  latestJob: NodeJob | null
  onDelete: (id: string) => void
  onSendTestJob: (node: Node) => void
  deleting: boolean
  sendingJob: boolean
}) {
  const statusConfig: Record<string, { icon: typeof Wifi; label: string; badgeClass: string; dotClass: string }> = {
    online:  { icon: Wifi,    label: 'Online',  badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dotClass: 'bg-emerald-400' },
    offline: { icon: WifiOff, label: 'Offline', badgeClass: 'text-red-400 bg-red-500/10 border-red-500/20', dotClass: 'bg-red-400' },
    pending: { icon: Clock,   label: 'Pending', badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20', dotClass: 'bg-amber-400 animate-pulse' },
  }
  const st = statusConfig[node.status] ?? statusConfig.offline
  const StIcon = st.icon
  const canSendJob = node.status === 'online' && !sendingJob

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0 mt-0.5">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Server className="w-5 h-5 text-slate-400" />
          </div>
          <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900', st.dotClass)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-slate-100 font-semibold text-sm truncate">{node.name}</h3>
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0', st.badgeClass)}>
              <StIcon className="w-3 h-3" />
              {st.label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 mt-2">
            {[
              { label: 'Hostname',       value: node.hostname ?? '—' },
              { label: 'IP Address',     value: node.ip_address ?? '—' },
              { label: 'Daemon',         value: node.daemon_version ?? '—' },
              { label: 'Last heartbeat', value: node.status === 'pending' ? 'Awaiting registration' : timeAgo(node.last_heartbeat) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-slate-600 text-xs">{label}</p>
                <p className="text-slate-300 text-xs font-medium font-mono truncate">{value}</p>
              </div>
            ))}
          </div>

          {latestJob && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Latest job: <span className="text-slate-200 font-mono">{latestJob.type}</span>
                </p>
                <span className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full border capitalize',
                  latestJob.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  latestJob.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                  latestJob.status === 'running' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                )}>
                  {latestJob.status}
                </span>
              </div>
              {(latestJob.result?.message || latestJob.error) && (
                <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                  {latestJob.result?.message ?? latestJob.error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onSendTestJob(node)}
            disabled={!canSendJob}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-brand-600/15 text-brand-300 border border-brand-500/20 hover:bg-brand-600/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send test job"
          >
            {sendingJob ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Test Job
          </button>

          <button
            onClick={() => onDelete(node.id)}
            disabled={deleting}
            className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            title="Delete node"
          >
            {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
