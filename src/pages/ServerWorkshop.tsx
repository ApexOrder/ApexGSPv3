import { ChangeEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Link as LinkIcon, RefreshCw, Trash2, UploadCloud, Wrench } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type ModEntry = {
  id: string
  name: string
  sourceType: 'url' | 'upload' | 'nexus' | 'manual'
  source?: string
  enabled: boolean
  status: 'installed' | 'disabled' | 'failed'
  installedAt: string
  updatedAt: string
  folderName: string
  error?: string | null
}

type ModConfig = {
  serverId: string
  installPath: string
  modsPath: string
  stagingPath: string
  mods: ModEntry[]
  updatedAt: string
}

type ModResult = { message?: string; config?: ModConfig; mod?: ModEntry }
const NEXUS_7DTD_URL = 'https://www.nexusmods.com/7daystodie'

function formatDate(value?: string | null) { if (!value) return 'Never'; return new Date(value).toLocaleString() }

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  return btoa(binary)
}

export default function ServerWorkshop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<GameServer | null>(null)
  const [config, setConfig] = useState<ModConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [urlName, setUrlName] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase.from('servers').select('*').eq('user_id', user.id).eq('id', id).maybeSingle()
    if (error) setMessage(error.message)
    setServer((data ?? null) as GameServer | null)
    setLoading(false)
  }

  async function callMods(action: 'mods_list' | 'mods_install_url' | 'mods_install_upload' | 'mods_remove', extra: Record<string, unknown> = {}) {
    if (!server) return null
    const result = await callNodeApi<ModResult>(session, action, { server_id: server.id, installPath: server.install_path, ...extra })
    if (result.config) setConfig(result.config)
    setMessage(result.message || 'Mod action completed')
    return result
  }

  async function loadMods() {
    if (!server) return
    setBusy(true)
    try { await callMods('mods_list') } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function installUrl() {
    if (!url.trim()) return setMessage('Paste a direct ZIP URL or Nexus URL first')
    setBusy(true)
    try {
      await callMods('mods_install_url', { url: url.trim(), name: urlName.trim() || undefined })
      setUrl('')
      setUrlName('')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function installUpload() {
    if (!uploadFile) return setMessage('Choose a ZIP file first')
    if (!uploadFile.name.toLowerCase().endsWith('.zip')) return setMessage('Only ZIP files are supported right now')
    setBusy(true)
    try {
      const fileBase64 = await fileToBase64(uploadFile)
      await callMods('mods_install_upload', { fileName: uploadFile.name, fileBase64, name: uploadName.trim() || undefined })
      setUploadFile(null)
      setUploadName('')
      const input = document.getElementById('mod-upload-input') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function removeInstalledMod(modId: string) {
    if (!confirm('Remove this mod from the server Mods folder?')) return
    setBusy(true)
    try { await callMods('mods_remove', { modId }) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadFile(event.target.files?.[0] || null)
  }

  useEffect(() => { fetchServer() }, [user, id])
  useEffect(() => { if (server) loadMods() }, [server?.id])

  if (loading) return <div className="p-8 text-slate-400">Loading mods...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  const mods = config?.mods || []

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="apex-button-muted mb-8"><ArrowLeft className="w-4 h-4" /> Back to server</button>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200 mb-3"><Wrench className="w-3.5 h-3.5" /> 7 Days To Die Mods</div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Mod Manager</h1>
          <p className="text-slate-400 text-sm mt-1">Install from direct ZIP URLs, Nexus/manual URLs, or upload a ZIP from your PC.</p>
        </div>
        <button onClick={loadMods} disabled={busy} className="apex-button-muted"><RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Server Mods folder</p><p className="text-sm text-slate-200 font-mono truncate">{config?.modsPath || `${server.install_path}/Mods`}</p></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Staging folder</p><p className="text-sm text-slate-200 font-mono truncate">{config?.stagingPath || 'Not created yet'}</p></div>
        <div className="apex-card p-4"><p className="text-xs text-slate-500 mb-1">Installed mods</p><p className="text-2xl font-black text-emerald-300">{mods.length}</p></div>
      </div>

      <div className="apex-card p-5 mb-6 border-amber-400/20 bg-amber-400/5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-amber-200 font-black text-sm">Nexus note</p>
            <p className="text-slate-400 text-sm mt-1">Nexus page URLs usually require login/manual download. Direct downloadable ZIP links work now; full Nexus API support can be added with an API key flow.</p>
          </div>
          <a href={NEXUS_7DTD_URL} target="_blank" rel="noreferrer" className="apex-button-muted shrink-0"><ExternalLink className="w-4 h-4" /> Open Nexus 7DTD</a>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="apex-card p-5 space-y-4">
          <div><p className="text-lg font-black text-slate-100">Install from URL</p><p className="text-sm text-slate-500 mt-1">Paste a direct ZIP URL. Nexus mod page URLs are stored/attempted, but may be blocked by Nexus auth.</p></div>
          <input value={urlName} onChange={event => setUrlName(event.target.value)} placeholder="Optional mod name" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/mod.zip or Nexus URL" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
          <button onClick={installUrl} disabled={busy} className="apex-button-primary"><LinkIcon className="w-4 h-4" /> Install URL</button>
        </div>

        <div className="apex-card p-5 space-y-4">
          <div><p className="text-lg font-black text-slate-100">Upload ZIP</p><p className="text-sm text-slate-500 mt-1">Upload a downloaded mod ZIP. The daemon extracts it and applies the detected mod folder.</p></div>
          <input value={uploadName} onChange={event => setUploadName(event.target.value)} placeholder="Optional mod name" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/40" />
          <input id="mod-upload-input" type="file" accept=".zip,application/zip" onChange={onFileChange} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-1 file:text-sm file:font-bold file:text-slate-950" />
          <button onClick={installUpload} disabled={busy || !uploadFile} className="apex-button-primary"><UploadCloud className="w-4 h-4" /> Upload + Install</button>
        </div>
      </div>

      <div className="apex-card p-4 mb-6"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-100 font-mono">{message || 'Ready'}</span></p></div>

      <div className="apex-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10"><p className="text-sm font-black text-slate-100">Installed Mods</p><p className="text-xs text-slate-500">Restart the game server after changing mods.</p></div>
        {mods.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No mods installed yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {mods.map(mod => (
              <div key={mod.id} className="grid grid-cols-1 lg:grid-cols-[1fr_160px_180px_90px] gap-3 p-4 items-center hover:bg-white/[0.03]">
                <div><p className="text-sm font-black text-slate-100">{mod.name}</p><p className="text-xs text-slate-500 font-mono truncate">{mod.folderName}</p>{mod.source && <p className="text-xs text-slate-600 truncate">{mod.source}</p>}</div>
                <div><p className="text-xs text-slate-500">Source</p><p className="text-xs text-slate-300 capitalize">{mod.sourceType}</p></div>
                <div><p className="text-xs text-slate-500">Installed</p><p className="text-xs text-slate-300">{formatDate(mod.installedAt)}</p></div>
                <button onClick={() => removeInstalledMod(mod.id)} disabled={busy} className="inline-flex items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
