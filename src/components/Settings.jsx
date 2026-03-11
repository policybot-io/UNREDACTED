import { useState, useEffect, useContext, createContext } from 'react'
import { fetchSettings, saveSettings, testAIConnection } from '../api/client.js'

// ─── Theme helpers (inline — matches App.jsx tokens) ─────────────────────────
const ORANGE = '#FF8000'
const BLUE   = '#0028AA'
const WHITE  = '#FFFFFF'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

// ─── Provider catalogue ───────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔷',
    description: 'Best price-performance. OpenAI-compatible.',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyField: 'DEEPSEEK_API_KEY',
    keyLink: 'https://platform.deepseek.com/',
    local: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🟢',
    description: 'GPT-4o and GPT-4 Turbo. Industry standard.',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyField: 'OPENAI_API_KEY',
    keyLink: 'https://platform.openai.com/api-keys',
    local: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: '🟠',
    description: 'Claude 3.5 Sonnet. Excellent reasoning and safety.',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    keyField: 'ANTHROPIC_API_KEY',
    keyLink: 'https://console.anthropic.com/',
    local: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    icon: '⚡',
    description: 'Ultra-fast inference. Free tier available.',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    keyField: 'GROQ_API_KEY',
    keyLink: 'https://console.groq.com/',
    local: false,
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    icon: '🔴',
    description: 'Qwen 2.5 series. Strong multilingual support.',
    defaultModel: 'qwen-plus',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct'],
    keyField: 'QWEN_API_KEY',
    keyLink: 'https://dashscope.aliyuncs.com/',
    local: false,
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    icon: '✖',
    description: 'Grok by xAI. Real-time knowledge.',
    defaultModel: 'grok-beta',
    models: ['grok-beta', 'grok-2', 'grok-2-mini'],
    keyField: 'XAI_API_KEY',
    keyLink: 'https://console.x.ai/',
    local: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    icon: '🦙',
    description: 'Run models locally. No API key required. Fully private.',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'phi3', 'gemma2'],
    keyField: null,
    extraField: 'OLLAMA_BASE_URL',
    extraLabel: 'Base URL',
    extraPlaceholder: 'http://localhost:11434',
    keyLink: 'https://ollama.com/',
    local: true,
  },
]

// ─── Settings component ───────────────────────────────────────────────────────

export default function Settings({ theme }) {
  const t = theme

  const [providerStatus, setProviderStatus] = useState({})
  const [activeProvider, setActiveProvider] = useState('deepseek')
  const [keys, setKeys] = useState({})               // draft key values
  const [showKey, setShowKey] = useState({})          // visibility toggle per field
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [qwenUrl, setQwenUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveResult, setSaveResult] = useState(null)  // { ok, msg }
  const [testResult, setTestResult] = useState(null)  // { ok, msg }
  const [loading, setLoading] = useState(true)

  // Load current settings from backend
  useEffect(() => {
    fetchSettings()
      .then(data => {
        if (data.success) {
          setProviderStatus(data.providers || {})
          setActiveProvider(data.providers?.active || 'deepseek')
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeMeta = PROVIDERS.find(p => p.id === activeProvider) || PROVIDERS[0]

  function handleKeyChange(field, value) {
    setKeys(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveResult(null)
    setTestResult(null)

    const payload = { AI_PROVIDER: activeProvider }
    if (selectedModel) payload.AI_MODEL = selectedModel

    // Include any non-empty keys the user has typed
    PROVIDERS.forEach(p => {
      if (p.keyField && keys[p.keyField]) {
        payload[p.keyField] = keys[p.keyField]
      }
      if (p.extraField && p.id === 'ollama') {
        payload.OLLAMA_BASE_URL = ollamaUrl
      }
      if (p.id === 'qwen' && qwenUrl) {
        payload.QWEN_BASE_URL = qwenUrl
      }
    })

    try {
      const res = await saveSettings(payload)
      if (res.success) {
        setProviderStatus(res.providers || providerStatus)
        setKeys({})   // clear draft fields
        setSaveResult({ ok: true, msg: res.message || 'Settings saved.' })
      } else {
        setSaveResult({ ok: false, msg: 'Failed to save settings.' })
      }
    } catch (err) {
      setSaveResult({ ok: false, msg: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testAIConnection()
      setTestResult({ ok: res.success, msg: res.success ? `✓ Connected · ${activeProvider}` : res.error })
    } catch (err) {
      setTestResult({ ok: false, msg: err.message })
    } finally {
      setTesting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>
          CONFIGURATION · AI PROVIDERS · API KEYS
        </div>
        <h2 style={{ fontFamily: SF, fontSize: 32, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 8 }}>
          Settings
        </h2>
        <p style={{ fontFamily: SF, fontSize: 14, fontStyle: 'italic', color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Configure AI providers and API keys. Keys are held in server memory only — they are never written to disk or logged.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* ── Left column: Provider selector + key entry ─────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Provider grid */}
          <SectionHeader t={t} label="AI Chat Provider" sub="Select which model powers the intelligence agents" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {PROVIDERS.map(p => {
              const configured = p.local || providerStatus[p.id]
              const active = activeProvider === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => { setActiveProvider(p.id); setSelectedModel(''); setSaveResult(null); setTestResult(null) }}
                  style={{
                    background: active ? ORANGE + '15' : t.card,
                    border: `1.5px solid ${active ? ORANGE : configured ? t.border : t.border}`,
                    borderTop: `3px solid ${active ? ORANGE : configured ? '#00C97A' : t.border}`,
                    padding: '12px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all .14s',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span style={{ fontFamily: MF, fontSize: 11, color: active ? ORANGE : t.hi, fontWeight: active ? 700 : 400 }}>
                      {p.name}
                    </span>
                    {active && (
                      <span style={{ marginLeft: 'auto', fontFamily: MF, fontSize: 7.5, color: ORANGE, border: `1px solid ${ORANGE}44`, padding: '1px 6px', letterSpacing: 1 }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, lineHeight: 1.5 }}>{p.description}</div>
                  {/* Configured dot */}
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    width: 6, height: 6, borderRadius: '50%',
                    background: configured ? '#00C97A' : t.border,
                    boxShadow: configured ? '0 0 6px #00C97A88' : 'none',
                  }} />
                </button>
              )
            })}
          </div>

          {/* Model selection for active provider */}
          <SectionHeader t={t} label={`${activeMeta.name} — Model`} sub={`Default: ${activeMeta.defaultModel}`} />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeMeta.models.map(m => (
              <button
                key={m}
                onClick={() => setSelectedModel(m === activeMeta.defaultModel ? '' : m)}
                style={{
                  background: (selectedModel || activeMeta.defaultModel) === m ? ORANGE + '20' : t.card,
                  border: `1px solid ${(selectedModel || activeMeta.defaultModel) === m ? ORANGE : t.border}`,
                  padding: '6px 14px',
                  fontFamily: MF, fontSize: 10, color: (selectedModel || activeMeta.defaultModel) === m ? ORANGE : t.mid,
                  cursor: 'pointer', transition: 'all .12s',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* API key entry */}
          <SectionHeader t={t} label="API Keys" sub="Enter keys for the providers you want to use. Leave blank to keep existing." />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PROVIDERS.filter(p => !p.local).map(p => (
              <KeyField
                key={p.id}
                t={t}
                label={p.name}
                icon={p.icon}
                field={p.keyField}
                placeholder={`sk-... (${p.name} API key)`}
                linkText="Get key →"
                linkUrl={p.keyLink}
                value={keys[p.keyField] || ''}
                shown={!!showKey[p.keyField]}
                configured={!!providerStatus[p.id]}
                active={activeProvider === p.id}
                onChange={v => handleKeyChange(p.keyField, v)}
                onToggleShow={() => setShowKey(prev => ({ ...prev, [p.keyField]: !prev[p.keyField] }))}
              />
            ))}

            {/* Ollama URL */}
            <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontFamily: MF, fontSize: 10, color: t.hi }}>🦙 Ollama — Base URL</div>
                <a href="https://ollama.com/" target="_blank" rel="noreferrer" style={{ fontFamily: MF, fontSize: 8.5, color: ORANGE }}>
                  Install Ollama →
                </a>
              </div>
              <input
                value={ollamaUrl}
                onChange={e => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                style={inputStyle(t)}
              />
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, marginTop: 6 }}>
                Run: <code style={{ color: ORANGE }}>ollama serve</code> then <code style={{ color: ORANGE }}>ollama pull llama3.2</code>
              </div>
            </div>
          </div>

          {/* Government data keys */}
          <SectionHeader t={t} label="Government Data APIs" sub="Free keys available — rate limits apply to DEMO_KEY" />

          <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: MF, fontSize: 10, color: t.hi }}>🗳️ FEC API Key</div>
              <a href="https://api.open.fec.gov/developers/" target="_blank" rel="noreferrer" style={{ fontFamily: MF, fontSize: 8.5, color: ORANGE }}>
                Get free key →
              </a>
            </div>
            <input
              value={keys['FEC_API_KEY'] || ''}
              onChange={e => handleKeyChange('FEC_API_KEY', e.target.value)}
              placeholder="DEMO_KEY (default) or your key"
              style={inputStyle(t)}
            />
            <div style={{ fontFamily: MF, fontSize: 8, color: t.low, marginTop: 6 }}>
              DEMO_KEY allows ~1,000 req/day. A personal key allows ~1,000 req/hour.
            </div>
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? t.border : ORANGE,
                border: 'none',
                padding: '10px 24px',
                fontFamily: MF, fontSize: 10.5, color: WHITE, fontWeight: 700, letterSpacing: 1,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
              }}
            >
              {saving ? 'SAVING…' : 'SAVE SETTINGS'}
            </button>

            <button
              onClick={handleTest}
              disabled={testing || saving}
              style={{
                background: 'transparent',
                border: `1px solid ${t.border}`,
                padding: '10px 18px',
                fontFamily: MF, fontSize: 10.5, color: t.mid,
                cursor: testing ? 'not-allowed' : 'pointer',
                transition: 'all .14s',
              }}
            >
              {testing ? 'TESTING…' : 'TEST CONNECTION'}
            </button>

            {saveResult && (
              <span style={{ fontFamily: MF, fontSize: 10, color: saveResult.ok ? '#00C97A' : ORANGE }}>
                {saveResult.ok ? '✓' : '✕'} {saveResult.msg}
              </span>
            )}
            {testResult && (
              <span style={{ fontFamily: MF, fontSize: 10, color: testResult.ok ? '#00C97A' : ORANGE }}>
                {testResult.ok ? '✓' : '✕'} {testResult.msg}
              </span>
            )}
          </div>
        </div>

        {/* ── Right column: Status panel ──────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Active provider status */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderTop: `3px solid ${ORANGE}`, padding: '14px 16px' }}>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: ORANGE, letterSpacing: 2, marginBottom: 12 }}>PROVIDER STATUS</div>
            {loading ? (
              <div style={{ fontFamily: MF, fontSize: 9, color: t.low }}>Loading…</div>
            ) : (
              PROVIDERS.map(p => {
                const ok = p.local || !!providerStatus[p.id]
                const isActive = providerStatus.active === p.id
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: ok ? '#00C97A' : t.border,
                      boxShadow: ok ? '0 0 5px #00C97A88' : 'none',
                    }} />
                    <span style={{ fontFamily: MF, fontSize: 9.5, color: isActive ? ORANGE : t.mid, flex: 1 }}>
                      {p.icon} {p.name}
                    </span>
                    <span style={{ fontFamily: MF, fontSize: 8, color: isActive ? ORANGE : (ok ? '#00C97A' : t.low) }}>
                      {isActive ? 'ACTIVE' : ok ? 'READY' : 'NO KEY'}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Active model info */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: '14px 16px' }}>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, letterSpacing: 2, marginBottom: 10 }}>ACTIVE CONFIGURATION</div>
            <div style={{ fontFamily: MF, fontSize: 10, color: t.hi, marginBottom: 6 }}>
              Provider: <span style={{ color: ORANGE }}>{activeMeta.icon} {activeMeta.name}</span>
            </div>
            <div style={{ fontFamily: MF, fontSize: 10, color: t.hi, marginBottom: 6 }}>
              Model: <span style={{ color: ORANGE }}>{selectedModel || activeMeta.defaultModel}</span>
            </div>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, lineHeight: 1.6, marginTop: 8 }}>
              {activeMeta.description}
            </div>
          </div>

          {/* Security note */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${ORANGE}`, padding: '12px 14px' }}>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: ORANGE, letterSpacing: 1.5, marginBottom: 8 }}>⚠ SECURITY NOTE</div>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, lineHeight: 1.65 }}>
              API keys are stored in server memory only. They are cleared when the server restarts. For persistent configuration, set keys in <code style={{ color: ORANGE }}>backend/.env</code>.
            </div>
          </div>

          {/* Quick links */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: '14px 16px' }}>
            <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, letterSpacing: 2, marginBottom: 10 }}>PROVIDER LINKS</div>
            {PROVIDERS.map(p => (
              <a
                key={p.id}
                href={p.keyLink}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, textDecoration: 'none' }}
              >
                <span style={{ fontSize: 11 }}>{p.icon}</span>
                <span style={{ fontFamily: MF, fontSize: 9, color: ORANGE }}>{p.name}</span>
                <span style={{ fontFamily: MF, fontSize: 8, color: t.low, marginLeft: 'auto' }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ t, label, sub }) {
  return (
    <div style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: 8 }}>
      <div style={{ fontFamily: MF, fontSize: 10.5, color: t.hi, marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low }}>{sub}</div>}
    </div>
  )
}

function KeyField({ t, label, icon, field, placeholder, linkText, linkUrl, value, shown, configured, active, onChange, onToggleShow }) {
  const ORANGE = '#FF8000'
  return (
    <div style={{ background: t.card, border: `1px solid ${active ? ORANGE + '55' : t.border}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{ fontFamily: MF, fontSize: 10, color: active ? ORANGE : t.hi }}>{label}</span>
          {configured && (
            <span style={{ fontFamily: MF, fontSize: 7.5, color: '#00C97A', border: '1px solid #00C97A44', padding: '1px 6px', letterSpacing: 0.5 }}>
              CONFIGURED
            </span>
          )}
        </div>
        <a href={linkUrl} target="_blank" rel="noreferrer" style={{ fontFamily: MF, fontSize: 8.5, color: ORANGE }}>
          {linkText}
        </a>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={configured ? '••••••••  (already set — enter to replace)' : placeholder}
          style={{ ...inputStyle(t), paddingRight: 40 }}
        />
        <button
          onClick={onToggleShow}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 36,
            background: 'none', border: 'none',
            color: t.low, cursor: 'pointer', fontSize: 12,
          }}
          title={shown ? 'Hide' : 'Show'}
        >
          {shown ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  )
}

function inputStyle(t) {
  return {
    width: '100%',
    background: t.inputBg || t.card,
    border: `1px solid ${t.border}`,
    padding: '8px 12px',
    fontFamily: MF,
    fontSize: 10.5,
    color: t.hi,
    outline: 'none',
    boxSizing: 'border-box',
  }
}
