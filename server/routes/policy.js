import { Router } from 'express'
import { searchRules, getRecentSignificantRules } from '../services/federalRegister.js'

const router = Router()

router.get('/rules', async (req, res) => {
  try {
    const { keyword, agency, dateFrom, limit } = req.query
    const data = await searchRules({ keyword, agency, dateFrom, limit: parseInt(limit) || 10 })
    res.json({ success: true, data })
  } catch (e) {
    console.error('policy/rules error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch policy rules' })
  }
})

router.get('/significant', async (req, res) => {
  try {
    const { limit } = req.query
    const data = await getRecentSignificantRules(parseInt(limit) || 20)
    res.json({ success: true, data })
  } catch (e) {
    console.error('policy/significant error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch significant rules' })
  }
})

export default router
