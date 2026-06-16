import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Server, Copy, Check, Terminal, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface CreatedNode { id: string; name: string; registration_token: string }

function generateToken(prefix: string) {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${value}`
}

export default function AddNode() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdNode, setCreatedNode] = useState<CreatedNode | null>(null)
  const [copied, setCopied] = useState(false)

  const panelUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    setError(null)

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setSubmitting(false)
      setError(userError?.message ?? 'You must be signed in to create a node')
      return
    }

    const { data, error: insertError } = await supabase
      .from('nodes')
      .insert({
        user_id: user.id,
        name: name.trim(),
        status: 'pending',
        registration_token: generateToken('agsp_reg'),
        node_secret: generateToken('agsp_node'),
        token_used: false,
      })
      .select('id, name, registration_token')
      .single()

    setSubmitting(false)

    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to create node')
      return
    }

    setCreatedNode(data)
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const installCmd = createdNode
    ? `curl -fsSL ${panelUrl}/install/linux.sh | sudo bash -s -- --panel-url ${panelUrl} --token ${createdNode.registration_token}`
    : ''

  if (createdNode) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/nodes')} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Node Created</h1>
            <p className="text-slate-400 text-sm mt-0.5">Run the install command on your VPS</p>
          </div>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-emerald-300 font-semibold text-sm">Node \"{createdNode.name}\" created</p>
            <p className="text-emerald-400/70 text-xs mt-1">Run the install command below on your VPS to register this node.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-200">Install Command</span>
            </div>
            <button
              onClick={() => copyToClipboard(installCmd)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {copied ? <><Check className="w-3 h-3 text-emerald-400" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
            </button>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-brand-300 leading-relaxed overflow-x-auto bg-slate-950/50">
            {installCmd}
          </pre>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Registration Token</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-xs font-mono text-slate-300 bg-slate-950/60 rounded-lg px-3 py-2.5 break-all">
              {createdNode.registration_token}
            </code>
            <button onClick={() => copyToClipboard(createdNode.registration_token)} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-start gap-3 mb-6">
          <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p>The token can only be used once. Once the daemon registers, the node will appear as <span className="text-emerald-400 font-medium">online</span>.</p>
            <p>Heartbeats are sent every 30 seconds. If no heartbeat is received for 2 minutes, the node is marked <span className="text-red-400 font-medium">offline</span>.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => navigate('/nodes')} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors">
            Back to Nodes
          </button>
          <button onClick={() => { setCreatedNode(null); setName('') }} className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors">
            Add Another Node
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/nodes')} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Add Node</h1>
          <p className="text-slate-400 text-sm mt-0.5">Register a new VPS to host game servers</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <Server className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="text-slate-200 font-semibold text-sm">New Node</p>
            <p className="text-slate-500 text-xs">You'll get an install command after creating</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="node-name">Node Name</label>
            <input
              id="node-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. UK-Node-01, Germany-VPS"
              required
              maxLength={64}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all"
            />
            <p className="text-xs text-slate-600 mt-1.5">A descriptive name to identify this node</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-150',
              submitting || !name.trim()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-brand-600 hover:bg-brand-500 text-white hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.99]'
            )}
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</>
            ) : (
              'Create Node & Get Install Command'
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">How it works</p>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Create a node here to get a registration token' },
            { step: '2', text: 'Run the install command on your VPS as root' },
            { step: '3', text: 'The daemon installs and registers automatically' },
            { step: '4', text: 'Node appears online and starts sending heartbeats' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-brand-600/30 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-brand-400 text-xs font-bold">{step}</span>
              </div>
              <p className="text-slate-400 text-sm">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
