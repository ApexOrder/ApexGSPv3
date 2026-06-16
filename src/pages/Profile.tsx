import { useState } from 'react'
import { User, Copy, Check, Shield, Calendar, Key } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, cn } from '@/lib/utils'

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.032.05a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  )
}

const licenceStatusConfig: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  trial:     { label: 'Trial',     cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  inactive:  { label: 'Inactive',  cls: 'bg-slate-700/50 text-slate-400 border-slate-600/30' },
  suspended: { label: 'Suspended', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

export default function Profile() {
  const { profile, licence, user } = useAuth()
  const [copiedKey, setCopiedKey] = useState(false)

  async function copyLicenceKey() {
    if (!licence?.key) return
    await navigator.clipboard.writeText(licence.key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const licenceCfg = licenceStatusConfig[licence?.status ?? 'inactive']

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Profile</h1>
        <p className="text-slate-400 text-sm mt-1">Your account and licence information</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Account</h2>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-slate-700 border border-slate-600 overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username ?? 'User'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-7 h-7 text-slate-400" />
              </div>
            )}
          </div>
          <div>
            <p className="text-slate-100 text-lg font-bold">{profile?.username ?? 'Unknown'}</p>
            <p className="text-slate-400 text-sm">{user?.email ?? 'No email'}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5 bg-[#5865F2]/10 border border-[#5865F2]/30 rounded-full px-2.5 py-1">
                <DiscordIcon className="w-3 h-3 text-[#5865F2]" />
                <span className="text-xs font-medium text-[#7289DA]">Discord</span>
              </div>
              {profile?.discord_id && <span className="text-xs text-slate-500 font-mono">{profile.discord_id}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-800">
          <ProfileField icon={Calendar} label="Member since" value={formatDate(profile?.created_at)} />
          <ProfileField icon={User} label="User ID" value={user?.id ? user.id.slice(0, 8) + '...' : '—'} mono />
        </div>
      </div>

      {licence && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Licence</h2>
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', licenceCfg.cls)}>
              {licenceCfg.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <ProfileField icon={Shield} label="Licence status" value={licenceCfg.label} />
            <ProfileField icon={Key} label="Max nodes" value={`${licence.max_nodes} nodes`} />
            <ProfileField icon={Calendar} label="Issued" value={formatDate(licence.created_at)} />
            <ProfileField icon={Calendar} label="Expires" value={licence.expires_at ? formatDate(licence.expires_at) : 'Never'} />
          </div>

          <div className="pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-2 font-medium">Licence Key</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-xs font-mono text-slate-400 bg-slate-950/60 rounded-lg px-3 py-2.5 break-all">
                {licence.key}
              </code>
              <button onClick={copyLicenceKey} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0">
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileField({ icon: Icon, label, value, mono = false }: { icon: typeof User; label: string; value: string | undefined; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('text-sm text-slate-200 font-medium mt-0.5', mono && 'font-mono text-xs')}>{value ?? '—'}</p>
      </div>
    </div>
  )
}
