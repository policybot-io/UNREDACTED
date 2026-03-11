import { useState, useEffect } from 'react'
import { getRecentStockTrades, getStockActWatchlist } from '../api/client'

const ORANGE = '#FF8000'
const RED    = '#E63946'
const GREEN  = '#2DC653'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

export default function StockActMonitor({ theme }) {
  const T = theme || {
    bg: '#0D0D0D', card: '#161616', cardB: '#1D1D1D', border: '#272727',
    hi: '#FFFFFF', mid: '#888888', low: '#484848', accent: ORANGE,
    grid: '#1E1E1E', tableAlt: '#111111', inputBg: '#0A0A0A',
  }

  const [trades, setTrades] = useState([])
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterChamber, setFilterChamber] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('filings')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [tradesRes, watchlistRes] = await Promise.allSettled([
          getRecentStockTrades(null, 100),
          getStockActWatchlist(),
        ])
        if (tradesRes.status === 'fulfilled') setTrades(tradesRes.value?.data || [])
        if (watchlistRes.status === 'fulfilled') setWatchlist(watchlistRes.value?.data || [])
        if (tradesRes.status === 'rejected') setError(tradesRes.reason?.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const senate = trades.filter(t => t.chamber === 'senate')
  const house = trades.filter(t => t.chamber === 'house')

  const filtered = trades.filter(t => {
    if (filterChamber === 'SENATE' && t.chamber !== 'senate') return false
    if (filterChamber === 'HOUSE' && t.chamber !== 'house') return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (t.senator || t.representative || '').toLowerCase().includes(q)
    }
    return true
  })

  const kpis = [
    { label: 'Total PTR Filings', value: trades.length, color: ORANGE },
    { label: 'Senate Filings', value: senate.length, color: '#7B61FF' },
    { label: 'House Filings', value: house.length, color: '#4A7FFF' },
    { label: 'Watchlist Entries', value: watchlist.length, color: RED },
  ]

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.mid, fontSize: 14 }}>Loading congressional trade disclosures...</div>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ background: RED, color: '#fff', fontFamily: MF, fontSize: 11, padding: '3px 10px', borderRadius: 3, fontWeight: 700, letterSpacing: 1 }}>
            PHASE 3
          </span>
          <h1 style={{ margin: 0, fontFamily: SF, fontSize: 26, fontWeight: 700, color: T.hi }}>
            STOCK Act Monitor
          </h1>
        </div>
        <p style={{ margin: 0, color: T.mid, fontSize: 13 }}>
          Congressional Periodic Transaction Reports (PTRs) from Senate eFiling and House Disclosures Clerk.
          PTRs must be filed within 45 days of a trade.
        </p>
        <div style={{ marginTop: 8, padding: '8px 12px', background: `${ORANGE}10`, border: `1px solid ${ORANGE}33`, borderRadius: 4, fontSize: 11, color: ORANGE }}>
          Data note: Individual trade details (ticker, amount) are embedded in PDF filings and require offline ETL parsing.
          This view shows PTR filing metadata from public congressional disclosure APIs.
        </div>
        {error && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 4, fontSize: 11, color: RED }}>
            API error: {error}
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: MF }}>{k.value}</div>
            <div style={{ fontSize: 12, color: T.mid, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
        {[
          { key: 'filings', label: `PTR Filings (${trades.length})` },
          { key: 'watchlist', label: `Watchlist (${watchlist.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
              fontFamily: MF, fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? T.accent : T.mid,
              borderBottom: activeTab === tab.key ? `2px solid ${T.accent}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 0' }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name..."
          style={{
            background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 4,
            color: T.hi, fontFamily: MF, fontSize: 12, padding: '7px 12px', width: 240,
          }}
        />
        {[['ALL', 'All'], ['SENATE', 'Senate'], ['HOUSE', 'House']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterChamber(v)}
            style={{
              background: filterChamber === v ? T.accent : T.inputBg,
              border: `1px solid ${filterChamber === v ? T.accent : T.border}`,
              borderRadius: 4, color: filterChamber === v ? '#000' : T.mid,
              fontFamily: MF, fontSize: 11, padding: '7px 14px', cursor: 'pointer',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* PTR Filings Tab */}
      {activeTab === 'filings' && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: T.mid }}>
              {trades.length === 0
                ? 'No PTR filings available. Senate/House disclosure APIs may be unavailable or rate-limited.'
                : 'No filings match current filters.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.cardB }}>
                  {['Chamber', 'Legislator', 'Filing Type', 'Filing Date', 'Document'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: T.mid, fontFamily: MF, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id || i} style={{ background: i % 2 === 0 ? T.card : T.tableAlt, borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: t.chamber === 'senate' ? '#7B61FF' : '#4A7FFF', marginRight: 6,
                      }} />
                      <span style={{ color: T.mid, fontSize: 11 }}>{(t.chamber || '').toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: T.hi, fontWeight: 600 }}>
                      {t.senator || t.representative || 'Unknown'}
                    </td>
                    <td style={{ padding: '10px 14px', color: ORANGE }}>{t.filingType || 'PTR'}</td>
                    <td style={{ padding: '10px 14px', color: T.mid }}>{t.filingDate || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {t.url ? (
                        <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'none', fontSize: 11 }}>
                          View PDF ↗
                        </a>
                      ) : (
                        <span style={{ color: T.low, fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Watchlist Tab */}
      {activeTab === 'watchlist' && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '24px' }}>
          {watchlist.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: T.mid }}>
              <div style={{ marginBottom: 12, fontSize: 14 }}>No watchlist data available</div>
              <div style={{ fontSize: 12, color: T.low, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                The high-risk watchlist is built by cross-referencing parsed individual trades with committee hearing schedules.
                This requires the PDF parsing ETL pipeline to process disclosure filings first.
              </div>
            </div>
          ) : (
            watchlist.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ color: T.hi, fontWeight: 700, fontSize: 14 }}>{p.politician}</div>
                  <div style={{ color: T.mid, fontSize: 11, marginTop: 2 }}>
                    {(p.chamber || '').toUpperCase()} · {p.state} · {p.violationCount} violation(s)
                  </div>
                </div>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: p.riskScore > 80 ? 'rgba(230,57,70,0.15)' : 'rgba(255,128,0,0.15)',
                  border: `2px solid ${p.riskScore > 80 ? RED : ORANGE}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: p.riskScore > 80 ? RED : ORANGE, fontSize: 14, fontWeight: 700 }}>{p.riskScore}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
