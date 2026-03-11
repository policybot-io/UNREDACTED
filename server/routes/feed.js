import { Router } from 'express'
import { getSpendingNews } from '../services/rssFeed.js'

const router = Router()

// GET /api/feed/spending-news?limit=12
router.get('/spending-news', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 30)
    const result = await getSpendingNews({ limit })
    res.json({ success: true, ...result })
  } catch (e) {
    console.error('feed/spending-news error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch spending news feed' })
  }
})

export default router
