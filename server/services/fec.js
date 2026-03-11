import axios from 'axios'

const BASE = 'https://api.open.fec.gov/v1'
const KEY = process.env.FEC_API_KEY || 'DEMO_KEY'

export async function searchCommittees({ keyword, limit = 10 }) {
  const res = await axios.get(`${BASE}/committees/`, {
    params: { q: keyword, api_key: KEY, per_page: limit, sort: '-receipts' },
  })
  return res.data.results
}

export async function getCommitteeReceipts(committeeId, limit = 20) {
  const res = await axios.get(`${BASE}/schedules/schedule_b/`, {
    params: { committee_id: committeeId, api_key: KEY, per_page: limit, sort: '-disbursement_date' },
  })
  return res.data.results
}

// Get current election cycle (most recent even year)
function getCurrentElectionYear() {
  const year = new Date().getFullYear()
  // Presidential/congressional elections are on even years
  // If current year is odd, use the previous even year
  return year % 2 === 0 ? year : year - 1
}

export async function searchCandidates({ name, office, state, limit = 10, electionYear }) {
  const year = electionYear || getCurrentElectionYear()
  const res = await axios.get(`${BASE}/candidates/search/`, {
    params: { q: name, office, state, api_key: KEY, per_page: limit, election_year: year },
  })
  return res.data.results
}

export async function getCandidateRaisedTotals(candidateId, electionYear) {
  const year = electionYear || getCurrentElectionYear()
  const res = await axios.get(`${BASE}/candidate/${candidateId}/totals/`, {
    params: { api_key: KEY, election_year: year },
  })
  return res.data.results?.[0]
}

// ========== PHASE 2: DONOR INTELLIGENCE FUNCTIONS ==========

export async function getCandidateContributions(candidateId, limit = 50, minAmount = 1000) {
  const res = await axios.get(`${BASE}/schedules/schedule_a/`, {
    params: {
      candidate_id: candidateId,
      api_key: KEY,
      per_page: limit,
      sort: '-contribution_receipt_amount',
      min_amount: minAmount,
      is_individual: true,
    },
  })
  return res.data.results || []
}

export async function getCommitteeContributions(committeeId, limit = 50, minAmount = 1000) {
  const res = await axios.get(`${BASE}/schedules/schedule_a/`, {
    params: {
      committee_id: committeeId,
      api_key: KEY,
      per_page: limit,
      sort: '-contribution_receipt_amount',
      min_amount: minAmount,
      is_individual: true,
    },
  })
  return res.data.results || []
}

export async function getTopDonorsByEmployer(employer, limit = 20, cycle = null) {
  const year = cycle || getCurrentElectionYear()
  const res = await axios.get(`${BASE}/schedules/schedule_a/`, {
    params: {
      contributor_employer: employer,
      api_key: KEY,
      per_page: limit,
      sort: '-contribution_receipt_amount',
      two_year_transaction_period: year,
    },
  })
  return res.data.results || []
}

export async function getDonorNetwork(donorName, limit = 30) {
  const res = await axios.get(`${BASE}/schedules/schedule_a/`, {
    params: {
      contributor_name: donorName,
      api_key: KEY,
      per_page: limit,
      sort: '-contribution_receipt_date',
    },
  })

  const contributions = res.data.results || []

  // Group by candidate/committee to show network
  const network = {
    donor: donorName,
    totalContributions: contributions.length,
    totalAmount: contributions.reduce((sum, c) => sum + (parseFloat(c.contribution_receipt_amount) || 0), 0),
    recipients: {},
  }

  contributions.forEach(contribution => {
    const candidate = contribution.candidate
    const committee = contribution.committee
    const amount = parseFloat(contribution.contribution_receipt_amount) || 0
    const date = contribution.contribution_receipt_date

    if (candidate?.candidate_id) {
      const key = `candidate:${candidate.candidate_id}`
      if (!network.recipients[key]) {
        network.recipients[key] = {
          type: 'candidate',
          id: candidate.candidate_id,
          name: candidate.name,
          party: candidate.party_full,
          totalAmount: 0,
          contributions: [],
        }
      }
      network.recipients[key].totalAmount += amount
      network.recipients[key].contributions.push({ amount, date })
    }

    if (committee?.committee_id) {
      const key = `committee:${committee.committee_id}`
      if (!network.recipients[key]) {
        network.recipients[key] = {
          type: 'committee',
          id: committee.committee_id,
          name: committee.name,
          totalAmount: 0,
          contributions: [],
        }
      }
      network.recipients[key].totalAmount += amount
      network.recipients[key].contributions.push({ amount, date })
    }
  })

  // Convert to array and sort by total amount
  network.recipients = Object.values(network.recipients)
    .sort((a, b) => b.totalAmount - a.totalAmount)

  return network
}

export async function getIndustryContributions(industryKeywords, limit = 50, cycle = null) {
  const year = cycle || getCurrentElectionYear()

  // This is a simplified implementation - in production, you'd want to
  // use a more sophisticated industry classification system
  const results = []

  for (const keyword of industryKeywords.slice(0, 3)) { // Limit to 3 keywords
    try {
      const res = await axios.get(`${BASE}/schedules/schedule_a/`, {
        params: {
          contributor_occupation: keyword,
          api_key: KEY,
          per_page: Math.floor(limit / industryKeywords.length),
          sort: '-contribution_receipt_amount',
          two_year_transaction_period: year,
        },
      })

      if (res.data.results) {
        results.push(...res.data.results.map(r => ({
          ...r,
          industry_keyword: keyword,
        })))
      }
    } catch (error) {
      console.error(`Error fetching contributions for industry keyword ${keyword}:`, error)
    }
  }

  return results
}

export async function getCandidateComparison(candidateIds, cycle = null) {
  const year = cycle || getCurrentElectionYear()
  const comparisons = []

  for (const candidateId of candidateIds) {
    try {
      // Get candidate info
      const candidateRes = await axios.get(`${BASE}/candidate/${candidateId}/`, {
        params: { api_key: KEY },
      })

      // Get totals
      const totalsRes = await axios.get(`${BASE}/candidate/${candidateId}/totals/`, {
        params: { api_key: KEY, election_year: year },
      })

      // Get top contributions
      const contributionsRes = await axios.get(`${BASE}/schedules/schedule_a/`, {
        params: {
          candidate_id: candidateId,
          api_key: KEY,
          per_page: 10,
          sort: '-contribution_receipt_amount',
          two_year_transaction_period: year,
        },
      })

      const candidate = candidateRes.data.results?.[0]
      const totals = totalsRes.data.results?.[0]
      const contributions = contributionsRes.data.results || []

      if (candidate) {
        comparisons.push({
          candidate_id: candidateId,
          name: candidate.name,
          party: candidate.party_full,
          state: candidate.state,
          office: candidate.office_full,
          totals: totals || {},
          top_contributions: contributions.slice(0, 5),
          total_raised: totals?.receipts || 0,
          cash_on_hand: totals?.cash_on_hand || 0,
        })
      }
    } catch (error) {
      console.error(`Error fetching data for candidate ${candidateId}:`, error)
    }
  }

  return comparisons.sort((a, b) => b.total_raised - a.total_raised)
}

export async function getPACSpending(committeeId, limit = 20) {
  const res = await axios.get(`${BASE}/schedules/schedule_b/`, {
    params: {
      committee_id: committeeId,
      api_key: KEY,
      per_page: limit,
      sort: '-disbursement_amount',
    },
  })

  const disbursements = res.data.results || []

  // Categorize disbursements
  const categorized = {
    candidate_support: [],
    operating_expenses: [],
    other: [],
  }

  disbursements.forEach(d => {
    const amount = parseFloat(d.disbursement_amount) || 0
    const purpose = d.disbursement_purpose?.toLowerCase() || ''

    if (purpose.includes('contribution') || purpose.includes('donation') || d.candidate) {
      categorized.candidate_support.push({
        ...d,
        amount,
        category: 'candidate_support',
      })
    } else if (purpose.includes('salary') || purpose.includes('rent') || purpose.includes('travel')) {
      categorized.operating_expenses.push({
        ...d,
        amount,
        category: 'operating_expenses',
      })
    } else {
      categorized.other.push({
        ...d,
        amount,
        category: 'other',
      })
    }
  })

  return {
    committee_id: committeeId,
    total_disbursements: disbursements.reduce((sum, d) => sum + (parseFloat(d.disbursement_amount) || 0), 0),
    categorized,
    raw_disbursements: disbursements,
  }
}
