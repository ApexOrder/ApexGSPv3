import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Server, Shield, Zap, Globe, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Login() {
  const { signInWithDiscord, session, loading } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading, navigate])

  async function handleDiscordLogin() {
    setError(null)
    setSubmitting(true)

    const err = await signInWithDiscord()

    if (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Server className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-100 tracking-tight">ApexGSP</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-5">
              <Server className="w-7 h-7 text-brand-400" />
            </div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">ApexGSP</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Sign in with Discord to manage your licensed game server nodes.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-xl shadow-black/30 overflow-hidden">
            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                    <Gamepad2 className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">Discord account required</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Your licence and linked daemon nodes are attached to your Discord account.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleDiscordLogin}
                disabled={submitting}
                className={cn(
                  'w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all duration-150',
                  submitting
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-[#5865F2] hover:bg-[#4752C4] text-white hover:shadow-lg hover:shadow-[#5865F2]/20 active:scale-[0.99]'
                )}
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting to Discord...
                  </>
                ) : (
                  'Continue with Discord'
                )}
              </button>

              <p className="text-center text-xs text-slate-500 leading-relaxed">
                No email signup. No password account. Access is verified through Discord and your ApexGSP licence.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { icon: Shield, label: 'Licence validated' },
              { icon: Zap,    label: 'Instant setup' },
              { icon: Globe,  label: 'Linked nodes' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-center">
                <Icon className="w-4 h-4 text-brand-400 mx-auto mb-1.5" />
                <span className="text-slate-400 text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center">
        <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} ApexGSP. All rights reserved.</p>
      </footer>
    </div>
  )
}
