import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Server, Shield, Zap, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'signup'

export default function Login() {
  const { signIn, signUp, session, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/dashboard', { replace: true })
  }, [session, loading, navigate])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setUsername('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode === 'signup') {
      if (!username.trim()) { setError('Username is required'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    }

    setSubmitting(true)
    const err = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password, username.trim())
    setSubmitting(false)

    if (err) setError(err)
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
          {/* Hero */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 mb-5">
              <Server className="w-7 h-7 text-brand-400" />
            </div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">ApexGSP</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Game server management platform
            </p>
          </div>

          {/* Card */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-xl shadow-black/30 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-800">
              {(['signin', 'signup'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'flex-1 py-3.5 text-sm font-semibold transition-colors',
                    mode === m
                      ? 'text-slate-100 border-b-2 border-brand-500 bg-slate-900'
                      : 'text-slate-500 hover:text-slate-300 bg-slate-900/50'
                  )}
                >
                  {m === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {mode === 'signup' && (
                <Field
                  id="username"
                  label="Username"
                  type="text"
                  value={username}
                  onChange={setUsername}
                  placeholder="Your display name"
                  autoComplete="username"
                />
              )}

              <Field
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />

              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />

              {mode === 'signup' && (
                <Field
                  id="confirm-password"
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 mt-2',
                  submitting
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-brand-600 hover:bg-brand-500 text-white hover:shadow-lg hover:shadow-brand-600/20 active:scale-[0.99]'
                )}
              >
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}</>
                ) : (
                  mode === 'signin' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>
          </div>

          {/* Feature pills */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { icon: Shield, label: 'Licence validated' },
              { icon: Zap,    label: 'Instant setup' },
              { icon: Globe,  label: 'Remote nodes' },
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

function Field({
  id, label, type, value, onChange, placeholder, autoComplete,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all"
      />
    </div>
  )
}
