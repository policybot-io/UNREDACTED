import OpenAI from 'openai'

/**
 * UNREDACTED AI Service
 *
 * Supports multiple AI providers via a unified interface.
 * Provider priority: AI_PROVIDER env var → settings store → 'deepseek' default
 *
 * Supported providers:
 *   deepseek  — DeepSeek Chat (OpenAI-compatible)
 *   openai    — OpenAI GPT-4o / GPT-4-turbo
 *   anthropic — Anthropic Claude 3.x
 *   groq      — Groq (Llama 3.3 70b, Mixtral, etc.)
 *   ollama    — Local Ollama (llama3, mistral, qwen2.5, etc.)
 *   qwen      — Alibaba Qwen via OpenAI-compatible API
 *   xai       — xAI Grok
 */

// ─── Provider client cache ────────────────────────────────────────────────────
const _clients = {}

// ─── In-memory settings store (overrides env vars when set via API) ───────────
let _runtimeSettings = {}

export function setRuntimeSettings(settings) {
  _runtimeSettings = { ..._runtimeSettings, ...settings }
}

export function getRuntimeSettings() {
  return { ..._runtimeSettings }
}

function getSetting(key) {
  return _runtimeSettings[key] || process.env[key]
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function getOpenAIClient() {
  if (!_clients.openai) {
    const key = getSetting('OPENAI_API_KEY')
    if (!key) throw new Error('OPENAI_API_KEY not set')
    _clients.openai = new OpenAI({ apiKey: key })
  }
  return _clients.openai
}

function getDeepSeekClient() {
  if (!_clients.deepseek) {
    const key = getSetting('DEEPSEEK_API_KEY')
    if (!key) throw new Error('DEEPSEEK_API_KEY not set')
    _clients.deepseek = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.deepseek.com/v1',
    })
  }
  return _clients.deepseek
}

function getGroqClient() {
  if (!_clients.groq) {
    const key = getSetting('GROQ_API_KEY')
    if (!key) throw new Error('GROQ_API_KEY not set')
    // Groq is OpenAI-compatible
    _clients.groq = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  }
  return _clients.groq
}

function getOllamaClient() {
  if (!_clients.ollama) {
    const base = getSetting('OLLAMA_BASE_URL') || 'http://localhost:11434'
    _clients.ollama = new OpenAI({
      apiKey: 'ollama',          // Ollama doesn't require a real key
      baseURL: `${base}/v1`,
    })
  }
  return _clients.ollama
}

function getQwenClient() {
  if (!_clients.qwen) {
    const key = getSetting('QWEN_API_KEY')
    if (!key) throw new Error('QWEN_API_KEY not set')
    _clients.qwen = new OpenAI({
      apiKey: key,
      baseURL: getSetting('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })
  }
  return _clients.qwen
}

function getXAIClient() {
  if (!_clients.xai) {
    const key = getSetting('XAI_API_KEY')
    if (!key) throw new Error('XAI_API_KEY not set')
    _clients.xai = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.x.ai/v1',
    })
  }
  return _clients.xai
}

// Anthropic uses its own SDK, lazy-loaded
async function getAnthropicClient() {
  const key = getSetting('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({ apiKey: key })
}

// ─── Default models per provider ─────────────────────────────────────────────

const DEFAULT_MODELS = {
  deepseek:  'deepseek-chat',
  openai:    'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  groq:      'llama-3.3-70b-versatile',
  ollama:    'llama3.2',
  qwen:      'qwen-plus',
  xai:       'grok-beta',
}

// ─── Clear client cache (called when settings change) ─────────────────────────
export function clearClientCache(provider) {
  if (provider) {
    delete _clients[provider]
  } else {
    Object.keys(_clients).forEach(k => delete _clients[k])
  }
}

// ─── Unified chat completion ──────────────────────────────────────────────────

/**
 * Create a chat completion using the configured AI provider.
 *
 * @param {Object} params
 * @param {string}   [params.model]           - Model override
 * @param {Array}    params.messages          - Message array [{role, content}]
 * @param {Object}   [params.response_format] - e.g. { type: 'json_object' }
 * @param {number}   [params.max_tokens]      - Max output tokens
 * @param {number}   [params.temperature]     - Sampling temperature
 * @returns {Promise<Object>} OpenAI-compatible response object
 */
export async function createChatCompletion(params) {
  const provider = getSetting('AI_PROVIDER') || 'deepseek'
  const defaultModel = DEFAULT_MODELS[provider] || DEFAULT_MODELS.deepseek

  // Anthropic uses a different SDK interface — handle separately
  if (provider === 'anthropic') {
    return _anthropicCompletion(params, defaultModel)
  }

  // All other providers use the OpenAI-compatible interface
  const client = _getOpenAICompatibleClient(provider)
  return client.chat.completions.create({
    model:           params.model || defaultModel,
    messages:        params.messages,
    response_format: params.response_format,
    max_tokens:      params.max_tokens || 2000,
    temperature:     params.temperature ?? 0.3,
  })
}

function _getOpenAICompatibleClient(provider) {
  switch (provider) {
    case 'openai':   return getOpenAIClient()
    case 'deepseek': return getDeepSeekClient()
    case 'groq':     return getGroqClient()
    case 'ollama':   return getOllamaClient()
    case 'qwen':     return getQwenClient()
    case 'xai':      return getXAIClient()
    default:
      console.warn(`Unknown provider "${provider}", falling back to DeepSeek`)
      return getDeepSeekClient()
  }
}

async function _anthropicCompletion(params, defaultModel) {
  const anthropic = await getAnthropicClient()
  const systemMsg = params.messages.find(m => m.role === 'system')
  const userMsgs  = params.messages.filter(m => m.role !== 'system')

  const res = await anthropic.messages.create({
    model:      params.model || defaultModel,
    max_tokens: params.max_tokens || 2000,
    system:     systemMsg?.content || '',
    messages:   userMsgs,
  })

  // Normalise to OpenAI-compatible shape
  return {
    choices: [{
      message: {
        role:    'assistant',
        content: res.content[0]?.text || '',
      },
    }],
    usage: res.usage,
  }
}

// ─── Quick completion helper ──────────────────────────────────────────────────

/**
 * Simple prompt → response helper.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {Object} [options]
 * @param {string}  [options.model]       - Model override
 * @param {boolean} [options.json]        - Return JSON object format
 * @param {number}  [options.maxTokens]
 * @param {number}  [options.temperature]
 * @returns {Promise<string>} Response text
 */
export async function quickCompletion(systemPrompt, userPrompt, options = {}) {
  const response = await createChatCompletion({
    model:           options.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    response_format: options.json ? { type: 'json_object' } : undefined,
    max_tokens:      options.maxTokens  || 2000,
    temperature:     options.temperature ?? 0.3,
  })

  return response.choices[0].message.content
}

// ─── JSON helper ─────────────────────────────────────────────────────────────

export function safeJsonParse(content) {
  try {
    return JSON.parse(content)
  } catch (e) {
    console.error('Failed to parse JSON:', e.message)
    console.error('Content:', content?.slice(0, 500))
    return null
  }
}

// ─── Provider availability check ─────────────────────────────────────────────

/**
 * Returns a map of provider → whether an API key is configured.
 */
export function getProviderStatus() {
  return {
    deepseek:  !!getSetting('DEEPSEEK_API_KEY'),
    openai:    !!getSetting('OPENAI_API_KEY'),
    anthropic: !!getSetting('ANTHROPIC_API_KEY'),
    groq:      !!getSetting('GROQ_API_KEY'),
    ollama:    true,                               // always available if local
    qwen:      !!getSetting('QWEN_API_KEY'),
    xai:       !!getSetting('XAI_API_KEY'),
    active:    getSetting('AI_PROVIDER') || 'deepseek',
  }
}
