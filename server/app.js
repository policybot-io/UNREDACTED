import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'
dotenv.config()

import spendingRouter from './routes/spending.js'
import policyRouter from './routes/policy.js'
import donorsRouter from './routes/donors.js'
import agentRouter from './routes/agent.js'
import aiAgentRouter from './routes/ai_agent.js'
import feedRouter from './routes/feed.js'
import settingsRouter from './routes/settings.js'
import corruptionRouter from './routes/corruption.js'
import companiesRouter from './routes/companies.js'
import stockActRouter from './routes/stockact.js'
import darkMoneyRouter from './routes/darkmoney.js'

const app = express()

// CORS — permissive for API (same-origin on Vercel, cross-origin in local dev)
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    /\.vercel\.app$/,
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}))

app.use(express.json({ limit: '10kb' }))

// ── Rate limiters ────────────────────────────────────────────────────────────
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many queries. Please wait a moment before trying again.' },
})

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

// ── Request logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
  next()
})

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }))

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/spending',    generalLimiter, spendingRouter)
app.use('/api/policy',      generalLimiter, policyRouter)
app.use('/api/donors',      generalLimiter, donorsRouter)
app.use('/api/agent',       agentLimiter,   agentRouter)
app.use('/api/ai-agent',    agentLimiter,   aiAgentRouter)
app.use('/api/feed',        generalLimiter, feedRouter)
app.use('/api/settings',    generalLimiter, settingsRouter)
app.use('/api/corruption',  generalLimiter, corruptionRouter)
app.use('/api/companies',   generalLimiter, companiesRouter)
app.use('/api/stockact',    generalLimiter, stockActRouter)
app.use('/api/darkmoney',   generalLimiter, darkMoneyRouter)

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

export default app
