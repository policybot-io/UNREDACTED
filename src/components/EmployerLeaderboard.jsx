/**
 * EmployerLeaderboard — Split-panel Follow the Money view.
 *
 * Left panel:  Ranked table of top employers by FEC donation volume,
 *              each classified into a sector via server-side keyword matching.
 * Right panel: 3-tier mini Sankey for the selected employer showing
 *              Employer → Committee (named) → Candidate flow.
 *
 * "Employer" = contributor_employer on FEC Schedule A — a self-reported
 * raw string (e.g. "GOLDMAN SACHS & CO") written by the donor at filing.
 */
import { useEffect, useMemo, useState } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'
import { useTheme } from '../theme/index.js'
import { ORANGE, FONT_MONO as MF } from '../theme/tokens.js'
import { Band, Card, SourceFooter } from './ui/index.js'
import { donors } from '../api/client.js'

const CYCLES  = ['2026', '2024']
const SECTORS = ['All Sectors', 'Finance', 'Technology', 'Healthcare', 'Energy', 'Legal',
                 'Real Estate', 'Defense', 'Media & Entertainment', 'Education',
                 'Labor / Unions', 'Consulting', 'Government / Politics', 'Retired / Inactive', 'Other']
const MIN_OPTIONS = [200, 1000, 5000, 10000, 50000]

const SECTOR_COLOR = {
  'Finance':               '#4A7FFF',
  'Technology':            '#00AADD',
  'Healthcare':            '#44CC88',
  'Energy':                '#FFB84D',
  'Legal':                 '#CC88FF',
  'Real Estate':           '#FF8C42',
  'Defense':               '#FF4466',
  'Media & Entertainment': '#FF66AA',
  'Education':             '#66CCFF',
  'Labor / Unions':        '#FFDD44',
  'Consulting':            '#88BBFF',
  'Government / Politics': '#FF8844',
  'Retired / Inactive':    '#666666',
  'Other':                 '#444444',
}

const TIER_COLOR = { 1: '#4A7FFF', 2: '#9966CC', 3: ORANGE, 4: '#FFB84D', 5: '#00AADD' }

function fmt$(v) {
  if (v == null) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}b`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}m`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v}`
}

function fmtName(s) {
  if (!s) return '—'
  // Title-case the raw all-caps employer string
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function SectorBadge({ sector }) {
  const color = SECTOR_COLOR[sector] || '#444'
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 2,
      fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5,
      border: `1px solid ${color}44`, color, background: `${color}18`,
      whiteSpace: 'nowrap',
    }}>
      {sector}
    </span>
  )
}

function SankeyNode({ x, y, width, height, payload, theme }) {
  if (!payload || height < 2) return null
  const color = TIER_COLOR[payload.tier] || ORANGE
  const label = payload.label || payload.name || '—'
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.85} stroke={color} />
      {height > 12 && (
        <text x={x + width + 6} y={y + height / 2} textAnchor="start" dominantBaseline="middle"
              fontFamily={MF} fontSize={9} fill={theme?.mid || "#BBB"}>
          {label.length > 32 ? label.slice(0, 30) + '…' : label}
        </text>
      )}
    </Layer>
  )
}

function MiniSankey({ edges, t }) {
  const chart = useMemo(() => {
    if (!edges.length) return null
    const idx = new Map()
    const nodes = []
    const register = (id, tier, label) => {
      const k = `${tier}:${id}`
      if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ name: label || id, label: fmtName(label || id), tier }) }
      return idx.get(k)
    }
    const links = []
    for (const e of edges) {
      const s   = register(e.source_id, Number(e.source_tier), e.source_label)
      const tgt = register(e.target_id, Number(e.target_tier), e.target_label)
      const v   = Number(e.amount) || 0
      if (v > 0 && s !== tgt) links.push({ source: s, target: tgt, value: v })
    }
    return nodes.length > 1 && links.length ? { nodes, links } : null
  }, [edges])

  if (!chart) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#444', fontFamily: MF, fontSize: 10 }}>
      No flow data for this employer in the selected cycle.
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={300}>
      <Sankey
        data={chart}
        nodePadding={10}
        nodeWidth={10}
        linkCurvature={0.5}
        iterations={32}
        node={<SankeyNode theme={t} />}
        link={{ stroke: ORANGE, strokeOpacity: 0.25, fill: ORANGE, fillOpacity: 0.2 }}
        margin={{ top: 8, right: 200, bottom: 8, left: 8 }}
      >
        <Tooltip
          contentStyle={{ background: t.card, border: `1px solid ${t.border}`, fontFamily: MF, fontSize: 10, color: t.hi }}
          formatter={v => [fmt$(v), 'amount']}
        />
      </Sankey>
    </ResponsiveContainer>
  )
}

export default function EmployerLeaderboard() {
  const t = useTheme()
  const [cycle, setCycle]       = useState('2026')
  const [sector, setSector]     = useState('All Sectors')
  const [minAmount, setMin]     = useState(200)
  const [employers, setEmp]     = useState([])
  const [loadingEmp, setLdEmp]  = useState(false)
  const [selected, setSelected] = useState(null)   // { employer, employer_id, sector, total, txn_count }
  const [flow, setFlow]         = useState([])
  const [loadingFlow, setLdFlow] = useState(false)
  const [flowErr, setFlowErr]   = useState(null)

  // Load leaderboard
  useEffect(() => {
    let cancelled = false
    setLdEmp(true)
    setSelected(null)
    setFlow([])
    donors.employers({
      cycle,
      minAmount,
      limit: 100,
      ...(sector !== 'All Sectors' && { sector }),
    })
      .then(r => { if (!cancelled) setEmp(r?.data?.results || []) })
      .catch(() => { if (!cancelled) setEmp([]) })
      .finally(() => { if (!cancelled) setLdEmp(false) })
    return () => { cancelled = true }
  }, [cycle, minAmount, sector])

  // Load flow for selected employer
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLdFlow(true); setFlowErr(null); setFlow([])
    donors.employerFlow(selected.employer_id, { cycle, limit: 50 })
      .then(r => { if (!cancelled) setFlow(r?.data?.edges || []) })
      .catch(e => { if (!cancelled) setFlowErr(e.message) })
      .finally(() => { if (!cancelled) setLdFlow(false) })
    return () => { cancelled = true }
  }, [selected, cycle])

  const selectStyle = {
    background: t.card, color: t.hi, border: `1px solid ${t.border}`,
    padding: '5px 8px', fontFamily: MF, fontSize: 10, borderRadius: 3,
  }

  return (
    <div>
      <Band label="Employer Money Flow — ranked by donation volume" right={`${employers.length} EMPLOYERS`} />
      <Card>
        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontFamily: MF, fontSize: 9, color: t.mid, display: 'flex', alignItems: 'center', gap: 5 }}>
            CYCLE
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={selectStyle}>
              {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontFamily: MF, fontSize: 9, color: t.mid, display: 'flex', alignItems: 'center', gap: 5 }}>
            SECTOR
            <select value={sector} onChange={e => setSector(e.target.value)} style={selectStyle}>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ fontFamily: MF, fontSize: 9, color: t.mid, display: 'flex', alignItems: 'center', gap: 5 }}>
            MIN $
            <select value={minAmount} onChange={e => setMin(Number(e.target.value))} style={selectStyle}>
              {MIN_OPTIONS.map(v => <option key={v} value={v}>{fmt$(v)}</option>)}
            </select>
          </label>
          <span style={{ fontFamily: MF, fontSize: 8, color: t.low, marginLeft: 'auto' }}>
            Employer = self-reported field on FEC Schedule A (≥ ${minAmount.toLocaleString()} contributions only)
          </span>
        </div>

        {/* Split panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minHeight: 360 }}>

          {/* Left: leaderboard */}
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 3, overflow: 'hidden' }}>
            {loadingEmp ? (
              <div style={{ padding: 32, textAlign: 'center', color: t.mid, fontFamily: MF, fontSize: 10 }}>Loading employers…</div>
            ) : employers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: t.low, fontFamily: MF, fontSize: 10 }}>No employers found for these filters.</div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: t.cardB, position: 'sticky', top: 0 }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: t.mid, fontFamily: MF, fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>#</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: t.mid, fontFamily: MF, fontSize: 8, fontWeight: 700 }}>EMPLOYER</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: t.mid, fontFamily: MF, fontSize: 8, fontWeight: 700 }}>SECTOR</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', color: t.mid, fontFamily: MF, fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>TOTAL $</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', color: t.mid, fontFamily: MF, fontSize: 8, fontWeight: 700 }}>DONORS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employers.map((row, i) => {
                      const isSelected = selected?.employer_id === row.employer_id
                      return (
                        <tr
                          key={row.employer_id}
                          onClick={() => setSelected(isSelected ? null : row)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: `1px solid ${t.border}`,
                            background: isSelected ? `${ORANGE}18` : i % 2 === 0 ? t.card : t.tableAlt,
                            borderLeft: isSelected ? `3px solid ${ORANGE}` : '3px solid transparent',
                          }}
                        >
                          <td style={{ padding: '5px 8px', color: t.low, fontFamily: MF, fontSize: 9 }}>{i + 1}</td>
                          <td style={{ padding: '5px 8px', color: isSelected ? ORANGE : t.hi, fontFamily: MF, fontSize: 9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fmtName(row.employer)}
                          </td>
                          <td style={{ padding: '5px 8px' }}><SectorBadge sector={row.sector} /></td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: ORANGE, fontFamily: MF, fontSize: 9, whiteSpace: 'nowrap' }}>{fmt$(row.total)}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: t.mid, fontFamily: MF, fontSize: 9 }}>{row.txn_count?.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: mini Sankey */}
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 3, background: t.cardB, display: 'flex', flexDirection: 'column' }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ textAlign: 'center', color: t.low, fontFamily: MF, fontSize: 10, lineHeight: 1.8 }}>
                  ← Select an employer<br />to explore their money flow
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 12px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: MF, fontSize: 11, fontWeight: 700, color: t.hi }}>
                    {fmtName(selected.employer)}
                  </span>
                  <SectorBadge sector={selected.sector} />
                </div>
                <div style={{ fontFamily: MF, fontSize: 8.5, color: t.mid, marginBottom: 10 }}>
                  {fmt$(selected.total)} total · {selected.txn_count?.toLocaleString()} donors · {cycle} cycle
                </div>
                {loadingFlow && (
                  <div style={{ padding: 20, textAlign: 'center', color: t.mid, fontFamily: MF, fontSize: 10 }}>Loading flow…</div>
                )}
                {flowErr && (
                  <div style={{ padding: 12, color: t.warn, fontFamily: MF, fontSize: 9 }}>Flow unavailable: {flowErr}</div>
                )}
                {!loadingFlow && !flowErr && (
                  <MiniSankey edges={flow} t={t} />
                )}
                <div style={{ fontFamily: MF, fontSize: 7.5, color: t.low, marginTop: 6 }}>
                  Employer → Committee → Candidate · top 50 edges by volume
                </div>
              </div>
            )}
          </div>
        </div>

        <SourceFooter s="FEC bulk data — individual contributions (Schedule A ≥ $200) · employer field is self-reported by donor · sector classification via keyword matching" />
      </Card>
    </div>
  )
}
