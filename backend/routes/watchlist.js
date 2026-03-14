/**
 * Watchlist API routes.
 * Allows authenticated users to save and track politicians and companies.
 */
import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from '../lib/supabase.js'
import { supabase } from '../lib/supabase.js'

const router = Router()

/**
 * GET /api/watchlist
 * Get the authenticated user's full watchlist with latest corruption scores.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await getWatchlist(req.user.id)
    res.json({
      success: true,
      data:    items,
      count:   items.length,
    })
  } catch (e) {
    console.error('[watchlist] GET / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch watchlist.' })
  }
})

/**
 * POST /api/watchlist
 * Add an entity to the authenticated user's watchlist.
 * Body: { entityType, entityId, entityName, metadata? }
 */
router.post('/', requireAuth, async (req, res) => {
  const { entityType, entityId, entityName, metadata } = req.body

  if (!entityType || !entityId || !entityName) {
    return res.status(400).json({
      success: false,
      error:   'entityType, entityId, and entityName are required.',
    })
  }

  if (!['politician', 'company'].includes(entityType)) {
    return res.status(400).json({
      success: false,
      error:   'entityType must be "politician" or "company".',
    })
  }

  try {
    const item = await addToWatchlist(
      req.user.id,
      entityType,
      entityId,
      entityName,
      metadata || {}
    )
    res.status(201).json({ success: true, data: item })
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ success: false, error: 'This entity is already in your watchlist.' })
    }
    console.error('[watchlist] POST / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to add to watchlist.' })
  }
})

/**
 * DELETE /api/watchlist/:id
 * Remove an item from the authenticated user's watchlist.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ success: false, error: 'Watchlist item ID is required.' })
  }

  try {
    await removeFromWatchlist(req.user.id, id)
    res.json({ success: true, message: 'Removed from watchlist.' })
  } catch (e) {
    console.error('[watchlist] DELETE /:id error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to remove from watchlist.' })
  }
})

/**
 * GET /api/watchlist/public/:userId
 * Get public watchlist items for a specific user (no auth required).
 * Only returns items where is_public = true.
 */
router.get('/public/:userId', optionalAuth, async (req, res) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ success: false, error: 'User ID is required.' })
  }

  try {
    if (!supabase) {
      return res.json({ success: true, data: [], count: 0 })
    }

    const { data, error } = await supabase
      .from('watchlist')
      .select('id, entity_type, entity_id, entity_name, created_at')
      .eq('user_id', userId)
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({
      success: true,
      data:    data || [],
      count:   data?.length || 0,
    })
  } catch (e) {
    console.error('[watchlist] GET /public/:userId error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch public watchlist.' })
  }
})

export default router
