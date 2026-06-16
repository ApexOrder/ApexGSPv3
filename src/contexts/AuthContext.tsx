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
  signInWithDiscord: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getAppUrl() {
  return (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
}

const getAuthCallbackUrl = () => `${getAppUrl()}/auth/callback`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [licence, setLicence] = useState<Licence | null>(null)
  const [loading, setLoading] = useState(true)

  async function ensureDiscordProfile(currentUser: User) {
    const identity = currentUser.identities?.find(item => item.provider === 'discord')
    const identityData = identity?.identity_data ?? currentUser.user_metadata ?? {}
    const discordId = identityData.provider_id ?? identityData.sub ?? null
    const username = identityData.full_name ?? identityData.name ?? identityData.user_name ?? identityData.preferred_username ?? currentUser.email ?? null
    const avatarUrl = identityData.avatar_url ?? null

    await supabase
      .from('profiles')
      .upsert({
        id: currentUser.id,
        discord_id: discordId,
        username,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
  }

  async function loadUserData(currentUser: User) {
    await ensureDiscordProfile(currentUser)

    const [{ data: profileData }, { data: licenceData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      supabase.from('licences').select('*').eq('user_id', currentUser.id).maybeSingle(),
    ])

    setProfile(profileData ?? null)
    setLicence(licenceData ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserData(session.user).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        ;(async () => { await loadUserData(session.user) })()
      } else {
        setProfile(null)
        setLicence(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signInWithDiscord(): Promise<string | null> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: getAuthCallbackUrl(),
      },
    })

    return error?.message ?? null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setLicence(null)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, licence, loading, signInWithDiscord, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
