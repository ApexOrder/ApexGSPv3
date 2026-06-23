import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Server, Wifi, WifiOff, Clock, Plus, ArrowRight, Activity, Sparkles, ShieldCheck } from 'lucide-react'
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
      const { data } = await supabase.from('nodes').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
      if (data) {
        setNodes(data)
        setStats({ total: data.length, online: data.filter(n => n.status === 'online').length, offline: data.filter(n => n.status === 'offline').length, pending: data.filter(n => n.status === 'pending').length })
      }
      setLoading(false)
    }
    fetchNodes()
    const channel = supabase.channel('dashboard-nodes').on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `user_id=eq.${user.id}` }, fetchNodes).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const statCards = [
    { label: 'Total Nodes', value: stats.total, icon: Server, tone: 'text-cyan-300', ring: 'border-cyan-400/20 bg-cyan-400/5' },
    { label: 'Online', value: stats.online, icon: Wifi, tone: 'text-emerald-300', ring: 'border-emerald-400/25 bg-emerald-400/5' },
    { label: 'Offline', value: stats.offline, icon: WifiOff, tone: 'text-red-300', ring: 'border-red-400/20 bg-red-400/5' },
    { label: 'Pending', value: stats.pending, icon: Clock, tone: 'text-amber-300', ring: 'border-amber-400/20 bg-amber-400/5' },
  ]

  return (
    <div className="relative p-8 max-w-7xl mx-auto">
      <div className="apex-card apex-glow overflow-hidden mb-8">
        <div className="relative p-7 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200 mb-4">
                <Sparkles className="w-3.5 h-3.5" /> ApexGSP Control Centre
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-50 tracking-tight">Welcome back, {profile?.username ?? 'there'}</h1>
              <p className="text-slate-400 mt-2 text-sm max-w-2xl">Monitor nodes, manage game servers and keep your hosting stack under control from one polished command centre.</p>
            </div>
            <Link to="/nodes/add" className="apex-button-primary shrink-0"><Plus className="w-4 h-4" /> Add Node</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, tone, ring }) => (
          <div key={label} className={cn('apex-card apex-card-hover p-5', ring)}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{label}</span>
              <div className="h-9 w-9 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center"><Icon className={cn('w-4 h-4', tone)} /></div>
            </div>
            <div className={cn('text-4xl font-black tabular-nums tracking-tight', tone)}>{loading ? '—' : value}</div>
          </div>
        ))}
      </div>

      {licence && (
        <div className="apex-card p-5 mb-6 flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 border border-emerald-400/25 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-emerald-300" /></div>
          <div className="flex-1">
            <p className="text-slate-100 text-sm font-bold capitalize">{licence.status} Licence</p>
            <p className="text-slate-500 text-xs mt-0.5">{stats.total} of {licence.max_nodes} nodes used</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <div className={cn('w-2 h-2 rounded-full', { 'bg-emerald-400 shadow-lg shadow-emerald-400/40': licence.status === 'active', 'bg-amber-400': licence.status === 'trial', 'bg-red-400': licence.status === 'suspended' || licence.status === 'inactive' })} />
            <span className="text-xs font-bold capitalize text-slate-300">{licence.status}</span>
          </div>
        </div>
      )}

      <div className="apex-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Recent Nodes</h2>
            <p className="text-xs text-slate-500 mt-0.5">Latest daemon connections and heartbeat status</p>
          </div>
          <Link to="/nodes" className="apex-button-muted px-3 py-1.5 text-xs">View all <ArrowRight className="w-3 h-3" /></Link>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center"><div className="inline-block w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : nodes.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-3xl border border-white/10 bg-white/[0.03] flex items-center justify-center"><Server className="w-7 h-7 text-slate-600" /></div>
            <p className="text-slate-300 text-sm font-bold">No nodes registered yet</p>
            <p className="text-slate-600 text-xs mt-1 mb-5">Add your first node to start hosting game servers</p>
            <Link to="/nodes/add" className="apex-button-primary"><Plus className="w-4 h-4" /> Add your first node</Link>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {nodes.slice(0, 5).map(node => (
              <div key={node.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.03] transition-colors">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center"><Server className="w-4 h-4 text-slate-400" /></div>
                  <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950', node.status === 'online' ? 'bg-emerald-400' : node.status === 'offline' ? 'bg-red-400' : 'bg-amber-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 text-sm font-bold truncate">{node.name}</p>
                  <p className="text-slate-500 text-xs truncate">{node.hostname ?? node.ip_address ?? 'Not yet registered'}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border capitalize', node.status === 'online' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : node.status === 'offline' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20')}>{node.status}</span>
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
