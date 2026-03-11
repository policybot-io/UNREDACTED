import { Router } from 'express'
import axios from 'axios'
import { scoreCompany } from '../services/corruptionScoring.js'
import { getCompanyNetwork, getTopContractorsByAgency, findRegulatoryPatterns, findQuidProQuoPaths } from '../services/graphService.js'
import { searchCommittees } from '../services/fec.js'

const router = Router()
const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2'

// GET /api/companies/search?q=lockheed&limit=20
router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query
    if (!q) return res.status(400).json({ success: false, error: 'q parameter required' })

    const res2 = await axios.post(`${USA_SPENDING_BASE}/autocomplete/recipient/`, {
      search_text: q,
      limit: parseInt(limit) || 20,
    }, { timeout: 10000 })

    const data = res2.data?.results || []
    res.json({ success: true, data })
  } catch (e) {
    console.error('companies/search error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to search companies' })
  }
})

// GET /api/companies/:name/profile — full company profile
router.get('/:name/profile', async (req, res) => {
  try {
    const { name } = req.params
    const normalizedName = decodeURIComponent(name).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    const [riskScore, network] = await Promise.allSettled([
      scoreCompany(decodeURIComponent(name)),
      getCompanyNetwork(normalizedName, 2),
    ])

    // Fetch contracts from USASpending
    let contracts = []
    try {
      const contractRes = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
        filters: {
          award_type_codes: ['A', 'B', 'C', 'D'],
          recipient_search_text: [decodeURIComponent(name)],
          time_period: [{ start_date: '2022-01-01', end_date: '2025-12-31' }],
        },
        fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Award Date', 'Description'],
        limit: 10,
        sort: 'Award Amount',
        order: 'desc',
      }, { timeout: 10000 })
      contracts = contractRes.data?.results || []
    } catch (e) {
      console.warn('USASpending contracts fetch failed:', e.message)
    }

    const data = {
      name: decodeURIComponent(name),
      normalizedName,
      riskScore: riskScore.status === 'fulfilled' ? riskScore.value : null,
      network: network.status === 'fulfilled' ? network.value : [],
      contracts,
    }

    res.json({ success: true, data })
  } catch (e) {
    console.error('companies/profile error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch company profile' })
  }
})

// GET /api/companies/:name/political-footprint
router.get('/:name/political-footprint', async (req, res) => {
  try {
    const { name } = req.params
    const companyName = decodeURIComponent(name)

    const [committees] = await Promise.allSettled([
      searchCommittees({ keyword: companyName, limit: 10 }),
    ])

    const pacs = committees.status === 'fulfilled' ? committees.value : []

    // Build political footprint
    const data = {
      companyName,
      pacs: pacs.map(p => ({
        id: p.committee_id,
        name: p.name,
        totalRaised: p.receipts || 0,
        totalSpent: p.disbursements || 0,
        type: p.committee_type,
      })),
      totalDonations: pacs.reduce((s, p) => s + (p.receipts || 0), 0),
      pacCount: pacs.length,
      note: 'PAC data sourced from FEC public records',
    }

    res.json({ success: true, data })
  } catch (e) {
    console.error('companies/political-footprint error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch political footprint' })
  }
})

// GET /api/companies/:name/contracts
router.get('/:name/contracts', async (req, res) => {
  try {
    const { name } = req.params
    const { limit, startDate, endDate } = req.query
    const companyName = decodeURIComponent(name)

    const contractRes = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        recipient_search_text: [companyName],
        time_period: [{
          start_date: startDate || '2020-01-01',
          end_date: endDate || '2025-12-31',
        }],
      },
      fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Award Date', 'Description', 'Place of Performance State'],
      limit: parseInt(limit) || 20,
      sort: 'Award Amount',
      order: 'desc',
    }, { timeout: 10000 })

    const data = contractRes.data?.results || []
    res.json({ success: true, data })
  } catch (e) {
    console.error('companies/contracts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch contracts' })
  }
})

// GET /api/companies/:name/regulatory
router.get('/:name/regulatory', async (req, res) => {
  try {
    const { name } = req.params
    const normalizedName = decodeURIComponent(name).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    const patterns = await findRegulatoryPatterns({ companyName: normalizedName, lookbackMonths: 24 })
    res.json({ success: true, data: patterns })
  } catch (e) {
    console.error('companies/regulatory error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch regulatory interactions' })
  }
})

// GET /api/companies/:name/revolving-door
router.get('/:name/revolving-door', async (req, res) => {
  try {
    const { name } = req.params
    const companyName = decodeURIComponent(name)

    // Search FEC for employees that came from government (employer field matching government agencies)
    const res2 = await axios.get('https://api.open.fec.gov/v1/schedules/schedule_a/', {
      params: {
        contributor_employer: companyName,
        api_key: process.env.FEC_API_KEY || 'DEMO_KEY',
        per_page: 20,
        is_individual: true,
        sort: '-contribution_receipt_amount',
      },
      timeout: 10000,
    })

    const contributors = res2.data?.results || []

    // Flag contributors with government-sounding occupations
    const govTitles = ['secretary', 'director', 'commissioner', 'deputy', 'administrator', 'general', 'official', 'inspector']
    const revolvingDoor = contributors.filter(c => {
      const occ = (c.contributor_occupation || '').toLowerCase()
      return govTitles.some(t => occ.includes(t))
    }).map(c => ({
      name: c.contributor_name,
      occupation: c.contributor_occupation,
      employer: c.contributor_employer,
      donationAmount: c.contribution_receipt_amount,
      donationDate: c.contribution_receipt_date,
      flag: 'Former government role',
    }))

    res.json({ success: true, data: revolvingDoor })
  } catch (e) {
    console.error('companies/revolving-door error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch revolving door data' })
  }
})

// GET /api/companies/:name/conflicts
router.get('/:name/conflicts', async (req, res) => {
  try {
    const { name } = req.params
    const normalizedName = decodeURIComponent(name).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    const [qpq, riskScore] = await Promise.allSettled([
      findQuidProQuoPaths({ agencyName: '', minAmount: 50000 }),
      scoreCompany(decodeURIComponent(name)),
    ])

    const patterns = qpq.status === 'fulfilled'
      ? qpq.value.filter(p => p.company?.toLowerCase().includes(normalizedName))
      : []

    const data = {
      companyName: decodeURIComponent(name),
      overallRisk: riskScore.status === 'fulfilled' ? riskScore.value : null,
      conflicts: patterns.map(p => ({
        type: 'quid_pro_quo',
        company: p.company,
        politician: p.politician,
        agency: p.agency,
        contractAmount: p.totalAmount,
        contractCount: p.contractCount,
        donorLink: p.donorLink,
        severity: p.donorLink ? 'HIGH' : 'MEDIUM',
      })),
    }

    res.json({ success: true, data })
  } catch (e) {
    console.error('companies/conflicts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch conflict signals' })
  }
})

export default router
