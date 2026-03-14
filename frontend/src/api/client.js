const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const TIMEOUT_MS = 35000

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new Error('Request timed out (15s)')
    throw e
  }
}

export async function queryAgent(query) {
  const res = await fetchWithTimeout(`${BASE}/api/agent/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

export async function fetchContracts(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/spending/contracts?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchGrants(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/spending/grants?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchRules(params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/policy/rules?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchSpendingNews(limit = 12) {
  const res = await fetchWithTimeout(`${BASE}/api/feed/spending-news?limit=${limit}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchAgencySpending(year = null) {
  const qs = year ? `?year=${year}` : ''
  const res = await fetchWithTimeout(`${BASE}/api/spending/agency${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchSignificantRules(limit = 20) {
  const res = await fetchWithTimeout(`${BASE}/api/policy/significant?limit=${limit}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ========== PHASE 2: DONOR INTELLIGENCE FUNCTIONS ==========

export async function searchCommittees(keyword, limit = 10) {
  const qs = new URLSearchParams({ keyword, limit }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/committees?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCommitteeReceipts(committeeId, limit = 20) {
  const qs = new URLSearchParams({ limit }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/committees/${committeeId}/receipts?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function searchCandidates({ name, office, state, limit = 10 }) {
  const params = { name, office, state, limit }
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/candidates?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCandidateTotals(candidateId) {
  const res = await fetchWithTimeout(`${BASE}/api/donors/candidates/${candidateId}/totals`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCandidateContributions(candidateId, limit = 50, minAmount = 1000) {
  const qs = new URLSearchParams({ limit, minAmount }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/candidates/${candidateId}/contributions?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCommitteeContributions(committeeId, limit = 50, minAmount = 1000) {
  const qs = new URLSearchParams({ limit, minAmount }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/committees/${committeeId}/contributions?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getTopDonorsByEmployer(employer, limit = 20, cycle = null) {
  const params = { employer, limit }
  if (cycle) params.cycle = cycle
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/donors/by-employer?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getDonorNetwork(donorName, limit = 30) {
  const qs = new URLSearchParams({ limit }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/donors/${encodeURIComponent(donorName)}/network?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getIndustryContributions(keywords, limit = 50, cycle = null) {
  const params = { keywords: keywords.join(','), limit }
  if (cycle) params.cycle = cycle
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/contributions/by-industry?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function compareCandidates(candidateIds, cycle = null) {
  const params = { ids: candidateIds.join(',') }
  if (cycle) params.cycle = cycle
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/candidates/compare?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getPACSpending(committeeId, limit = 20) {
  const qs = new URLSearchParams({ limit }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/donors/committees/${committeeId}/spending?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ========== PHASE 3: CORRUPTION INTELLIGENCE, STOCK ACT, DARK MONEY, COMPANY PROFILES ==========

export async function getCompanyRiskScore(companyName) {
  const qs = new URLSearchParams({ name: companyName }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/corruption/score/company?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getPoliticianAccountabilityScore(candidateId) {
  const qs = new URLSearchParams({ candidateId }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/corruption/score/politician?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getAccountabilityLeaderboard(chamber = null, party = null, limit = 50) {
  const params = { limit }
  if (chamber) params.chamber = chamber
  if (party) params.party = party
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/corruption/leaderboard?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCorruptionPatterns(agencyName = '', lookbackMonths = 12) {
  const qs = new URLSearchParams({ agencyName, lookbackMonths }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/corruption/patterns?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCorruptionHotspots() {
  const res = await fetchWithTimeout(`${BASE}/api/corruption/hotspots`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function analyzeCorruption(query) {
  const res = await fetchWithTimeout(`${BASE}/api/corruption/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// Company profile
export async function searchCompanies(q, limit = 20) {
  const qs = new URLSearchParams({ q, limit }).toString()
  const res = await fetchWithTimeout(`${BASE}/api/companies/search?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCompanyProfile(name) {
  const res = await fetchWithTimeout(`${BASE}/api/companies/${encodeURIComponent(name)}/profile`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCompanyPoliticalFootprint(name) {
  const res = await fetchWithTimeout(`${BASE}/api/companies/${encodeURIComponent(name)}/political-footprint`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCompanyConflicts(name) {
  const res = await fetchWithTimeout(`${BASE}/api/companies/${encodeURIComponent(name)}/conflicts`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// STOCK Act monitor
export async function getRecentStockTrades(chamber = null, limit = 50) {
  const params = { limit }
  if (chamber) params.chamber = chamber
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithTimeout(`${BASE}/api/stockact/recent?${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getStockActViolations() {
  const res = await fetchWithTimeout(`${BASE}/api/stockact/violations`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getPoliticianStockTrades(name) {
  const res = await fetchWithTimeout(`${BASE}/api/stockact/politician/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getStockActWatchlist() {
  const res = await fetchWithTimeout(`${BASE}/api/stockact/watchlist`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// Dark money
export async function getDarkMoneyOrgs() {
  const res = await fetchWithTimeout(`${BASE}/api/darkmoney/orgs`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function traceDarkMoneyFlow(committeeId) {
  const res = await fetchWithTimeout(`${BASE}/api/darkmoney/trace/${encodeURIComponent(committeeId)}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getCandidateDarkMoneyExposure(candidateId) {
  const res = await fetchWithTimeout(`${BASE}/api/darkmoney/candidate/${encodeURIComponent(candidateId)}/exposure`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getDarkMoneyFlowData(cycle = null) {
  const qs = cycle ? `?cycle=${cycle}` : ''
  const res = await fetchWithTimeout(`${BASE}/api/darkmoney/flow${qs}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ─── Settings API ─────────────────────────────────────────────────────────────

export async function fetchSettings() {
  const res = await fetchWithTimeout(`${BASE}/api/settings`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function saveSettings(settings) {
  const res = await fetchWithTimeout(`${BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

export async function testAIConnection() {
  const res = await fetchWithTimeout(`${BASE}/api/settings/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

// Helper function to format currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Helper function to format date
export function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Helper function to get party color
export function getPartyColor(party) {
  const partyLower = (party || '').toLowerCase()
  if (partyLower.includes('democrat')) return '#1a365d' // Blue
  if (partyLower.includes('republican')) return '#822727' // Red
  if (partyLower.includes('independent')) return '#6b7280' // Gray
  return '#4a5568' // Default gray
}
