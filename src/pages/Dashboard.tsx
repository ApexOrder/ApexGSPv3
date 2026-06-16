import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Server, Wifi, WifiOff, Clock, Plus, ArrowRight, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { timeAgo, cn } from '@/lib/utils'
import type { Node } from '@/lib/types'

interface NodeStats { total: number; online: number; offline: number; pending: number }

export default function Dashboard() {
  const { user, profile, licence } = useAuth()
  const [nodes, setNodes] = useState<Node[]>([])
  const [stats, setStats] = useState<NodeStats>({ total: 0, online: 0, offline: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    async function fetchNodes() {
      const { data } = await supabase
        .from('nodes')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (data) {
        setNodes(data)
        setStats({
          total: data.length,
          online: data.filter(n => n.status === 'online').length,
          offline: data.filter(n => n.status === 'offline').length,
          pending: data.filter(n => n.status === 'pending').length,
        })
      }
      setLoading(false)
    }

    fetchNodes()

    const channel = supabase
      .channel('dashboard-nodes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `user_id=eq.${user.id}` }, fetchNodes)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  const statCards = [
    { label: 'Total Nodes', value: stats.total, icon: Server, color: 'text-slate-400', bg: 'bg-slate-800/50 border-slate-700/50' },
    { label: 'Online',      value: stats.online, icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
    { label: 'Offline',     value: stats.offline, icon: WifiOff, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20' },
    { label: 'Pending',     value: stats.pending, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20' },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Welcome back, {profile?.username ?? 'there'}
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Here's what's happening with your nodes.</p>
        </div>
        <Link
          to="/nodes/add"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all duration-150 hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Add Node
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn('rounded-xl border p-5', bg)}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</span>
              <Icon className={cn('w-4 h-4', color)} />
            </div>
            <div className={cn('text-3xl font-bold tabular-nums', color)}>
              {loading ? '—' : value}
            </div>
          </div>
        ))}
      </div>

      {licence && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-brand-400" />
          </div>
          <div className="flex-1">
            <p className="text-slate-200 text-sm font-medium capitalize">{licence.status} Licence</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {stats.total} of {licence.max_nodes} nodes used
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', {
              'bg-emerald-400': licence.status === 'active',
              'bg-amber-400': licence.status === 'trial',
              'bg-red-400': licence.status === 'suspended' || licence.status === 'inactive',
            })} />
            <span className="text-xs font-medium capitalize text-slate-400">{licence.status}</span>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">Recent Nodes</h2>
          <Link to="/nodes" className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Server className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No nodes registered yet</p>
            <p className="text-slate-600 text-xs mt-1 mb-4">Add your first node to get started</p>
            <Link to="/nodes/add" className="inline-flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors">
              <Plus className="w-4 h-4" />
              Add your first node
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {nodes.slice(0, 5).map(node => (
              <div key={node.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-800/30 transition-colors">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <Server className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900',
                    node.status === 'online' ? 'bg-emerald-400' : node.status === 'offline' ? 'bg-red-400' : 'bg-amber-400'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium truncate">{node.name}</p>
                  <p className="text-slate-500 text-xs truncate">{node.hostname ?? node.ip_address ?? 'Not yet registered'}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize',
                    node.status === 'online'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    node.status === 'offline' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  )}>
                    {node.status}
                  </span>
                  <p className="text-slate-600 text-xs mt-1">{timeAgo(node.last_heartbeat)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
