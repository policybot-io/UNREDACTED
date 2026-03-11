// Express proxy route for FastAPI AI Agent service
import { Router } from 'express'
import axios from 'axios'

const router = Router()

// FastAPI service URL
const AI_AGENT_URL = process.env.AI_AGENT_URL || 'http://localhost:8000'

// Create axios instance with timeout
const aiAgentClient = axios.create({
  baseURL: AI_AGENT_URL,
  timeout: 30000, // 30 second timeout for AI processing
  headers: {
    'Content-Type': 'application/json',
  },
})

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const response = await aiAgentClient.get('/health')
    res.json({
      success: true,
      ai_service: response.data,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'AI agent service unavailable',
      details: error.message,
    })
  }
})

// Donor agent endpoint
router.post('/donor', async (req, res) => {
  try {
    const { query, context } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      })
    }

    const response = await aiAgentClient.post('/api/agent/donor', {
      query,
      context,
    })

    res.json({
      success: true,
      ...response.data,
    })
  } catch (error) {
    console.error('AI donor agent error:', error.message)

    if (error.response) {
      // AI service returned an error
      res.status(error.response.status).json({
        success: false,
        error: 'AI agent service error',
        details: error.response.data,
      })
    } else if (error.request) {
      // No response from AI service
      res.status(503).json({
        success: false,
        error: 'AI agent service unavailable',
        details: 'Service did not respond',
      })
    } else {
      // Other error
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      })
    }
  }
})

// Corruption agent endpoint
router.post('/corruption', async (req, res) => {
  try {
    const { query, context } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      })
    }

    const response = await aiAgentClient.post('/api/agent/corruption', {
      query,
      context,
    })

    res.json({
      success: true,
      ...response.data,
    })
  } catch (error) {
    console.error('AI corruption agent error:', error.message)

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: 'AI agent service error',
        details: error.response.data,
      })
    } else if (error.request) {
      res.status(503).json({
        success: false,
        error: 'AI agent service unavailable',
        details: 'Service did not respond',
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      })
    }
  }
})

// Multi-agent orchestration endpoint
router.post('/orchestrate', async (req, res) => {
  try {
    const {
      query,
      use_donor_agent = true,
      use_corruption_agent = true,
      use_policy_agent = false,
    } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      })
    }

    const response = await aiAgentClient.post('/api/agent/orchestrate', {
      query,
      use_donor_agent,
      use_corruption_agent,
      use_policy_agent,
    })

    res.json({
      success: true,
      ...response.data,
    })
  } catch (error) {
    console.error('AI orchestration error:', error.message)

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: 'AI agent service error',
        details: error.response.data,
      })
    } else if (error.request) {
      res.status(503).json({
        success: false,
        error: 'AI agent service unavailable',
        details: 'Service did not respond',
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      })
    }
  }
})

// Data endpoints (proxied to AI service)
router.get('/data/donor/:donor_name', async (req, res) => {
  try {
    const { donor_name } = req.params

    const response = await aiAgentClient.get(`/api/data/donor/${donor_name}`)

    res.json({
      success: true,
      ...response.data,
    })
  } catch (error) {
    console.error('AI data endpoint error:', error.message)

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: 'AI agent service error',
        details: error.response.data,
      })
    } else if (error.request) {
      res.status(503).json({
        success: false,
        error: 'AI agent service unavailable',
        details: 'Service did not respond',
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      })
    }
  }
})

router.get('/data/candidate/:candidate_id', async (req, res) => {
  try {
    const { candidate_id } = req.params

    const response = await aiAgentClient.get(`/api/data/candidate/${candidate_id}`)

    res.json({
      success: true,
      ...response.data,
    })
  } catch (error) {
    console.error('AI data endpoint error:', error.message)

    if (error.response) {
      res.status(error.response.status).json({
        success: false,
        error: 'AI agent service error',
        details: error.response.data,
      })
    } else if (error.request) {
      res.status(503).json({
        success: false,
        error: 'AI agent service unavailable',
        details: 'Service did not respond',
      })
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
      })
    }
  }
})

// Fallback endpoint - if AI service is down, use simple analysis
router.post('/fallback/donor', async (req, res) => {
  try {
    const { query, context } = req.body

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required',
      })
    }

    // Use the existing donorAgent as fallback
    const { runDonorAgent } = await import('../agents/donorAgent.js')
    const result = await runDonorAgent({
      query,
      keywords: [query],
      entities: context?.entities || [],
    })

    res.json({
      success: true,
      data: result,
      summary: result.summary || 'Analysis completed using fallback method',
      sources: ['FEC API', 'Internal Database'],
    })
  } catch (error) {
    console.error('Fallback donor agent error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Fallback analysis failed',
      details: error.message,
    })
  }
})

export default router
