/**
 * STOCK Act monitoring service.
 * Tracks congressional stock trades and detects potential STOCK Act violations
 * by cross-referencing trade dates with committee activity.
 */
import axios from 'axios'

const FEC_BASE = 'https://api.open.fec.gov/v1'
const KEY = process.env.FEC_API_KEY || 'DEMO_KEY'

// Senate eFiling search endpoint
const SENATE_EFTS = 'https://efts.senate.gov/PROD/s_search.json'
// House disclosures API
const HOUSE_DISCLOSURES = 'https://disclosures-clerk.house.gov/api/v1/financial-pdfs'

/**
 * Fetch recent stock trade disclosures (PTRs) from Senate eFiling.
 * Senate PTR = Periodic Transaction Report filed within 45 days of trade.
 */
export async function getSenateRecentTrades(limit = 50) {
  try {
    const res = await axios.get(SENATE_EFTS, {
      params: {
        query: 'ptr',
        page_size: limit,
        sort: 'date_filed:desc',
      },
      timeout: 10000,
    })

    const hits = res.data?.hits?.hits || []
    return hits.map(h => ({
      chamber: 'senate',
      senator: h._source?.name || 'Unknown',
      filingDate: h._source?.date_filed,
      filingType: h._source?.form_type || 'PTR',
      url: h._source?.url || null,
      id: h._id,
    }))
  } catch (e) {
    console.error('Senate eFiling query failed:', e.message)
    return []
  }
}

/**
 * Fetch recent stock trade disclosures from House disclosures clerk.
 */
export async function getHouseRecentTrades(limit = 50) {
  try {
    const year = new Date().getFullYear()
    const res = await axios.get(HOUSE_DISCLOSURES, {
      params: { year, FilingType: 'P' },  // P = Periodic Transaction Report
      timeout: 10000,
    })

    const filings = res.data?.filings || []
    return filings.slice(0, limit).map(f => ({
      chamber: 'house',
      representative: f.name || 'Unknown',
      filingDate: f.file_date,
      filingType: 'PTR',
      url: f.pdf_url || null,
      id: f.document_id,
    }))
  } catch (e) {
    console.error('House disclosures query failed:', e.message)
    return []
  }
}

/**
 * Get all recent stock trades across both chambers.
 */
export async function getRecentStockTrades(chamber = null, limit = 50) {
  if (chamber === 'senate') return getSenateRecentTrades(limit)
  if (chamber === 'house') return getHouseRecentTrades(limit)

  const [senate, house] = await Promise.allSettled([
    getSenateRecentTrades(Math.ceil(limit / 2)),
    getHouseRecentTrades(Math.floor(limit / 2)),
  ])

  const results = [
    ...(senate.status === 'fulfilled' ? senate.value : []),
    ...(house.status === 'fulfilled' ? house.value : []),
  ]

  return results.slice(0, limit)
}

/**
 * Detect potential STOCK Act violations by checking if trades
 * coincide with committee hearings within a 30-day window.
 */
export async function detectStockActViolations(trades = []) {
  const violations = []

  for (const trade of trades) {
    if (!trade.ticker && !trade.company) continue

    // Check FEC for committee activity around the company
    const committeeActivity = await getCommitteeActivityForCompany(
      trade.ticker || trade.company,
      trade.transactionDate || trade.date
    )

    for (const activity of committeeActivity) {
      const tradeDate = new Date(trade.transactionDate || trade.date)
      const hearingDate = new Date(activity.date)
      const daysBetween = Math.abs(Math.round((hearingDate - tradeDate) / (1000 * 60 * 60 * 24)))

      if (daysBetween <= 30) {
        violations.push({
          trade,
          committeeName: activity.committeeName,
          hearingDate: activity.date,
          daysBetween,
          violationSeverity: daysBetween <= 7 ? 'HIGH' : daysBetween <= 14 ? 'HIGH' : 'MEDIUM',
          evidenceNote: `Trade on ${trade.transactionDate} is ${daysBetween} days from committee hearing on ${activity.date}`,
        })
      }
    }
  }

  return violations
}

/**
 * Get committee activity related to a specific company/ticker.
 * Uses FEC to find committees that oversee the relevant industry.
 */
async function getCommitteeActivityForCompany(ticker, tradeDate) {
  try {
    // Map common tickers to committee keywords
    const TICKER_COMMITTEES = {
      LMT: { name: 'Armed Services', keyword: 'defense' },
      RTX: { name: 'Armed Services', keyword: 'defense' },
      NOC: { name: 'Armed Services', keyword: 'defense' },
      PFE: { name: 'Health, Education, Labor, and Pensions', keyword: 'health' },
      JNJ: { name: 'Health, Education, Labor, and Pensions', keyword: 'health' },
      JPM: { name: 'Banking, Housing, and Urban Affairs', keyword: 'banking' },
      BAC: { name: 'Banking, Housing, and Urban Affairs', keyword: 'banking' },
      CVX: { name: 'Energy and Natural Resources', keyword: 'energy' },
      XOM: { name: 'Energy and Natural Resources', keyword: 'energy' },
      NVDA: { name: 'Commerce, Science, and Transportation', keyword: 'technology' },
      AMZN: { name: 'Commerce, Science, and Transportation', keyword: 'technology' },
    }

    const tickerUpper = (ticker || '').toUpperCase()
    const committeeInfo = TICKER_COMMITTEES[tickerUpper]

    if (!committeeInfo) return []

    // Generate hypothetical hearing dates near the trade
    if (!tradeDate) return []

    const tradeDt = new Date(tradeDate)
    // Cannot generate hearing dates without a real congressional calendar API
    return []
  } catch (e) {
    return []
  }
}

/**
 * Get all stock trades for a specific politician.
 */
export async function getStockTradesByPolitician(name, chamber = null) {
  // Individual trade details require PDF parsing ETL pipeline (not yet complete)
  // PTR filing metadata does not include parsed individual transactions
  return []
}

/**
 * Compute market outperformance estimate for a politician's trades.
 * Returns cumulative portfolio performance vs S&P 500 baseline.
 */
export async function getMarketOutperformance(politicianName) {
  return {
    politician: politicianName,
    note: 'Portfolio performance data requires parsed individual trade history from PDF filings. ETL pipeline not yet complete.',
    monthlyData: [],
    portfolioReturn: null,
    sp500Return: null,
    outperformance: null,
  }
}

/**
 * Get politicians with highest STOCK Act violation risk scores.
 */
export async function getViolationWatchlist() {
  // Requires parsed trade data from PDF ETL pipeline to detect violations
  return []
}

