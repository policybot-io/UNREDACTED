// Federal spending routes.
// Dual read-path: SPENDING_SOURCE=supabase env var OR ?source=supabase per-request
// switches from the live USASpending.gov API to the Supabase bulk-ingest tables.
// Default remains live API until backfill is verified.

import { Router } from 'express'
import { searchContracts as liveContracts, searchGrants as liveGrants, getAgencySpending as liveAgency } from '../services/usaSpending.js'
import * as sbSpending from '../services/supabaseSpending.js'

const router = Router()

const DEFAULT_SOURCE = (process.env.SPENDING_SOURCE || 'usaspending').toLowerCase()
function useSupabase(req) {
  return (req.query.source || DEFAULT_SOURCE).toString().toLowerCase() === 'supabase'
}

// ─── /contracts ───────────────────────────────────────────────────────────────

router.get('/contracts', async (req, res) => {
  try {
    const { keyword, agency, limit, fiscal_year } = req.query
    if (useSupabase(req)) {
      const data = await sbSpending.searchContracts({ keyword, agency, limit: parseInt(limit) || 50, fiscalYear: fiscal_year })
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await liveContracts({ keyword, agency, limit: parseInt(limit) || 10 })
    const fiscalYear = data.length > 0 && data[0].fiscalYear ? data[0].fiscalYear : null
    res.json({ success: true, source: 'usaspending', data, fiscalYear, count: data.length })
  } catch (e) {
    console.error('spending/contracts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch contract data' })
  }
})

// ─── /grants ──────────────────────────────────────────────────────────────────

router.get('/grants', async (req, res) => {
  try {
    const { keyword, limit, fiscal_year } = req.query
    if (useSupabase(req)) {
      const data = await sbSpending.searchGrants({ keyword, limit: parseInt(limit) || 50, fiscalYear: fiscal_year })
      return res.json({ success: true, source: 'supabase', data })
    }
    const data = await liveGrants({ keyword, limit: parseInt(limit) || 10 })
    res.json({ success: true, source: 'usaspending', data })
  } catch (e) {
    console.error('spending/grants error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch grants data' })
  }
})

// ─── /agency ──────────────────────────────────────────────────────────────────

router.get('/agency', async (req, res) => {
  try {
    const { year } = req.query
    if (useSupabase(req)) {
      try {
        const data = await sbSpending.getAgencySpending(year ? parseInt(year) : null)
        return res.json({ success: true, source: 'supabase', data })
      } catch (sbErr) {
        // Supabase spending tables not yet populated — fall through to live API
        console.warn('spending/agency Supabase unavailable, falling back to live API:', sbErr.message)
      }
    }
    const data = await liveAgency(year ? parseInt(year) : null)
    res.json({ success: true, source: 'usaspending', data })
  } catch (e) {
    console.error('spending/agency error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch agency spending data' })
  }
})

// ─── /disbursements (Supabase-only — oppexp, Story A) ─────────────────────────

router.get('/disbursements', async (req, res) => {
  try {
    const { committee_id, cycle, recipient, min_amount, limit, offset } = req.query
    const data = await sbSpending.getDisbursements({
      committeeId:   committee_id,
      cycle:         cycle ? Number(cycle) : undefined,
      recipientName: recipient,
      minAmount:     min_amount ? Number(min_amount) : 0,
      limit:         parseInt(limit)  || 50,
      offset:        parseInt(offset) || 0,
    })
    res.json({ success: true, source: 'supabase', ...data })
  } catch (e) {
    console.error('spending/disbursements error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── /pay-to-play (Supabase-only — Story B) ───────────────────────────────────

router.get('/pay-to-play', async (req, res) => {
  try {
    const { company, limit } = req.query
    if (!company) return res.status(400).json({ success: false, error: 'company parameter required' })
    const data = await sbSpending.getPayToPlayMatches({ company, limit: parseInt(limit) || 20 })
    res.json({ success: true, source: 'supabase', ...data })
  } catch (e) {
    console.error('spending/pay-to-play error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── /independent-expenditures (Supabase-only — Story F) ─────────────────────

router.get('/independent-expenditures', async (req, res) => {
  try {
    const { candidate_id, committee_id, cycle, limit, offset } = req.query
    const data = await sbSpending.getIndependentExpenditures({
      candidateId: candidate_id,
      committeeId: committee_id,
      cycle:       cycle ? Number(cycle) : undefined,
      limit:       parseInt(limit)  || 100,
      offset:      parseInt(offset) || 0,
    })
    res.json({ success: true, source: 'supabase', ...data })
  } catch (e) {
    console.error('spending/independent-expenditures error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ─── /lobbyist-bundles (Supabase-only — Story D) ─────────────────────────────

router.get('/lobbyist-bundles', async (req, res) => {
  try {
    const { candidate_id, committee_id, cycle, limit, offset } = req.query
    const data = await sbSpending.getLobbyistBundles({
      candidateId: candidate_id,
      committeeId: committee_id,
      cycle:       cycle ? Number(cycle) : undefined,
      limit:       parseInt(limit)  || 100,
      offset:      parseInt(offset) || 0,
    })
    res.json({ success: true, source: 'supabase', ...data })
  } catch (e) {
    console.error('spending/lobbyist-bundles error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

export default router
