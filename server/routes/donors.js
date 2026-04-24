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
import * as sbDonors from '../services/supabaseDonors.js'
import { classifySector } from '../lib/sectorClassifier.js'

const router = Router()

// Feature flag — flip per-request via ?source=supabase|fec, or globally via env.
// Default to FEC live until Phase 1 backfill lands in Supabase.
const DEFAULT_SOURCE = (process.env.DONOR_SOURCE || 'fec').toLowerCase()
function useSupabase(req) {
  const s = (req.query.source || DEFAULT_SOURCE).toString().toLowerCase()
  return s === 'supabase'
}

router.get('/committees', async (req, res) => {
  try {
    const { keyword, limit, offset, cycle } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.searchCommittees({
        keyword, cycle,
        limit:  parseInt(limit)  || 100,
        offset: parseInt(offset) || 0,
      })
      return res.json({ success: true, source: 'supabase', data })
    }
    if (!keyword) return res.status(400).json({ success: false, error: 'keyword parameter required' })
    const data = await searchCommittees({ keyword, limit: parseInt(limit) || 10 })
    res.json({ success: true, source: 'fec', data })
  } catch (e) {
    console.error('donors/committees error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee data' })
  }
})

router.get('/committees/:id/receipts', async (req, res) => {
  try {
    const { limit, cycle } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.getCommitteeReceipts({
        committeeId: req.params.id,
        limit: parseInt(limit) || 20,
        cycle: cycle ? parseInt(cycle) : undefined,
      })
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await getCommitteeReceipts(req.params.id, parseInt(limit) || 20)
    res.json({ success: true, data })
  } catch (e) {
    console.error('donors/receipts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee receipts' })
  }
})

router.get('/candidates', async (req, res) => {
  try {
    const { name, office, state, party, cycle, limit, offset, sortBy, sortDir } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.searchCandidates({
        name, office, state, party, cycle,
        limit:   parseInt(limit)  || 100,
        offset:  parseInt(offset) || 0,
        sortBy:  sortBy  || 'name',
        sortDir: sortDir || 'asc',
      })
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await searchCandidates({ name, office, state, limit: parseInt(limit) || 10 })
    res.json({ success: true, source: 'fec', data })
  } catch (e) {
    console.error('donors/candidates error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidates' })
  }
})

router.get('/candidates/:id/totals', async (req, res) => {
  try {
    if (useSupabase(req)) {
      const data = await sbDonors.getCandidateRaisedTotals(req.params.id)
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await getCandidateRaisedTotals(req.params.id)
    res.json({ success: true, source: 'fec', data })
  } catch (e) {
    console.error('donors/totals error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidate totals' })
  }
})

// ========== PHASE 2: DONOR INTELLIGENCE ENDPOINTS ==========

router.get('/candidates/:id/contributions', async (req, res) => {
  try {
    const { limit, minAmount, offset } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.getCandidateContributions(
        req.params.id,
        parseInt(limit) || 100,
        parseInt(minAmount) || 1000,
        parseInt(offset) || 0,
      )
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await getCandidateContributions(
      req.params.id,
      parseInt(limit) || 50,
      parseInt(minAmount) || 1000
    )
    res.json({ success: true, source: 'fec', data })
  } catch (e) {
    console.error('donors/candidate/contributions error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch candidate contributions' })
  }
})

router.get('/candidates/:id/top-industries', async (req, res) => {
  try {
    const { cycle, limit } = req.query
    const data = await sbDonors.getCandidateTopIndustries(req.params.id, {
      cycle: cycle ? parseInt(cycle) : undefined,
      limit: parseInt(limit) || 15,
    })
    res.json({ success: true, source: 'supabase', data: { results: data } })
  } catch (e) {
    console.error('donors/candidates/:id/top-industries error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/committees/:id/contributions', async (req, res) => {
  try {
    const { limit, minAmount, offset } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.getCommitteeContributions(
        req.params.id,
        parseInt(limit) || 100,
        parseInt(minAmount) || 1000,
        parseInt(offset) || 0,
      )
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await getCommitteeContributions(
      req.params.id,
      parseInt(limit) || 50,
      parseInt(minAmount) || 1000
    )
    res.json({ success: true, source: 'fec', data })
  } catch (e) {
    console.error('donors/committee/contributions error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch committee contributions' })
  }
})

router.get('/donors/by-employer', async (req, res) => {
  try {
    const { employer, limit, cycle } = req.query
    if (!employer) return res.status(400).json({ success: false, error: 'employer parameter required' })

    if (useSupabase(req)) {
      const data = await sbDonors.getTopDonorsByEmployer(
        employer,
        parseInt(limit) || 20,
        cycle ? parseInt(cycle) : null
      )
      return res.json({ success: true, source: 'supabase', data })
    }
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
    if (useSupabase(req)) {
      const data = await sbDonors.getContributionsByIndustry({
        keywords: industryKeywords,
        limit: parseInt(limit) || 50,
        cycle: cycle ? parseInt(cycle) : undefined,
      })
      return res.json({ success: true, source: 'supabase', data })
    }
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
    if (useSupabase(req)) {
      const data = await sbDonors.getCandidateTotalsComparison({
        candidateIds,
        cycle: cycle ? parseInt(cycle) : undefined,
      })
      return res.json({ success: true, source: 'supabase', data })
    }
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
    const { limit, cycle } = req.query
    if (useSupabase(req)) {
      const data = await sbDonors.getCommitteeSpending({
        committeeId: req.params.id,
        limit: parseInt(limit) || 20,
        cycle: cycle ? parseInt(cycle) : undefined,
      })
      return res.json({ success: true, source: 'supabase', data })
    }
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

// ─── Money-flow (Sankey) — Supabase-only, reads money_flow_edges MV ──────────

router.get('/money-flow', async (req, res) => {
  try {
    const { cycle, sourceTier, targetTier, nodeId, nodeType, minAmount, limit } = req.query
    const data = await sbDonors.getMoneyFlow({
      cycle,
      sourceTier,
      targetTier,
      nodeId,
      nodeType,
      minAmount: parseInt(minAmount) || 0,
      limit: parseInt(limit) || 500,
    })
    res.json({ success: true, source: 'supabase', data })
  } catch (e) {
    console.error('donors/money-flow error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── Story J: Cash Flood Anomalies — Supabase-only ───────────────────────────

router.get('/cash-flood', async (req, res) => {
  try {
    const { cycle, topN } = req.query
    const data = await sbDonors.getCashFloodAlerts({
      cycle: cycle ? Number(cycle) : null,
      topN:  parseInt(topN) || 20,
    })
    res.json({ success: true, source: 'supabase', ...data })
  } catch (e) {
    console.error('donors/cash-flood error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── Employer leaderboard ─────────────────────────────────────────────────────

router.get('/employers', async (req, res) => {
  try {
    const { cycle, minAmount, limit, sector } = req.query
    const requestedLimit = parseInt(limit) || 100
    // Fetch more rows when sector filter is active so post-filter has enough coverage
    const fetchLimit = sector ? Math.max(requestedLimit * 5, 200) : requestedLimit
    const rows = await sbDonors.getTopEmployers({
      cycle,
      minAmount: parseInt(minAmount) || 0,
      limit:     fetchLimit,
    })
    // Apply sector classification, optional sector filter, then re-limit
    let results = rows.map(r => ({ ...r, sector: classifySector(r.employer) }))
    if (sector) results = results.filter(r => r.sector === sector)
    results = results.slice(0, requestedLimit)
    res.json({ success: true, source: 'supabase', data: { results, pagination: { count: results.length, limit: requestedLimit, offset: 0 } } })
  } catch (e) {
    console.error('donors/employers error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/employers/:id/flow', async (req, res) => {
  try {
    const { cycle, limit } = req.query
    const employerId = decodeURIComponent(req.params.id).toLowerCase().trim()
    const data = await sbDonors.getEmployerFlow({
      employerId,
      cycle,
      limit: parseInt(limit) || 50,
    })
    res.json({ success: true, source: 'supabase', data })
  } catch (e) {
    console.error('donors/employers/:id/flow error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── Corporate PAC flow — Supabase-only ──────────────────────────────────────

router.get('/corporate-pacs', async (req, res) => {
  try {
    const { cycle, limit, minAmount } = req.query
    const data = await sbDonors.getCorporatePACs({
      cycle:     cycle     ? parseInt(cycle)     : undefined,
      limit:     parseInt(limit)     || 20,
      minAmount: parseInt(minAmount) || 0,
    })
    res.json({ success: true, source: 'supabase', data })
  } catch (e) {
    console.error('donors/corporate-pacs error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

router.get('/corporate-pacs/:id/recipients', async (req, res) => {
  try {
    const { cycle, limit } = req.query
    const corpId = decodeURIComponent(req.params.id)
    const data = await sbDonors.getCorporatePACRecipients({
      corpId,
      cycle: cycle ? parseInt(cycle) : undefined,
      limit: parseInt(limit) || 15,
    })
    res.json({ success: true, source: 'supabase', data })
  } catch (e) {
    console.error('donors/corporate-pacs/:id/recipients error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

export default router
