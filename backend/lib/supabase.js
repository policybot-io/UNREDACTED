/**
 * Supabase backend client — uses service role key for full database access.
 * This module is only used server-side; the service role key is never exposed to clients.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase features disabled')
}

export const supabase = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

// ─── CORRUPTION SCORE CACHE ───────────────────────────────────────────────────

/**
 * Check corruption_scores table for a fresh (not expired) cached score.
 * Returns the score data if found and not expired, or null if cache miss.
 */
export async function getCachedCorruptionScore(entityType, entityId) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('corruption_scores')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error) throw error
    return data || null
  } catch (e) {
    console.error('[supabase] getCachedCorruptionScore error:', e.message)
    return null
  }
}

/**
 * Upsert a corruption score into the cache.
 * scoreData should be the full result from scoreCompany() or scorePolitician().
 */
export async function cacheCorruptionScore(entityType, entityId, entityName, scoreData) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('corruption_scores')
      .upsert(
        {
          entity_type:   entityType,
          entity_id:     entityId,
          entity_name:   entityName,
          overall_score: scoreData.overallScore,
          tier:          scoreData.tier || scoreData.riskLevel,
          components:    scoreData.components || null,
          risk_factors:  scoreData.riskFactors || scoreData.components?.riskFactors || null,
          evidence:      scoreData.evidence || null,
          raw_data:      scoreData.rawData || null,
          scored_at:     new Date().toISOString(),
          expires_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'entity_type,entity_id' }
      )
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('[supabase] cacheCorruptionScore error:', e.message)
    return null
  }
}

// ─── API LOGGING ──────────────────────────────────────────────────────────────

/**
 * Log an API request to the api_logs table.
 * Non-blocking — failures are silently swallowed so they never affect responses.
 */
export async function logApiRequest(endpoint, method, statusCode, responseTimeMs, queryParams = null) {
  if (!supabase) return
  try {
    await supabase.from('api_logs').insert({
      endpoint,
      method:          method.toUpperCase(),
      status_code:     statusCode,
      response_time_ms: responseTimeMs,
      query_params:    queryParams,
      timestamp:       new Date().toISOString(),
    })
  } catch (e) {
    // Silently ignore — logging should never break the request
  }
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────

/**
 * Fetch a user's watchlist joined with their most recent (non-expired) corruption scores.
 */
export async function getWatchlist(userId) {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .rpc('get_watchlist_with_scores', { p_user_id: userId })

    if (error) throw error
    return data || []
  } catch (e) {
    console.error('[supabase] getWatchlist error:', e.message)
    return []
  }
}

/**
 * Add an item to a user's watchlist.
 * entityType: 'politician' | 'company'
 */
export async function addToWatchlist(userId, entityType, entityId, entityName, metadata = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('watchlist')
    .insert({
      user_id:     userId,
      entity_type: entityType,
      entity_id:   entityId,
      entity_name: entityName,
      metadata,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Remove an item from a user's watchlist by watchlist row ID.
 */
export async function removeFromWatchlist(userId, watchlistId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', watchlistId)
    .eq('user_id', userId)  // Ensure ownership

  if (error) throw error
  return true
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────

/**
 * Fetch all alert rules for a user, including recent unread events.
 */
export async function getUserAlerts(userId) {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select(`
        *,
        alert_events (
          id, event_type, message, is_read, created_at
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (e) {
    console.error('[supabase] getUserAlerts error:', e.message)
    return []
  }
}

/**
 * Create a new alert rule.
 * alertType: 'score_drop' | 'new_disclosure' | 'new_flag' | 'tier_change'
 */
export async function createAlert(userId, entityType, entityId, entityName, alertType, threshold = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('alerts')
    .insert({
      user_id:     userId,
      entity_type: entityType,
      entity_id:   entityId,
      entity_name: entityName,
      alert_type:  alertType,
      threshold,
      is_active:   true,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete an alert rule (verifies ownership).
 */
export async function deleteAlert(userId, alertId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('alerts')
    .delete()
    .eq('id', alertId)
    .eq('user_id', userId)

  if (error) throw error
  return true
}

/**
 * Mark alert events as read for a user.
 */
export async function markAlertsRead(userId, alertEventIds) {
  if (!supabase) return
  await supabase
    .from('alert_events')
    .update({ is_read: true })
    .in('id', alertEventIds)
    .eq('user_id', userId)
}

// ─── CORRUPTION FLAGS ─────────────────────────────────────────────────────────

/**
 * Get paginated corruption flags, optionally filtered by entityId.
 */
export async function getCorruptionFlags({ entityId, page = 1, pageSize = 20 } = {}) {
  if (!supabase) return { data: [], count: 0 }
  try {
    let query = supabase
      .from('corruption_flags')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (entityId) query = query.eq('entity_id', entityId)

    const { data, error, count } = await query
    if (error) throw error
    return { data: data || [], count: count || 0 }
  } catch (e) {
    console.error('[supabase] getCorruptionFlags error:', e.message)
    return { data: [], count: 0 }
  }
}

/**
 * Submit a new corruption flag.
 */
export async function submitCorruptionFlag(userId, { entityType, entityId, entityName, flagType, description, evidenceUrls = [] }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('corruption_flags')
    .insert({
      submitted_by:  userId,
      entity_type:   entityType,
      entity_id:     entityId,
      entity_name:   entityName,
      flag_type:     flagType,
      description,
      evidence_urls: evidenceUrls,
      status:        'pending',
    })
    .select()
    .single()

  if (error) throw error
  return data
}
