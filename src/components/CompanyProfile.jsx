import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getCompanyProfile, getCompanyPoliticalFootprint, getCompanyConflicts } from '../api/client'

const ORANGE = '#FF8000'
const RED    = '#E63946'
const GREEN  = '#2DC653'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

function RiskMeter({ score, level, T }) {
  const color = level === 'CRITICAL' ? RED : level === 'HIGH' ? ORANGE : level === 'MEDIUM' ? '#FFB84D' : level === 'LOW' ? GREEN : T.mid
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: color + '15', border: `3px solid ${color}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color, fontSize: 20, fontWeight: 700, fontFamily: MF }}>{score ?? '?'}</span>
        <span style={{ color: color + 'AA', fontSize: 8, letterSpacing: 0.5 }}>/100</span>
      </div>
      <div>
        <div style={{ color, fontWeight: 700, fontFamily: MF, fontSize: 13 }}>{level || 'UNKNOWN'} RISK</div>
        <div style={{ color: T.mid, fontSize: 11, marginTop: 2 }}>RECEIPTS Score</div>
      </div>
    </div>
  )
}

export default function CompanyProfile({ companyName, theme }) {
  const T = theme || {
    bg: '#0D0D0D', card: '#161616', cardB: '#1D1D1D', border: '#272727',
    hi: '#FFFFFF', mid: '#888888', low: '#484848', accent: ORANGE,
    grid: '#1E1E1E', tableAlt: '#111111', inputBg: '#0A0A0A',
  }

  const [searchInput, setSearchInput] = useState(companyName || '')
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [footprint, setFootprint] = useState(null)
  const [conflicts, setConflicts] = useState(null)
  const [currentName, setCurrentName] = useState('')

  async function fetchCompany(name) {
    if (!name) return
    setLoading(true)
    setError(null)
    setProfile(null)
    setFootprint(null)
    setConflicts(null)
    setCurrentName(name)

    const [profileRes, footprintRes, conflictsRes] = await Promise.allSettled([
      getCompanyProfile(name),
      getCompanyPoliticalFootprint(name),
      getCompanyConflicts(name),
    ])

    if (profileRes.status === 'fulfilled') setProfile(profileRes.value?.data || null)
    else setError(profileRes.reason?.message)
    if (footprintRes.status === 'fulfilled') setFootprint(footprintRes.value?.data || null)
    if (conflictsRes.status === 'fulfilled') setConflicts(conflictsRes.value?.data || null)
    setLoading(false)
  }

  useEffect(() => {
    if (companyName) {
      setSearchInput(companyName)
      fetchCompany(companyName)
    }
  }, [companyName])

  function handleSearch(e) {
    e.preventDefault()
    fetchCompany(searchInput)
  }

  const fmt = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v || 0}`

  const riskScore = profile?.riskScore
  const contracts = profile?.contracts || []
  const pacs = footprint?.pacs || []
  const conflictList = conflicts?.conflicts || []

  // Build year-based spending trend from USASpending contracts
  const spendByYear = {}
  for (const c of contracts) {
    const yr = (c['Award Date'] || '').substring(0, 4)
    if (yr) spendByYear[yr] = (spendByYear[yr] || 0) + (c['Award Amount'] || 0)
  }
  const spendingTrend = Object.entries(spendByYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, amount]) => ({ year, amount: parseFloat((amount / 1e9).toFixed(2)) }))

  const totalContractValue = contracts.reduce((s, c) => s + (c['Award Amount'] || 0), 0)

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'contracts', label: `Contracts (${contracts.length})` },
    { key: 'footprint', label: `PACs (${pacs.length})` },
    { key: 'conflicts', label: `Conflicts (${conflictList.length})` },
  ]

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px' }}>
      {/* Search Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ background: RED, color: '#fff', fontFamily: MF, fontSize: 11, padding: '3px 10px', borderRadius: 3, fontWeight: 700, letterSpacing: 1 }}>
            PHASE 3
          </span>
          <h1 style={{ margin: 0, fontFamily: SF, fontSize: 26, fontWeight: 700, color: T.hi }}>
            Corporate Accountability Tracker
          </h1>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search company name (e.g. Lockheed Martin, Boeing)..."
            style={{
              background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 4,
              color: T.hi, fontFamily: MF, fontSize: 13, padding: '9px 14px', width: 400,
            }}
          />
          <button type="submit" disabled={loading} style={{
            background: T.accent, border: 'none', borderRadius: 4,
            color: '#000', fontFamily: MF, fontSize: 12, fontWeight: 700,
            padding: '9px 20px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Loading...' : 'Audit'}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 4, fontSize: 12, color: RED }}>
          Error: {error}
        </div>
      )}

      {!currentName && !loading && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '48px', textAlign: 'center', color: T.mid }}>
          Enter a company name above to begin audit. Data sourced from USASpending, FEC, and Neo4j graph database.
        </div>
      )}

      {loading && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '48px', textAlign: 'center', color: T.mid }}>
          Fetching data from USASpending, FEC, and Neo4j...
        </div>
      )}

      {!loading && currentName && !profile && !error && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '48px', textAlign: 'center', color: T.mid }}>
          No data found for "{currentName}". Try a slightly different name (e.g. "Boeing" vs "Boeing Company").
        </div>
      )}

      {!loading && profile && (
        <>
          {/* Company Header Card */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontFamily: SF, fontSize: 22, color: T.hi }}>{profile.name}</h2>
                <div style={{ color: T.mid, fontSize: 12 }}>normalized: {profile.normalizedName}</div>
              </div>
              {riskScore && <RiskMeter score={riskScore.overallScore} level={riskScore.riskLevel} T={T} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 }}>
              {[
                { label: 'Contract Value (shown)', value: fmt(totalContractValue), color: ORANGE },
                { label: 'Contract Records', value: contracts.length, color: T.hi },
                { label: 'PAC Committees (FEC)', value: pacs.length, color: RED },
              ].map(k => (
                <div key={k.label}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: T.mid, marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
            {tabs.map(tab => (
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

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {spendingTrend.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px' }}>
                  <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: T.hi, marginBottom: 16 }}>
                    Contract Volume by Year ($B)
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={spendingTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                      <XAxis dataKey="year" tick={{ fill: T.mid, fontSize: 10 }} />
                      <YAxis tick={{ fill: T.mid, fontSize: 10 }} unit="B" />
                      <Tooltip
                        contentStyle={{ background: T.cardB, border: `1px solid ${T.border}`, fontFamily: MF, fontSize: 11 }}
                        formatter={v => [`$${v.toFixed(2)}B`]}
                      />
                      <Bar dataKey="amount" fill={ORANGE} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {riskScore?.evidence && riskScore.evidence.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px' }}>
                  <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: T.hi, marginBottom: 16 }}>Risk Evidence</div>
                  {riskScore.evidence.map((e, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', background: T.cardB, borderRadius: 4,
                      border: `1px solid ${e.severity === 'HIGH' ? RED + '44' : T.border}`, marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.hi }}>
                          {(e.type || '').replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span style={{ background: e.severity === 'HIGH' ? RED : ORANGE, color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 700 }}>
                          {e.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: T.mid }}>{e.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {spendingTrend.length === 0 && (!riskScore?.evidence || riskScore.evidence.length === 0) && (
                <div style={{ gridColumn: '1 / -1', background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '32px', textAlign: 'center', color: T.mid }}>
                  No overview data available. The company name may not match USASpending or Neo4j records exactly.
                </div>
              )}
            </div>
          )}

          {/* Contracts Tab */}
          {activeTab === 'contracts' && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
              {contracts.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: T.mid }}>
                  No contract data from USASpending for "{currentName}".
                  Try searching with a shorter or exact legal name.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.cardB }}>
                      {['Award ID', 'Description', 'Agency', 'Amount', 'Date'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: T.mid, fontFamily: MF, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? T.card : T.tableAlt, borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: '10px 14px', color: T.low, fontFamily: MF, fontSize: 11 }}>{c['Award ID'] || '—'}</td>
                        <td style={{ padding: '10px 14px', color: T.hi, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c['Description'] || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: T.mid }}>{c['Awarding Agency'] || '—'}</td>
                        <td style={{ padding: '10px 14px', color: ORANGE, fontWeight: 600 }}>{fmt(c['Award Amount'] || 0)}</td>
                        <td style={{ padding: '10px 14px', color: T.mid }}>{c['Award Date'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Political Footprint Tab */}
          {activeTab === 'footprint' && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '20px 24px' }}>
              <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: T.hi, marginBottom: 16 }}>
                PAC Committees (FEC)
              </div>
              {pacs.length === 0 ? (
                <div style={{ color: T.mid, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                  No PAC committees found for "{currentName}" in FEC records.
                  Companies may donate through individual employee contributions not tracked here.
                </div>
              ) : (
                pacs.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div>
                      <div style={{ color: T.hi, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ color: T.mid, fontSize: 11, marginTop: 2 }}>ID: {p.id} · Type: {p.type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: ORANGE, fontWeight: 600, fontSize: 14 }}>{fmt(p.totalRaised || 0)}</div>
                      <div style={{ color: T.low, fontSize: 10 }}>raised · {fmt(p.totalSpent || 0)} spent</div>
                    </div>
                  </div>
                ))
              )}
              {footprint?.note && (
                <div style={{ marginTop: 16, fontSize: 11, color: T.low, fontStyle: 'italic' }}>{footprint.note}</div>
              )}
            </div>
          )}

          {/* Conflicts Tab */}
          {activeTab === 'conflicts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '12px 16px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 4 }}>
                <div style={{ fontSize: 12, color: T.mid }}>
                  Corruption signals from Neo4j graph: cross-referencing donation records, contract awards, and committee oversight.
                  Analytical hypotheses — not legal findings. Requires Neo4j with populated data.
                </div>
              </div>
              {conflictList.length === 0 ? (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '32px', textAlign: 'center', color: T.mid }}>
                  No conflict patterns detected. This may indicate clean records or that the Neo4j graph database
                  doesn't yet have sufficient data for this company.
                </div>
              ) : (
                conflictList.map((s, i) => (
                  <div key={i} style={{
                    background: T.card,
                    border: `1px solid ${s.severity === 'HIGH' ? RED + '44' : T.border}`,
                    borderRadius: 6, padding: '18px 22px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: T.hi }}>
                        {(s.type || '').replace(/_/g, ' ')} Pattern
                      </span>
                      <span style={{ background: s.severity === 'HIGH' ? RED : ORANGE, color: '#fff', fontSize: 10, padding: '3px 9px', borderRadius: 3, fontWeight: 700 }}>
                        {s.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: T.mid }}>
                      {s.politician && <span>Politician: <strong style={{ color: T.hi }}>{s.politician}</strong> · </span>}
                      {s.agency && <span>Agency: <strong style={{ color: T.hi }}>{s.agency}</strong> · </span>}
                      {s.contractAmount && <span>Contract: <strong style={{ color: ORANGE }}>{fmt(s.contractAmount)}</strong></span>}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: RED, fontStyle: 'italic' }}>
                      Analytical inference — not legal conclusion
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
