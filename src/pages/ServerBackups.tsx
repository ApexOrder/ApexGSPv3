import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, RefreshCw, Trash2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type BackupJobType = 'list_backups' | 'create_backup' | 'delete_backup'

type Backup = {
  name: string
  path: string
  size: number
  createdAt?: string
  modifiedAt: string
}

type BackupJob = {
  id: string
  type: BackupJobType
  status: 'pending' | 'running' | 'completed' | 'failed'
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
}

function getServerId(job: BackupJob) {
  const value = job.payload?.server_id ?? job.result?.serverId
  return typeof value === 'string' ? value : null
}

function getBackups(job: BackupJob | null) {
  const value = job?.result?.backups
  return Array.isArray(value) ? value as Backup[] : []
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export default function ServerBackups() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const serverJobs = useMemo(() => jobs.filter(job => getServerId(job) === id), [jobs, id])
  const latestJob = serverJobs[0] ?? null
  const latestListJob = serverJobs.find(job => job.type === 'list_backups') ?? null
  const backups = getBackups(latestListJob)
  const jobBusy = latestJob?.status === 'pending' || latestJob?.status === 'running'

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
      .in('type', ['list_backups', 'create_backup', 'delete_backup'])
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) console.error(error)
    setJobs((data ?? []) as BackupJob[])
  }

  async function queueJob(type: BackupJobType, extra: Record<string, unknown> = {}) {
    if (!user || !server) return
    setBusy(true)

    const { error } = await supabase.from('jobs').insert({
      node_id: server.node_id,
      user_id: user.id,
      type,
      status: 'pending',
      payload: {
        requested_at: new Date().toISOString(),
        server_id: server.id,
        installPath: server.install_path,
        ...extra,
      },
    })

    if (error) alert(error.message)
    await fetchJobs()
    setBusy(false)
  }

  async function createBackup() {
    const name = prompt('Backup name', `backup-${new Date().toISOString().slice(0, 16).replace('T', '-')}`)
    if (!name) return
    await queueJob('create_backup', { backupName: name })
  }

  async function deleteBackup(name: string) {
    if (!confirm(`Delete backup ${name}?`)) return
    await queueJob('delete_backup', { backupFile: name })
  }

  useEffect(() => {
    fetchServer()
    fetchJobs()
    if (!user) return

    const channel = supabase
      .channel(`server-backups-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, id])

  useEffect(() => {
    if (server && !latestListJob) queueJob('list_backups')
  }, [server])

  useEffect(() => {
    if (latestJob?.status === 'completed' && (latestJob.type === 'create_backup' || latestJob.type === 'delete_backup')) {
      queueJob('list_backups')
    }
  }, [latestJob?.id, latestJob?.status])

  if (loading) return <div className="p-8 text-slate-400">Loading backups...</div>
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
            <Archive className="w-5 h-5 text-brand-400" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Backups</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Create and manage backups for {server.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => queueJob('list_backups')} disabled={busy || jobBusy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40">
            <RefreshCw className={busy || jobBusy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
          </button>
          <button onClick={createBackup} disabled={busy || jobBusy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Create Backup
          </button>
        </div>
      </div>

      {latestJob && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">Latest job: <span className="text-slate-200 font-mono">{latestJob.type}</span></p>
          <p className="text-xs text-slate-500 font-mono truncate">{latestJob.error ?? String(latestJob.result?.message ?? latestJob.status)}</p>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500">
          <div className="col-span-6">Name</div>
          <div className="col-span-2 text-right">Size</div>
          <div className="col-span-3">Modified</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {backups.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No backups yet. Create one to test the backup job.</p>
        ) : backups.map(backup => (
          <div key={backup.name} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 last:border-b-0 items-center hover:bg-slate-800/40">
            <div className="col-span-6 text-sm text-slate-200 font-mono truncate">{backup.name}</div>
            <div className="col-span-2 text-right text-xs text-slate-400">{formatSize(backup.size)}</div>
            <div className="col-span-3 text-xs text-slate-500">{new Date(backup.modifiedAt).toLocaleString()}</div>
            <div className="col-span-1 text-right">
              <button onClick={() => deleteBackup(backup.name)} disabled={busy || jobBusy} className="p-1.5 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
