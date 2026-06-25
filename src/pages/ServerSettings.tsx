import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Save, Settings } from 'lucide-react'
import { callNodeApi } from '@/lib/nodeApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type ServerWithNode = GameServer & { nodes?: { name: string | null; status: string | null } | null }
type SettingsForm = Record<string, string>
type ConfigResult = { message?: string; configPath?: string; settings?: Record<string, unknown> }
type Field = [string, string, string]

const settingsByGame: Record<string, { defaults: SettingsForm; fields: Field[]; fileName: string; restartNote: string }> = {
  '7dtd': {
    fileName: 'serverconfig.xml',
    restartNote: 'Some settings may require a server restart before 7DTD applies them.',
    defaults: {
      serverName: 'Apex 7DTD', serverPassword: '', serverPort: '26900', maxPlayers: '8', gameWorld: 'Navezgane', worldGenSeed: 'ApexGSP', worldGenSize: '6144', difficulty: '2', xpMultiplier: '100', lootAbundance: '100', bloodMoonFrequency: '7',
    },
    fields: [
      ['serverName', 'Server Name', 'Public server name shown in the browser'],
      ['serverPassword', 'Server Password', 'Leave blank for no password'],
      ['serverPort', 'Server Port', 'Default 26900'],
      ['maxPlayers', 'Max Players', 'Recommended 8-16 for testing'],
      ['gameWorld', 'Game World', 'Navezgane or generated world name'],
      ['worldGenSeed', 'World Seed', 'Used for generated worlds'],
      ['worldGenSize', 'World Size', 'Example: 6144'],
      ['difficulty', 'Difficulty', '0 easiest, 5 hardest'],
      ['xpMultiplier', 'XP Multiplier', '100 is default'],
      ['lootAbundance', 'Loot Abundance', '100 is default'],
      ['bloodMoonFrequency', 'Blood Moon Frequency', '7 is default'],
    ],
  },
  dayz: {
    fileName: 'serverDZ.cfg',
    restartNote: 'DayZ reads serverDZ.cfg on launch, so restart the server after saving these settings.',
    defaults: {
      serverName: 'ApexGSP DayZ Server',
      description: '',
      serverPassword: '',
      adminPassword: 'changeme',
      serverPort: '2302',
      maxPlayers: '60',
      mission: 'dayzOffline.chernarusplus',
      instanceId: '1',
      shardId: '123abc',
      enableWhitelist: 'false',
      thirdPerson: 'true',
      crosshair: 'false',
      vonEnabled: 'true',
      vonCodecQuality: '20',
      disablePersonalLight: 'true',
      lightingConfig: '0',
      serverTime: 'SystemTime',
      timeAcceleration: '1',
      nightAcceleration: '1',
      serverTimePersistent: 'false',
      loginQueueConcurrentPlayers: '5',
      loginQueueMaxPlayers: '500',
      verifySignatures: '2',
      forceSameBuild: 'true',
      guaranteedUpdates: '1',
      storageAutoFix: 'true',
      logAverageFps: 'false',
      logMemory: 'false',
      logPlayers: 'false',
      logFile: 'server_console.log',
      adminLogPlayerHitsOnly: 'false',
    },
    fields: [
      ['serverName', 'Hostname', 'Public DayZ server name'],
      ['description', 'Description', 'Shown in the DayZ server browser'],
      ['serverPassword', 'Server Password', 'Leave blank for public'],
      ['adminPassword', 'Admin Password', 'Used for admin login'],
      ['serverPort', 'Server Port', 'Default 2302'],
      ['maxPlayers', 'Max Players', 'Default 60'],
      ['mission', 'Mission Template', 'Examples: dayzOffline.chernarusplus, dayzOffline.enoch, dayzOffline.sakhal'],
      ['instanceId', 'Instance ID', 'Unique per server instance on the same machine'],
      ['shardId', 'Shard ID', 'Six alphanumeric characters for private hive/persistence'],
      ['enableWhitelist', 'Enable Whitelist', 'true or false'],
      ['thirdPerson', 'Allow 3rd Person', 'true or false'],
      ['crosshair', 'Allow Crosshair', 'true or false'],
      ['vonEnabled', 'Enable Voice', 'true or false'],
      ['vonCodecQuality', 'Voice Quality', '0-30, higher is better'],
      ['disablePersonalLight', 'Disable Personal Light', 'true or false'],
      ['lightingConfig', 'Lighting Config', '0 brighter nights, 1 darker nights'],
      ['serverTime', 'Server Time', 'SystemTime or YYYY/MM/DD/HH/MM'],
      ['timeAcceleration', 'Time Acceleration', '1-64'],
      ['nightAcceleration', 'Night Acceleration', '1-64'],
      ['serverTimePersistent', 'Persistent Server Time', 'true or false'],
      ['loginQueueConcurrentPlayers', 'Login Queue Concurrent', 'Players processed at once'],
      ['loginQueueMaxPlayers', 'Login Queue Max', 'Maximum queue size'],
      ['verifySignatures', 'Verify Signatures', '2 recommended'],
      ['forceSameBuild', 'Force Same Build', 'true or false'],
      ['guaranteedUpdates', 'Guaranteed Updates', 'Usually 1'],
      ['storageAutoFix', 'Storage Auto Fix', 'true or false'],
      ['logAverageFps', 'Log Average FPS', 'true or false'],
      ['logMemory', 'Log Memory', 'true or false'],
      ['logPlayers', 'Log Players', 'true or false'],
      ['logFile', 'Log File', 'Example: server_console.log'],
      ['adminLogPlayerHitsOnly', 'Admin Log Hits Only', 'true or false'],
    ],
  },
}

function gameKey(game?: string | null) { return game === 'dayz' ? 'dayz' : '7dtd' }

export default function ServerSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [form, setForm] = useState<SettingsForm>(settingsByGame['7dtd'].defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const profile = useMemo(() => settingsByGame[gameKey(server?.game)], [server?.game])

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase.from('servers').select('*, nodes(name, status)').eq('user_id', user.id).eq('id', id).maybeSingle()
    if (error) setMessage(error.message)
    const nextServer = (data ?? null) as ServerWithNode | null
    setServer(nextServer)
    if (nextServer) {
      const nextProfile = settingsByGame[gameKey(nextServer.game)]
      const metadataSettings = nextServer.metadata?.settings
      const safeSettings = metadataSettings && typeof metadataSettings === 'object' && !Array.isArray(metadataSettings) ? metadataSettings as Partial<SettingsForm> : {}
      setForm({ ...nextProfile.defaults, serverName: nextServer.name, ...safeSettings })
    }
    setLoading(false)
  }

  async function saveSettings() {
    if (!user || !server) return
    setSaving(true)
    setMessage(`Saving ${profile.fileName} through Direct API...`)
    try {
      const result = await callNodeApi<ConfigResult>(session, 'config', { server_id: server.id, installPath: server.install_path, game: server.game, settings: form })
      const nextMetadata = { ...(server.metadata || {}), settings: form }
      const { error } = await supabase.from('servers').update({ name: form.serverName, metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', server.id).eq('user_id', user.id)
      if (error) throw error
      setServer(prev => prev ? { ...prev, name: form.serverName, metadata: nextMetadata } : prev)
      setMessage(result.message || 'Server configuration saved')
      setLastSaved(new Date().toLocaleTimeString())
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { fetchServer() }, [user, id])
  if (loading) return <div className="p-8 text-slate-400">Loading settings...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to server</button>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-brand-400" /><h1 className="text-2xl font-bold text-slate-100 tracking-tight">Server Settings</h1></div>
          <p className="text-slate-400 text-sm mt-1">Editing {profile.fileName} for {server.name}</p>
        </div>
        <button onClick={saveSettings} disabled={saving} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Config</button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 flex items-center justify-between gap-4"><p className="text-xs text-slate-400">Direct API: <span className="text-slate-200 font-mono">{message || 'Ready'}</span></p>{lastSaved && <p className="text-xs text-emerald-400 font-mono">saved {lastSaved}</p>}</div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {profile.fields.map(([key, label, helper]) => (
          <label key={key} className="block"><span className="block text-sm font-medium text-slate-300 mb-2">{label}</span><input value={form[key] ?? ''} onChange={event => setForm(prev => ({ ...prev, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /><span className="block text-[11px] text-slate-500 mt-1">{helper}</span></label>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-xs text-amber-300 font-medium">{profile.restartNote}</p></div>
    </div>
  )
}
