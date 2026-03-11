import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getDarkMoneyOrgs, getDarkMoneyFlowData } from '../api/client'

const ORANGE = '#FF8000'
const RED    = '#E63946'
const GREEN  = '#2DC653'
const YELLOW = '#FFB84D'
const MF     = "'IBM Plex Mono','Courier New',monospace"
const SF     = "'Playfair Display',Georgia,serif"

const DISCLOSURE_COLORS = { dark: RED, partial: YELLOW, disclosed: GREEN }
const DISCLOSURE_LABELS = {
  dark: 'DARK — No known donors',
  partial: 'PARTIAL — Some donors known',
  disclosed: 'DISCLOSED — Donors public',
}

function DisclosurePill({ level }) {
  const color = DISCLOSURE_COLORS[level] || '#888'
  return (
    <span style={{
      background: color + '22', border: `1px solid ${color}`,
      color, fontFamily: MF, fontSize: 10, padding: '2px 8px', borderRadius: 12,
      fontWeight: 700, letterSpacing: 0.5,
    }}>
      {(level || '—').toUpperCase()}
    </span>
  )
}

function FlowDiagram({ nodes, links, T }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: T.mid }}>
        No flow data available. Organizations may not have traceable committee transfers in FEC records.
      </div>
    )
  }
  const fmt = v => `$${(v / 1e6).toFixed(1)}M`
  const sources = nodes.filter(n => n.type === 'source')
  const orgs = nodes.filter(n => n.type !== 'source')
  const cols = [
    { label: 'Unknown Sources', items: sources, color: '#555' },
    { label: '501(c)(4) / Super PACs', items: orgs, color: RED },
  ]
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 0, minWidth: 500 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ flex: 1, padding: '0 12px' }}>
            <div style={{ fontSize: 10, color: T.mid, fontFamily: MF, textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
              {col.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.items.map((item, ii) => (
                <div key={ii} style={{ background: col.color + '18', border: `1px solid ${col.color}55`, borderRadius: 5, padding: '10px 12px', position: 'relative' }}>
                  <div style={{ fontSize: 11, color: T.hi, fontFamily: MF, marginBottom: 4, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: col.color, fontWeight: 700 }}>{fmt(item.amount || 0)}</div>
                  {ci < cols.length - 1 && (
                    <div style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', color: col.color, fontSize: 18 }}>→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DarkMoneyTracker({ theme }) {
  const T = theme || {
    bg: '#0D0D0D', card: '#161616', cardB: '#1D1D1D', border: '#272727',
    hi: '#FFFFFF', mid: '#888888', low: '#484848', accent: ORANGE,
    grid: '#1E1E1E', tableAlt: '#111111', inputBg: '#0A0A0A',
  }

  const [orgs, setOrgs] = useState([])
  const [flowData, setFlowData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('orgs')
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [filterLevel, setFilterLevel] = useState('ALL')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [orgsRes, flowRes] = await Promise.allSettled([
          getDarkMoneyOrgs(),
          getDarkMoneyFlowData(),
        ])
        if (orgsRes.status === 'fulfilled') setOrgs(orgsRes.value?.data || [])
        if (flowRes.status === 'fulfilled') setFlowData(flowRes.value?.data || { nodes: [], links: [] })
        if (orgsRes.status === 'rejected') setError(orgsRes.reason?.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = orgs.filter(o => filterLevel === 'ALL' || o.disclosureLevel === filterLevel)
  const totalDark = orgs.filter(o => o.disclosureLevel === 'dark').reduce((s, o) => s + (o.totalSpend || 0), 0)
  const totalPartial = orgs.filter(o => o.disclosureLevel === 'partial').reduce((s, o) => s + (o.totalSpend || 0), 0)
  const totalDisclosed = orgs.filter(o => o.disclosureLevel === 'disclosed').reduce((s, o) => s + (o.totalSpend || 0), 0)
  const totalAll = totalDark + totalPartial + totalDisclosed
  const fmt = v => `$${(v / 1e6).toFixed(1)}M`

  // Aggregate spending by issue area for chart
  const issueMap = {}
  for (const org of orgs) {
    const key = org.issues || 'General advocacy'
    if (!issueMap[key]) issueMap[key] = { name: key, dark: 0, partial: 0, disclosed: 0 }
    issueMap[key][org.disclosureLevel || 'dark'] += (org.totalSpend || 0) / 1e6
  }
  const industryData = Object.values(issueMap)
    .sort((a, b) => (b.dark + b.partial + b.disclosed) - (a.dark + a.partial + a.disclosed))
    .slice(0, 8)

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', fontFamily: MF, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.mid, fontSize: 14 }}>Loading dark money data from FEC...</div>
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
            Dark Money Tracker
          </h1>
        </div>
        <p style={{ margin: 0, color: T.mid, fontSize: 13 }}>
          Super PACs and 501(c)(4) organizations from FEC public records.
          Color coding: <span style={{ color: GREEN }}>disclosed</span> → <span style={{ color: YELLOW }}>partial</span> → <span style={{ color: RED }}>fully dark</span>.
        </p>
        <p style={{ margin: '4px 0 0', color: RED, fontSize: 11, fontStyle: 'italic' }}>
          Analytical inference — not legal conclusion. Data from FEC public records.
        </p>
        {error && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 4, fontSize: 11, color: RED }}>
            API error: {error}
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Dark Money', value: fmt(totalDark), sub: 'No donors disclosed', color: RED },
          { label: 'Partial Disclosure', value: fmt(totalPartial), sub: 'Some donors known', color: YELLOW },
          { label: 'Fully Disclosed', value: fmt(totalDisclosed), sub: 'All donors public', color: GREEN },
          { label: 'Total (This Set)', value: fmt(totalAll), sub: `${orgs.length} organizations`, color: ORANGE },
        ].map(k => (
          <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '16px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: MF }}>{k.value}</div>
            <div style={{ fontSize: 12, color: T.hi, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: T.mid, marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
        {[
          { key: 'orgs', label: `Organizations (${orgs.length})` },
          { key: 'flow', label: 'Money Flow' },
          { key: 'spending', label: 'By Issue Area' },
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

      <div style={{ marginTop: 20 }}>
        {/* Organizations Tab */}
        {activeTab === 'orgs' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['ALL', 'All Orgs'], ['dark', 'Dark'], ['partial', 'Partial'], ['disclosed', 'Disclosed']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFilterLevel(v)}
                  style={{
                    background: filterLevel === v ? T.accent : T.inputBg,
                    border: `1px solid ${filterLevel === v ? T.accent : T.border}`,
                    borderRadius: 4, color: filterLevel === v ? '#000' : T.mid,
                    fontFamily: MF, fontSize: 11, padding: '6px 14px', cursor: 'pointer',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '48px', textAlign: 'center', color: T.mid }}>
                {orgs.length === 0
                  ? 'No organizations loaded from FEC. API may be rate-limited (DEMO_KEY: 1000 calls/day) or temporarily unavailable.'
                  : 'No organizations match current filter.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(org => (
                  <div
                    key={org.id}
                    onClick={() => setSelectedOrg(selectedOrg?.id === org.id ? null : org)}
                    style={{
                      background: T.card, border: `1px solid ${selectedOrg?.id === org.id ? ORANGE : T.border}`,
                      borderRadius: 6, padding: '16px 20px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.hi, marginBottom: 4 }}>{org.name}</div>
                        <div style={{ fontSize: 11, color: T.mid, marginBottom: 6 }}>
                          {org.type} · {org.cycle} Cycle · {org.state || 'National'}
                          {org.treasurer ? ` · Treasurer: ${org.treasurer}` : ''}
                        </div>
                        {org.issues && <div style={{ fontSize: 12, color: T.mid }}>Issues: {org.issues}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: ORANGE }}>{fmt(org.totalSpend || 0)}</div>
                        <div style={{ marginTop: 6 }}><DisclosurePill level={org.disclosureLevel} /></div>
                      </div>
                    </div>

                    {selectedOrg?.id === org.id && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                        {org.connectedOrg && (
                          <div style={{ fontSize: 12, color: T.mid, marginBottom: 8 }}>
                            <strong style={{ color: T.hi }}>Connected Organization:</strong> {org.connectedOrg}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: YELLOW, fontStyle: 'italic', marginBottom: 12 }}>
                          {DISCLOSURE_LABELS[org.disclosureLevel] || org.disclosureLevel}
                        </div>
                        <a
                          href={`https://www.fec.gov/data/committee/${org.id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: T.accent, textDecoration: 'none', fontFamily: MF, fontSize: 11 }}
                          onClick={e => e.stopPropagation()}
                        >
                          View FEC Filing ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Flow Diagram Tab */}
        {activeTab === 'flow' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '24px' }}>
            <div style={{ fontFamily: SF, fontSize: 16, fontWeight: 700, color: T.hi, marginBottom: 6 }}>
              Dark Money Flow — FEC Data
            </div>
            <div style={{ fontSize: 12, color: T.mid, marginBottom: 20 }}>
              Funding chains from unknown sources through Super PACs and 501(c)(4)s based on FEC disbursement data.
            </div>
            <FlowDiagram nodes={flowData.nodes} links={flowData.links} T={T} />
            <div style={{ marginTop: 20, padding: '12px 16px', background: T.cardB, borderRadius: 4, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: RED, fontStyle: 'italic' }}>
                Disclaimer: Connections to anonymous donors are inferred from public FEC filings and organizational relationships.
                This is not a confirmed funding trace.
              </div>
            </div>
          </div>
        )}

        {/* Spending by Issue Area */}
        {activeTab === 'spending' && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '24px' }}>
            <div style={{ fontFamily: SF, fontSize: 16, fontWeight: 700, color: T.hi, marginBottom: 16 }}>
              Political Spending by Issue Area ($M)
            </div>
            {industryData.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: T.mid }}>
                No spending data available.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={industryData} margin={{ left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                    <XAxis dataKey="name" tick={{ fill: T.mid, fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fill: T.mid, fontSize: 10 }} unit="M" />
                    <Tooltip
                      contentStyle={{ background: T.cardB, border: `1px solid ${T.border}`, fontFamily: MF, fontSize: 11 }}
                      formatter={(v, name) => [`$${v.toFixed(1)}M`, name]}
                    />
                    <Bar dataKey="dark" stackId="a" name="Dark (no disclosure)" fill={RED} />
                    <Bar dataKey="partial" stackId="a" name="Partial disclosure" fill={YELLOW} />
                    <Bar dataKey="disclosed" stackId="a" name="Fully disclosed" fill={GREEN} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', fontSize: 11 }}>
                  <span style={{ color: RED }}>■ Dark</span>
                  <span style={{ color: YELLOW }}>■ Partial</span>
                  <span style={{ color: GREEN }}>■ Disclosed</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
