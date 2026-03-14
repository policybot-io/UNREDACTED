/**
 * Community corruption flags API routes.
 * Anyone can read flags; authenticated users can submit them.
 */
import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import {
  getCorruptionFlags,
  submitCorruptionFlag,
  supabase,
} from '../lib/supabase.js'

const router = Router()

const VALID_FLAG_TYPES = ['quid_pro_quo', 'revolving_door', 'dark_money', 'stock_act', 'other']
const VALID_ENTITY_TYPES = ['politician', 'company']

/**
 * GET /api/flags
 * Get all corruption flags (public, paginated).
 * Query params: page, pageSize, flagType, status
 */
router.get('/', optionalAuth, async (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page || '1'))
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20')))

  try {
    const { data, count } = await getCorruptionFlags({ page, pageSize })
    res.json({
      success:    true,
      data,
      pagination: { page, pageSize, total: count, pages: Math.ceil(count / pageSize) },
    })
  } catch (e) {
    console.error('[flags] GET / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch flags.' })
  }
})

/**
 * POST /api/flags
 * Submit a new community corruption flag (authenticated users only).
 * Body: { entityType, entityId, entityName, flagType, description, evidenceUrls? }
 */
router.post('/', requireAuth, async (req, res) => {
  const { entityType, entityId, entityName, flagType, description, evidenceUrls } = req.body

  if (!entityType || !entityId || !flagType || !description) {
    return res.status(400).json({
      success: false,
      error:   'entityType, entityId, flagType, and description are required.',
    })
  }

  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({
      success: false,
      error:   `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}.`,
    })
  }

  if (!VALID_FLAG_TYPES.includes(flagType)) {
    return res.status(400).json({
      success: false,
      error:   `flagType must be one of: ${VALID_FLAG_TYPES.join(', ')}.`,
    })
  }

  if (description.length < 20 || description.length > 2000) {
    return res.status(400).json({
      success: false,
      error:   'description must be between 20 and 2000 characters.',
    })
  }

  try {
    const flag = await submitCorruptionFlag(req.user.id, {
      entityType,
      entityId,
      entityName: entityName || entityId,
      flagType,
      description: description.trim(),
      evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 5) : [],
    })
    res.status(201).json({ success: true, data: flag })
  } catch (e) {
    console.error('[flags] POST / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to submit flag.' })
  }
})

/**
 * GET /api/flags/:entityId
 * Get all flags for a specific entity (public).
 * Query params: page, pageSize
 */
router.get('/:entityId', optionalAuth, async (req, res) => {
  const { entityId } = req.params
  const page     = Math.max(1, parseInt(req.query.page || '1'))
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '20')))

  try {
    const { data, count } = await getCorruptionFlags({ entityId, page, pageSize })
    res.json({
      success:    true,
      entityId,
      data,
      pagination: { page, pageSize, total: count, pages: Math.ceil(count / pageSize) },
    })
  } catch (e) {
    console.error('[flags] GET /:entityId error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch flags for entity.' })
  }
})

/**
 * POST /api/flags/:id/upvote
 * Upvote a flag (authenticated users only).
 */
router.post('/:id/upvote', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ success: false, error: 'Supabase not configured.' })

  try {
    const { data, error } = await supabase.rpc('increment_flag_upvotes', {
      flag_id: req.params.id,
    })

    // Fallback: direct update if RPC not available
    if (error) {
      const { data: flag, error: fetchErr } = await supabase
        .from('corruption_flags')
        .select('upvotes')
        .eq('id', req.params.id)
        .single()

      if (fetchErr) throw fetchErr

      const { data: updated, error: updateErr } = await supabase
        .from('corruption_flags')
        .update({ upvotes: (flag.upvotes || 0) + 1 })
        .eq('id', req.params.id)
        .select()
        .single()

      if (updateErr) throw updateErr
      return res.json({ success: true, data: updated })
    }

    res.json({ success: true, data })
  } catch (e) {
    console.error('[flags] POST /:id/upvote error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to upvote flag.' })
  }
})

export default router
