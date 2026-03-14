/**
 * Alert management API routes.
 * Allows authenticated users to create and manage alert rules for entities they track.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getUserAlerts,
  createAlert,
  deleteAlert,
  supabase,
} from '../lib/supabase.js'
import { getCachedCorruptionScore } from '../lib/supabase.js'

const router = Router()

const VALID_ALERT_TYPES = ['score_drop', 'new_disclosure', 'new_flag', 'tier_change']
const VALID_ENTITY_TYPES = ['politician', 'company']

/**
 * GET /api/alerts
 * Get all active alert rules for the authenticated user.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const alerts = await getUserAlerts(req.user.id)
    res.json({
      success: true,
      data:    alerts,
      count:   alerts.length,
    })
  } catch (e) {
    console.error('[alerts] GET / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch alerts.' })
  }
})

/**
 * POST /api/alerts
 * Create a new alert rule.
 * Body: { entityType, entityId, entityName, alertType, threshold? }
 */
router.post('/', requireAuth, async (req, res) => {
  const { entityType, entityId, entityName, alertType, threshold } = req.body

  if (!entityType || !entityId || !alertType) {
    return res.status(400).json({
      success: false,
      error:   'entityType, entityId, and alertType are required.',
    })
  }

  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({
      success: false,
      error:   `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}.`,
    })
  }

  if (!VALID_ALERT_TYPES.includes(alertType)) {
    return res.status(400).json({
      success: false,
      error:   `alertType must be one of: ${VALID_ALERT_TYPES.join(', ')}.`,
    })
  }

  try {
    const alert = await createAlert(
      req.user.id,
      entityType,
      entityId,
      entityName || entityId,
      alertType,
      threshold || {}
    )
    res.status(201).json({ success: true, data: alert })
  } catch (e) {
    console.error('[alerts] POST / error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to create alert.' })
  }
})

/**
 * DELETE /api/alerts/:id
 * Delete an alert rule (ownership verified).
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  try {
    await deleteAlert(req.user.id, id)
    res.json({ success: true, message: 'Alert deleted.' })
  } catch (e) {
    console.error('[alerts] DELETE /:id error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to delete alert.' })
  }
})

/**
 * POST /api/alerts/check
 * Manually trigger alert check for all active alerts.
 * Intended for cron job or service role — checks current scores vs thresholds.
 * Protected by a simple service token header to prevent abuse.
 */
router.post('/check', async (req, res) => {
  const serviceToken = req.headers['x-service-token']
  const expectedToken = process.env.SERVICE_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16)

  if (!serviceToken || serviceToken !== expectedToken) {
    return res.status(403).json({ success: false, error: 'Forbidden.' })
  }

  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Supabase not configured.' })
  }

  try {
    // Fetch all active alerts
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('is_active', true)

    if (error) throw error

    let eventsCreated = 0

    for (const alert of alerts || []) {
      try {
        if (alert.alert_type === 'score_drop') {
          const cached = await getCachedCorruptionScore(alert.entity_type, alert.entity_id)
          if (!cached) continue

          const threshold = alert.threshold?.score_below || 50
          if (cached.overall_score < threshold) {
            // Create an alert event
            await supabase.from('alert_events').insert({
              alert_id:   alert.id,
              user_id:    alert.user_id,
              entity_id:  alert.entity_id,
              event_type: 'score_drop',
              event_data: {
                current_score: cached.overall_score,
                threshold,
                tier: cached.tier,
              },
              message: `Score alert: ${alert.entity_name || alert.entity_id} scored ${cached.overall_score} (below threshold of ${threshold})`,
              is_read:    false,
            })
            eventsCreated++
          }
        }

        // Update last_checked
        await supabase
          .from('alerts')
          .update({ last_checked: new Date().toISOString() })
          .eq('id', alert.id)
      } catch (alertErr) {
        console.error('[alerts] check error for alert', alert.id, alertErr.message)
      }
    }

    res.json({
      success:       true,
      alertsChecked: alerts?.length || 0,
      eventsCreated,
    })
  } catch (e) {
    console.error('[alerts] POST /check error:', e.message)
    res.status(500).json({ success: false, error: 'Alert check failed.' })
  }
})

/**
 * PATCH /api/alerts/:id/read
 * Mark alert events as read for a specific alert.
 */
router.patch('/:id/read', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ success: false, error: 'Supabase not configured.' })

  try {
    const { error } = await supabase
      .from('alert_events')
      .update({ is_read: true })
      .eq('alert_id', req.params.id)
      .eq('user_id', req.user.id)

    if (error) throw error
    res.json({ success: true })
  } catch (e) {
    console.error('[alerts] PATCH /:id/read error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to mark alerts as read.' })
  }
})

export default router
