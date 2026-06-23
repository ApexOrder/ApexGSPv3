import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gamepad2, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Node } from '@/lib/types'

const STEAM_SETTINGS_KEY = 'apexgsp_steam_credentials'

const gameOptions = [
  { id: '7dtd', label: '7 Days To Die', defaultName: 'My 7DTD Server', needsSteam: false },
  { id: 'dayz', label: 'DayZ', defaultName: 'My DayZ Server', needsSteam: true },
]

type SteamSettings = { username?: string; password?: string; guardCode?: string }

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function loadSteamSettings(): SteamSettings {
  try {
    const raw = window.localStorage.getItem(STEAM_SETTINGS_KEY)
    return raw ? JSON.parse(raw) as SteamSettings : {}
  } catch {
    return {}
  }
}

export default function NewServer() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [nodes, setNodes] = useState<Node[]>([])
  const [nodeId, setNodeId] = useState('')
  const [game, setGame] = useState('7dtd')
  const [serverName, setServerName] = useState('My 7DTD Server')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const selectedNode = useMemo(() => nodes.find(node => node.id === nodeId), [nodes, nodeId])
  const selectedGame = gameOptions.find(option => option.id === game) ?? gameOptions[0]
  const steam = loadSteamSettings()
  const hasSteamCredentials = Boolean(steam.username && steam.password)

  useEffect(() => {
    async function loadNodes() {
      if (!user) return
      const { data } = await supabase.from('nodes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      const nextNodes = (data ?? []) as Node[]
      setNodes(nextNodes)
      setNodeId(nextNodes.find(node => node.status === 'online')?.id ?? nextNodes[0]?.id ?? '')
      setLoading(false)
    }
    loadNodes()
  }, [user])

  function handleGameChange(nextGame: string) {
    setGame(nextGame)
    const profile = gameOptions.find(option => option.id === nextGame)
    if (profile) setServerName(profile.defaultName)
  }

  async function createServerJob() {
    if (!user || !selectedNode) return
    const slug = slugify(serverName)
    if (!slug) return alert('Please enter a valid server name.')

    const steamForJob = loadSteamSettings()
    if (selectedGame.needsSteam && (!steamForJob.username || !steamForJob.password)) {
      alert('DayZ requires Steam credentials. Add them in Settings → Integrations first.')
      return
    }

    setSubmitting(true)
    const payload: Record<string, unknown> = { requested_at: new Date().toISOString(), game, serverName, slug }
    if (selectedGame.needsSteam) {
      payload.steam = { username: steamForJob.username, password: steamForJob.password, guardCode: steamForJob.guardCode || '' }
    }

    const { error } = await supabase.from('jobs').insert({ node_id: selectedNode.id, user_id: user.id, type: 'create_server', status: 'pending', payload })
    setSubmitting(false)
    if (error) return alert(error.message)
    navigate('/nodes')
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button onClick={() => navigate('/nodes')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to nodes</button>
      <div className="mb-8"><h1 className="text-2xl font-bold text-slate-100 tracking-tight">Create Server</h1><p className="text-slate-400 text-sm mt-1">Provision a new game server on one of your online nodes.</p></div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Game</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gameOptions.map(option => (
              <button key={option.id} type="button" onClick={() => handleGameChange(option.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${game === option.id ? 'border-brand-500 bg-brand-500/10 text-brand-200' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}>
                <Gamepad2 className="w-4 h-4 text-brand-400" /> {option.label}
              </button>
            ))}
          </div>
          {selectedGame.needsSteam && (
            <div className={`mt-3 rounded-lg border p-3 text-xs ${hasSteamCredentials ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}>
              {hasSteamCredentials ? `Steam account ready: ${steam.username}` : 'DayZ needs Steam credentials. Go to Settings → Integrations and save your Steam account first.'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Server name</label>
          <input value={serverName} onChange={event => setServerName(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" placeholder={selectedGame.defaultName} />
          <p className="text-xs text-slate-500 mt-1">Install folder: /opt/apexgsp/servers/{slugify(serverName) || 'server-name'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Node</label>
          {loading ? <div className="text-sm text-slate-500">Loading nodes...</div> : nodes.length === 0 ? <div className="text-sm text-red-400">No nodes found. Add and register a node first.</div> : (
            <select value={nodeId} onChange={event => setNodeId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500">
              {nodes.map(node => <option key={node.id} value={node.id}>{node.name} - {node.status}</option>)}
            </select>
          )}
        </div>

        <button onClick={createServerJob} disabled={!selectedNode || selectedNode.status !== 'online' || submitting} className="flex items-center justify-center gap-2 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Gamepad2 className="w-4 h-4" />} Queue {selectedGame.label} Create Job
        </button>
      </div>
    </div>
  )
}
