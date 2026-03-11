import { Router } from 'express'
import { orchestrate } from '../agents/orchestrator.js'

const router = Router()

router.post('/query', async (req, res) => {
  try {
    const { query } = req.body
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query string required' })
    }
    if (query.trim().length > 500) {
      return res.status(400).json({ success: false, error: 'query too long (max 500 chars)' })
    }
    const result = await orchestrate(query.trim())
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('agent/query error:', e.message)
    res.status(500).json({ success: false, error: e.message || 'Agent query failed. Please try again.' })
  }
})

export default router
