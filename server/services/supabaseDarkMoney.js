/**
 * Supabase-backed dark money analysis.
 * Replaces live FEC API calls in darkMoney.js with queries against bulk-ingested tables:
 * - pac_committees (is_super_pac, is_501c4, connected_org_name, total_disbursements)
 * - committee_transfers (from/to committee flows)
 * - contributions (receipts into committees)
 * - independent_expenditures (IE spending targeting candidates)
 */
import { supabase } from '../lib/supabase.js'

function ensure() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

function inferIssues(name = '') {
  const n = name.toLowerCase()
  if (n.includes('defense') || n.includes('security') || n.includes('military')) return 'Defense, national security'
  if (n.includes('health') || n.includes('pharma') || n.includes('medical')) return 'Healthcare, drug pricing'
  if (n.includes('energy') || n.includes('oil') || n.includes('gas') || n.includes('climate')) return 'Energy, environment'
  if (n.includes('finance') || n.includes('bank') || n.includes('wall street')) return 'Financial regulation'
  if (n.includes('tech') || n.includes('digital') || n.includes('data')) return 'Technology, antitrust'
  if (n.includes('freedom') || n.includes('america') || n.includes('patriot')) return 'General conservative/liberal advocacy'
  return 'General political advocacy'
}

/**
 * Get dark money organizations — Super PACs and 501(c)(4)s ranked by spending.
 */
export async function getDarkMoneyOrgs(limit = 20, cycle) {
  const db = ensure()
  let q = db
    .from('pac_committees')
    .select('committee_id, name, connected_org_name, total_receipts, total_disbursements, committee_type, cycle')
    .or('committee_type.eq.O,committee_type.eq.U,committee_type.eq.V,committee_type.eq.W')
    .order('total_disbursements', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (cycle) q = q.eq('cycle', Number(cycle))
  const { data, error } = await q
  if (error) throw new Error(`getDarkMoneyOrgs: ${error.message}`)

  // Committee types: O=Super PAC (independent-expenditure-only), U=Super PAC (non-contribution),
  // V=Hybrid PAC (has non-contribution account), W=Hybrid PAC (has contribution account)
  return (data || []).map(c => {
    const type = (c.committee_type === 'O' || c.committee_type === 'U') ? 'super_pac' : '501c4'
    let disclosureLevel = 'dark'
    if (c.connected_org_name && c.connected_org_name !== 'NONE') disclosureLevel = 'disclosed'
    else if (c.committee_type === 'O' || c.committee_type === 'U') disclosureLevel = 'partial'

    return {
      id: c.committee_id,
      name: c.name,
      type,
      totalSpend: Number(c.total_disbursements) || 0,
      cycle: c.cycle || 2024,
      disclosureLevel,
      connectedOrg: c.connected_org_name || null,
      treasurer: null,
      state: null,
      linkedCandidates: 0,
      issues: inferIssues(c.name),
    }
  })
}

/**
 * Trace the funding chain for a committee — receipts in + transfers out.
 */
export async function traceDarkMoneyFlow(committeeId) {
  const db = ensure()

  const [committeeRes, transfersRes, receiptsRes] = await Promise.all([
    db.from('pac_committees')
      .select('committee_id, name, committee_type')
      .eq('committee_id', committeeId)
      .limit(1),
    db.from('committee_transfers')
      .select('to_committee_id, transfer_amount, transfer_date')
      .eq('from_committee_id', committeeId)
      .order('transfer_amount', { ascending: false })
      .limit(20),
    db.from('contributions')
      .select('contributor_name, contributor_employer, amount, date, committee_id')
      .eq('committee_id', committeeId)
      .order('amount', { ascending: false })
      .limit(20),
  ])

  if (committeeRes.error) throw new Error(`traceDarkMoneyFlow/committee: ${committeeRes.error.message}`)
  const committee = committeeRes.data?.[0] || { committee_id: committeeId, name: committeeId }

  // Enrich transfer targets with names
  const targetIds = (transfersRes.data || []).map(t => t.to_committee_id).filter(Boolean)
  let targetNames = {}
  if (targetIds.length > 0) {
    const { data: targets } = await db
      .from('pac_committees')
      .select('committee_id, name')
      .in('committee_id', targetIds)
    targetNames = Object.fromEntries((targets || []).map(t => [t.committee_id, t.name]))
  }

  const flow = []

  // Receipts into this committee
  for (const r of (receiptsRes.data || []).slice(0, 10)) {
    flow.push({
      from: r.contributor_name || r.contributor_employer || 'Unknown Donor',
      to: committee.name,
      amount: Number(r.amount) || 0,
      relationship: 'CONTRIBUTED_TO',
      disclosure_level: r.contributor_name ? 'disclosed' : 'dark',
      date: r.date,
    })
  }

  // Transfers out
  for (const t of (transfersRes.data || []).slice(0, 10)) {
    flow.push({
      from: committee.name,
      to: targetNames[t.to_committee_id] || t.to_committee_id || 'Unknown Recipient',
      amount: Number(t.transfer_amount) || 0,
      relationship: 'TRANSFERRED_TO',
      disclosure_level: targetNames[t.to_committee_id] ? 'partial' : 'dark',
      date: t.transfer_date,
    })
  }

  return {
    committee: { id: committeeId, name: committee.name, type: committee.committee_type },
    flow,
    totalTraceable: (receiptsRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    totalDisbursed: (transfersRes.data || []).reduce((s, t) => s + (Number(t.transfer_amount) || 0), 0),
  }
}

/**
 * Dark money exposure for a candidate — independent expenditures targeting them.
 */
export async function getCandidateDarkMoneyExposure(candidateId) {
  const db = ensure()
  const { data, error } = await db
    .from('independent_expenditures')
    .select('committee_id, support_oppose, expenditure_amount, expenditure_date, payee_name')
    .eq('candidate_id', candidateId)
    .order('expenditure_amount', { ascending: false })
    .limit(500)
  if (error) throw new Error(`getCandidateDarkMoneyExposure: ${error.message}`)

  let totalSupport = 0
  let totalOppose = 0
  const byCommittee = new Map()

  for (const e of (data || [])) {
    const amt = Number(e.expenditure_amount) || 0
    if (e.support_oppose === 'S') totalSupport += amt
    else if (e.support_oppose === 'O') totalOppose += amt

    const cid = e.committee_id || 'unknown'
    const cur = byCommittee.get(cid) || { committeeId: cid, support: 0, oppose: 0 }
    if (e.support_oppose === 'S') cur.support += amt
    else cur.oppose += amt
    byCommittee.set(cid, cur)
  }

  // Enrich committee names
  const cids = [...byCommittee.keys()].filter(c => c !== 'unknown')
  if (cids.length > 0) {
    const { data: pacs } = await db
      .from('pac_committees')
      .select('committee_id, name, committee_type')
      .in('committee_id', cids)
    const pacMap = new Map((pacs || []).map(p => [p.committee_id, p]))
    for (const [cid, entry] of byCommittee) {
      const pac = pacMap.get(cid)
      entry.name = pac?.name || cid
      entry.disclosureLevel = (pac?.committee_type === 'V' || pac?.committee_type === 'W') ? 'dark' : (pac?.committee_type === 'O' || pac?.committee_type === 'U') ? 'partial' : 'disclosed'
    }
  }

  const committees = [...byCommittee.values()]
    .sort((a, b) => (b.support + b.oppose) - (a.support + a.oppose))

  return {
    candidateId,
    totalSupport,
    totalOppose,
    net: totalSupport - totalOppose,
    committees,
    darkMoneyTotal: committees
      .filter(c => c.disclosureLevel === 'dark')
      .reduce((s, c) => s + c.support + c.oppose, 0),
  }
}

/**
 * Infer funding source for a committee from its name and connections.
 */
export async function inferFundingSource(committeeId) {
  const db = ensure()
  const { data, error } = await db
    .from('pac_committees')
    .select('committee_id, name, connected_org_name, committee_type')
    .eq('committee_id', committeeId)
    .limit(1)
  if (error) throw new Error(`inferFundingSource: ${error.message}`)

  const committee = data?.[0]
  if (!committee) return { committeeId, likelyIndustry: 'Unknown', confidence: 0, evidenceNotes: [], disclaimer: 'Analytical inference — not legal conclusion.' }

  const name = committee.name || ''
  const issues = inferIssues(name)

  const INDUSTRY_MAP = {
    'Defense, national security': { industry: 'Defense Contractors', confidence: 74 },
    'Healthcare, drug pricing': { industry: 'Pharmaceutical Industry', confidence: 68 },
    'Energy, environment': { industry: 'Fossil Fuel Industry', confidence: 71 },
    'Financial regulation': { industry: 'Finance & Banking', confidence: 69 },
    'Technology, antitrust': { industry: 'Big Technology Companies', confidence: 65 },
    'General conservative/liberal advocacy': { industry: 'Mixed/Unknown Industry', confidence: 40 },
    'General political advocacy': { industry: 'Unknown Industry', confidence: 30 },
  }

  const inferred = INDUSTRY_MAP[issues] || { industry: 'Unknown', confidence: 25 }

  return {
    committeeId,
    committeeName: name,
    likelyIndustry: inferred.industry,
    confidence: inferred.confidence,
    evidenceNotes: [
      `Committee focus inferred from name: "${name}"`,
      `Issue alignment: ${issues}`,
      committee.connected_org_name ? `Connected organization: ${committee.connected_org_name}` : 'No connected organization disclosed',
    ],
    disclaimer: 'Analytical inference — not legal conclusion. Based on public filings and pattern analysis.',
  }
}

/**
 * Dark money flow for Sankey visualization — reads committee_transfers + pac_committees.
 */
export async function getDarkMoneyFlowData(cycle = null) {
  const db = ensure()

  // Get dark money orgs (Super PACs / 501c4s) with transfers
  let q = db
    .from('committee_transfers')
    .select('from_committee_id, to_committee_id, transfer_amount, cycle')
    .order('transfer_amount', { ascending: false })
    .limit(200)
  if (cycle) q = q.eq('cycle', Number(cycle))
  const { data: transfers, error } = await q
  if (error) throw new Error(`getDarkMoneyFlowData: ${error.message}`)

  // Collect all committee IDs for name lookup
  const allIds = new Set()
  for (const t of (transfers || [])) {
    if (t.from_committee_id) allIds.add(t.from_committee_id)
    if (t.to_committee_id) allIds.add(t.to_committee_id)
  }
  const { data: pacs } = await db
    .from('pac_committees')
    .select('committee_id, name, committee_type')
    .in('committee_id', [...allIds])
  const pacMap = new Map((pacs || []).map(p => [p.committee_id, p]))

  // Build Sankey nodes + links
  const nodes = []
  const nodeIndex = {}
  function addNode(id, name, type, amount = 0) {
    if (!nodeIndex[id]) {
      nodeIndex[id] = nodes.length
      nodes.push({ id, name, type, amount })
    }
    return nodeIndex[id]
  }

  const links = []
  for (const t of (transfers || [])) {
    const fromPac = pacMap.get(t.from_committee_id)
    const toPac = pacMap.get(t.to_committee_id)

    const fromName = fromPac?.name || t.from_committee_id
    const toName = toPac?.name || t.to_committee_id
    const fromType = (fromPac?.committee_type === 'V' || fromPac?.committee_type === 'W') ? '501c4' : (fromPac?.committee_type === 'O' || fromPac?.committee_type === 'U') ? 'super_pac' : 'committee'
    const toType = (toPac?.committee_type === 'V' || toPac?.committee_type === 'W') ? '501c4' : (toPac?.committee_type === 'O' || toPac?.committee_type === 'U') ? 'super_pac' : 'committee'

    const fromIdx = addNode(t.from_committee_id, fromName, fromType, Number(t.transfer_amount) || 0)
    const toIdx = addNode(t.to_committee_id, toName, toType, 0)

    const disclosureLevel = fromType === '501c4' ? 'dark' : fromType === 'super_pac' ? 'partial' : 'disclosed'
    links.push({
      source: t.from_committee_id,
      target: t.to_committee_id,
      amount: Number(t.transfer_amount) || 0,
      disclosure_level: disclosureLevel,
    })
  }

  return { nodes, links, cycle: cycle || new Date().getFullYear() }
}
