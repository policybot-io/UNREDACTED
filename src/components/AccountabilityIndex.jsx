import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getAccountabilityLeaderboard } from '../api/client'

const ORANGE = '#FF8000'
const RED    = '#E63946'
const GREEN  = '#2DC653'
const BLUE   = '#4A7FFF'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

const TIER_COLORS = { A: GREEN, B: BLUE, C: ORANGE, D: '#FFB84D', F: RED }

const COMPONENT_LABELS = {
  donorTransparency: 'Donor Transparency',
  stockActCompliance: 'STOCK Act Compliance',
  voteDonorAlignment: 'Vote-Donor Alignment',
  disclosureTimeliness: 'Disclosure Timeliness',
}

function partyColor(party = '') {
  const p = party.toUpperCase()
  if (p.includes('DEM')) return BLUE
  if (p.includes('REP')) return RED
  return '#888'
}

function ScoreBadge({ score, tier }) {
  const color = TIER_COLORS[tier] || ORANGE
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 42, height: 42, borderRadius: '50%',
        background: color + '18', border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, color, fontFamily: MF,
      }}>
        {score}
      </div>
      <div style={{
        background: color + '22', border: `1px solid ${color}44`,
        color, fontFamily: MF, fontSize: 11, padding: '2px 7px', borderRadius: 3, fontWeight: 700,
      }}>
        Grade {tier}
      </div>
    </div>
  )
}

function ComponentBar({ label, value, T }) {
  if (value === null || value === undefined) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: T.mid }}>{label}</span>
          <span style={{ fontSize: 10, color: T.low, fontStyle: 'italic' }}>N/A — requires ETL data</span>
        </div>
        <div style={{ height: 5, background: T.border, borderRadius: 3 }} />
      </div>
    )
  }
  const pct = (value / 25) * 100
  const color = pct >= 70 ? GREEN : pct >= 50 ? ORANGE : RED
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.mid }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>{value}/25</span>
      </div>
      <div style={{ height: 5, background: T.border, borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function AccountabilityIndex({ theme }) {
  const T = theme || {
    bg: '#0D0D0D', card: '#161616', cardB: '#1D1D1D', border: '#272727',
    hi: '#FFFFFF', mid: '#888888', low: '#484848', accent: ORANGE,
    grid: '#1E1E1E', tableAlt: '#111111', inputBg: '#0A0A0A',
  }

  const [politicians, setPoliticians] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterChamber, setFilterChamber] = useState('ALL')
  const [filterParty, setFilterParty] = useState('ALL')
  const [sortBy, setSortBy] = useState('score')
  const [expandedId, setExpandedId] = useState(null)
  const [activeHall, setActiveHall] = useState('shame')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await getAccountabilityLeaderboard(null, null, 50)
        setPoliticians(res?.data || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const sorted = [...politicians]
    .filter(p => filterChamber === 'ALL' || p.office === filterChamber)
    .filter(p => filterParty === 'ALL' || (p.party || '').toUpperCase().includes(filterParty))
    .sort((a, b) => sortBy === 'score' ? b.overallScore - a.overallScore : a.overallScore - b.overallScore)

  const hallOfFame = [...politicians].sort((a, b) => b.overallScore - a.overallScore).slice(0, 3)
  const hallOfShame = [...politicians].sort((a, b) => a.overallScore - b.overallScore).slice(0, 3)

  const distData = [
    { range: '0–20', count: politicians.filter(p => p.overallScore <= 20).length },
    { range: '21–40', count: politicians.filter(p => p.overallScore > 20 && p.overallScore <= 40).length },
    { range: '41–60', count: politicians.filter(p => p.overallScore > 40 && p.overallScore <= 60).length },
    { range: '61–80', count: politicians.filter(p => p.overallScore > 60 && p.overallScore <= 80).length },
    { range: '81–100', count: politicians.filter(p => p.overallScore > 80).length },
  ]

  const fmtM = v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v || 0}`

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.mid, fontSize: 14 }}>Loading accountability scores from FEC...</div>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ background: RED, color: '#fff', fontFamily: MF, fontSize: 11, padding: '3px 10px', borderRadius: 3, fontWeight: 700, letterSpacing: 1 }}>
            PHASE 3
          </span>
          <h1 style={{ margin: 0, fontFamily: SF, fontSize: 26, fontWeight: 700, color: T.hi }}>
            Accountability Index
          </h1>
        </div>
        <p style={{ margin: 0, color: T.mid, fontSize: 13 }}>
          RECEIPTS Accountability Score (0–100) computed from FEC donor transparency and vote-donor alignment data.
          STOCK Act compliance and disclosure timeliness require additional ETL pipeline data (marked N/A).
        </p>
        {error && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 4, fontSize: 11, color: RED }}>
            Error loading data: {error}
          </div>
        )}
      </div>

      {politicians.length === 0 ? (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '48px', textAlign: 'center', color: T.mid }}>
          <div style={{ fontSize: 16, marginBottom: 12 }}>No politician data available</div>
          <div style={{ fontSize: 12, color: T.low, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            The accountability leaderboard requires FEC candidate data.
            This may be due to API rate limits (DEMO_KEY: 1000 calls/day) or connectivity issues.
            Set FEC_API_KEY in the backend .env for higher limits.
          </div>
        </div>
      ) : (
        <>
          {/* Score Distribution + Hall */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px' }}>
              <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: T.hi, marginBottom: 16 }}>Score Distribution</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={distData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                  <XAxis dataKey="range" tick={{ fill: T.mid, fontSize: 10 }} />
                  <YAxis tick={{ fill: T.mid, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: T.cardB, border: `1px solid ${T.border}`, fontFamily: MF, fontSize: 11 }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {distData.map((d, i) => (
                      <Cell key={i} fill={
                        d.range === '81–100' ? GREEN : d.range === '61–80' ? BLUE :
                        d.range === '41–60' ? ORANGE : d.range === '21–40' ? '#FFB84D' : RED
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                {[['shame', 'Hall of Shame'], ['fame', 'Hall of Fame']].map(([k, l]) => (
                  <button key={k} onClick={() => setActiveHall(k)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '6px 16px',
                    fontFamily: MF, fontSize: 11, fontWeight: activeHall === k ? 700 : 400,
                    color: activeHall === k ? (k === 'shame' ? RED : GREEN) : T.mid,
                    borderBottom: activeHall === k ? `2px solid ${k === 'shame' ? RED : GREEN}` : '2px solid transparent',
                    marginBottom: -1,
                  }}>{l}</button>
                ))}
              </div>
              {(activeHall === 'shame' ? hallOfShame : hallOfFame).map((p, i) => (
                <div key={p.candidateId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                  <div>
                    <span style={{ color: T.low, marginRight: 10, fontSize: 11 }}>#{i + 1}</span>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: partyColor(p.party), marginRight: 7 }} />
                    <span style={{ color: T.hi, fontSize: 13 }}>{p.name}</span>
                    <span style={{ color: T.mid, fontSize: 11, marginLeft: 6 }}>{p.state}</span>
                  </div>
                  <ScoreBadge score={p.overallScore} tier={p.tier} />
                </div>
              ))}
            </div>
          </div>

          {/* Filters + Table */}
          <div style={{ display: 'flex', gap: 8, padding: '0 0 14px' }}>
            {[['ALL', 'All'], ['S', 'Senate'], ['H', 'House']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterChamber(v)} style={{
                background: filterChamber === v ? T.accent : T.inputBg,
                border: `1px solid ${filterChamber === v ? T.accent : T.border}`,
                borderRadius: 4, color: filterChamber === v ? '#000' : T.mid,
                fontFamily: MF, fontSize: 11, padding: '6px 14px', cursor: 'pointer',
              }}>{l}</button>
            ))}
            <div style={{ width: 1, background: T.border, margin: '0 4px' }} />
            {[['ALL', 'All'], ['DEM', 'Dem'], ['REP', 'Rep']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterParty(v)} style={{
                background: filterParty === v ? T.accent : T.inputBg,
                border: `1px solid ${filterParty === v ? T.accent : T.border}`,
                borderRadius: 4, color: filterParty === v ? '#000' : T.mid,
                fontFamily: MF, fontSize: 11, padding: '6px 14px', cursor: 'pointer',
              }}>{l}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {[['score', 'Best First'], ['worst', 'Worst First']].map(([v, l]) => (
                <button key={v} onClick={() => setSortBy(v)} style={{
                  background: sortBy === v ? '#1A1A1A' : 'none',
                  border: `1px solid ${sortBy === v ? T.border : 'transparent'}`,
                  borderRadius: 4, color: sortBy === v ? T.hi : T.mid,
                  fontFamily: MF, fontSize: 11, padding: '6px 14px', cursor: 'pointer',
                }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.cardB }}>
                  {['Rank', 'Politician', 'Party/State', 'Total Raised', 'Score'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: T.mid, fontFamily: MF, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <>
                    <tr
                      key={p.candidateId}
                      onClick={() => setExpandedId(expandedId === p.candidateId ? null : p.candidateId)}
                      style={{
                        background: expandedId === p.candidateId ? T.cardB : i % 2 === 0 ? T.card : T.tableAlt,
                        borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '10px 14px', color: T.low, fontWeight: 700 }}>#{i + 1}</td>
                      <td style={{ padding: '10px 14px', color: T.hi, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: partyColor(p.party), marginRight: 6 }} />
                        <span style={{ color: T.mid, fontSize: 11 }}>
                          {p.party} · {p.state} · {p.office === 'S' ? 'Senate' : p.office === 'H' ? 'House' : p.office || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: T.hi }}>{fmtM(p.totalRaised || 0)}</td>
                      <td style={{ padding: '10px 14px' }}><ScoreBadge score={p.overallScore} tier={p.tier} /></td>
                    </tr>
                    {expandedId === p.candidateId && (
                      <tr key={`${p.candidateId}-expand`} style={{ background: T.cardB }}>
                        <td colSpan={5} style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.hi, marginBottom: 12 }}>Score Breakdown</div>
                              {Object.entries(COMPONENT_LABELS).map(([k, label]) => (
                                <ComponentBar key={k} label={label} value={p.components?.[k] ?? null} T={T} />
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.hi, marginBottom: 12 }}>Risk Factors</div>
                              {(p.riskFactors || []).length === 0 ? (
                                <div style={{ fontSize: 12, color: GREEN }}>No risk factors detected</div>
                              ) : (
                                <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                                  {p.riskFactors.map((f, fi) => (
                                    <li key={fi} style={{ fontSize: 12, color: T.mid, marginBottom: 6 }}>{f}</li>
                                  ))}
                                </ul>
                              )}
                              {p.candidateId && (
                                <a
                                  href={`https://www.fec.gov/data/candidate/${p.candidateId}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: T.accent, textDecoration: 'none', fontSize: 11, marginTop: 12, display: 'inline-block' }}
                                >
                                  View FEC Profile ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
