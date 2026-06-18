import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Save, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type ServerJob = {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
}

type SettingsForm = {
  serverName: string
  serverPassword: string
  serverPort: string
  maxPlayers: string
  gameWorld: string
  worldGenSeed: string
  worldGenSize: string
  difficulty: string
  xpMultiplier: string
  lootAbundance: string
  bloodMoonFrequency: string
}

const defaultSettings: SettingsForm = {
  serverName: 'Apex 7DTD',
  serverPassword: '',
  serverPort: '26900',
  maxPlayers: '8',
  gameWorld: 'Navezgane',
  worldGenSeed: 'ApexGSP',
  worldGenSize: '6144',
  difficulty: '2',
  xpMultiplier: '100',
  lootAbundance: '100',
  bloodMoonFrequency: '7',
}

function getServerId(job: ServerJob) {
  const value = job.payload?.server_id ?? job.result?.serverId
  return typeof value === 'string' ? value : null
}

function getMessage(job: ServerJob | null) {
  if (!job) return ''
  if (typeof job.result?.message === 'string') return job.result.message
  return job.error ?? ''
}

export default function ServerSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [jobs, setJobs] = useState<ServerJob[]>([])
  const [form, setForm] = useState<SettingsForm>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const latestJob = useMemo(
    () => jobs.find(job => job.type === 'update_server_config' && getServerId(job) === id) ?? null,
    [jobs, id],
  )

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error(error)
    const nextServer = (data ?? null) as ServerWithNode | null
    setServer(nextServer)
    if (nextServer) {
      const metadataSettings = nextServer.metadata?.settings
      const safeSettings = metadataSettings && typeof metadataSettings === 'object' && !Array.isArray(metadataSettings)
        ? metadataSettings as Partial<SettingsForm>
        : {}
      setForm({ ...defaultSettings, serverName: nextServer.name, ...safeSettings })
    }
    setLoading(false)
  }

  async function fetchJobs() {
    if (!user) return
    const { data, error } = await supabase
      .from('jobs')
      .select('id, type, status, payload, result, error, created_at')
      .eq('user_id', user.id)
      .eq('type', 'update_server_config')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) console.error(error)
    setJobs((data ?? []) as ServerJob[])
  }

  async function saveSettings() {
    if (!user || !server) return
    setSaving(true)

    const { error } = await supabase.from('jobs').insert({
      node_id: server.node_id,
      user_id: user.id,
      type: 'update_server_config',
      status: 'pending',
      payload: {
        requested_at: new Date().toISOString(),
        server_id: server.id,
        installPath: server.install_path,
        settings: form,
      },
    })

    if (error) alert(error.message)
    await fetchJobs()
    setSaving(false)
  }

  useEffect(() => {
    fetchServer()
    fetchJobs()
    if (!user) return

    const channel = supabase
      .channel(`server-settings-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, id])

  if (loading) return <div className="p-8 text-slate-400">Loading settings...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  const jobBusy = latestJob?.status === 'pending' || latestJob?.status === 'running'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to server
      </button>

      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-400" />
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Server Settings</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Edit 7 Days To Die serverconfig.xml for {server.name}</p>
        </div>
        <button onClick={saveSettings} disabled={saving || jobBusy} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving || jobBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Config
        </button>
      </div>

      {latestJob && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">Latest config job: <span className="text-slate-200 font-mono">{latestJob.status}</span></p>
          <p className="text-xs text-slate-500 font-mono truncate">{getMessage(latestJob)}</p>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          ['serverName', 'Server Name'],
          ['serverPassword', 'Server Password'],
          ['serverPort', 'Server Port'],
          ['maxPlayers', 'Max Players'],
          ['gameWorld', 'Game World'],
          ['worldGenSeed', 'World Seed'],
          ['worldGenSize', 'World Size'],
          ['difficulty', 'Difficulty'],
          ['xpMultiplier', 'XP Multiplier'],
          ['lootAbundance', 'Loot Abundance'],
          ['bloodMoonFrequency', 'Blood Moon Frequency'],
        ].map(([key, label]) => (
          <label key={key} className="block">
            <span className="block text-sm font-medium text-slate-300 mb-2">{label}</span>
            <input
              value={form[key as keyof SettingsForm]}
              onChange={event => setForm(prev => ({ ...prev, [key]: event.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
