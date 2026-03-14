/**
 * Auth modal component — sign in / sign up toggle.
 * Matches the UNREDACTED dark/light theme system.
 * Uses IBM Plex Mono font throughout.
 * Orange accent (#FF8000) for all interactive elements.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

const ORANGE = '#FF8000'
const MF     = "'IBM Plex Mono','Courier New',monospace"

export default function Auth({ isOpen, onClose, theme }) {
  const { signIn, signUp, loading, error, clearError } = useAuth()
  const T = theme || {}

  const [mode, setMode]               = useState('signin')  // 'signin' | 'signup'
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [displayName, setDisplayName] = useState('')
  const [localError, setLocalError]   = useState('')
  const [success, setSuccess]         = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const emailRef = useRef(null)

  // Focus email input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => emailRef.current?.focus(), 80)
      clearError()
      setLocalError('')
      setSuccess('')
    }
  }, [isOpen, clearError])

  // Clear form on mode switch
  useEffect(() => {
    setLocalError('')
    setSuccess('')
    clearError()
    setPassword('')
  }, [mode, clearError])

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')
    setSuccess('')

    if (!email || !password) {
      setLocalError('Email and password are required.')
      return
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.')
      return
    }
    if (mode === 'signup' && !displayName.trim()) {
      setLocalError('Display name is required.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const result = await signIn(email, password)
        if (result.success) {
          setSuccess('Signed in successfully.')
          setTimeout(() => onClose(), 800)
        } else {
          setLocalError(result.error || 'Sign in failed. Check your credentials.')
        }
      } else {
        const result = await signUp(email, password, displayName.trim())
        if (result.success) {
          if (result.needsConfirmation) {
            setSuccess('Account created! Check your email to confirm your address before signing in.')
          } else {
            setSuccess('Account created and signed in.')
            setTimeout(() => onClose(), 800)
          }
        } else {
          setLocalError(result.error || 'Sign up failed. Please try again.')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = localError || error

  const bg     = T.bg     || '#0D0D0D'
  const card   = T.card   || '#161616'
  const border = T.border || '#272727'
  const hi     = T.hi     || '#FFFFFF'
  const mid    = T.mid    || '#888888'
  const low    = T.low    || '#484848'
  const inputBg = T.inputBg || '#0A0A0A'

  const inputStyle = {
    width:         '100%',
    background:    inputBg,
    border:        `1px solid ${border}`,
    color:         hi,
    fontFamily:    MF,
    fontSize:      12,
    padding:       '10px 12px',
    outline:       'none',
    transition:    'border-color .15s',
    boxSizing:     'border-box',
  }

  const btnStyle = {
    width:          '100%',
    background:     ORANGE,
    border:         'none',
    color:          '#FFFFFF',
    fontFamily:     MF,
    fontSize:       11,
    letterSpacing:  1.5,
    padding:        '12px',
    cursor:         submitting || loading ? 'not-allowed' : 'pointer',
    opacity:        submitting || loading ? 0.7 : 1,
    transition:     'opacity .15s',
    marginTop:      6,
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:      0,
          background: 'rgba(0,0,0,0.72)',
          zIndex:     999,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}
        style={{
          position:     'fixed',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          zIndex:       1000,
          width:        '100%',
          maxWidth:     420,
          background:   card,
          border:       `1px solid ${border}`,
          borderTop:    `3px solid ${ORANGE}`,
          padding:      '28px 28px 24px',
          fontFamily:   MF,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 6 }}>
              UN*REDACTED
            </div>
            <div style={{ fontSize: 18, color: hi, letterSpacing: 0.5 }}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: mid, fontSize: 18, cursor: 'pointer', padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{
          display:      'flex',
          borderBottom: `1px solid ${border}`,
          marginBottom: 22,
        }}>
          {[['signin', 'Sign In'], ['signup', 'Sign Up']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background:  'none',
                border:      'none',
                borderBottom: `2px solid ${mode === m ? ORANGE : 'transparent'}`,
                color:       mode === m ? ORANGE : mid,
                fontFamily:  MF,
                fontSize:    10,
                letterSpacing: 1.5,
                padding:     '8px 16px 10px',
                cursor:      'pointer',
                transition:  'color .14s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 9, color: mid, letterSpacing: 1.5, marginBottom: 6 }}>
                DISPLAY NAME
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = ORANGE }}
                onBlur={(e)  => { e.target.style.borderColor = border }}
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 9, color: mid, letterSpacing: 1.5, marginBottom: 6 }}>
              EMAIL
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = ORANGE }}
              onBlur={(e)  => { e.target.style.borderColor = border }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 9, color: mid, letterSpacing: 1.5, marginBottom: 6 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = ORANGE }}
              onBlur={(e)  => { e.target.style.borderColor = border }}
            />
          </div>

          {/* Error message */}
          {displayError && (
            <div style={{
              background:  '#E6394611',
              border:      '1px solid #E6394644',
              color:       '#E63946',
              fontFamily:  MF,
              fontSize:    10.5,
              padding:     '10px 12px',
              marginBottom: 14,
              lineHeight:  1.5,
            }}>
              {displayError}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div style={{
              background:  '#00CC6611',
              border:      '1px solid #00CC6644',
              color:       '#00CC66',
              fontFamily:  MF,
              fontSize:    10.5,
              padding:     '10px 12px',
              marginBottom: 14,
              lineHeight:  1.5,
            }}>
              {success}
            </div>
          )}

          <button type="submit" style={btnStyle} disabled={submitting || loading}>
            {submitting || loading
              ? 'PLEASE WAIT...'
              : mode === 'signin'
                ? 'SIGN IN'
                : 'CREATE ACCOUNT'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${border}` }}>
          <p style={{ fontSize: 9, color: low, lineHeight: 1.6 }}>
            By signing in you agree to our terms of service. All data is from public federal sources.
            UN*REDACTED does not store your password — authentication is handled securely by Supabase.
          </p>
        </div>
      </div>
    </>
  )
}
