import {
  searchCommittees,
  searchCandidates,
  getCandidateContributions,
  getCommitteeContributions,
  getDonorNetwork,
  getTopDonorsByEmployer,
  getCandidateComparison,
  getPACSpending
} from '../services/fec.js'

export async function runDonorAgent({ keywords, entities, query }) {
  const keyword = (keywords || []).join(' ') || (entities || [])[0] || query || ''

  try {
    // Enhanced search with multiple data sources
    const [committees, candidates, topDonors] = await Promise.all([
      searchCommittees({ keyword, limit: 10 }),
      searchCandidates({ name: keyword, limit: 8 }),
      getTopDonorsByEmployer(keyword, 10),
    ])

    // Get additional data for the first candidate and committee if available
    let candidateContributions = []
    let committeeContributions = []
    let donorNetwork = null
    let pacSpending = null

    if (candidates.length > 0) {
      const topCandidate = candidates[0]
      candidateContributions = await getCandidateContributions(topCandidate.candidate_id, 10, 1000)
    }

    if (committees.length > 0) {
      const topCommittee = committees[0]
      committeeContributions = await getCommitteeContributions(topCommittee.committee_id, 10, 1000)

      // Get PAC spending for the top committee
      pacSpending = await getPACSpending(topCommittee.committee_id, 10)
    }

    // Try to get donor network if keyword looks like a person name
    if (keyword.split(' ').length >= 2 && !keyword.includes('inc') && !keyword.includes('llc')) {
      try {
        donorNetwork = await getDonorNetwork(keyword, 15)
      } catch (e) {
        // Silently fail if donor network not found
      }
    }

    // Analyze relationships and patterns
    const analysis = analyzeDonorPatterns({
      committees,
      candidates,
      topDonors,
      candidateContributions,
      committeeContributions,
      donorNetwork,
    })

    return {
      committees: committees.map(c => ({
        name: c.name,
        type: c.committee_type_full,
        party: c.party_full,
        totalReceipts: c.receipts,
        totalDisbursements: c.disbursements,
        state: c.state,
        id: c.committee_id,
        cashOnHand: c.cash_on_hand,
        designation: c.designation,
      })),
      candidates: candidates.map(c => ({
        name: c.name,
        office: c.office_full,
        party: c.party_full,
        state: c.state,
        totalRaised: c.receipts,
        electionYear: c.election_years?.[0],
        candidate_id: c.candidate_id,
        district: c.district,
        incumbent: c.incumbent_challenge_full,
      })),
      topDonors: topDonors.map(d => ({
        name: d.contributor_name,
        employer: d.contributor_employer,
        occupation: d.contributor_occupation,
        amount: d.contribution_receipt_amount,
        date: d.contribution_receipt_date,
        candidate: d.candidate?.name,
        committee: d.committee?.name,
      })),
      candidateContributions: candidateContributions.map(c => ({
        donor: c.contributor_name,
        employer: c.contributor_employer,
        amount: c.contribution_receipt_amount,
        date: c.contribution_receipt_date,
        state: c.contributor_state,
      })),
      committeeContributions: committeeContributions.map(c => ({
        donor: c.contributor_name,
        employer: c.contributor_employer,
        amount: c.contribution_receipt_amount,
        date: c.contribution_receipt_date,
        state: c.contributor_state,
      })),
      donorNetwork: donorNetwork ? {
        donor: donorNetwork.donor,
        totalContributions: donorNetwork.totalContributions,
        totalAmount: donorNetwork.totalAmount,
        recipients: donorNetwork.recipients,
      } : null,
      pacSpending: pacSpending ? {
        committee_id: pacSpending.committee_id,
        total_disbursements: pacSpending.total_disbursements,
        categorized: pacSpending.categorized,
      } : null,
      analysis,
      summary: generateSummary({
        keyword,
        committeesCount: committees.length,
        candidatesCount: candidates.length,
        topDonorsCount: topDonors.length,
        analysis,
      }),
    }
  } catch (e) {
    console.error('donorAgent error:', e.message)
    return {
      committees: [],
      candidates: [],
      topDonors: [],
      analysis: { error: e.message },
      summary: `Error analyzing donor data: ${e.message}`
    }
  }
}

function analyzeDonorPatterns(data) {
  const { committees, candidates, topDonors, candidateContributions, committeeContributions, donorNetwork } = data

  const analysis = {
    totalFunds: 0,
    topIndustries: [],
    politicalLeaning: 'neutral',
    networkStrength: 'weak',
    notablePatterns: [],
  }

  // Calculate total funds
  const committeeFunds = committees.reduce((sum, c) => sum + (parseFloat(c.totalReceipts) || 0), 0)
  const candidateFunds = candidates.reduce((sum, c) => sum + (parseFloat(c.totalRaised) || 0), 0)
  analysis.totalFunds = committeeFunds + candidateFunds

  // Analyze political leaning based on party distribution
  const partyCounts = {
    democrat: 0,
    republican: 0,
    other: 0,
  }

  committees.forEach(c => {
    const party = (c.party || '').toLowerCase()
    if (party.includes('democrat')) partyCounts.democrat++
    else if (party.includes('republican')) partyCounts.republican++
    else partyCounts.other++
  })

  candidates.forEach(c => {
    const party = (c.party || '').toLowerCase()
    if (party.includes('democrat')) partyCounts.democrat++
    else if (party.includes('republican')) partyCounts.republican++
    else partyCounts.other++
  })

  if (partyCounts.democrat > partyCounts.republican * 2) analysis.politicalLeaning = 'strongly democratic'
  else if (partyCounts.democrat > partyCounts.republican) analysis.politicalLeaning = 'democratic'
  else if (partyCounts.republican > partyCounts.democrat * 2) analysis.politicalLeaning = 'strongly republican'
  else if (partyCounts.republican > partyCounts.democrat) analysis.politicalLeaning = 'republican'

  // Analyze network strength
  const totalConnections = committees.length + candidates.length + (donorNetwork?.recipients?.length || 0)
  if (totalConnections > 20) analysis.networkStrength = 'strong'
  else if (totalConnections > 10) analysis.networkStrength = 'moderate'

  // Identify notable patterns
  if (committeeContributions.length > 0) {
    const avgContribution = committeeContributions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0) / committeeContributions.length
    if (avgContribution > 5000) analysis.notablePatterns.push('High average contribution amount')
  }

  if (candidateContributions.length > 0) {
    const recentContributions = candidateContributions.filter(c => {
      const date = new Date(c.date)
      const now = new Date()
      const sixMonthsAgo = new Date(now.setMonth(now.getMonth() - 6))
      return date > sixMonthsAgo
    })
    if (recentContributions.length > 5) analysis.notablePatterns.push('Active recent donor activity')
  }

  // Identify top industries from employer data
  const employerCounts = {}
  topDonors.forEach(d => {
    if (d.employer) {
      employerCounts[d.employer] = (employerCounts[d.employer] || 0) + 1
    }
  })

  analysis.topIndustries = Object.entries(employerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([employer, count]) => ({ employer, count }))

  return analysis
}

function generateSummary(data) {
  const { keyword, committeesCount, candidatesCount, topDonorsCount, analysis } = data

  const parts = []

  if (committeesCount > 0 || candidatesCount > 0) {
    parts.push(`Found ${committeesCount} political committees and ${candidatesCount} candidates related to "${keyword}".`)
  }

  if (topDonorsCount > 0) {
    parts.push(`Identified ${topDonorsCount} top donors from this sector.`)
  }

  if (analysis.totalFunds > 0) {
    const fundsFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(analysis.totalFunds)
    parts.push(`Total political funds: ${fundsFormatted}.`)
  }

  if (analysis.politicalLeaning !== 'neutral') {
    parts.push(`Political leaning: ${analysis.politicalLeaning}.`)
  }

  if (analysis.networkStrength !== 'weak') {
    parts.push(`Network strength: ${analysis.networkStrength}.`)
  }

  if (analysis.notablePatterns.length > 0) {
    parts.push(`Notable patterns: ${analysis.notablePatterns.join(', ')}.`)
  }

  if (analysis.topIndustries.length > 0) {
    const industries = analysis.topIndustries.map(i => i.employer).join(', ')
    parts.push(`Top contributing industries: ${industries}.`)
  }

  return parts.join(' ')
}
