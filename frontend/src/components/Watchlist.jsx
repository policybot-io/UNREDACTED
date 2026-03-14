/**
 * Watchlist component — shows a user's saved politicians and companies.
 * Requires authentication. Shows sign-in prompt if not logged in.
 * Supports real-time updates via Supabase subscriptions.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase, subscribeToWatchlist } from '../lib/supabase.js'

const ORANGE = '#FF8000'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

// Tier badge colors
const TIER_COLORS = {
  A:        '#00CC66',
  B:        '#4A7FFF',
  C:        '#FFB84D',
  D:        '#FF8000',
  F:        '#E63946',
  LOW:      '#00CC66',
  MEDIUM:   '#FFB84D',
  HIGH:     '#FF8000',
  CRITICAL: '#E63946',
}

function TierBadge({ tier }) {
  const color = TIER_COLORS[tier] || '#888888'
  return (
    <span style={{
      background:    color + '22',
      border:        `1px solid ${color}66`,
      color,
      fontFamily:    MF,
      fontSize:      9,
      padding:       '2px 7px',
      letterSpacing: 0.5,
      fontWeight:    700,
    }}>
      {tier || '—'}
    </span>
  )
}

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ fontFamily: MF, fontSize: 10, color: '#555' }}>—</span>
  const color = score >= 70 ? '#4A7FFF' : score >= 50 ? '#FFB84D' : score >= 35 ? ORANGE : '#E63946'
  return <span style={{ fontFamily: MF, fontSize: 11, color, fontWeight: 700 }}>{score}</span>
}

function EmptyState({ filter, theme }) {
  const T = theme
  return (
    <div style={{
      textAlign:  'center',
      padding:    '48px 24px',
      color:      T.mid,
      fontFamily: MF,
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
      <div style={{ fontSize: 12, marginBottom: 6, color: T.hi }}>
        No {filter !== 'all' ? filter : ''} items in watchlist
      </div>
      <div style={{ fontSize: 10, color: T.low, maxWidth: 300, margin: '0 auto', lineHeight: 1.6 }}>
        Add politicians and companies from the Accountability Index, Company Profile, or Donor Intelligence tabs.
      </div>
    </div>
  )
}

function SignInPrompt({ onSignIn, theme }) {
  const T = theme
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '60px 24px',
      textAlign:      'center',
    }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>⚑</div>
      <div style={{ fontFamily: SF, fontSize: 22, color: T.hi, marginBottom: 10 }}>
        Your personal watchlist
      </div>
      <p style={{ fontFamily: MF, fontSize: 11, color: T.mid, lineHeight: 1.75, maxWidth: 400, marginBottom: 28 }}>
        Track politicians and companies, monitor their corruption scores over time,
        and get alerts when scores change significantly. Sign in to get started.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 }}>
        {[
          ['◈', 'Track any politician or company'],
          ['⚠', 'Real-time score change alerts'],
          ['⟳', 'Live data from FEC, USASpending'],
        ].map(([icon, text]) => (
          <div key={text} style={{
            background:  T.card,
            border:      `1px solid ${T.border}`,
            padding:     '12px 16px',
            fontFamily:  MF,
            fontSize:    10,
            color:       T.mid,
            display:     'flex',
            alignItems:  'center',
            gap:         8,
            maxWidth:    180,
          }}>
            <span style={{ color: ORANGE }}>{icon}</span> {text}
          </div>
        ))}
      </div>
      <button
        onClick={onSignIn}
        style={{
          background:   ORANGE,
          border:       'none',
          color:        '#FFFFFF',
          fontFamily:   MF,
          fontSize:     11,
          letterSpacing: 1.5,
          padding:      '12px 28px',
          cursor:       'pointer',
        }}
      >
        SIGN IN / CREATE ACCOUNT
      </button>
    </div>
  )
}

export default function Watchlist({ theme, onSignInRequest }) {
  const { isAuthenticated, user } = useAuth()
  const T = theme || {}

  const [items, setItems]   = useState([])
  const [filter, setFilter] = useState('all')   // 'all' | 'politician' | 'company'
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState(null)  // id of item being removed

  const fetchWatchlist = useCallback(async () => {
    if (!user || !supabase) return
    setLoading(true)
    try {
      // Use the RPC function to get watchlist with scores
      const { data, error } = await supabase
        .rpc('get_watchlist_with_scores', { p_user_id: user.id })

      if (error) throw error
      setItems(data || [])
    } catch (e) {
      console.error('[Watchlist] fetch error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Initial load
  useEffect(() => {
    if (isAuthenticated) fetchWatchlist()
    else setItems([])
  }, [isAuthenticated, fetchWatchlist])

  // Real-time subscription
  useEffect(() => {
    if (!isAuthenticated || !user) return

    const channel = subscribeToWatchlist(user.id, () => {
      // Refetch on any watchlist change
      fetchWatchlist()
    })

    return () => { channel.unsubscribe() }
  }, [isAuthenticated, user, fetchWatchlist])

  const handleRemove = async (watchlistId, entityName) => {
    if (!supabase) return
    if (!window.confirm(`Remove "${entityName}" from watchlist?`)) return

    setRemoving(watchlistId)
    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', watchlistId)
        .eq('user_id', user.id)

      if (error) throw error
      setItems(prev => prev.filter(i => i.watchlist_id !== watchlistId))
    } catch (e) {
      console.error('[Watchlist] remove error:', e.message)
    } finally {
      setRemoving(null)
    }
  }

  const filteredItems = filter === 'all'
    ? items
    : items.filter(i => i.entity_type === filter)

  const bgCard   = T.card   || '#161616'
  const bgCardB  = T.cardB  || '#1D1D1D'
  const border   = T.border || '#272727'
  const hi       = T.hi     || '#FFFFFF'
  const mid      = T.mid    || '#888888'
  const low      = T.low    || '#484848'
  const inputBg  = T.inputBg || '#0A0A0A'

  if (!isAuthenticated) {
    return (
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 24 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 12 }}>
          WATCHLIST
        </div>
        <SignInPrompt onSignIn={onSignInRequest || (() => {})} theme={T} />
      </div>
    )
  }

  return (
    <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 6 }}>
            WATCHLIST
          </div>
          <div style={{ fontFamily: SF, fontSize: 22, color: hi }}>
            Your tracked entities
          </div>
        </div>
        <div style={{ fontFamily: MF, fontSize: 9, color: mid }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        display:      'flex',
        borderBottom: `1px solid ${border}`,
        marginBottom: 20,
      }}>
        {[
          ['all',        'All'],
          ['politician', 'Politicians'],
          ['company',    'Companies'],
        ].map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background:    'none',
              border:        'none',
              borderBottom:  `2px solid ${filter === f ? ORANGE : 'transparent'}`,
              color:         filter === f ? ORANGE : mid,
              fontFamily:    MF,
              fontSize:      10,
              letterSpacing: 1,
              padding:       '8px 16px 10px',
              cursor:        'pointer',
              transition:    'color .14s',
            }}
          >
            {label}
            <span style={{
              marginLeft:  6,
              background:  filter === f ? ORANGE + '22' : 'transparent',
              color:       filter === f ? ORANGE : low,
              fontSize:    8,
              padding:     '1px 5px',
              border:      `1px solid ${filter === f ? ORANGE + '44' : border}`,
            }}>
              {f === 'all' ? items.length : items.filter(i => i.entity_type === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ fontFamily: MF, fontSize: 10, color: mid, padding: '32px', textAlign: 'center' }}>
          Loading watchlist...
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState filter={filter} theme={T} />
      ) : (
        /* Watchlist table */
        <div style={{ background: bgCard, border: `1px solid ${border}` }}>
          {/* Table header */}
          <div style={{
            display:         'grid',
            gridTemplateColumns: '1fr 100px 80px 90px 120px',
            padding:         '8px 16px',
            background:      bgCardB,
            borderBottom:    `1px solid ${border}`,
          }}>
            {['ENTITY', 'TYPE', 'SCORE', 'TIER', 'ACTIONS'].map(h => (
              <div key={h} style={{
                fontFamily:    MF,
                fontSize:      8.5,
                color:         low,
                letterSpacing: 1.5,
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Table rows */}
          {filteredItems.map((item, idx) => (
            <div
              key={item.watchlist_id}
              style={{
                display:         'grid',
                gridTemplateColumns: '1fr 100px 80px 90px 120px',
                padding:         '12px 16px',
                borderBottom:    idx < filteredItems.length - 1 ? `1px solid ${border}` : 'none',
                alignItems:      'center',
                background:      idx % 2 === 0 ? bgCard : T.tableAlt || bgCard,
                transition:      'background .14s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = inputBg }}
              onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? bgCard : (T.tableAlt || bgCard) }}
            >
              {/* Entity name */}
              <div>
                <div style={{ fontFamily: MF, fontSize: 11, color: hi, marginBottom: 2 }}>
                  {item.entity_name}
                </div>
                <div style={{ fontFamily: MF, fontSize: 9, color: low }}>
                  ID: {item.entity_id}
                </div>
              </div>

              {/* Type */}
              <div>
                <span style={{
                  fontFamily:    MF,
                  fontSize:      8.5,
                  color:         item.entity_type === 'politician' ? '#4A7FFF' : ORANGE,
                  background:    item.entity_type === 'politician' ? '#4A7FFF22' : ORANGE + '22',
                  border:        `1px solid ${item.entity_type === 'politician' ? '#4A7FFF44' : ORANGE + '44'}`,
                  padding:       '2px 7px',
                  letterSpacing: 0.5,
                }}>
                  {item.entity_type === 'politician' ? 'POLITICIAN' : 'COMPANY'}
                </span>
              </div>

              {/* Score */}
              <div>
                <ScoreBadge score={item.overall_score} />
              </div>

              {/* Tier */}
              <div>
                {item.tier
                  ? <TierBadge tier={item.tier} />
                  : <span style={{ fontFamily: MF, fontSize: 10, color: low }}>Not scored</span>
                }
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {item.scored_at && (
                  <span style={{ fontFamily: MF, fontSize: 8, color: low }} title={`Scored: ${new Date(item.scored_at).toLocaleDateString()}`}>
                    {new Date(item.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button
                  onClick={() => handleRemove(item.watchlist_id, item.entity_name)}
                  disabled={removing === item.watchlist_id}
                  style={{
                    background:  'none',
                    border:      `1px solid ${border}`,
                    color:       removing === item.watchlist_id ? low : '#E63946',
                    fontFamily:  MF,
                    fontSize:    9,
                    padding:     '4px 8px',
                    cursor:      removing === item.watchlist_id ? 'not-allowed' : 'pointer',
                    opacity:     removing === item.watchlist_id ? 0.5 : 1,
                    transition:  'all .15s',
                  }}
                >
                  {removing === item.watchlist_id ? '...' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last updated */}
      <div style={{ marginTop: 14, fontFamily: MF, fontSize: 8.5, color: low }}>
        Watchlist · {items.length} entities tracked · Scores cached for 24h from FEC + USASpending data
      </div>
    </div>
  )
}
