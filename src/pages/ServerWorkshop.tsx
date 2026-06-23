import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, DownloadCloud, ExternalLink, Plus, RefreshCw, Save, Search, Trash2, Wrench } from 'lucide-react'
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
type BrowserItem = { id: string; title: string; image: string; author: string; stats: string; url: string }
type BrowserResult = { appId: string; query: string; sort: string; page: number; items: BrowserItem[] }

function emptyMod(): WorkshopMod { return { id: '', name: '', enabled: true, status: null, error: null } }
function formatDate(value?: string | null) { if (!value) return 'Never'; return new Date(value).toLocaleString() }

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
  const [query, setQuery] = useState('')
  const [catalogueFilter, setCatalogueFilter] = useState('')
  const [sort, setSort] = useState('trend')
  const [page, setPage] = useState(1)
  const [browserItems, setBrowserItems] = useState<BrowserItem[]>([])
  const [browserBusy, setBrowserBusy] = useState(false)
  const [browserMessage, setBrowserMessage] = useState('Catalogue will load automatically. Filter by title, author, or Workshop ID.')

  const filteredItems = useMemo(() => {
    const needle = catalogueFilter.trim().toLowerCase()
    if (!needle) return browserItems
    return browserItems.filter(item => item.id.includes(needle) || item.title.toLowerCase().includes(needle) || item.author.toLowerCase().includes(needle))
  }, [browserItems, catalogueFilter])

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
    setMessage(result.message || 'Workshop action completed')
    return result
  }

  async function loadWorkshop() {
    if (!server) return
    setBusy(true)
    try { await direct('workshop_list') } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function saveWorkshop() {
    setBusy(true)
    try { await direct('workshop_save', { mods: mods.filter(mod => mod.id.trim()) }) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function updateWorkshop() {
    setBusy(true)
    try { await direct('workshop_update', { mods: mods.filter(mod => mod.id.trim()) }) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function loadCatalogue(nextPage = page, event?: FormEvent) {
    event?.preventDefault()
    if (!session?.access_token) return
    setBrowserBusy(true)
    setBrowserMessage('Loading Workshop catalogue...')
    try {
      const response = await fetch('/api/workshop/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ appId, query, sort, page: nextPage }),
      })
      const data = await response.json().catch(() => null) as { success?: boolean; result?: BrowserResult; error?: string } | null
      if (!response.ok || !data?.success) throw new Error(data?.error || `Workshop catalogue failed: ${response.status}`)
      setPage(data.result?.page || nextPage)
      setBrowserItems(data.result?.items || [])
      setBrowserMessage((data.result?.items || []).length ? `${data.result?.items.length} catalogue items loaded. Use the filter box to narrow them down.` : 'No Workshop catalogue items found.')
    } catch (error) {
      setBrowserMessage((error as Error).message)
    } finally {
      setBrowserBusy(false)
    }
  }

  function addBrowserItem(item: BrowserItem) {
    setMods(prev => prev.some(mod => mod.id === item.id) ? prev : [...prev, { id: item.id, name: item.title, enabled: true, status: null, error: null }])
    setMessage(`Added ${item.title}`)
  }

  function updateMod(index: number, patch: Partial<WorkshopMod>) { setMods(prev => prev.map((mod, i) => i === index ? { ...mod, ...patch } : mod)) }
  function removeMod(index: number) { setMods(prev => prev.filter((_, i) => i !== index)) }

  useEffect(() => { fetchServer() }, [user, id])
  useEffect(() => { if (server) loadWorkshop() }, [server?.id])
  useEffect(() => { if (server && session?.access_token) loadCatalogue(1) }, [server?.id, session?.access_token])

  if (loading) return <div className="p-8 text-slate-400">Loading Workshop...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="apex-button-muted mb-8"><ArrowLeft className="w-4 h-4" /> Back to server</button>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200 mb-3"><Wrench className="w-3.5 h-3.5" /> Steam Workshop</div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Workshop Catalogue</h1>
          <p className="text-slate-400 text-sm mt-1">Browse available Workshop mods, filter by title or ID, then add them to {server.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadWorkshop} disabled={busy} className="apex-button-muted"><RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh</button>
          <button onClick={saveWorkshop} disabled={busy} className="apex-button-muted"><Save className="w-4 h-4" /> Save</button>
          <button onClick={updateWorkshop} disabled={busy || mods.filter(mod => mod.enabled && mod.id.trim()).length === 0} className="apex-button-primary"><DownloadCloud className="w-4 h-4" /> Download + Apply</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Steam App ID</p><input value={appId} onChange={event => setAppId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" /></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Workshop cache path</p><p className="text-sm text-slate-200 font-mono truncate">{workshopRoot || 'Not created yet'}</p></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Server Mods folder</p><p className="text-sm text-slate-200 font-mono truncate">{modsPath || `${server.install_path}/Mods`}</p></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-6">
        <div className="space-y-6">
          <div className="apex-card p-4 space-y-3">
            <form onSubmit={event => loadCatalogue(1, event)} className="grid grid-cols-1 lg:grid-cols-[1fr_180px_120px] gap-3">
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Catalogue search, e.g. UI, weapons, vehicles" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
              <select value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40">
                <option value="trend">Trending</option>
                <option value="mostrecent">Most recent</option>
                <option value="totaluniquesubscribers">Most subscribed</option>
                <option value="totalunique">Most popular</option>
              </select>
              <button disabled={browserBusy} className="apex-button-primary justify-center"><Search className={browserBusy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Load</button>
            </form>
            <input value={catalogueFilter} onChange={event => setCatalogueFilter(event.target.value)} placeholder="Filter loaded catalogue by title, author, or exact Workshop ID" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{browserMessage}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => loadCatalogue(Math.max(1, page - 1))} disabled={browserBusy || page <= 1} className="apex-button-muted px-3 py-2 text-xs"><ChevronLeft className="w-3.5 h-3.5" /> Prev</button>
                <span className="text-xs text-slate-400 font-mono">Page {page}</span>
                <button type="button" onClick={() => loadCatalogue(page + 1)} disabled={browserBusy} className="apex-button-muted px-3 py-2 text-xs">Next <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <div key={item.id} className="apex-card apex-card-hover overflow-hidden">
                <div className="h-36 bg-slate-950 border-b border-white/10 overflow-hidden">{item.image ? <img src={item.image} alt={item.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600"><Wrench className="w-8 h-8" /></div>}</div>
                <div className="p-4">
                  <p className="text-sm font-black text-slate-100 line-clamp-2 min-h-[2.5rem]">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">ID {item.id}</p>
                  {item.author && <p className="text-xs text-slate-400 mt-1 truncate">by {item.author}</p>}
                  {item.stats && <p className="text-xs text-slate-500 mt-1 truncate">{item.stats}</p>}
                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => addBrowserItem(item)} disabled={mods.some(mod => mod.id === item.id)} className="flex-1 apex-button-primary justify-center px-3 py-2 text-xs disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> {mods.some(mod => mod.id === item.id) ? 'Added' : 'Add'}</button>
                    <a href={item.url} target="_blank" rel="noreferrer" className="apex-button-muted px-3 py-2 text-xs"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="apex-card p-4"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-100 font-mono">{message || 'Ready'}</span></p></div>
          <div className="apex-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10"><div><p className="text-sm font-black text-slate-100">Selected Mods</p><p className="text-xs text-slate-500">Enabled mods will be downloaded and applied.</p></div><button onClick={() => setMods(prev => [...prev, emptyMod()])} className="apex-button-muted px-3 py-2 text-xs"><Plus className="w-4 h-4" /> Manual</button></div>
            {mods.length === 0 ? <div className="p-8 text-center"><p className="text-slate-400 text-sm mb-4">No Workshop mods added yet.</p><button onClick={() => setMods([emptyMod()])} className="apex-button-primary"><Plus className="w-4 h-4" /> Add manually</button></div> : <div className="divide-y divide-white/10 max-h-[720px] overflow-y-auto">{mods.map((mod, index) => <div key={`${mod.id}-${index}`} className="p-4 hover:bg-white/[0.03] space-y-3"><div className="grid grid-cols-[1fr_40px] gap-2"><input value={mod.id} onChange={event => updateMod(index, { id: event.target.value })} placeholder="Workshop ID" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-emerald-400/40" /><button onClick={() => removeMod(index)} className="inline-flex items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /></button></div><input value={mod.name || ''} onChange={event => updateMod(index, { name: event.target.value })} placeholder="Optional name" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" /><div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={mod.enabled} onChange={event => updateMod(index, { enabled: event.target.checked })} /> Enabled</label><p className="text-xs text-slate-500 font-mono truncate">{mod.error || mod.status || 'Not installed'} • {formatDate(mod.appliedAt || mod.updatedAt)}</p></div></div>)}</div>}
          </div>
          <div className="apex-card p-5 text-sm text-slate-400">Catalogue loads from Steam Workshop public browse pages. Manual Workshop IDs still work if Steam blocks or changes catalogue results.</div>
        </div>
      </div>
    </div>
  )
}
