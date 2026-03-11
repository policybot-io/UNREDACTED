import { Router } from 'express'
import {
  setRuntimeSettings,
  getRuntimeSettings,
  clearClientCache,
  getProviderStatus,
} from '../services/aiService.js'

const router = Router()

// ─── GET /api/settings ────────────────────────────────────────────────────────
// Returns current provider status + active settings (keys are masked)
router.get('/', (req, res) => {
  try {
    const status = getProviderStatus()
    const runtime = getRuntimeSettings()

    // Mask all key values for security — only send whether they are set
    const masked = {}
    for (const [k, v] of Object.entries(runtime)) {
      if (k.toLowerCase().includes('key') || k.toLowerCase().includes('password')) {
        masked[k] = v ? '***CONFIGURED***' : ''
      } else {
        masked[k] = v
      }
    }

    res.json({
      success: true,
      providers: status,
      settings: masked,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── POST /api/settings ───────────────────────────────────────────────────────
// Accepts runtime overrides for API keys and provider selection.
// Keys are stored in memory only — never persisted to disk.
router.post('/', (req, res) => {
  try {
    const allowed = [
      'AI_PROVIDER',
      'AI_MODEL',
      'OPENAI_API_KEY',
      'DEEPSEEK_API_KEY',
      'ANTHROPIC_API_KEY',
      'GROQ_API_KEY',
      'QWEN_API_KEY',
      'QWEN_BASE_URL',
      'XAI_API_KEY',
      'OLLAMA_BASE_URL',
      'FEC_API_KEY',
    ]

    const incoming = req.body || {}
    const updates = {}

    for (const key of allowed) {
      if (incoming[key] !== undefined && incoming[key] !== null) {
        // Allow clearing a key by sending empty string
        updates[key] = incoming[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid settings provided' })
    }

    // Clear cached clients for affected providers so they are re-initialised
    if (updates.AI_PROVIDER) clearClientCache()
    if (updates.OPENAI_API_KEY)    clearClientCache('openai')
    if (updates.DEEPSEEK_API_KEY)  clearClientCache('deepseek')
    if (updates.ANTHROPIC_API_KEY) clearClientCache('anthropic')
    if (updates.GROQ_API_KEY)      clearClientCache('groq')
    if (updates.QWEN_API_KEY)      clearClientCache('qwen')
    if (updates.XAI_API_KEY)       clearClientCache('xai')
    if (updates.OLLAMA_BASE_URL)   clearClientCache('ollama')

    setRuntimeSettings(updates)

    const status = getProviderStatus()
    res.json({
      success: true,
      message: `Updated ${Object.keys(updates).length} setting(s)`,
      providers: status,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── POST /api/settings/test ──────────────────────────────────────────────────
// Quick connectivity test for the active provider
router.post('/test', async (req, res) => {
  try {
    const { quickCompletion } = await import('../services/aiService.js')
    const result = await quickCompletion(
      'You are a test assistant.',
      'Reply with exactly: {"status":"ok"}',
      { json: true, maxTokens: 20 }
    )
    res.json({ success: true, response: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
