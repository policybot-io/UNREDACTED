import { Router } from 'express'
import {
  searchCommittees,
  getCommitteeReceipts,
  searchCandidates,
  getCandidateRaisedTotals,
  getCandidateContributions,
  getCommitteeContributions,
  getTopDonorsByEmployer,
  getDonorNetwork,
  getIndustryContributions,
  getCandidateComparison,
  getPACSpending
} from '../services/fec.js'

const router = Router()

router.get('/committees', async (req, res) => {
  try {
    const { keyword, limit } = req.query
    if (!keyword) return res.status(400).json({ success: false, error: 'keyword parameter required' })
    const data = await searchCommittees({ keyword, limit: parseInt(limit) || 10 })
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/committees error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee data' })
  }
})

router.get('/committees/:id/receipts', async (req, res) => {
  try {
    const { limit } = req.query
    const data = await getCommitteeReceipts(req.params.id, parseInt(limit) || 20)
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/receipts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee receipts' })
  }
})

router.get('/candidates', async (req, res) => {
  try {
    const { name, office, state, limit } = req.query
    const data = await searchCandidates({ name, office, state, limit: parseInt(limit) || 10 })
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/candidates error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidates' })
  }
})

router.get('/candidates/:id/totals', async (req, res) => {
  try {
    const data = await getCandidateRaisedTotals(req.params.id)
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/totals error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidate totals' })
  }
})

// ========== PHASE 2: DONOR INTELLIGENCE ENDPOINTS ==========

router.get('/candidates/:id/contributions', async (req, res) => {
  try {
    const { limit, minAmount } = req.query
    const data = await getCandidateContributions(
      req.params.id,
      parseInt(limit) || 50,
      parseInt(minAmount) || 1000
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/candidate/contributions error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidate contributions' })
  }
})

router.get('/committees/:id/contributions', async (req, res) => {
  try {
    const { limit, minAmount } = req.query
    const data = await getCommitteeContributions(
      req.params.id,
      parseInt(limit) || 50,
      parseInt(minAmount) || 1000
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/committee/contributions error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee contributions' })
  }
})

router.get('/donors/by-employer', async (req, res) => {
  try {
    const { employer, limit, cycle } = req.query
    if (!employer) return res.status(400).json({ success: false, error: 'employer parameter required' })

    const data = await getTopDonorsByEmployer(
      employer,
      parseInt(limit) || 20,
      cycle ? parseInt(cycle) : null
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/by-employer error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch donors by employer' })
  }
})

router.get('/donors/:name/network', async (req, res) => {
  try {
    const { limit } = req.query
    const data = await getDonorNetwork(
      req.params.name,
      parseInt(limit) || 30
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/network error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch donor network' })
  }
})

router.get('/contributions/by-industry', async (req, res) => {
  try {
    const { keywords, limit, cycle } = req.query
    if (!keywords) return res.status(400).json({ success: false, error: 'keywords parameter required' })

    const industryKeywords = keywords.split(',').map(k => k.trim())
    const data = await getIndustryContributions(
      industryKeywords,
      parseInt(limit) || 50,
      cycle ? parseInt(cycle) : null
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/by-industry error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch contributions by industry' })
  }
})

router.get('/candidates/compare', async (req, res) => {
  try {
    const { ids, cycle } = req.query
    if (!ids) return res.status(400).json({ success: false, error: 'ids parameter required' })

    const candidateIds = ids.split(',').map(id => id.trim())
    const data = await getCandidateComparison(
      candidateIds,
      cycle ? parseInt(cycle) : null
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/candidates/compare error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to compare candidates' })
  }
})

router.get('/committees/:id/spending', async (req, res) => {
  try {
    const { limit } = req.query
    const data = await getPACSpending(
      req.params.id,
      parseInt(limit) || 20
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/committee/spending error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch PAC spending' })
  }
})

export default router
