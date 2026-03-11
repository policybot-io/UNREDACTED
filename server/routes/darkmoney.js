import { Router } from 'express'
import {
  getDarkMoneyOrgs,
  traceDarkMoneyFlow,
  getCandidateDarkMoneyExposure,
  inferFundingSource,
  getDarkMoneyFlowData,
} from '../services/darkMoney.js'

const router = Router()

// GET /api/darkmoney/orgs
router.get('/orgs', async (req, res) => {
  try {
    const { limit } = req.query
    const data = await getDarkMoneyOrgs(parseInt(limit) || 20)
    res.json({ success: true, data })
  } catch (e) {
    console.error('darkmoney/orgs error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch dark money organizations' })
  }
})

// GET /api/darkmoney/trace/:committeeId
router.get('/trace/:committeeId', async (req, res) => {
  try {
    const data = await traceDarkMoneyFlow(req.params.committeeId)
    res.json({ success: true, data })
  } catch (e) {
    console.error('darkmoney/trace error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to trace dark money flow' })
  }
})

// GET /api/darkmoney/candidate/:id/exposure
router.get('/candidate/:id/exposure', async (req, res) => {
  try {
    const data = await getCandidateDarkMoneyExposure(req.params.id)
    res.json({ success: true, data })
  } catch (e) {
    console.error('darkmoney/candidate/exposure error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to get candidate dark money exposure' })
  }
})

// GET /api/darkmoney/candidate/:id/infer
router.get('/candidate/:id/infer', async (req, res) => {
  try {
    const data = await inferFundingSource(req.params.id)
    res.json({
      success: true,
      data,
      disclaimer: 'Analytical inference — not legal conclusion. Based on public FEC filings and pattern analysis.',
    })
  } catch (e) {
    console.error('darkmoney/candidate/infer error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to infer funding source' })
  }
})

// GET /api/darkmoney/flow?cycle=2024
// Returns Sankey-compatible flow diagram data
router.get('/flow', async (req, res) => {
  try {
    const { cycle } = req.query
    const data = await getDarkMoneyFlowData(cycle ? parseInt(cycle) : null)
    res.json({ success: true, data })
  } catch (e) {
    console.error('darkmoney/flow error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to get dark money flow data' })
  }
})

// GET /api/darkmoney/organizations/index
router.get('/organizations/index', async (req, res) => {
  try {
    const { limit, level } = req.query
    let orgs = await getDarkMoneyOrgs(parseInt(limit) || 50)

    // Filter by disclosure level if requested
    if (level && ['dark', 'partial', 'disclosed'].includes(level)) {
      orgs = orgs.filter(o => o.disclosureLevel === level)
    }

    // Sort by total spend descending
    orgs.sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))

    res.json({
      success: true,
      data: orgs,
      summary: {
        total: orgs.length,
        dark: orgs.filter(o => o.disclosureLevel === 'dark').length,
        partial: orgs.filter(o => o.disclosureLevel === 'partial').length,
        disclosed: orgs.filter(o => o.disclosureLevel === 'disclosed').length,
        totalSpend: orgs.reduce((s, o) => s + (o.totalSpend || 0), 0),
      },
    })
  } catch (e) {
    console.error('darkmoney/organizations/index error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch organizations index' })
  }
})

export default router
