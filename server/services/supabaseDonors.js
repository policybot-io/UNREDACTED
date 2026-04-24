/**
 * Supabase-backed donor/committee/candidate queries.
 * Reads from bulk-ingested FEC tables (politicians, pac_committees,
 * candidate_totals, contributions, committee_transfers, money_flow_edges).
 *
 * Used by server/routes/donors.js when DONOR_SOURCE=supabase (or ?source=supabase).
 * Coexists with services/fec.js (live FEC API) so the cutover is a flag flip.
 */
import { supabase } from '../lib/supabase.js'
import { classifySector } from '../lib/sectorClassifier.js'

function ensure() {
  if (!supabase) throw new Error('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)')
  return supabase
}

// ─── Candidates ───────────────────────────────────────────────────────────────

/**
 * Search politicians, optionally joined with candidate_totals for a given cycle
 * so the same candidate appears once per cycle they filed in.
 */
export async function searchCandidates({ name, office, state, party, cycle, limit = 100, offset = 0, sortBy = 'name', sortDir = 'asc' }) {
  const db = ensure()

  // When sortBy is a candidate_totals column and no politician-table filters are active,
  // lead with candidate_totals for accurate server-side pagination.
  const TOTALS_SORT_FIELDS = ['total_receipts', 'total_disbursements']
  const hasPolFilters = name || office || state || party
  if (TOTALS_SORT_FIELDS.includes(sortBy) && !hasPolFilters) {
    const ascending = sortDir === 'asc'
    let tq = db
      .from('candidate_totals')
      .select('candidate_id, total_receipts, total_disbursements, cash_on_hand, individual_contributions, pac_contributions, cycle', { count: 'exact' })
      .order(sortBy, { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1)
    if (cycle) tq = tq.eq('cycle', Number(cycle))
    const { data: totals, error: tErr, count } = await tq
    if (tErr) throw new Error(`searchCandidates/totals-led: ${tErr.message}`)
    if (!totals || totals.length === 0) return { results: [], pagination: { count: count || 0, limit, offset } }

    const ids = totals.map(t => t.candidate_id).filter(Boolean)
    const { data: pols, error: pErr } = await db
      .from('politicians')
      .select('fec_candidate_id, name, party, state, district, chamber, office, in_office, next_election')
      .in('fec_candidate_id', ids)
    if (pErr) throw new Error(`searchCandidates/pols: ${pErr.message}`)
    const polMap = new Map((pols || []).map(p => [p.fec_candidate_id, p]))

    const rows = totals.map(t => ({
      ...(polMap.get(t.candidate_id) || { fec_candidate_id: t.candidate_id }),
      cycle: t.cycle,
      totals: t,
    }))
    return { results: rows, pagination: { count, limit, offset } }
  }

  // Default path: filter politicians, hydrate with candidate_totals.
  // No FK between politicians.fec_candidate_id and candidate_totals.candidate_id,
  // so PostgREST embed isn't available — two-step query.
  let q = db
    .from('politicians')
    .select('fec_candidate_id, name, party, state, district, chamber, office, in_office, next_election', { count: 'exact' })
  if (name)   q = q.ilike('name', `%${name}%`)
  if (office) q = q.ilike('office', `%${office}%`)
  if (state)  q = q.eq('state', state.toUpperCase())
  if (party)  q = q.eq('party', party.toUpperCase())
  q = q.order('name', { ascending: true }).range(offset, offset + limit - 1)

  const { data: pols, error, count } = await q
  if (error) throw new Error(`searchCandidates: ${error.message}`)
  if (!pols || pols.length === 0) return { results: [], pagination: { count: count || 0, limit, offset } }

  const ids = pols.map(p => p.fec_candidate_id).filter(Boolean)
  let tq = db.from('candidate_totals').select('*').in('candidate_id', ids)
  if (cycle) tq = tq.eq('cycle', Number(cycle))
  const { data: totals, error: tErr } = await tq
  if (tErr) throw new Error(`searchCandidates/totals: ${tErr.message}`)

  const byId = new Map()
  for (const t of totals || []) {
    if (!byId.has(t.candidate_id)) byId.set(t.candidate_id, [])
    byId.get(t.candidate_id).push(t)
  }

  // Emit one row per (candidate, cycle). If no totals row exists, emit once with cycle=null.
  const rows = []
  for (const p of pols) {
    const list = byId.get(p.fec_candidate_id) || []
    if (list.length === 0) {
      rows.push({ ...p, cycle: null, totals: null })
    } else {
      for (const t of list) rows.push({ ...p, cycle: t.cycle, totals: t })
    }
  }

  return { results: rows, pagination: { count, limit, offset } }
}

export async function getCandidateRaisedTotals(candidateId) {
  const db = ensure()
  const { data, error } = await db
    .from('candidate_totals')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('cycle', { ascending: false })
  if (error) throw new Error(`getCandidateRaisedTotals: ${error.message}`)
  return { results: data || [] }
}

export async function getCandidateContributions(candidateId, limit = 50, minAmount = 1000, offset = 0) {
  const db = ensure()
  const { data, error, count } = await db
    .from('contributions')
    .select('*', { count: 'exact' })
    .eq('candidate_id', candidateId)
    .gte('amount', minAmount)
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`getCandidateContributions: ${error.message}`)
  return { results: data || [], pagination: { count, limit, offset } }
}

// ─── Committees ───────────────────────────────────────────────────────────────

export async function searchCommittees({ keyword, cycle, limit = 100, offset = 0 }) {
  const db = ensure()
  let q = db
    .from('pac_committees')
    .select('*', { count: 'exact' })
    .order('total_receipts', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (keyword) q = q.ilike('name', `%${keyword}%`)
  if (cycle)   q = q.eq('cycle', Number(cycle))
  const { data, error, count } = await q
  if (error) throw new Error(`searchCommittees: ${error.message}`)
  return { results: data || [], pagination: { count, limit, offset } }
}

export async function getCommitteeContributions(committeeId, limit = 50, minAmount = 1000, offset = 0) {
  const db = ensure()
  const { data, error, count } = await db
    .from('contributions')
    .select('*', { count: 'exact' })
    .eq('committee_id', committeeId)
    .gte('amount', minAmount)
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`getCommitteeContributions: ${error.message}`)
  return { results: data || [], pagination: { count, limit, offset } }
}

// ─── Donor-side aggregates ────────────────────────────────────────────────────

export async function getTopDonorsByEmployer(employer, limit = 20, cycle = null) {
  const db = ensure()
  let q = db
    .from('contributions')
    .select('contributor_name, contributor_employer, contributor_occupation, amount, date, candidate_id, committee_id')
    .ilike('contributor_employer', `%${employer}%`)
    .order('amount', { ascending: false })
    .limit(limit)
  if (cycle) {
    q = q.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)
  }
  const { data, error } = await q
  if (error) throw new Error(`getTopDonorsByEmployer: ${error.message}`)
  return { results: data || [] }
}

// ─── Cash Flood Anomalies (Story J) ──────────────────────────────────────────

/**
 * Detect candidates with anomalous fundraising spikes.
 * Compares the most recent 30-day window against the prior 30-day window.
 * Returns candidates where recent receipts are >= 1.5× the prior window
 * and at least $100k (to filter noise).
 */
export async function getCashFloodAlerts({ cycle = null, topN = 20 } = {}) {
  const db = ensure()
  const now = new Date()
  const d30 = new Date(now - 30  * 86400000).toISOString().slice(0, 10)
  const d60 = new Date(now - 60  * 86400000).toISOString().slice(0, 10)
  const d90 = new Date(now - 90  * 86400000).toISOString().slice(0, 10)

  let q = db
    .from('contributions')
    .select('candidate_id, amount, date')
    .gte('date', d90)
    .not('candidate_id', 'is', null)
    .gte('amount', 200)
    .order('date')
    .limit(100000)
  if (cycle) q = q.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)

  const { data, error } = await q
  if (error) throw new Error(`getCashFloodAlerts: ${error.message}`)

  // Bucket contributions into recent (0–30d) and prior (30–60d) windows
  const byCandidate = new Map()
  for (const row of (data || [])) {
    if (!row.candidate_id) continue
    if (!byCandidate.has(row.candidate_id)) byCandidate.set(row.candidate_id, { recent: 0, prior: 0 })
    const d = byCandidate.get(row.candidate_id)
    if (row.date >= d30)       d.recent += row.amount || 0
    else if (row.date >= d60)  d.prior  += row.amount || 0
  }

  // Score spikes: recent vs prior
  const spikes = []
  for (const [candidateId, d] of byCandidate) {
    if (d.recent < 100000) continue  // ignore small-dollar noise
    const ratio = d.prior > 0 ? d.recent / d.prior : d.recent > 0 ? 99 : 0
    if (ratio >= 1.5 || (d.prior === 0 && d.recent >= 250000)) {
      spikes.push({ candidateId, recentAmount: d.recent, priorAmount: d.prior, spikeRatio: Number(ratio.toFixed(2)) })
    }
  }
  spikes.sort((a, b) => b.spikeRatio - a.spikeRatio)
  const top = spikes.slice(0, topN)
  if (top.length === 0) return { alerts: [] }

  // Hydrate with politician names
  const ids = top.map(s => s.candidateId)
  const { data: pols } = await db.from('politicians').select('fec_candidate_id, name, party, state').in('fec_candidate_id', ids)
  const polMap = new Map((pols || []).map(p => [p.fec_candidate_id, p]))

  return {
    alerts: top.map(s => ({ ...s, ...(polMap.get(s.candidateId) || {}) })),
    windowDays: 30,
    asOf: now.toISOString().slice(0, 10),
  }
}

// ─── Employer leaderboard ─────────────────────────────────────────────────────

/**
 * Top employers by total contribution volume, for the leaderboard panel.
 * Sector classification is applied server-side in the route handler.
 */
export async function getTopEmployers({ cycle, minAmount = 0, limit = 100 } = {}) {
  const db = ensure()
  // Use money_flow_edges MV (already aggregated per employer→committee pair)
  // Fetch all tier-1 employer rows, then group by employer in JS.
  let q = db
    .from('money_flow_edges')
    .select('source_id, source_label, amount, txn_count')
    .eq('source_type', 'employer')
    .eq('source_tier', 1)
    .gt('amount', 0)
    .order('amount', { ascending: false })
    .limit(5000)
  if (cycle) q = q.eq('cycle', Number(cycle))
  const { data, error } = await q
  if (error) throw new Error(`getTopEmployers: ${error.message}`)

  // Group by employer_id, summing amount and txn_count across committees
  const byId = new Map()
  for (const row of (data || [])) {
    const id  = row.source_id
    const cur = byId.get(id) || { employer_id: id, employer: row.source_label || id, total: 0, txn_count: 0 }
    cur.total     += Number(row.amount)    || 0
    cur.txn_count += Number(row.txn_count) || 0
    if (row.source_label) cur.employer = row.source_label  // keep most recent raw label
    byId.set(id, cur)
  }

  return [...byId.values()]
    .filter(r => r.total >= minAmount)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/**
 * 3-tier money flow for a specific employer:
 * employer → committee (tier1→2) + committee → candidate (tier4→5 for those committees).
 * Enriches committee IDs with names from pac_committees.
 */
export async function getEmployerFlow({ employerId, cycle, limit = 50 } = {}) {
  const db = ensure()

  // Step 1: employer → committee edges from MV
  let q1 = db
    .from('money_flow_edges')
    .select('*')
    .eq('source_type', 'employer')
    .eq('source_tier', 1)
    .eq('source_id', employerId)
    .order('amount', { ascending: false })
    .limit(limit)
  if (cycle) q1 = q1.eq('cycle', Number(cycle))
  const { data: empEdges, error: e1 } = await q1
  if (e1) throw new Error(`getEmployerFlow step1: ${e1.message}`)
  if (!empEdges || empEdges.length === 0) return { edges: [] }

  // Step 2: collect committee IDs, fetch their names
  const committeeIds = [...new Set(empEdges.map(e => e.target_id).filter(Boolean))]
  const { data: committees, error: e2 } = await db
    .from('pac_committees')
    .select('committee_id, name')
    .in('committee_id', committeeIds)
  if (e2) throw new Error(`getEmployerFlow step2: ${e2.message}`)
  const nameById = Object.fromEntries((committees || []).map(c => [c.committee_id, c.name]))

  // Step 3: committee → candidate edges from MV
  let q3 = db
    .from('money_flow_edges')
    .select('*')
    .in('source_id', committeeIds)
    .eq('target_type', 'candidate')
    .order('amount', { ascending: false })
    .limit(limit)
  if (cycle) q3 = q3.eq('cycle', Number(cycle))
  const { data: candEdges, error: e3 } = await q3
  if (e3) throw new Error(`getEmployerFlow step3: ${e3.message}`)

  // Enrich labels
  const enrich = edges => (edges || []).map(e => ({
    ...e,
    source_label: e.source_type === 'committee' ? (nameById[e.source_id] || e.source_id) : (e.source_label || e.source_id),
    target_label: e.target_type === 'committee' ? (nameById[e.target_id] || e.target_id) : (e.target_label || e.target_id),
  }))

  return { edges: [...enrich(empEdges), ...enrich(candEdges)] }
}

// ─── Money-flow (Sankey) ──────────────────────────────────────────────────────

/**
 * Read edges from the money_flow_edges materialized view for the Sankey.
 * Filters by cycle + optional tier/node.
 */
export async function getMoneyFlow({ cycle, sourceTier, targetTier, nodeId, nodeType, minAmount = 0, limit = 500 }) {
  const db = ensure()
  let q = db
    .from('money_flow_edges')
    .select('*')
    .gte('amount', minAmount)
    .order('amount', { ascending: false })
    .limit(limit)
  if (cycle)      q = q.eq('cycle', Number(cycle))
  if (sourceTier) q = q.eq('source_tier', Number(sourceTier))
  if (targetTier) q = q.eq('target_tier', Number(targetTier))
  if (nodeId && nodeType) {
    // Match edges touching this node on either end
    q = q.or(`and(source_id.eq.${nodeId},source_type.eq.${nodeType}),and(target_id.eq.${nodeId},target_type.eq.${nodeType})`)
  }
  const { data, error } = await q
  if (error) throw new Error(`getMoneyFlow: ${error.message}`)
  return { edges: data || [] }
}

// ─── Committee receipts ───────────────────────────────────────────────────────

/**
 * Top individual contributions into a committee (Schedule A receipts).
 * Falls back to querying `contributions` by committee_id.
 */
export async function getCommitteeReceipts({ committeeId, limit = 20, cycle } = {}) {
  const db = ensure()
  let q = db
    .from('contributions')
    .select('contributor_name, contributor_employer, contributor_occupation, amount, date, receipt_type')
    .eq('committee_id', committeeId)
    .order('amount', { ascending: false })
    .limit(limit)
  if (cycle) q = q.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)
  const { data, error } = await q
  if (error) throw new Error(`getCommitteeReceipts: ${error.message}`)
  return { results: data || [] }
}

// ─── Contributions by industry ────────────────────────────────────────────────

/**
 * Aggregate contributions by sector, using keyword matching on contributor_employer.
 * Keywords are OR'd together; results are grouped by sector via classifySector().
 */
export async function getContributionsByIndustry({ keywords, limit = 50, cycle } = {}) {
  const db = ensure()
  // Build OR clause: each keyword applied as ilike on contributor_employer
  const orClause = keywords.map(k => `contributor_employer.ilike.%${k}%`).join(',')
  let q = db
    .from('contributions')
    .select('contributor_employer, amount')
    .or(orClause)
    .order('amount', { ascending: false })
    .limit(20000)
  if (cycle) q = q.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)
  const { data, error } = await q
  if (error) throw new Error(`getContributionsByIndustry: ${error.message}`)

  // Group by sector
  const bySector = new Map()
  for (const row of (data || [])) {
    const sector = classifySector(row.contributor_employer || '')
    const cur = bySector.get(sector) || { sector, total: 0, employer_count: 0 }
    cur.total += Number(row.amount) || 0
    cur.employer_count += 1
    bySector.set(sector, cur)
  }

  const results = [...bySector.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
  return { results }
}

// ─── Candidate comparison ─────────────────────────────────────────────────────

/**
 * Return candidate_totals rows for a list of candidate IDs, enriched with
 * politician names from the politicians table.
 */
export async function getCandidateTotalsComparison({ candidateIds, cycle } = {}) {
  const db = ensure()
  let tq = db
    .from('candidate_totals')
    .select('*')
    .in('candidate_id', candidateIds)
  if (cycle) tq = tq.eq('cycle', Number(cycle))
  const { data: totals, error: tErr } = await tq
  if (tErr) throw new Error(`getCandidateTotalsComparison: ${tErr.message}`)

  const { data: pols, error: pErr } = await db
    .from('politicians')
    .select('fec_candidate_id, name, party, state, chamber, office')
    .in('fec_candidate_id', candidateIds)
  if (pErr) throw new Error(`getCandidateTotalsComparison/pols: ${pErr.message}`)

  const polMap = new Map((pols || []).map(p => [p.fec_candidate_id, p]))
  const results = (totals || []).map(t => ({
    ...(polMap.get(t.candidate_id) || {}),
    ...t,
  }))
  return { results }
}

// ─── Committee spending (disbursements) ───────────────────────────────────────

/**
 * Top disbursements for a committee from the disbursements_detail table (FEC oppexp).
 */
export async function getCommitteeSpending({ committeeId, limit = 20, cycle } = {}) {
  const db = ensure()
  let q = db
    .from('disbursements_detail')
    .select('recipient_name, disbursement_amount, disbursement_date, purpose_category, disbursement_description')
    .eq('committee_id', committeeId)
    .order('disbursement_amount', { ascending: false })
    .limit(limit)
  if (cycle) q = q.gte('disbursement_date', `${cycle - 1}-01-01`).lte('disbursement_date', `${cycle}-12-31`)
  const { data, error } = await q
  if (error) throw new Error(`getCommitteeSpending: ${error.message}`)
  return { results: data || [] }
}

// ─── Per-candidate top industries (Story D) ──────────────────────────────────

/**
 * Top donor sources for a single candidate — combines individual employers
 * with PAC/committee names. Returns traceable org names, not just sectors.
 *
 * Individual contributions → grouped by contributor_employer
 * PAC contributions (no employer) → grouped by committee_id, enriched with
 *   pac_committees.name and connected_org_name
 */
export async function getCandidateTopIndustries(candidateId, { cycle, limit = 15 } = {}) {
  const db = ensure()

  // Step 1: Find the candidate's campaign committees via candidate_committee_links
  let linkQ = db
    .from('candidate_committee_links')
    .select('committee_id')
    .eq('fec_candidate_id', candidateId)
  if (cycle) linkQ = linkQ.eq('cycle', Number(cycle))
  const { data: links } = await linkQ
  const candCommitteeIds = (links || []).map(l => l.committee_id).filter(Boolean)

  // Step 2: Query contributions both to the candidate directly (pas2)
  // AND to the candidate's principal committees (individual donations)
  let q = db
    .from('contributions')
    .select('contributor_employer, committee_id, amount')
    .gte('amount', 200)
    .order('amount', { ascending: false })
    .limit(20000)
  if (candCommitteeIds.length > 0) {
    // Match contributions to candidate directly OR to their committees
    const orClause = `candidate_id.eq.${candidateId},committee_id.in.(${candCommitteeIds.join(',')})`
    q = q.or(orClause)
  } else {
    q = q.eq('candidate_id', candidateId)
  }
  if (cycle) q = q.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)
  const { data, error } = await q
  if (error) throw new Error(`getCandidateTopIndustries: ${error.message}`)

  // Split: individual donors (have employer) vs PAC contributions (no employer)
  // Exclude the candidate's own committees from the PAC donor list
  const ownCommittees = new Set(candCommitteeIds.map(c => c.toUpperCase()))
  const byEmployer = new Map()
  const byCommittee = new Map()
  for (const row of (data || [])) {
    const amt = Number(row.amount) || 0
    const emp = (row.contributor_employer || '').trim()
    if (emp && emp.length > 1) {
      const key = emp.toUpperCase()
      const cur = byEmployer.get(key) || { source: emp, total: 0, count: 0 }
      cur.total += amt
      cur.count += 1
      if (emp.length > cur.source.length) cur.source = emp
      byEmployer.set(key, cur)
    } else if (row.committee_id && !ownCommittees.has(row.committee_id.toUpperCase())) {
      // Only count external PACs/committees as donors, not the candidate's own committees
      const cur = byCommittee.get(row.committee_id) || { committeeId: row.committee_id, total: 0, count: 0 }
      cur.total += amt
      cur.count += 1
      byCommittee.set(row.committee_id, cur)
    }
  }

  // Enrich committee entries with names from pac_committees
  const committeeIds = [...byCommittee.keys()]
  if (committeeIds.length > 0) {
    const { data: pacs } = await db
      .from('pac_committees')
      .select('committee_id, name, connected_org_name')
      .in('committee_id', committeeIds)
    const pacMap = new Map((pacs || []).map(p => [p.committee_id, p]))
    for (const [cid, entry] of byCommittee) {
      const pac = pacMap.get(cid)
      entry.source = pac?.connected_org_name || pac?.name || cid
    }
  }

  // Merge both lists, classify sector, rank by total
  const all = []
  for (const e of byEmployer.values()) {
    all.push({ source: e.source, sector: classifySector(e.source), total: e.total, donorCount: e.count, type: 'employer' })
  }
  for (const e of byCommittee.values()) {
    all.push({ source: e.source, sector: classifySector(e.source), total: e.total, donorCount: e.count, type: 'pac' })
  }
  all.sort((a, b) => b.total - a.total)
  return all.slice(0, limit)
}

// ─── Corporate PAC flow ───────────────────────────────────────────────────────

/**
 * Top corporations ranked by combined PAC spending across connected PACs,
 * Super PACs, and 501(c)4s. Aggregates pac_committees grouped by connected_org_name.
 */
export async function getCorporatePACs({ cycle, limit = 20, minAmount = 0 } = {}) {
  const db = ensure()
  let q = db
    .from('pac_committees')
    .select('committee_id, name, connected_org_name, total_receipts, is_super_pac, is_501c4, cycle')
    .not('connected_org_name', 'is', null)
    .not('connected_org_name', 'eq', 'NONE')
    .not('connected_org_name', 'eq', '')
    .order('total_receipts', { ascending: false, nullsFirst: false })
    .limit(5000)
  if (cycle) q = q.eq('cycle', Number(cycle))
  const { data, error } = await q
  if (error) throw new Error(`getCorporatePACs: ${error.message}`)

  // Group by corp (lowercased connected_org_name), aggregate by PAC type
  const byCorpId = new Map()
  for (const pac of (data || [])) {
    const raw = (pac.connected_org_name || '').trim()
    if (!raw || raw.toUpperCase() === 'NONE') continue
    const corpId = raw.toLowerCase()
    if (!byCorpId.has(corpId)) {
      byCorpId.set(corpId, {
        corp_id: corpId, corp: raw,
        pac_total: 0, super_pac_total: 0, c4_total: 0, total: 0,
        pac_count: 0, pacs: [],
      })
    }
    const corp = byCorpId.get(corpId)
    const amount = Number(pac.total_receipts) || 0
    if (pac.is_super_pac)  corp.super_pac_total += amount
    else if (pac.is_501c4) corp.c4_total        += amount
    else                    corp.pac_total        += amount
    corp.total += amount
    corp.pac_count += 1
    corp.pacs.push({ committee_id: pac.committee_id, type: pac.is_super_pac ? 'super_pac' : pac.is_501c4 ? '501c4' : 'connected_pac' })
    // prefer longer/better label
    if (raw.length > corp.corp.length) corp.corp = raw
  }

  const results = [...byCorpId.values()]
    .filter(c => c.total >= minAmount)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
  return { results }
}

/**
 * Top politician recipients of PAC money from a specific corporation.
 * corpId = lowercased connected_org_name used as key in getCorporatePACs.
 */
export async function getCorporatePACRecipients({ corpId, cycle, limit = 15 } = {}) {
  const db = ensure()

  // Step 1: find all PAC committees for this corp
  let pq = db
    .from('pac_committees')
    .select('committee_id, name, is_super_pac, is_501c4')
    .ilike('connected_org_name', corpId)
  if (cycle) pq = pq.eq('cycle', Number(cycle))
  const { data: pacs, error: pErr } = await pq
  if (pErr) throw new Error(`getCorporatePACRecipients/pacs: ${pErr.message}`)
  if (!pacs || pacs.length === 0) return { recipients: [], pacs: [] }

  const committeeIds = pacs.map(p => p.committee_id)

  // Step 2: contributions from those committees to candidates
  let cq = db
    .from('contributions')
    .select('candidate_id, amount')
    .in('committee_id', committeeIds)
    .not('candidate_id', 'is', null)
    .order('amount', { ascending: false })
    .limit(10000)
  if (cycle) cq = cq.gte('date', `${cycle - 1}-01-01`).lte('date', `${cycle}-12-31`)
  const { data: contribs, error: cErr } = await cq
  if (cErr) throw new Error(`getCorporatePACRecipients/contribs: ${cErr.message}`)

  // Aggregate by candidate
  const byCand = new Map()
  for (const c of (contribs || [])) {
    if (!c.candidate_id) continue
    byCand.set(c.candidate_id, (byCand.get(c.candidate_id) || 0) + (Number(c.amount) || 0))
  }

  const topCands = [...byCand.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  const pacList = pacs.map(p => ({
    committee_id: p.committee_id, name: p.name,
    type: p.is_super_pac ? 'super_pac' : p.is_501c4 ? '501c4' : 'connected_pac',
  }))
  if (topCands.length === 0) return { recipients: [], pacs: pacList }

  // Hydrate with politician names
  const candIds = topCands.map(([id]) => id)
  const { data: pols } = await db
    .from('politicians')
    .select('fec_candidate_id, name, party, state, chamber, office')
    .in('fec_candidate_id', candIds)
  const polMap = new Map((pols || []).map(p => [p.fec_candidate_id, p]))

  const recipients = topCands.map(([candidateId, amount]) => ({
    fec_candidate_id: candidateId,
    amount,
    ...(polMap.get(candidateId) || {}),
  }))
  return { recipients, pacs: pacList }
}
