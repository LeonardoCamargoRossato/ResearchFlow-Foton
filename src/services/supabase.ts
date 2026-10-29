import { createClient, type Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null

export const PENDING_INVITE_KEY = 'researchflow.pendingInviteToken'

export const authService = {
  async getSession(): Promise<Session | null> {
    if (!supabase) return null
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },

  async signInWithGoogle(inviteToken?: string): Promise<void> {
    if (!supabase) throw new Error('Supabase ainda não foi configurado neste deploy.')
    if (inviteToken) window.sessionStorage.setItem(PENDING_INVITE_KEY, inviteToken)
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    })
    if (error) throw error
  },

  getPendingInviteToken(): string | null {
    return window.sessionStorage.getItem(PENDING_INVITE_KEY)
  },

  clearPendingInviteToken(): void {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY)
  },

  async signOut(): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }
}
