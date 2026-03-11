import { Router } from 'express'
import { searchContracts, searchGrants, getAgencySpending } from '../services/usaSpending.js'

const router = Router()

router.get('/contracts', async (req, res) => {
  try {
    const { keyword, agency, limit } = req.query
    const data = await searchContracts({ keyword, agency, limit: parseInt(limit) || 10 })
    
    // Determine the fiscal year from the first contract (if any)
    const fiscalYear = data.length > 0 && data[0].fiscalYear ? data[0].fiscalYear : null
    
    res.json({ 
      success: true, 
      data,
      fiscalYear,
      count: data.length
    })
  } catch (e) {
    console.error('spending/contracts error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch contract data' })
  }
})

router.get('/grants', async (req, res) => {
  try {
    const { keyword, limit } = req.query
    const data = await searchGrants({ keyword, limit: parseInt(limit) || 10 })
    res.json({ success: true, data })
  } catch (e) {
    console.error('spending/grants error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch grants data' })
  }
})

router.get('/agency', async (req, res) => {
  try {
    const { year } = req.query
    // If no year provided, service will use current fiscal year
    const data = await getAgencySpending(year ? parseInt(year) : null)
    res.json({ success: true, data })
  } catch (e) {
    console.error('spending/agency error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch agency spending data' })
  }
})

export default router
