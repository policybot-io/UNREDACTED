/**
 * CorporatePACFlow — Corporate PAC spending leaderboard + politician recipients.
 *
 * Left panel:  Horizontal stacked bar chart showing top corporations ranked by
 *              combined PAC spending, broken out by PAC type:
 *              Connected PAC (orange) | Super PAC (blue) | 501c4 (purple)
 *
 * Right panel: Click a corporation → top politicians receiving their PAC money,
 *              with real names from the politicians table (not FEC IDs).
 *
 * Data path:
 *   pac_committees.connected_org_name → committee_id
 *   → contributions.committee_id / candidate_id
 *   → politicians.fec_candidate_id / name
 */
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { useTheme } from '../theme/index.js'
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from '../theme/tokens.js'
import { Band, Card, SourceFooter } from './ui/index.js'
import { donors } from '../api/client.js'

const CYCLES = ['2026', '2024']
const LIMITS = [10, 20, 30, 50]

const PAC_COLOR       = ORANGE
const SUPER_PAC_COLOR = '#4A7FFF'
const C4_COLOR        = '#9966CC'

const PARTY_COLOR = { DEM: '#4A7FFF', REP: '#FF4444', IND: '#888888' }

function fmt$(v) {
  if (!v && v !== 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}b`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}m`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v}`
}

/** Convert "PELOSI, NANCY" → "Nancy Pelosi" */
function fmtPolitician(raw) {
  if (!raw) return '—'
  const parts = raw.split(',').map(s => s.trim())
  const fmt = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
  return parts.length >= 2 ? `${fmt(parts[1])} ${fmt(parts[0])}` : fmt(parts[0])
}

/** Convert "LOCKHEED MARTIN CORP" → "Lockheed Martin Corp" */
function fmtCorp(s) {
  if (!s) return '—'
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function PartyBadge({ party }) {
  if (!party) return null
  const color = PARTY_COLOR[party] || '#666'
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 2,
      fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5,
      border: `1px solid ${color}44`, color, background: `${color}18`,
    }}>
      {party}
    </span>
  )
}

function PACTypeBadge({ type }) {
  const label = type === 'super_pac' ? 'Super PAC' : type === '501c4' ? '501(c)4' : 'PAC'
  const color = type === 'super_pac' ? SUPER_PAC_COLOR : type === '501c4' ? C4_COLOR : PAC_COLOR
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 2,
      fontSize: 7.5, fontWeight: 700, letterSpacing: 0.3,
      border: `1px solid ${color}44`, color, background: `${color}18`,
    }}>
      {label}
    </span>
  )
}

function CustomTooltip({ active, payload, label, t }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: '8px 12px', fontFamily: MF, fontSize: 10 }}>
      <div style={{ color: t.hi, marginBottom: 4, fontWeight: 600 }}>{fmtCorp(label)}</div>
      {payload.map(p => p.value > 0 && (
        <div key={p.dataKey} style={{ color: p.fill, marginBottom: 2 }}>
          {p.name}: {fmt$(p.value)}
        </div>
      ))}
    </div>
  )
}

export default function CorporatePACFlow() {
  const t = useTheme()
  const [cycle, setCycle]           = useState('2026')
  const [limit, setLimit]           = useState(20)
  const [corps, setCorps]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [selected, setSelected]     = useState(null)
  const [recipients, setRecipients] = useState({ recipients: [], pacs: [] })
  const [loadingRec, setLoadingRec] = useState(false)
  const [recErr, setRecErr]         = useState(null)

  // Load leaderboard
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSelected(null)
    donors.corporatePACs({ cycle, limit })
      .then(r => { if (!cancelled) setCorps(r?.data?.results || []) })
      .catch(() => { if (!cancelled) setCorps([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cycle, limit])

  // Load recipients for selected corp
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoadingRec(true); setRecErr(null)
    donors.corporatePACRecipients(selected.corp_id, { cycle, limit: 15 })
      .then(r => { if (!cancelled) setRecipients(r?.data || { recipients: [], pacs: [] }) })
      .catch(e => { if (!cancelled) setRecErr(e.message) })
      .finally(() => { if (!cancelled) setLoadingRec(false) })
    return () => { cancelled = true }
  }, [selected, cycle])

  const selectStyle = {
    background: t.card, color: t.hi, border: `1px solid ${t.border}`,
    padding: '5px 8px', fontFamily: MF, fontSize: 10, borderRadius: 3,
  }

  // Recharts needs short Y-axis labels
  const chartData = corps.map(c => ({
    ...c,
    label: fmtCorp(c.corp).slice(0, 22),
  }))

  return (
    <div>
      <Band label="Corporate PAC spending — connected PACs, Super PACs, 501(c)4s" right={`${corps.length} CORPORATIONS`} />
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
            TOP
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={selectStyle}>
              {LIMITS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', alignItems: 'center' }}>
            {[[PAC_COLOR, 'Connected PAC'], [SUPER_PAC_COLOR, 'Super PAC'], [C4_COLOR, '501(c)4']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, background: c }} />
                <span style={{ fontFamily: MF, fontSize: 8.5, color: t.mid }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Split panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>

          {/* Left: stacked bar chart */}
          <div style={{ border: `1px solid ${t.border}`, background: t.cardB, borderRadius: 3, padding: '12px 0 8px' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: t.mid, fontFamily: MF, fontSize: 10 }}>Loading corporate PAC data…</div>
            ) : corps.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: t.low, fontFamily: MF, fontSize: 10 }}>
                No corporate PAC data found for {cycle}.<br />
                <span style={{ color: t.low, fontSize: 9 }}>Requires pac_committees.connected_org_name to be populated.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, corps.length * 28)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 8, right: 60, top: 4, bottom: 4 }}
                  barCategoryGap="18%"
                  onClick={d => d?.activePayload && setSelected(corps.find(c => c.corp_id === d.activePayload[0]?.payload?.corp_id) || null)}
                >
                  <CartesianGrid horizontal={false} stroke={t.grid} />
                  <XAxis type="number" tick={{ fontFamily: MF, fontSize: 9, fill: t.mid }} tickFormatter={fmt$} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontFamily: MF, fontSize: 9, fill: t.mid }} width={130} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip t={t} />} cursor={{ fill: `${ORANGE}10` }} />
                  <Bar dataKey="pac_total"       name="Connected PAC" stackId="a" barSize={14} fill={PAC_COLOR}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={PAC_COLOR} fillOpacity={selected?.corp_id === entry.corp_id ? 1 : 0.75} />
                    ))}
                  </Bar>
                  <Bar dataKey="super_pac_total" name="Super PAC"     stackId="a" barSize={14} fill={SUPER_PAC_COLOR}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={SUPER_PAC_COLOR} fillOpacity={selected?.corp_id === entry.corp_id ? 1 : 0.75} />
                    ))}
                  </Bar>
                  <Bar dataKey="c4_total"        name="501(c)4"       stackId="a" barSize={14} fill={C4_COLOR} radius={[0, 3, 3, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={C4_COLOR} fillOpacity={selected?.corp_id === entry.corp_id ? 1 : 0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Right: politician recipients */}
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 3, background: t.cardB, display: 'flex', flexDirection: 'column' }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ textAlign: 'center', color: t.low, fontFamily: MF, fontSize: 10, lineHeight: 1.8 }}>
                  ← Click a corporation<br />to see which politicians<br />received their PAC money
                </div>
              </div>
            ) : (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Corp heading */}
                <div>
                  <div style={{ fontFamily: SF, fontSize: 13, color: t.hi, fontWeight: 700, marginBottom: 4 }}>
                    {fmtCorp(selected.corp)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                    {selected.pacs?.map(p => <PACTypeBadge key={p.committee_id} type={p.type} />)}
                  </div>
                  <div style={{ fontFamily: MF, fontSize: 8.5, color: t.mid }}>
                    {fmt$(selected.total)} total · {selected.pac_count} PAC{selected.pac_count !== 1 ? 's' : ''} · {cycle} cycle
                  </div>
                </div>

                <div style={{ fontFamily: MF, fontSize: 8, color: ORANGE, letterSpacing: 2 }}>TOP POLITICIAN RECIPIENTS</div>

                {loadingRec && (
                  <div style={{ color: t.mid, fontFamily: MF, fontSize: 10, padding: '12px 0' }}>Loading recipients…</div>
                )}
                {recErr && (
                  <div style={{ color: t.warn, fontFamily: MF, fontSize: 9 }}>Error: {recErr}</div>
                )}

                {!loadingRec && !recErr && recipients.recipients.length === 0 && (
                  <div style={{ color: t.low, fontFamily: MF, fontSize: 9, padding: '8px 0' }}>
                    No direct candidate contributions found for this cycle.
                  </div>
                )}

                {!loadingRec && recipients.recipients.map((r, i) => (
                  <div key={r.fec_candidate_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 3,
                    background: i % 2 === 0 ? t.card : 'transparent',
                    border: `1px solid ${t.border}`,
                  }}>
                    <span style={{ fontFamily: MF, fontSize: 9, color: t.low, minWidth: 16 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SF, fontSize: 11, color: t.hi, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fmtPolitician(r.name)}
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
                        <PartyBadge party={r.party} />
                        {r.state && <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>{r.state}</span>}
                        {r.chamber && <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>· {r.chamber}</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily: MF, fontSize: 10, fontWeight: 700, color: ORANGE, whiteSpace: 'nowrap' }}>
                      {fmt$(r.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <SourceFooter s="FEC bulk data — pac_committees (connected_org_name), contributions (Schedule A/B) · politicians table for candidate names · cycles 2024+2026" />
      </Card>
    </div>
  )
}
