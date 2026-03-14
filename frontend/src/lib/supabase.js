/**
 * Supabase frontend client.
 * Uses the public anon key — safe to expose in client-side code.
 * Row Level Security enforces data access control at the database layer.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: true,
  },
})

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 * Returns { user, session, error }.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { user: data?.user || null, session: data?.session || null, error }
}

/**
 * Sign up a new user.
 * Returns { user, session, error }.
 * If email confirmation is required, session will be null until confirmed.
 */
export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split('@')[0] },
    },
  })
  return { user: data?.user || null, session: data?.session || null, error }
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get the current session. Returns null if not authenticated.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

/**
 * Get the current user (from session cache, no network call).
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Fetch the user profile from the user_profiles table.
 */
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { profile: data || null, error }
}

/**
 * Update the user profile.
 */
export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  return { profile: data || null, error }
}

// ─── REAL-TIME HELPERS ────────────────────────────────────────────────────────

/**
 * Subscribe to real-time corruption score updates for a specific entity.
 * callback(payload) is called with { old, new, eventType } on any change.
 * Returns the subscription channel (call channel.unsubscribe() to clean up).
 */
export function subscribeToCorruptionScores(entityId, callback) {
  const channel = supabase
    .channel(`corruption_scores:${entityId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'corruption_scores',
        filter: `entity_id=eq.${entityId}`,
      },
      (payload) => callback(payload)
    )
    .subscribe()

  return channel
}

/**
 * Subscribe to real-time alert events for the current user.
 * callback(payload) is called when new alert events are inserted.
 * Returns the subscription channel (call channel.unsubscribe() to clean up).
 */
export function subscribeToAlerts(userId, callback) {
  const channel = supabase
    .channel(`alert_events:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'alert_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => callback(payload)
    )
    .subscribe()

  return channel
}

/**
 * Subscribe to watchlist changes for the current user.
 * callback(payload) is called on INSERT/DELETE.
 */
export function subscribeToWatchlist(userId, callback) {
  const channel = supabase
    .channel(`watchlist:${userId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'watchlist',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => callback(payload)
    )
    .subscribe()

  return channel
}
