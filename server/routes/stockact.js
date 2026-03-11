import { Router } from 'express'
import {
  getRecentStockTrades,
  detectStockActViolations,
  getStockTradesByPolitician,
  getMarketOutperformance,
  getViolationWatchlist,
} from '../services/stockAct.js'

const router = Router()

// GET /api/stockact/recent?chamber=senate&limit=50
router.get('/recent', async (req, res) => {
  try {
    const { chamber, limit } = req.query
    const data = await getRecentStockTrades(chamber || null, parseInt(limit) || 50)
    res.json({ success: true, data })
  } catch (e) {
    console.error('stockact/recent error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch recent stock trades' })
  }
})

// GET /api/stockact/violations
router.get('/violations', async (req, res) => {
  try {
    const trades = await getRecentStockTrades(null, 100)
    // Filter trades that have ticker info for violation detection
    const tradeable = trades.filter(t => t.ticker)
    const violations = await detectStockActViolations(tradeable)
    res.json({ success: true, data: violations, total: violations.length })
  } catch (e) {
    console.error('stockact/violations error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to detect STOCK Act violations' })
  }
})

// GET /api/stockact/politician/:name
router.get('/politician/:name', async (req, res) => {
  try {
    const { chamber } = req.query
    const data = await getStockTradesByPolitician(
      decodeURIComponent(req.params.name),
      chamber || null
    )
    res.json({ success: true, data })
  } catch (e) {
    console.error('stockact/politician error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch politician trades' })
  }
})

// GET /api/stockact/politician/:name/performance
router.get('/politician/:name/performance', async (req, res) => {
  try {
    const data = await getMarketOutperformance(decodeURIComponent(req.params.name))
    res.json({ success: true, data })
  } catch (e) {
    console.error('stockact/performance error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch performance data' })
  }
})

// GET /api/stockact/watchlist
router.get('/watchlist', async (req, res) => {
  try {
    const data = await getViolationWatchlist()
    res.json({ success: true, data })
  } catch (e) {
    console.error('stockact/watchlist error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch watchlist' })
  }
})

// GET /api/stockact/companies/most-traded
router.get('/companies/most-traded', async (req, res) => {
  try {
    const trades = await getRecentStockTrades(null, 200)

    // Aggregate by ticker
    const byTicker = {}
    for (const t of trades) {
      const ticker = t.ticker || 'UNKNOWN'
      if (!byTicker[ticker]) {
        byTicker[ticker] = { ticker, company: t.company || ticker, tradeCount: 0, politicians: new Set(), latestDate: null }
      }
      byTicker[ticker].tradeCount++
      if (t.politician) byTicker[ticker].politicians.add(t.politician)
      if (t.transactionDate || t.date) {
        const d = t.transactionDate || t.date
        if (!byTicker[ticker].latestDate || d > byTicker[ticker].latestDate) {
          byTicker[ticker].latestDate = d
        }
      }
    }

    const sorted = Object.values(byTicker)
      .map(t => ({ ...t, politicians: t.politicians.size }))
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, 20)

    res.json({ success: true, data: sorted })
  } catch (e) {
    console.error('stockact/most-traded error:', e.message)
    res.status(500).json({ success: false, error: 'Failed to fetch most-traded companies' })
  }
})

export default router
