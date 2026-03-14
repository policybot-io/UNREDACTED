/**
 * Auth context for the UNREDACTED frontend.
 * Provides auth state and helpers to the entire component tree.
 * Listens to Supabase auth state changes and auto-fetches user profile.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  supabase,
  signIn as sbSignIn,
  signUp as sbSignUp,
  signOut as sbSignOut,
  getUserProfile,
} from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Fetch the user's profile from user_profiles table
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    try {
      const { profile: p } = await getUserProfile(userId)
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }, [])

  // Initialize auth state from existing session
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { data: { session: existing } } = await supabase.auth.getSession()
        if (!mounted) return

        if (existing) {
          setSession(existing)
          setUser(existing.user)
          fetchProfile(existing.user.id)
        }
      } catch (e) {
        console.error('[AuthContext] init error:', e.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()

    // Listen for future auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return

        setSession(newSession)
        setUser(newSession?.user || null)

        if (newSession?.user) {
          fetchProfile(newSession.user.id)
        } else {
          setProfile(null)
        }

        if (event === 'SIGNED_OUT') {
          setError(null)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  // ─── Auth actions ────────────────────────────────────────────────────────────

  const signIn = useCallback(async (email, password) => {
    setError(null)
    setLoading(true)
    try {
      const { user: u, session: s, error: e } = await sbSignIn(email, password)
      if (e) {
        setError(e.message)
        return { success: false, error: e.message }
      }
      setUser(u)
      setSession(s)
      await fetchProfile(u?.id)
      return { success: true }
    } catch (e) {
      const msg = e.message || 'Sign in failed'
      setError(msg)
      return { success: false, error: msg }
    } finally {
      setLoading(false)
    }
  }, [fetchProfile])

  const signUp = useCallback(async (email, password, displayName) => {
    setError(null)
    setLoading(true)
    try {
      const { user: u, session: s, error: e } = await sbSignUp(email, password, displayName)
      if (e) {
        setError(e.message)
        return { success: false, error: e.message }
      }
      // If email confirmation is required, u exists but s is null
      if (u && s) {
        setUser(u)
        setSession(s)
        await fetchProfile(u.id)
      }
      return {
        success:            true,
        needsConfirmation:  u && !s,
      }
    } catch (e) {
      const msg = e.message || 'Sign up failed'
      setError(msg)
      return { success: false, error: msg }
    } finally {
      setLoading(false)
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    setLoading(true)
    try {
      await sbSignOut()
      setUser(null)
      setSession(null)
      setProfile(null)
      setError(null)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = {
    user,
    session,
    profile,
    loading,
    error,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    clearError,
    refreshProfile: () => fetchProfile(user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * useAuth — hook to consume the auth context.
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export default AuthContext
