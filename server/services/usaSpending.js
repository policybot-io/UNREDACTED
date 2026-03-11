import axios from 'axios'

const BASE = 'https://api.usaspending.gov/api/v2'

// Try to get contracts data with fiscal year fallback
async function tryGetContractsData({ keyword, keywords, agency, limit = 10 }) {
  const currentFiscalYear = getCurrentFiscalYear()
  
  // Try current fiscal year and previous 2 years
  for (let year = currentFiscalYear; year >= currentFiscalYear - 2; year--) {
    if (year < 2017) break;
    
    const filters = {
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [{ start_date: `${year}-10-01`, end_date: `${year + 1}-09-30` }],
    }
    
    // Accept either a keywords array (from agents) or a single keyword string (from routes)
    const kwArray = keywords?.length ? keywords : keyword ? [keyword] : null
    if (kwArray) filters.keywords = kwArray
    if (agency) filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }]

    try {
      const res = await axios.post(`${BASE}/search/spending_by_award/`, {
        filters,
        fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Award Date', 'Description'],
        limit,
        sort: 'Award Amount',
        order: 'desc',
      })
      
      if (res.data.results && res.data.results.length > 0) {
        console.log(`Found ${res.data.results.length} contracts for FY${year}`)
        // Add fiscal year to each result
        const resultsWithYear = res.data.results.map(result => ({
          ...result,
          fiscalYear: year
        }))
        return { results: resultsWithYear, fiscalYear: year }
      }
    } catch (e) {
      console.error(`Error fetching FY${year} contracts:`, e.message)
      // Continue to next year
    }
  }
  
  console.log(`No contract data found for FY${currentFiscalYear} or previous 2 years`)
  return { results: [], fiscalYear: currentFiscalYear }
}

export async function searchContracts({ keyword, keywords, agency, limit = 10 }) {
  const { results, fiscalYear } = await tryGetContractsData({ keyword, keywords, agency, limit })
  return results
}

// Get current fiscal year (Oct 1 - Sept 30)
function getCurrentFiscalYear() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-11
  // Fiscal year runs Oct 1 - Sept 30
  // If we're before October, we're in the previous fiscal year
  return month < 9 ? year - 1 : year
}

// Try to get data for a fiscal year, falling back to previous years if no data
async function tryGetFiscalYearData(targetYear, maxFallbackYears = 3) {
  for (let year = targetYear; year >= targetYear - maxFallbackYears; year--) {
    if (year < 2017) break; // USASpending data typically starts around 2017
    
    const startDate = `${year}-10-01`
    const endDate = `${year + 1}-09-30`
    
    try {
      const res = await axios.post(`${BASE}/search/spending_by_award/`, {
        filters: {
          award_type_codes: ['A', 'B', 'C', 'D', '02', '03', '04', '05'],
          time_period: [{ start_date: startDate, end_date: endDate }],
        },
        fields: ['Awarding Agency', 'Award Amount', 'Award Date'],
        limit: 100,
        sort: 'Award Amount',
        order: 'desc',
      })

      // Check if we got any results
      if (res.data.results && res.data.results.length > 0) {
        console.log(`Found data for FY${year} (${res.data.results.length} results)`)
        
        // Aggregate by agency
        const byAgency = {}
        res.data.results?.forEach(r => {
          const agency = r['Awarding Agency'] || 'Unknown'
          const amount = parseFloat(r['Award Amount'] || 0)
          if (!byAgency[agency]) {
            byAgency[agency] = { agency, totalAmount: 0, count: 0, fiscalYear: year }
          }
          byAgency[agency].totalAmount += amount
          byAgency[agency].count += 1
        })

        const agencies = Object.values(byAgency)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 20)
        
        return { agencies, fiscalYear: year }
      }
    } catch (e) {
      console.error(`Error fetching FY${year} data:`, e.message)
      // Continue to next year
    }
  }
  
  console.log(`No data found for FY${targetYear} or previous ${maxFallbackYears} years`)
  return { agencies: [], fiscalYear: targetYear }
}

export async function getAgencySpending(fiscalYear) {
  const targetYear = fiscalYear || getCurrentFiscalYear()
  const { agencies, fiscalYear: actualYear } = await tryGetFiscalYearData(targetYear)
  
  // Add fiscal year info to each agency for frontend display
  agencies.forEach(agency => {
    agency.fiscalYear = actualYear
  })
  
  return agencies
}

export async function searchGrants({ keyword, keywords, limit = 10 }) {
  const filters = {
    award_type_codes: ['02', '03', '04', '05'],
  }
  const kwArray = keywords?.length ? keywords : keyword ? [keyword] : null
  if (kwArray) filters.keywords = kwArray

  const res = await axios.post(`${BASE}/search/spending_by_award/`, {
    filters,
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Award Date', 'Description'],
    limit,
    sort: 'Award Amount',
    order: 'desc',
  })
  return res.data.results
}
