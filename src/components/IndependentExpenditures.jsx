import { useState, useEffect } from 'react'
import { useTheme } from '../theme/index.js'

// Story F: Attack-ad coordination — independent expenditures from committees
// supporting or opposing candidates. Real data from Supabase (fec-ies ingest).
// Journalists: look for same payee_name (media buyer / ad vendor) appearing
// across multiple SuperPACs near the same election — coordination signal.

const API_BASE = import.meta.env.VITE_API_URL || ''

async function fetchIEs({ candidateId, committeeId, cycle, limit = 100 } = {}) {
  const params = new URLSearchParams({ limit })
  if (candidateId) params.set('candidate_id', candidateId)
  if (committeeId) params.set('committee_id', committeeId)
  if (cycle)       params.set('cycle', cycle)
  const res = await fetch(`${API_BASE}/api/spending/independent-expenditures?${params}`)
  if (!res.ok) throw new Error(`IE fetch failed: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Unknown error')
  return json.data || []
}

function fmtMoney(n) {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function SupportBadge({ value }) {
  if (!value) return <span>—</span>
  const isSupport = value.toUpperCase().startsWith('S')
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 3,
      fontSize: '0.7rem',
      fontWeight: 600,
      border: `1px solid ${isSupport ? '#4A7FFF' : '#FF8000'}`,
      color: isSupport ? '#4A7FFF' : '#FF8000',
    }}>
      {isSupport ? 'Support' : 'Oppose'}
    </span>
  )
}

export default function IndependentExpenditures({ candidateId, committeeId, cycle: propCycle }) {
  const t = useTheme()
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [search, setSearch] = useState('')
  const [cycle, setCycle]   = useState(propCycle || 2026)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchIEs({ candidateId, committeeId, cycle })
      .then(data => { setRows(data); setLoading(false) })
      .catch(err  => { setError(err.message); setLoading(false) })
  }, [candidateId, committeeId, cycle])

  const filtered = rows.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (r.committee_id || '').toLowerCase().includes(s) ||
      (r.candidate_id || '').toLowerCase().includes(s) ||
      (r.payee_name   || '').toLowerCase().includes(s) ||
      (r.purpose      || '').toLowerCase().includes(s)
    )
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <h6 style={{ margin: 0, flexGrow: 1, color: t.hi, fontSize: '1rem', fontWeight: 600 }}>
          Independent Expenditures
        </h6>
        <select
          value={cycle}
          onChange={e => setCycle(Number(e.target.value))}
          style={{ background: t.inputBg, color: t.hi, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', fontSize: '0.85rem' }}
        >
          <option value={2026}>2026</option>
          <option value={2024}>2024</option>
          <option value={2022}>2022</option>
        </select>
        <input
          type="text"
          placeholder="Search payee, candidate, purpose…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: t.inputBg, color: t.hi, border: `1px solid ${t.border}`, borderRadius: 4, padding: '5px 10px', fontSize: '0.85rem', minWidth: 240 }}
        />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: t.mid }}>Loading…</div>
      )}

      {error && (
        <div style={{ background: t.card, border: `1px solid ${t.warn}`, borderRadius: 4, padding: '10px 14px', color: t.warn, marginBottom: 12, fontSize: '0.875rem' }}>
          {error.includes('Failed') || error.includes('fetch')
            ? <>Data not yet available — run <code>fec-ies</code> ingest for cycle {cycle}.</>
            : error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 4, padding: '10px 14px', color: t.mid, fontSize: '0.875rem' }}>
          No independent expenditure records found for this filter.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: t.cardB, borderBottom: `1px solid ${t.border}` }}>
                {['Committee','Candidate','S/O','Amount','Payee','Purpose','Date'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: t.mid, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r, i) => (
                <tr key={r.sub_id || i} style={{ borderBottom: `1px solid ${t.border}`, background: i % 2 === 0 ? t.card : t.tableAlt }}>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: t.mid }}>{r.committee_id}</td>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: '0.72rem', color: t.mid }}>{r.candidate_id || '—'}</td>
                  <td style={{ padding: '5px 10px' }}><SupportBadge value={r.support_oppose} /></td>
                  <td style={{ padding: '5px 10px', fontWeight: 600, color: t.accent }}>{fmtMoney(r.expenditure_amount)}</td>
                  <td style={{ padding: '5px 10px', color: t.hi }}>{r.payee_name || '—'}</td>
                  <td style={{ padding: '5px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.mid }}>{r.purpose || '—'}</td>
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: t.mid }}>{r.expenditure_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 200 && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: t.low }}>
          Showing top 200 of {filtered.length} records. Use candidate/committee filters to narrow.
        </p>
      )}
    </div>
  )
}
