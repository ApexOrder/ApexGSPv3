import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, DownloadCloud, Plus, RefreshCw, Save, Trash2, Wrench } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type WorkshopMod = {
  id: string
  name?: string
  enabled: boolean
  installedAt?: string | null
  updatedAt?: string | null
  status?: string | null
  error?: string | null
}

type WorkshopConfig = {
  serverId: string
  installPath: string
  appId: string
  workshopRoot: string
  mods: WorkshopMod[]
  updatedAt: string
}

type WorkshopResult = {
  message?: string
  config?: WorkshopConfig
}

function emptyMod(): WorkshopMod {
  return { id: '', name: '', enabled: true, status: null, error: null }
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export default function ServerWorkshop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<GameServer | null>(null)
  const [mods, setMods] = useState<WorkshopMod[]>([])
  const [appId, setAppId] = useState('251570')
  const [workshopRoot, setWorkshopRoot] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase.from('servers').select('*').eq('user_id', user.id).eq('id', id).maybeSingle()
    if (error) setMessage(error.message)
    setServer((data ?? null) as GameServer | null)
    setLoading(false)
  }

  async function direct(action: 'workshop_list' | 'workshop_save' | 'workshop_update', extra: Record<string, unknown> = {}) {
    if (!server) return null
    const result = await callNodeApi<WorkshopResult>(session, action, {
      server_id: server.id,
      installPath: server.install_path,
      appId,
      ...extra,
    })
    if (result.config) {
      setAppId(result.config.appId || '251570')
      setWorkshopRoot(result.config.workshopRoot || '')
      setMods(result.config.mods || [])
    }
    setMessage(result.message || 'Workshop action completed')
    return result
  }

  async function loadWorkshop() {
    if (!server) return
    setBusy(true)
    try {
      await direct('workshop_list')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveWorkshop() {
    setBusy(true)
    try {
      await direct('workshop_save', { mods: mods.filter(mod => mod.id.trim()) })
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function updateWorkshop() {
    setBusy(true)
    try {
      await direct('workshop_update', { mods: mods.filter(mod => mod.id.trim()) })
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function updateMod(index: number, patch: Partial<WorkshopMod>) {
    setMods(prev => prev.map((mod, i) => i === index ? { ...mod, ...patch } : mod))
  }

  function removeMod(index: number) {
    setMods(prev => prev.filter((_, i) => i !== index))
  }

  useEffect(() => { fetchServer() }, [user, id])
  useEffect(() => { if (server) loadWorkshop() }, [server?.id])

  if (loading) return <div className="p-8 text-slate-400">Loading Workshop...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="apex-button-muted mb-8"><ArrowLeft className="w-4 h-4" /> Back to server</button>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200 mb-3"><Wrench className="w-3.5 h-3.5" /> Steam Workshop</div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Workshop Mods</h1>
          <p className="text-slate-400 text-sm mt-1">Manage Workshop IDs for {server.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadWorkshop} disabled={busy} className="apex-button-muted"><RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh</button>
          <button onClick={saveWorkshop} disabled={busy} className="apex-button-muted"><Save className="w-4 h-4" /> Save</button>
          <button onClick={updateWorkshop} disabled={busy || mods.filter(mod => mod.enabled && mod.id.trim()).length === 0} className="apex-button-primary"><DownloadCloud className="w-4 h-4" /> Update Mods</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Steam App ID</p><input value={appId} onChange={event => setAppId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" /></div>
        <div className="apex-card p-4 lg:col-span-2"><p className="text-xs text-slate-500 mb-1">Workshop cache path</p><p className="text-sm text-slate-200 font-mono truncate">{workshopRoot || 'Not created yet'}</p></div>
      </div>

      <div className="apex-card p-4 mb-6"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-100 font-mono">{message || 'Ready'}</span></p></div>

      <div className="apex-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div><p className="text-sm font-black text-slate-100">Mod List</p><p className="text-xs text-slate-500">Add numeric Workshop IDs from Steam.</p></div>
          <button onClick={() => setMods(prev => [...prev, emptyMod()])} className="apex-button-muted px-3 py-2 text-xs"><Plus className="w-4 h-4" /> Add Mod</button>
        </div>

        {mods.length === 0 ? (
          <div className="p-10 text-center"><p className="text-slate-400 text-sm mb-4">No Workshop mods added yet.</p><button onClick={() => setMods([emptyMod()])} className="apex-button-primary"><Plus className="w-4 h-4" /> Add first mod</button></div>
        ) : (
          <div className="divide-y divide-white/10">
            {mods.map((mod, index) => (
              <div key={`${mod.id}-${index}`} className="grid grid-cols-1 lg:grid-cols-[150px_1fr_120px_160px_90px] gap-3 p-4 items-center hover:bg-white/[0.03]">
                <input value={mod.id} onChange={event => updateMod(index, { id: event.target.value })} placeholder="Workshop ID" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" />
                <input value={mod.name || ''} onChange={event => updateMod(index, { name: event.target.value })} placeholder="Optional name" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={mod.enabled} onChange={event => updateMod(index, { enabled: event.target.checked })} /> Enabled</label>
                <div><p className="text-xs text-slate-500">Status</p><p className="text-xs text-slate-300 font-mono truncate">{mod.error || mod.status || 'Not installed'} • {formatDate(mod.updatedAt)}</p></div>
                <button onClick={() => removeMod(index)} className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 apex-card p-5 text-sm text-slate-400">
        Phase 1 downloads Workshop content using SteamCMD into the daemon cache. Phase 2 will add install/copy rules per game profile so 7DTD mods can be applied automatically to the live server folder.
      </div>
    </div>
  )
}
