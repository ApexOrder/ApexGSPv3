import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Licence } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  licence: Licence | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, username: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [licence, setLicence] = useState<Licence | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadUserData(userId: string) {
    const [{ data: profileData }, { data: licenceData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('licences').select('*').eq('user_id', userId).maybeSingle(),
    ])
    setProfile(profileData ?? null)
    setLicence(licenceData ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        ;(async () => { await loadUserData(session.user.id) })()
      } else {
        setProfile(null)
        setLicence(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  async function signUp(email: string, password: string, username: string): Promise<string | null> {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-signup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, password, username }),
      }
    )

    const data = await res.json() as { success?: boolean; error?: string }
    if (!res.ok || data.error) return data.error ?? 'Sign up failed'

    // Auto sign in after successful registration
    return signIn(email, password)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setLicence(null)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, licence, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
