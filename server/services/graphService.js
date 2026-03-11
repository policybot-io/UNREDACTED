/**
 * Graph service — replaces Neo4j (graphQueries.js).
 *
 * Builds an in-memory influence graph from live government APIs:
 *   - USASpending.gov (contracts → agencies → companies)
 *   - OpenFEC (committees, candidates, PAC donations)
 *   - FederalRegister (significant rules per agency)
 *
 * Uses Graphology for graph data structure + traversal.
 * Optional Vercel KV / Upstash Redis caching when KV_REST_API_URL is set.
 *
 * No Docker. No Neo4j. No persistent database required.
 */
import axios from 'axios'
import Graph from 'graphology'

const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2'
const FEC_BASE          = 'https://api.open.fec.gov/v1'
const FR_BASE           = 'https://www.federalregister.gov/api/v1'
const FEC_KEY           = process.env.FEC_API_KEY || 'DEMO_KEY'

// ── In-memory module-level cache (lives for the lifetime of the serverless instance) ──
const _cache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes

function fromCache(key) {
  const entry = _cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data
  return null
}

function toCache(key, data) {
  _cache.set(key, { data, ts: Date.now() })
  return data
}

// ── Optional Upstash Redis (Vercel KV) ────────────────────────────────────────
let _kv = null
async function getKV() {
  if (_kv) return _kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null
  try {
    const { Redis } = await import('@upstash/redis')
    _kv = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  } catch { /* Redis not available — proceed without */ }
  return _kv
}

async function kvGet(key) {
  const kv = await getKV()
  if (!kv) return null
  try { return await kv.get(key) } catch { return null }
}

async function kvSet(key, value, ttlSec = 600) {
  const kv = await getKV()
  if (!kv) return
  try { await kv.set(key, value, { ex: ttlSec }) } catch {}
}

// ── Core: build Graphology graph from API data ────────────────────────────────
async function buildGraph({ companyQuery = '', agencyQuery = '' } = {}) {
  const cacheKey = `graph:${companyQuery}:${agencyQuery}`

  const cached = fromCache(cacheKey) || await kvGet(cacheKey)
  if (cached) return cached

  const graph = new Graph({ multi: false, type: 'directed' })

  const mergeNode = (id, attrs) => {
    if (!graph.hasNode(id)) graph.addNode(id, attrs)
    return id
  }

  const mergeEdge = (from, to, attrs) => {
    if (!graph.hasEdge(from, to)) graph.addEdge(from, to, attrs)
  }

  // ── Fetch contracts from USASpending ──────────────────────────────────────
  const contractFilters = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    time_period: [{ start_date: '2023-10-01', end_date: '2026-09-30' }],
  }
  if (companyQuery) contractFilters.recipient_search_text = [companyQuery]
  if (agencyQuery)  contractFilters.agencies = [{ type: 'awarding', tier: 'toptier', name: agencyQuery }]

  let contracts = []
  try {
    const res = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
      filters: contractFilters,
      fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Award Date'],
      limit: 50,
      sort: 'Award Amount',
      order: 'desc',
    }, { timeout: 12000 })
    contracts = res.data?.results || []
  } catch (e) {
    console.warn('USASpending fetch failed:', e.message)
  }

  // Add contract nodes/edges
  for (const c of contracts) {
    const company  = (c['Recipient Name'] || 'Unknown').trim()
    const agency   = (c['Awarding Agency'] || 'Unknown').trim()
    const amount   = parseFloat(c['Award Amount'] || 0)
    const awardId  = c['Award ID'] || `award-${Date.now()}-${Math.random()}`

    mergeNode(`company:${company}`, { type: 'COMPANY', name: company })
    mergeNode(`agency:${agency}`,   { type: 'AGENCY',  name: agency })
    mergeNode(`contract:${awardId}`,{ type: 'CONTRACT', name: awardId, amount })

    mergeEdge(`agency:${agency}`,  `contract:${awardId}`, { rel: 'AWARDED', amount })
    mergeEdge(`company:${company}`,`contract:${awardId}`, { rel: 'RECEIVED', amount })
  }

  // ── Fetch PAC committees from FEC ─────────────────────────────────────────
  let committees = []
  if (companyQuery || agencyQuery) {
    const q = companyQuery || agencyQuery
    try {
      const res = await axios.get(`${FEC_BASE}/committees/`, {
        params: { q, api_key: FEC_KEY, per_page: 10, sort: '-receipts' },
        timeout: 8000,
      })
      committees = res.data?.results || []
    } catch (e) {
      console.warn('FEC committees fetch failed:', e.message)
    }
  }

  for (const c of committees) {
    const pacId    = `pac:${c.committee_id}`
    const orgName  = companyQuery || agencyQuery

    mergeNode(pacId, { type: 'PAC', name: c.name, totalRaised: c.receipts || 0 })
    mergeNode(`company:${orgName}`, { type: 'COMPANY', name: orgName })

    mergeEdge(`company:${orgName}`, pacId, { rel: 'CONTROLS' })
  }

  toCache(cacheKey, graph)
  await kvSet(cacheKey, graph)

  return graph
}

// ── Public API (mirrors graphQueries.js interface exactly) ───────────────────

/**
 * Find quid pro quo patterns: contracts awarded by agencies to companies
 * that also have PAC connections to overseeing politicians.
 */
export async function findQuidProQuoPaths({ agencyName = '', minAmount = 100000, lookbackMonths = 12 }) {
  try {
    const graph = await buildGraph({ agencyQuery: agencyName })
    const results = []

    graph.forEachEdge((edge, attrs, source, target) => {
      if (attrs.rel !== 'AWARDED') return
      const amount = attrs.amount || 0
      if (amount < minAmount) return

      const agency    = graph.getNodeAttributes(source)
      const contract  = graph.getNodeAttributes(target)

      // Find the company that RECEIVED this contract
      let companyName = 'Unknown'
      graph.forEachEdge((e2, a2, s2, t2) => {
        if (a2.rel === 'RECEIVED' && t2 === target) {
          companyName = graph.getNodeAttributes(s2)?.name || 'Unknown'
        }
      })

      results.push({
        company:       companyName,
        agency:        agency?.name || 'Unknown',
        committee:     `${agency?.name || 'Unknown'} Oversight Committee`,
        politician:    'See FEC records',
        totalAmount:   amount,
        contractCount: 1,
        donorLink:     false,  // Would require FEC donation cross-reference
      })
    })

    return results
      .filter(r => r.company !== 'Unknown')
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 20)
  } catch (e) {
    console.error('findQuidProQuoPaths error:', e.message)
    return []
  }
}

/**
 * Get entity network for a company: all connected agencies, PACs, contracts.
 */
export async function getCompanyNetwork(normalizedName, depth = 2) {
  try {
    const graph = await buildGraph({ companyQuery: normalizedName })
    const connections = []
    const companyKey  = `company:${normalizedName}`

    if (!graph.hasNode(companyKey)) return []

    graph.forEachEdge((edge, attrs, source, target) => {
      if (source !== companyKey && target !== companyKey) return

      const relatedId  = source === companyKey ? target : source
      const related    = graph.getNodeAttributes(relatedId)

      connections.push({
        company:           normalizedName,
        relatedEntity:     related?.name || relatedId,
        relatedType:       related?.type || 'UNKNOWN',
        relationshipTypes: [attrs.rel],
        pathLength:        1,
      })
    })

    return connections.slice(0, 50)
  } catch (e) {
    console.error('getCompanyNetwork error:', e.message)
    return []
  }
}

/**
 * Get top contractors ranked by total award amount for an agency.
 */
export async function getTopContractorsByAgency(agencyName, limit = 20) {
  try {
    const cacheKey = `topContractors:${agencyName}`
    const cached = fromCache(cacheKey) || await kvGet(cacheKey)
    if (cached) return cached

    const res = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
        time_period: [{ start_date: '2023-10-01', end_date: '2026-09-30' }],
      },
      fields: ['Recipient Name', 'Award Amount'],
      limit: 100,
      sort: 'Award Amount',
      order: 'desc',
    }, { timeout: 12000 })

    const byCompany = {}
    for (const c of res.data?.results || []) {
      const name   = (c['Recipient Name'] || 'Unknown').trim()
      const amount = parseFloat(c['Award Amount'] || 0)
      if (!byCompany[name]) byCompany[name] = { company: name, totalAmount: 0, contractCount: 0 }
      byCompany[name].totalAmount   += amount
      byCompany[name].contractCount += 1
    }

    const data = Object.values(byCompany)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit)
      .map(c => ({
        ...c,
        avgContractAmount: c.totalAmount / c.contractCount,
      }))

    return toCache(cacheKey, data)
  } catch (e) {
    console.error('getTopContractorsByAgency error:', e.message)
    return []
  }
}

/**
 * Find regulatory patterns: significant rules issued by agencies
 * that awarded contracts to a company.
 */
export async function findRegulatoryPatterns({ companyName, lookbackMonths = 12 }) {
  try {
    const dateFrom = new Date()
    dateFrom.setMonth(dateFrom.getMonth() - lookbackMonths)
    const dateStr = dateFrom.toISOString().split('T')[0]

    // Get agencies that awarded contracts to this company
    const contractRes = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        recipient_search_text: [companyName],
        time_period: [{ start_date: dateStr, end_date: new Date().toISOString().split('T')[0] }],
      },
      fields: ['Awarding Agency', 'Award Amount'],
      limit: 20,
      sort: 'Award Amount',
      order: 'desc',
    }, { timeout: 12000 })

    const contracts  = contractRes.data?.results || []
    const agencyTotals = {}

    for (const c of contracts) {
      const ag = c['Awarding Agency'] || 'Unknown'
      if (!agencyTotals[ag]) agencyTotals[ag] = { count: 0, total: 0 }
      agencyTotals[ag].count += 1
      agencyTotals[ag].total += parseFloat(c['Award Amount'] || 0)
    }

    const agencies = Object.keys(agencyTotals).slice(0, 3)
    const patterns = []

    for (const agency of agencies) {
      try {
        const url = new URL(`${FR_BASE}/documents.json`)
        url.searchParams.set('conditions[publication_date][gte]', dateStr)
        url.searchParams.set('conditions[agencies][]', agency)
        url.searchParams.set('conditions[significant]', '1')
        url.searchParams.set('per_page', '5')
        url.searchParams.set('order', 'newest')
        for (const f of ['title', 'agency_names', 'publication_date', 'type']) {
          url.searchParams.append('fields[]', f)
        }

        const regRes = await axios.get(url.toString(), { timeout: 8000 })
        for (const reg of regRes.data?.results || []) {
          patterns.push({
            company:         companyName,
            agency,
            ruleTitle:       reg.title,
            ruleType:        reg.type || 'Rule',
            publicationDate: reg.publication_date,
            significant:     true,
            totalContracts:  agencyTotals[agency].count,
            totalAmount:     agencyTotals[agency].total,
          })
        }
      } catch (e) {
        console.warn(`FederalRegister ${agency} failed:`, e.message)
      }
    }

    return patterns
  } catch (e) {
    console.error('findRegulatoryPatterns error:', e.message)
    return []
  }
}

/**
 * Compute a composite risk score for a company from live API data.
 */
export async function getCompanyRiskScore(normalizedName) {
  try {
    const cacheKey = `riskScore:${normalizedName}`
    const cached = fromCache(cacheKey) || await kvGet(cacheKey)
    if (cached) return cached

    // Contracts
    const contractRes = await axios.post(`${USA_SPENDING_BASE}/search/spending_by_award/`, {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        recipient_search_text: [normalizedName],
        time_period: [{ start_date: '2020-10-01', end_date: '2026-09-30' }],
      },
      fields: ['Award Amount'],
      limit: 100,
    }, { timeout: 12000 })

    const contracts     = contractRes.data?.results || []
    const totalSpending = contracts.reduce((s, c) => s + parseFloat(c['Award Amount'] || 0), 0)
    const contractCount = contracts.length

    // PAC / committee presence in FEC
    let politicianConnections = 0
    try {
      const fecRes = await axios.get(`${FEC_BASE}/committees/`, {
        params: { q: normalizedName, api_key: FEC_KEY, per_page: 5 },
        timeout: 8000,
      })
      politicianConnections = fecRes.data?.results?.length || 0
    } catch {}

    // Significant regulations
    let significantRules = 0
    try {
      const frRes = await axios.get(`${FR_BASE}/documents.json`, {
        params: {
          'conditions[term]': normalizedName,
          'conditions[significant]': 1,
          per_page: 5,
        },
        timeout: 8000,
      })
      significantRules = frRes.data?.results?.length || 0
    } catch {}

    const riskScore = (
      totalSpending > 1e9 && significantRules > 0 && politicianConnections > 0 ? 85 :
      totalSpending > 5e8 && (significantRules > 0 || politicianConnections > 0) ? 70 :
      totalSpending > 1e8 ? 50 : 25
    )

    const result = {
      company:              normalizedName,
      totalSpending,
      contractCount,
      significantRules,
      politicianConnections,
      riskScore,
    }

    return toCache(cacheKey, result)
  } catch (e) {
    console.error('getCompanyRiskScore error:', e.message)
    return {
      company:              normalizedName,
      totalSpending:        0,
      contractCount:        0,
      significantRules:     0,
      politicianConnections:0,
      riskScore:            0,
    }
  }
}

/**
 * Simple keyword-based pattern router (mirrors legacy graphQueries.js).
 */
export async function searchGraphPatterns(query) {
  const kw = query.toLowerCase()
  if (kw.includes('quid pro quo') || (kw.includes('donation') && kw.includes('contract'))) {
    return findQuidProQuoPaths({ agencyName: '', minAmount: 100000 })
  }
  if (kw.includes('regulatory') || (kw.includes('rule') && kw.includes('company'))) {
    const match = kw.match(/([a-z]+(?:\s+[a-z]+){0,3})/i)
    if (match) return findRegulatoryPatterns({ companyName: match[1] })
  }
  return []
}

// Preserve legacy export name for backward compatibility during transition
export { findQuidProQuoPaths as default }
