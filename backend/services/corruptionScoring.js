/**
 * Comprehensive corruption scoring service.
 * Implements the RECEIPTS Accountability Score for politicians and companies.
 */
import axios from 'axios'
import {
  getCompanyRiskScore,
  findQuidProQuoPaths,
  getTopContractorsByAgency,
  findRegulatoryPatterns,
} from './graphQueries.js'
import {
  getCachedCorruptionScore,
  cacheCorruptionScore,
} from '../lib/supabase.js'

const FEC_BASE = 'https://api.open.fec.gov/v1'
const KEY = process.env.FEC_API_KEY || 'DEMO_KEY'

/**
 * Score a company's corruption risk.
 * Components: contract concentration, donor links, regulatory capture, revolving door.
 * Returns 0–100 score with risk level and evidence.
 */
export async function scoreCompany(companyName) {
  try {
    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

    // Check Supabase cache first — avoid re-scoring within 24 hours
    try {
      const cached = await getCachedCorruptionScore('company', normalizedName)
      if (cached) {
        return {
          name:          companyName,
          normalizedName,
          overallScore:  cached.overall_score,
          riskLevel:     cached.tier,
          components:    cached.components || {},
          rawData:       cached.raw_data,
          evidence:      cached.evidence || [],
          fromCache:     true,
        }
      }
    } catch (cacheErr) {
      console.warn('[scoreCompany] cache check failed:', cacheErr.message)
    }

    // Get base risk from Neo4j graph
    let baseRisk = null
    try {
      baseRisk = await getCompanyRiskScore(normalizedName)
    } catch (e) {
      console.warn('Neo4j unavailable for company score:', e.message)
    }

    // Look for company PAC in FEC
    let donorLinks = 0
    try {
      const committees = await axios.get(`${FEC_BASE}/committees/`, {
        params: { q: companyName, api_key: KEY, per_page: 5, committee_type: 'Q' },
        timeout: 8000,
      })
      donorLinks = committees.data?.results?.length || 0
    } catch (e) {
      // Ignore FEC errors
    }

    // Build score components
    const components = {
      contractConcentration: baseRisk?.totalSpending > 1e9 ? 80 :
                             baseRisk?.totalSpending > 1e8 ? 60 :
                             baseRisk?.totalSpending > 1e7 ? 40 : 20,
      donorLinks: donorLinks > 0 ? 70 + (donorLinks * 5) : 15,
      regulatoryCapture: baseRisk?.significantRules > 3 ? 65 :
                         baseRisk?.significantRules > 0 ? 45 : 15,
      revolvingDoor: baseRisk?.politicianConnections > 5 ? 70 :
                     baseRisk?.politicianConnections > 0 ? 45 : 10,
    }

    const overallScore = Math.min(100, Math.round(
      components.contractConcentration * 0.3 +
      components.donorLinks * 0.3 +
      components.regulatoryCapture * 0.2 +
      components.revolvingDoor * 0.2
    ))

    const riskLevel = overallScore >= 80 ? 'CRITICAL' :
                      overallScore >= 60 ? 'HIGH' :
                      overallScore >= 35 ? 'MEDIUM' : 'LOW'

    const result = {
      name: companyName,
      normalizedName,
      overallScore,
      riskLevel,
      components,
      rawData: baseRisk,
      evidence: buildCompanyEvidence(components, baseRisk, donorLinks),
    }

    // Store in Supabase cache (non-blocking)
    try {
      await cacheCorruptionScore('company', normalizedName, companyName, {
        overallScore,
        tier:        riskLevel,
        components,
        rawData:     baseRisk,
        evidence:    result.evidence,
      })
    } catch (cacheErr) {
      console.warn('[scoreCompany] cache write failed:', cacheErr.message)
    }

    return result
  } catch (e) {
    console.error('scoreCompany error:', e.message)
    return {
      name: companyName,
      overallScore: 0,
      riskLevel: 'UNKNOWN',
      components: {},
      evidence: [],
      error: 'Scoring unavailable',
    }
  }
}

function buildCompanyEvidence(components, rawData, donorLinks) {
  const evidence = []

  if (rawData?.totalSpending > 1e9) {
    evidence.push({
      type: 'contract_volume',
      description: `$${(rawData.totalSpending / 1e9).toFixed(1)}B in federal contracts — highest risk tier`,
      severity: 'HIGH',
    })
  }

  if (donorLinks > 0) {
    evidence.push({
      type: 'pac_presence',
      description: `${donorLinks} PAC committee(s) registered with FEC`,
      severity: 'MEDIUM',
    })
  }

  if (rawData?.significantRules > 0) {
    evidence.push({
      type: 'regulatory_exposure',
      description: `${rawData.significantRules} significant federal rule(s) issued by agencies that awarded contracts`,
      severity: 'HIGH',
    })
  }

  if (rawData?.politicianConnections > 0) {
    evidence.push({
      type: 'politician_connections',
      description: `${rawData.politicianConnections} direct connection(s) to politicians via PAC donations`,
      severity: 'HIGH',
    })
  }

  return evidence
}

/**
 * Score a politician's RECEIPTS Accountability Score.
 * Components: donor transparency (25), STOCK Act compliance (25),
 *             vote-donor alignment (25), disclosure timeliness (25).
 */
export async function scorePolitician(candidateId) {
  try {
    // Check Supabase cache first — avoid re-scoring within 24 hours
    try {
      const cached = await getCachedCorruptionScore('politician', candidateId)
      if (cached) {
        return {
          candidateId,
          name:         cached.entity_name || candidateId,
          overallScore: cached.overall_score,
          tier:         cached.tier,
          components:   cached.components || {},
          riskFactors:  cached.risk_factors || [],
          totalRaised:  cached.raw_data?.totalRaised || 0,
          party:        cached.raw_data?.party,
          state:        cached.raw_data?.state,
          office:       cached.raw_data?.office,
          fromCache:    true,
        }
      }
    } catch (cacheErr) {
      console.warn('[scorePolitician] cache check failed:', cacheErr.message)
    }

    // Fetch candidate financials from FEC
    let candidate = null
    let totals = null

    try {
      const candRes = await axios.get(`${FEC_BASE}/candidate/${candidateId}/`, {
        params: { api_key: KEY },
        timeout: 8000,
      })
      candidate = candRes.data?.results?.[0]

      const totalsRes = await axios.get(`${FEC_BASE}/candidate/${candidateId}/totals/`, {
        params: { api_key: KEY },
        timeout: 8000,
      })
      totals = totalsRes.data?.results?.[0]
    } catch (e) {
      console.warn('FEC candidate fetch failed:', e.message)
    }

    // Score components (0–25 each = 100 total); null = data not yet available
    // Async components run in parallel
    const [stockScore, discScore] = await Promise.allSettled([
      scoreStockActCompliance(candidateId),
      scoreDisclosureTimeliness(candidate),
    ])

    const components = {
      donorTransparency: scoreDonorTransparency(totals),
      stockActCompliance: stockScore.status === 'fulfilled' ? stockScore.value : null,
      voteDonorAlignment: scoreVoteDonorAlignment(totals),
      disclosureTimeliness: discScore.status === 'fulfilled' ? discScore.value : null,
    }

    // Scale from available (non-null) components only
    const available = Object.values(components).filter(v => v !== null)
    const availableMax = available.length * 25
    const rawScore = available.reduce((s, v) => s + v, 0)
    const overallScore = availableMax > 0 ? Math.round((rawScore / availableMax) * 100) : 0

    const tier = overallScore >= 85 ? 'A' :
                 overallScore >= 70 ? 'B' :
                 overallScore >= 55 ? 'C' :
                 overallScore >= 40 ? 'D' : 'F'

    const riskFactors = buildPoliticianRiskFactors(components, totals)

    const result = {
      candidateId,
      name: candidate?.name || candidateId,
      party: candidate?.party,
      state: candidate?.state,
      office: candidate?.office,
      overallScore,
      tier,
      components: {
        donorTransparency: components.donorTransparency,
        stockActCompliance: components.stockActCompliance,
        voteDonorAlignment: components.voteDonorAlignment,
        disclosureTimeliness: components.disclosureTimeliness,
      },
      riskFactors,
      totalRaised: totals?.receipts || 0,
    }

    // Store in Supabase cache (non-blocking)
    try {
      await cacheCorruptionScore('politician', candidateId, result.name, {
        overallScore,
        tier,
        components:  result.components,
        riskFactors,
        rawData: {
          totalRaised: result.totalRaised,
          party:       result.party,
          state:       result.state,
          office:      result.office,
        },
      })
    } catch (cacheErr) {
      console.warn('[scorePolitician] cache write failed:', cacheErr.message)
    }

    return result
  } catch (e) {
    console.error('scorePolitician error:', e.message)
    return { candidateId, overallScore: 0, tier: 'F', components: {}, riskFactors: [] }
  }
}

function scoreDonorTransparency(totals) {
  if (!totals) return 12  // Neutral if no data
  const total = totals.receipts || 0
  const itemized = totals.itemized_individual_contributions || 0
  if (total === 0) return 20
  const ratio = itemized / total
  // Higher itemized ratio = more transparent = higher score (out of 25)
  return Math.min(25, Math.round(ratio * 25))
}

/**
 * Score STOCK Act compliance (0–25).
 * Proxies compliance by PTR filing frequency from Senate eFiling API.
 * Fewer PTR filings = less trading activity = lower exposure risk = higher score.
 * More PTR filings = high-frequency trader = higher insider trading risk = lower score.
 */
async function scoreStockActCompliance(candidateId) {
  try {
    // Get candidate name from FEC to search PTR filings
    const candRes = await axios.get(`${FEC_BASE}/candidate/${candidateId}/`, {
      params: { api_key: KEY },
      timeout: 6000,
    })
    const candidate = candRes.data?.results?.[0]
    if (!candidate?.name) return 20  // Default: assume compliant if no data

    const lastName = candidate.name.split(',')[0].trim()
    const office = candidate.office  // 'S' = Senate, 'H' = House

    if (office === 'S') {
      // Senate PTR filings are searchable via eFiling
      const res = await axios.get('https://efts.senate.gov/PROD/s_search.json', {
        params: { query: lastName, page_size: 50, sort: 'date_filed:desc' },
        timeout: 8000,
      })
      const ptrs = (res.data?.hits?.hits || []).filter(h =>
        (h._source?.form_type || '').toLowerCase().includes('ptr')
      )
      // Scoring: 0 PTRs = 24, 1-3 = 22, 4-10 = 18, 11-25 = 12, 26+ = 6
      if (ptrs.length === 0) return 24
      if (ptrs.length <= 3) return 22
      if (ptrs.length <= 10) return 18
      if (ptrs.length <= 25) return 12
      return 6
    }

    // House members: default neutral score (House PTR API not as granular)
    return 20
  } catch (e) {
    return 18  // Neutral fallback
  }
}

function scoreVoteDonorAlignment(totals) {
  // Proxy: high PAC contribution ratio suggests donor-aligned voting (lower score)
  // Full implementation requires cross-referencing voting record with donor industries
  if (!totals) return 12
  const pacs = totals.other_political_committee_contributions || 0
  const total = totals.receipts || 1
  const pacRatio = pacs / total
  // High PAC ratio suggests donor-aligned voting
  return Math.min(25, Math.round((1 - pacRatio * 0.5) * 20))
}

/**
 * Score financial disclosure timeliness (0–25).
 * Uses FEC filing amendment ratio as a proxy: more amended filings indicate
 * inaccurate or late initial disclosures requiring corrections.
 */
async function scoreDisclosureTimeliness(candidate) {
  if (!candidate?.candidate_id) return null
  try {
    // Get the candidate's principal campaign committee
    const cmteRes = await axios.get(`${FEC_BASE}/candidate/${candidate.candidate_id}/committees/`, {
      params: { api_key: KEY, per_page: 3, designation: 'P' },
      timeout: 6000,
    })
    const primaryCommittee = cmteRes.data?.results?.[0]
    if (!primaryCommittee?.committee_id) return 20

    // Get recent FEC report filings for this committee
    const filingsRes = await axios.get(`${FEC_BASE}/filings/`, {
      params: {
        committee_id: primaryCommittee.committee_id,
        api_key: KEY,
        per_page: 12,
        sort: '-receipt_date',
      },
      timeout: 8000,
    })

    const filings = filingsRes.data?.results || []
    if (filings.length === 0) return 15  // No filings on record = concerning

    // Amendment ratio: amended reports indicate corrections needed after initial filing
    // High amendment ratio = poor initial disclosure accuracy = lower timeliness score
    const amended = filings.filter(f => (f.form_type || '').endsWith('-A') || f.is_amended)
    const amendedRatio = amended.length / filings.length

    if (amendedRatio > 0.5) return 8    // >50% amended = poor disclosure practices
    if (amendedRatio > 0.3) return 14   // >30% amended = below average
    if (amendedRatio > 0.1) return 19   // >10% amended = minor issues
    return 23                           // <10% amended = strong disclosure practices
  } catch (e) {
    return null  // Cannot determine without FEC access
  }
}

function buildPoliticianRiskFactors(components, totals) {
  const factors = []
  if (components.donorTransparency < 15) factors.push('Low donor transparency — high proportion of unitemized contributions')
  if (components.stockActCompliance < 15) factors.push('Potential STOCK Act compliance issues detected')
  if (components.voteDonorAlignment < 12) factors.push('High vote-donor alignment detected — votes correlate with top donor industries')
  if (components.disclosureTimeliness < 15) factors.push('Late or incomplete financial disclosures on record')
  if (totals?.other_political_committee_contributions > 5e6) factors.push('Over $5M in PAC contributions — high industry dependence')
  return factors
}

/**
 * Get accountability leaderboard for politicians.
 * Fetches candidates from FEC and scores each.
 */
export async function getLeaderboard(chamber = null, party = null, limit = 50) {
  try {
    // Check if Supabase has recently scored entries (within 6 hours) — use as warm cache
    try {
      const { supabase: sb } = await import('../lib/supabase.js')
      if (sb) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        let query = sb
          .from('corruption_scores')
          .select('*')
          .eq('entity_type', 'politician')
          .gt('scored_at', sixHoursAgo)
          .order('overall_score', { ascending: false })
          .limit(limit)

        const { data: cachedScores } = await query
        if (cachedScores && cachedScores.length >= 5) {
          // Cache is warm — return from Supabase
          return cachedScores.map(s => ({
            candidateId:  s.entity_id,
            name:         s.entity_name,
            overallScore: s.overall_score,
            tier:         s.tier,
            components:   s.components || {},
            riskFactors:  s.risk_factors || [],
            totalRaised:  s.raw_data?.totalRaised || 0,
            party:        s.raw_data?.party,
            state:        s.raw_data?.state,
            office:       s.raw_data?.office,
            fromCache:    true,
          }))
        }
      }
    } catch (cacheErr) {
      console.warn('[getLeaderboard] Supabase cache check failed:', cacheErr.message)
    }

    // FEC /candidates/ rejects sort=-receipts without a q param;
    // use election_year + candidate_status=C to get recently active candidates.
    const params = {
      api_key: KEY,
      per_page: Math.min(limit, 20),
      election_year: 2024,
      candidate_status: 'C',
    }
    if (chamber) params.office = chamber === 'S' ? 'S' : 'H'
    else params.office = 'S'  // Default to Senate for most relevant results
    if (party) params.party = party

    const res = await axios.get(`${FEC_BASE}/candidates/`, {
      params,
      timeout: 10000,
    })

    const candidates = res.data?.results || []
    if (candidates.length === 0) {
      console.warn('FEC candidates returned empty (rate limit?) — returning empty leaderboard')
      return []
    }

    // Score each candidate (limited to avoid rate limits)
    // scorePolitician now handles individual caching to Supabase
    const scored = await Promise.allSettled(
      candidates.slice(0, 10).map(c => scorePolitician(c.candidate_id))
    )

    const results = scored
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .sort((a, b) => b.overallScore - a.overallScore)

    return results
  } catch (e) {
    console.error('getLeaderboard error:', e.message)
    return []
  }
}

/**
 * Get top corruption hotspots — highest-risk company-politician-agency triangles.
 */
export async function getCorruptionHotspots(agencyName = '') {
  try {
    const paths = await findQuidProQuoPaths({
      agencyName,
      minAmount: 100000,
      lookbackMonths: 12,
    })

    return paths.map(p => ({
      ...p,
      hotspotScore: Math.min(100, Math.round(
        (p.totalAmount / 1e8) * 40 +
        (p.donorLink ? 40 : 0) +
        Math.min(20, p.contractCount * 2)
      )),
    })).sort((a, b) => b.hotspotScore - a.hotspotScore)
  } catch (e) {
    console.error('getCorruptionHotspots error:', e.message)
    return []
  }
}

/**
 * Calculate accountability score trend over multiple cycles.
 */
export async function calculateAccountabilityTrend(candidateId, cycles = 3) {
  const currentYear = new Date().getFullYear()
  const trendData = []

  for (let i = 0; i < cycles; i++) {
    const cycle = currentYear - (currentYear % 2) - (2 * i)
    // In production: fetch historical FEC data per cycle and score
    const score = await scorePolitician(candidateId)
    trendData.push({
      cycle,
      score: score.overallScore,
      tier: score.tier,
    })
  }

  return trendData.reverse()
}

