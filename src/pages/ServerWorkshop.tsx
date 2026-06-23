import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, DownloadCloud, ExternalLink, Plus, RefreshCw, Save, Trash2, UploadCloud, Wrench } from 'lucide-react'
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
  appliedAt?: string | null
  status?: string | null
  error?: string | null
}

type WorkshopConfig = {
  serverId: string
  installPath: string
  appId: string
  workshopRoot: string
  modsPath?: string
  mods: WorkshopMod[]
  updatedAt: string
}

type WorkshopResult = { message?: string; config?: WorkshopConfig }

function emptyMod(): WorkshopMod { return { id: '', name: '', enabled: true, status: null, error: null } }
function formatDate(value?: string | null) { if (!value) return 'Never'; return new Date(value).toLocaleString() }

const NEXUS_7DTD_URL = 'https://www.nexusmods.com/7daystodie'

export default function ServerWorkshop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<GameServer | null>(null)
  const [mods, setMods] = useState<WorkshopMod[]>([])
  const [appId, setAppId] = useState('251570')
  const [workshopRoot, setWorkshopRoot] = useState('')
  const [modsPath, setModsPath] = useState('')
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
    const result = await callNodeApi<WorkshopResult>(session, action, { server_id: server.id, installPath: server.install_path, appId, ...extra })
    if (result.config) {
      setAppId(result.config.appId || '251570')
      setWorkshopRoot(result.config.workshopRoot || '')
      setModsPath(result.config.modsPath || '')
      setMods(result.config.mods || [])
    }
    setMessage(result.message || 'Mod action completed')
    return result
  }

  async function loadMods() {
    if (!server) return
    setBusy(true)
    try { await direct('workshop_list') } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function saveMods() {
    setBusy(true)
    try { await direct('workshop_save', { mods: mods.filter(mod => mod.id.trim()) }) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function updateMods() {
    setBusy(true)
    try { await direct('workshop_update', { mods: mods.filter(mod => mod.id.trim()) }) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  function updateMod(index: number, patch: Partial<WorkshopMod>) { setMods(prev => prev.map((mod, i) => i === index ? { ...mod, ...patch } : mod)) }
  function removeMod(index: number) { setMods(prev => prev.filter((_, i) => i !== index)) }

  useEffect(() => { fetchServer() }, [user, id])
  useEffect(() => { if (server) loadMods() }, [server?.id])

  if (loading) return <div className="p-8 text-slate-400">Loading mods...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="apex-button-muted mb-8"><ArrowLeft className="w-4 h-4" /> Back to server</button>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200 mb-3"><Wrench className="w-3.5 h-3.5" /> 7 Days To Die Mods</div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Mod Manager</h1>
          <p className="text-slate-400 text-sm mt-1">7 Days To Die does not expose a normal Steam Workshop catalogue, so Nexus/manual mod support is the correct route.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadMods} disabled={busy} className="apex-button-muted"><RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh</button>
          <button onClick={saveMods} disabled={busy} className="apex-button-muted"><Save className="w-4 h-4" /> Save</button>
          <button onClick={updateMods} disabled={busy || mods.filter(mod => mod.enabled && mod.id.trim()).length === 0} className="apex-button-primary"><DownloadCloud className="w-4 h-4" /> Apply Steam IDs</button>
        </div>
      </div>

      <div className="apex-card p-5 mb-6 border-amber-400/20 bg-amber-400/5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-amber-200 font-black text-sm">Steam Workshop catalogue unavailable for 7DTD</p>
            <p className="text-slate-400 text-sm mt-1">Use Nexus Mods or manual ZIP upload/install next. Manual Steam Workshop IDs remain here for games that support Workshop properly.</p>
          </div>
          <a href={NEXUS_7DTD_URL} target="_blank" rel="noreferrer" className="apex-button-muted shrink-0"><ExternalLink className="w-4 h-4" /> Open Nexus 7DTD</a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Steam App ID</p><input value={appId} onChange={event => setAppId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" /></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Workshop cache path</p><p className="text-sm text-slate-200 font-mono truncate">{workshopRoot || 'Not created yet'}</p></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Server Mods folder</p><p className="text-sm text-slate-200 font-mono truncate">{modsPath || `${server.install_path}/Mods`}</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-6">
          <div className="apex-card p-6 text-center border-dashed">
            <UploadCloud className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-200 font-black mb-2">Next: Nexus/manual ZIP mod installer</p>
            <p className="text-slate-500 text-sm max-w-2xl mx-auto">This will let you paste a Nexus/manual download URL or upload a mod ZIP, extract it safely, detect the mod folder, and apply it to the server Mods directory.</p>
          </div>

          <div className="apex-card p-4"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-100 font-mono">{message || 'Ready'}</span></p></div>
        </div>

        <div className="apex-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div><p className="text-sm font-black text-slate-100">Manual Steam IDs</p><p className="text-xs text-slate-500">Kept for games with real Workshop support.</p></div>
            <button onClick={() => setMods(prev => [...prev, emptyMod()])} className="apex-button-muted px-3 py-2 text-xs"><Plus className="w-4 h-4" /> Manual</button>
          </div>
          {mods.length === 0 ? (
            <div className="p-8 text-center"><p className="text-slate-400 text-sm mb-4">No manual Workshop IDs added.</p><button onClick={() => setMods([emptyMod()])} className="apex-button-primary"><Plus className="w-4 h-4" /> Add manually</button></div>
          ) : (
            <div className="divide-y divide-white/10 max-h-[720px] overflow-y-auto">
              {mods.map((mod, index) => (
                <div key={`${mod.id}-${index}`} className="p-4 hover:bg-white/[0.03] space-y-3">
                  <div className="grid grid-cols-[1fr_40px] gap-2"><input value={mod.id} onChange={event => updateMod(index, { id: event.target.value })} placeholder="Workshop ID" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" /><button onClick={() => removeMod(index)} className="inline-flex items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /></button></div>
                  <input value={mod.name || ''} onChange={event => updateMod(index, { name: event.target.value })} placeholder="Optional name" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
                  <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={mod.enabled} onChange={event => updateMod(index, { enabled: event.target.checked })} /> Enabled</label><p className="text-xs text-slate-500 font-mono truncate">{mod.error || mod.status || 'Not installed'} • {formatDate(mod.appliedAt || mod.updatedAt)}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
