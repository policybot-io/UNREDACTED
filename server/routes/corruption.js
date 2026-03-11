import { Router } from 'express'
import axios from 'axios'
import { scoreCompany, scorePolitician, getLeaderboard, getCorruptionHotspots } from '../services/corruptionScoring.js'
import { findQuidProQuoPaths, findRegulatoryPatterns, getCompanyRiskScore } from '../services/graphService.js'

const router = Router()
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000'

// GET /api/corruption/score/company?name=LockheedMartin
router.get('/score/company', async (req, res) => {
  try {
    const { name } = req.query
    if (!name) return res.status(400).json({ success: false, error: 'name parameter required' })
    const data = await scoreCompany(name)
    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/score/company error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to score company' })
  }
})

// GET /api/corruption/score/politician?candidateId=S1CA00999
router.get('/score/politician', async (req, res) => {
  try {
    const { candidateId } = req.query
    if (!candidateId) return res.status(400).json({ success: false, error: 'candidateId parameter required' })
    const data = await scorePolitician(candidateId)
    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/score/politician error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to score politician' })
  }
})

// GET /api/corruption/leaderboard?chamber=S&party=DEM&limit=50
router.get('/leaderboard', async (req, res) => {
  try {
    const { chamber, party, limit } = req.query
    const data = await getLeaderboard(chamber || null, party || null, parseInt(limit) || 50)
    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/leaderboard error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' })
  }
})

// GET /api/corruption/patterns?agencyName=Defense&lookbackMonths=12
router.get('/patterns', async (req, res) => {
  try {
    const { agencyName, lookbackMonths, minAmount } = req.query
    const data = await findQuidProQuoPaths({
      agencyName: agencyName || '',
      lookbackMonths: parseInt(lookbackMonths) || 12,
      minAmount: parseInt(minAmount) || 100000,
    })
    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/patterns error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch corruption patterns' })
  }
})

// GET /api/corruption/hotspots
router.get('/hotspots', async (req, res) => {
  try {
    const { agencyName } = req.query
    const data = await getCorruptionHotspots(agencyName || '')
    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/hotspots error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch corruption hotspots' })
  }
})

// GET /api/corruption/signals/company/:name
router.get('/signals/company/:name', async (req, res) => {
  try {
    const { name } = req.params
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    const [riskScore, patterns, regulatory] = await Promise.allSettled([
      getCompanyRiskScore(normalizedName),
      findQuidProQuoPaths({ agencyName: '', minAmount: 50000 }),
      findRegulatoryPatterns({ companyName: normalizedName }),
    ])

    const data = {
      riskScore: riskScore.status === 'fulfilled' ? riskScore.value : null,
      quidProQuoPatterns: patterns.status === 'fulfilled'
        ? patterns.value.filter(p => p.company?.toLowerCase().includes(normalizedName))
        : [],
      regulatoryPatterns: regulatory.status === 'fulfilled' ? regulatory.value : [],
    }

    res.json({ success: true, data })
  } catch (e) {
    console.error('corruption/signals error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch company signals' })
  }
})

// POST /api/corruption/analyze — proxy to FastAPI corruption agent
router.post('/analyze', async (req, res) => {
  try {
    const { query } = req.body
    if (!query) return res.status(400).json({ success: false, error: 'query required' })

    const response = await axios.post(`${FASTAPI_URL}/api/agent/corruption`, {
      query,
    }, { timeout: 30000 })

    res.json({ success: true, data: response.data })
  } catch (e) {
    console.error('corruption/analyze error:', e.message)
    // Fallback: return a structured empty response rather than error
    res.json({
      success: false,
      error: e.response?.status === 503 ? 'AI agent service unavailable' : 'Analysis failed',
      fallback: true,
      data: {
        summary: 'AI analysis service is currently unavailable. Please try again later.',
        patterns: [],
        risk_scores: { level: 'UNKNOWN', overall: 0 },
      },
    })
  }
})

export default router
