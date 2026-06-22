import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, RefreshCw, Trash2, Plus } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type BackupMode = 'full' | 'world'

type Backup = {
  name: string
  displayName?: string
  path: string
  size: number
  createdAt?: string
  modifiedAt: string
  status?: 'creating' | 'ready'
  mode?: BackupMode
}

type BackupResult = {
  message?: string
  backups?: Backup[]
  backup?: Backup
  backupFile?: string
  creating?: boolean
}

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
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
  const { user, session } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [backups, setBackups] = useState<Backup[]>([])
  const [backupMode, setBackupMode] = useState<BackupMode>('world')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const loadingBackupsRef = useRef(false)

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error(error)
      setMessage(error.message)
    }

    setServer((data ?? null) as ServerWithNode | null)
    setLoading(false)
  }

  async function directBackups(action: 'backup_list' | 'backup_create' | 'backup_delete', extra: Record<string, unknown> = {}) {
    if (!server) return null

    const result = await callNodeApi<BackupResult>(session, action, {
      server_id: server.id,
      installPath: server.install_path,
      ...extra,
    })

    setMessage(result.message || 'Backup action completed')
    setLastUpdated(new Date().toLocaleTimeString())
    return result
  }

  async function loadBackups(showBusy = true) {
    if (!server || loadingBackupsRef.current) return
    loadingBackupsRef.current = true
    if (showBusy) setBusy(true)
    if (showBusy) setMessage('Loading backups...')

    try {
      const result = await directBackups('backup_list')
      const nextBackups = result?.backups ?? []
      setBackups(nextBackups)
      setCreating(Boolean(result?.creating || nextBackups.some(backup => backup.status === 'creating')))
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      loadingBackupsRef.current = false
      if (showBusy) setBusy(false)
    }
  }

  async function createBackup() {
    const name = prompt('Backup name', `${backupMode}-${new Date().toISOString().slice(0, 16).replace('T', '-')}`)
    if (!name) return

    setBusy(true)
    setCreating(true)
    setMessage(`Starting ${backupMode} backup archive...`)

    try {
      const result = await directBackups('backup_create', { backupName: name, backupMode })
      if (result?.backup) setBackups(prev => [result.backup as Backup, ...prev])
      setMessage(result?.message || 'Backup creation started')
      window.setTimeout(() => loadBackups(false), 1000)
    } catch (error) {
      setCreating(false)
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteBackup(name: string) {
    if (!confirm(`Delete backup ${name}?`)) return

    setBusy(true)
    setMessage(`Deleting ${name}...`)

    try {
      await directBackups('backup_delete', { backupFile: name })
      setBackups(prev => prev.filter(backup => backup.name !== name))
      await loadBackups(false)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    fetchServer()
  }, [user, id])

  useEffect(() => {
    if (server) loadBackups()
  }, [server?.id])

  useEffect(() => {
    if (!server || !creating) return
    const timer = window.setInterval(() => loadBackups(false), 3000)
    return () => window.clearInterval(timer)
  }, [server?.id, creating, session?.access_token])

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
            {creating && <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Creating</span>}
          </div>
          <p className="text-slate-400 text-sm mt-1">Create and manage backups for {server.name}</p>
        </div>
        <div className="flex gap-2">
          <select value={backupMode} onChange={event => setBackupMode(event.target.value as BackupMode)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-brand-500">
            <option value="world">World Backup</option>
            <option value="full">Full Backup</option>
          </select>
          <button onClick={() => loadBackups()} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40">
            <RefreshCw className={busy || creating ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
          </button>
          <button onClick={createBackup} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Create Backup
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-300">World Backup</p>
          <p className="text-xs text-slate-500 mt-1">Backs up saves, config, admins, mods and generated worlds. Faster and smaller.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-300">Full Backup</p>
          <p className="text-xs text-slate-500 mt-1">Backs up the full server directory, excluding logs and temp files. Slower but complete.</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-400">Direct API: <span className="text-slate-200 font-mono">{message || 'Ready'}</span></p>
        {lastUpdated && <p className="text-xs text-emerald-400 font-mono">updated {lastUpdated}</p>}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-500">
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Mode</div>
          <div className="col-span-2 text-right">Size</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Modified</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {backups.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No backups yet. Create one to test Direct API backup creation.</p>
        ) : backups.map(backup => {
          const isCreating = backup.status === 'creating' || backup.name.endsWith('.partial')
          return (
            <div key={backup.name} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-800 last:border-b-0 items-center hover:bg-slate-800/40">
              <div className="col-span-4 text-sm text-slate-200 font-mono truncate">{backup.displayName || backup.name}</div>
              <div className="col-span-2 text-xs capitalize text-slate-400">{backup.mode || 'full'}</div>
              <div className="col-span-2 text-right text-xs text-slate-400">{formatSize(backup.size)}</div>
              <div className="col-span-2 text-xs">
                <span className={isCreating ? 'text-amber-300' : 'text-emerald-400'}>{isCreating ? 'Creating...' : 'Ready'}</span>
              </div>
              <div className="col-span-1 text-xs text-slate-500 truncate">{new Date(backup.modifiedAt).toLocaleTimeString()}</div>
              <div className="col-span-1 text-right">
                <button onClick={() => deleteBackup(backup.name)} disabled={busy || isCreating} className="p-1.5 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
