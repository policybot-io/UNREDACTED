/**
 * Supabase JWT authentication middleware for Express.
 * Verifies Bearer tokens issued by Supabase Auth using the anon key client.
 * Does not block requests if no token provided — use requireAuth for protected routes.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

// Create a base anon client used only for token verification
// (getUser() validates the JWT signature server-side against Supabase's key)
const anonClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

/**
 * verifySupabaseJWT — internal helper.
 * Extracts Bearer token from Authorization header and verifies it with Supabase.
 * Sets req.user = { id, email, role } on success; does nothing on failure.
 */
async function verifySupabaseJWT(req) {
  if (!anonClient) return null

  const authHeader = req.headers['authorization'] || req.headers['Authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token)
    if (error || !user) return null

    return {
      id:    user.id,
      email: user.email,
      role:  user.role || 'authenticated',
    }
  } catch (e) {
    console.error('[auth] JWT verification error:', e.message)
    return null
  }
}

/**
 * optionalAuth middleware.
 * Attempts to verify the JWT. If valid, attaches req.user.
 * Always calls next() — does not block unauthenticated requests.
 */
export async function optionalAuth(req, res, next) {
  try {
    const user = await verifySupabaseJWT(req)
    if (user) req.user = user
  } catch (e) {
    // Non-blocking — silently continue without user
  }
  next()
}

/**
 * requireAuth middleware.
 * Must be placed after optionalAuth, or used standalone (it calls verifySupabaseJWT internally).
 * Returns 401 if no valid JWT is present.
 */
export async function requireAuth(req, res, next) {
  try {
    // If optionalAuth already ran, req.user may already be set
    if (!req.user) {
      const user = await verifySupabaseJWT(req)
      if (user) {
        req.user = user
      } else {
        return res.status(401).json({
          success: false,
          error:   'Authentication required. Please sign in to access this resource.',
        })
      }
    }
    next()
  } catch (e) {
    console.error('[auth] requireAuth error:', e.message)
    res.status(401).json({ success: false, error: 'Authentication failed.' })
  }
}
