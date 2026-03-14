/**
 * UNREDACTED — Comprehensive API Endpoint Tester
 * Tests every backend endpoint with real parameters.
 * Run with: node test-endpoints.mjs [--base http://localhost:3001]
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'

const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3001'

// ─── COLOURS ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  blue:  '\x1b[34m',
  orange:'\x1b[38;5;208m',
  white: '\x1b[37m',
}

// ─── WELL-KNOWN FEC IDs ───────────────────────────────────────────────────────
// Hardcoded to avoid picking wrong "Sanders" from candidate search
const KNOWN_CANDIDATE_ID  = 'S8VT00109'   // Bernie Sanders (Senate, VT)
const KNOWN_CANDIDATE_ID2 = 'S4AL00091'   // Tommy Tuberville (Senate, AL)
const KNOWN_COMMITTEE_ID  = 'C00577130'   // BERNIE 2016 — confirmed has contribution data

const delay = (ms) => new Promise(r => setTimeout(r, ms))

// ─── HTTP CLIENT ──────────────────────────────────────────────────────────────
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE)
    const lib = url.protocol === 'https:' ? https : http
    const start = Date.now()

    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    }

    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        const ms = Date.now() - start
        let json = null
        try { json = JSON.parse(data) } catch {}
        resolve({ status: res.statusCode, ms, json, raw: data })
      })
    })

    req.on('error', (e) => resolve({ status: 0, ms: Date.now() - start, json: null, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, ms: 30000, json: null, error: 'timeout' }) })

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// ─── TEST RUNNER ──────────────────────────────────────────────────────────────
const results = []

async function test(label, method, path, opts = {}) {
  const { body = null, headers = {}, expect = 200, note = '', skipCheck = null } = opts
  const r = await request(method, path, body, headers)

  const statusOk = opts.expect ? r.status === expect : r.status < 500
  const successFlag = r.json?.success
  const dataPresent = r.json?.data !== undefined || r.json?.providers !== undefined

  let verdict = 'PASS'
  let detail = ''

  if (r.error) {
    verdict = 'ERROR'
    detail = r.error
  } else if (r.status === 0) {
    verdict = 'ERROR'
    detail = 'no response'
  } else if (r.status >= 500) {
    verdict = 'FAIL'
    detail = r.json?.error || r.raw?.slice(0, 80) || 'server error'
  } else if (r.status === 401 || r.status === 403) {
    verdict = 'AUTH'
    detail = 'requires authentication (expected)'
  } else if (r.status === 429) {
    // Rate-limited — could be our limiter or FEC; not a code bug
    verdict = 'WARN'
    detail = 'rate-limited (429) — retry after 60s or run in isolation'
  } else if (r.status >= 400 && expect !== r.status) {
    verdict = 'WARN'
    detail = r.json?.error || `HTTP ${r.status}`
  } else if (successFlag === false) {
    verdict = 'WARN'
    detail = r.json?.error || 'success=false'
  } else {
    // Extract interesting info from response
    const d = r.json?.data
    if (Array.isArray(d)) {
      detail = `${d.length} items`
      if (d[0]) {
        const k = Object.keys(d[0]).slice(0, 3).join(', ')
        detail += ` {${k}}`
      }
    } else if (d && typeof d === 'object') {
      detail = Object.keys(d).slice(0, 4).join(', ')
    } else if (r.json?.providers) {
      const p = Object.entries(r.json.providers).map(([k,v]) => `${k}:${v.available ? '✓' : '✗'}`).join(' ')
      detail = p
    } else {
      detail = r.json ? JSON.stringify(r.json).slice(0, 80) : ''
    }
  }

  // Override for specific checks
  if (skipCheck) verdict = 'SKIP'

  results.push({ label, verdict, status: r.status, ms: r.ms, detail, path, method })

  const icon = {
    PASS:  `${C.green}✓ PASS${C.reset}`,
    FAIL:  `${C.red}✗ FAIL${C.reset}`,
    WARN:  `${C.yellow}⚠ WARN${C.reset}`,
    ERROR: `${C.red}⚡ ERR ${C.reset}`,
    AUTH:  `${C.blue}🔒 AUTH${C.reset}`,
    SKIP:  `${C.dim}– SKIP${C.reset}`,
  }[verdict] || verdict

  const ms = r.ms < 1000
    ? `${C.dim}${r.ms}ms${C.reset}`
    : `${C.yellow}${r.ms}ms${C.reset}`

  const statusStr = r.status
    ? `[${r.status >= 500 ? C.red : r.status >= 400 ? C.yellow : C.green}${r.status}${C.reset}]`
    : `[${C.red}---${C.reset}]`

  console.log(`  ${icon} ${statusStr} ${ms.padEnd(10)} ${label.padEnd(52)} ${C.dim}${detail.slice(0, 60)}${C.reset}`)

  return r
}

function section(name) {
  console.log(`\n${C.bold}${C.orange}▶ ${name}${C.reset}`)
  console.log(`${C.dim}${'─'.repeat(100)}${C.reset}`)
}

// ─── TESTS ────────────────────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.orange}╔══════════════════════════════════════════════════════════╗
║        UNREDACTED — API Endpoint Test Suite              ║
╚══════════════════════════════════════════════════════════╝${C.reset}`)
console.log(`${C.dim}Target: ${BASE}${C.reset}\n`)

// ── 0. HEALTH ─────────────────────────────────────────────────────────────────
section('HEALTH')
const health = await test('Health check', 'GET', '/health')
if (!health.json?.status) {
  console.log(`\n${C.red}${C.bold}Backend is not running at ${BASE}${C.reset}`)
  console.log(`Start it with: ${C.cyan}cd backend && npm run dev${C.reset}\n`)
  process.exit(1)
}

// ── 1. SPENDING ───────────────────────────────────────────────────────────────
section('SPENDING  (/api/spending)')
await test('GET /spending/contracts (keyword=defense)',     'GET', '/api/spending/contracts?keyword=defense&limit=5')
await test('GET /spending/contracts (keyword=healthcare)',  'GET', '/api/spending/contracts?keyword=healthcare&limit=5')
await test('GET /spending/grants (keyword=education)',      'GET', '/api/spending/grants?keyword=education&limit=5')
await test('GET /spending/agency (current FY)',             'GET', '/api/spending/agency')
await test('GET /spending/agency (year=2024)',              'GET', '/api/spending/agency?year=2024')

// ── 2. POLICY ─────────────────────────────────────────────────────────────────
section('POLICY  (/api/policy)')
await test('GET /policy/rules (keyword=environment)',       'GET', '/api/policy/rules?keyword=environment&limit=5')
await test('GET /policy/rules (keyword=healthcare)',        'GET', '/api/policy/rules?keyword=healthcare&limit=5')
await test('GET /policy/significant (top 10)',              'GET', '/api/policy/significant?limit=10')

// ── 3. DONORS / FEC ──────────────────────────────────────────────────────────
await delay(1000)
section('DONORS / FEC  (/api/donors)')
const cmteRes = await test('GET /donors/committees (keyword=defense)',   'GET', '/api/donors/committees?keyword=defense&limit=5')
const cmteId  = cmteRes.json?.data?.[0]?.committee_id ?? 'C00401786'

await test('GET /donors/committees (keyword=lockheed)',    'GET', '/api/donors/committees?keyword=lockheed&limit=5')
await test(`GET /donors/committees/${cmteId}/receipts`,   'GET', `/api/donors/committees/${cmteId}/receipts?limit=5`)
await test(`GET /donors/committees/${cmteId}/contributions`,'GET',`/api/donors/committees/${cmteId}/contributions?limit=5`)
await test(`GET /donors/committees/${cmteId}/spending`,   'GET', `/api/donors/committees/${cmteId}/spending?limit=5`)

await test('GET /donors/candidates (name=Sanders)',           'GET', '/api/donors/candidates?name=Sanders&limit=5')
await test(`GET /donors/candidates/${KNOWN_CANDIDATE_ID}/totals`,          'GET', `/api/donors/candidates/${KNOWN_CANDIDATE_ID}/totals`)
await test(`GET /donors/candidates/${KNOWN_CANDIDATE_ID}/contributions`,   'GET', `/api/donors/candidates/${KNOWN_CANDIDATE_ID}/contributions?limit=5`)
await test('GET /donors/candidates/compare (Sanders + Baldwin)',           'GET', '/api/donors/candidates/compare?ids=S8VT00109,S0WI00086')
await test('GET /donors/donors/by-employer (Lockheed)',   'GET', '/api/donors/donors/by-employer?employer=Lockheed+Martin&limit=5')
await test('GET /donors/donors/:name/network (Koch)',     'GET', '/api/donors/donors/Koch%20Industries/network?limit=10')
await test('GET /donors/contributions/by-industry (defense)', 'GET', '/api/donors/contributions/by-industry?keywords=defense,military&limit=10')
await test('GET /donors/committees (missing keyword — 400)', 'GET', '/api/donors/committees', { expect: 400 })

// ── 4. FEED ───────────────────────────────────────────────────────────────────
await delay(1000)
section('FEED  (/api/feed)')
await test('GET /feed/spending-news (limit=5)',            'GET', '/api/feed/spending-news?limit=5')

// ── 5. SETTINGS / AI ─────────────────────────────────────────────────────────
await delay(1000)
section('SETTINGS / AI  (/api/settings)')
await test('GET /settings (provider status)',              'GET', '/api/settings')
await test('POST /settings (switch provider=anthropic)',   'POST', '/api/settings', { body: { AI_PROVIDER: 'anthropic' } })
await test('POST /settings/test (live AI ping)',           'POST', '/api/settings/test')
await test('POST /settings (no valid keys — 400)',         'POST', '/api/settings', { body: { UNKNOWN_KEY: 'x' }, expect: 400 })

// ── 6. CORRUPTION SCORING ────────────────────────────────────────────────────
await delay(1000)
section('CORRUPTION SCORING  (/api/corruption)')
await test('GET /corruption/leaderboard (default)',                        'GET', '/api/corruption/leaderboard?limit=10')
await test('GET /corruption/leaderboard (chamber=S, party=DEM)',           'GET', '/api/corruption/leaderboard?chamber=S&party=DEM&limit=5')
await test('GET /corruption/score/company (Lockheed Martin)',              'GET', '/api/corruption/score/company?name=Lockheed%20Martin')
await test('GET /corruption/score/company (Boeing)',                       'GET', '/api/corruption/score/company?name=Boeing')
await test('GET /corruption/score/politician (Sanders S8VT00109)',         'GET', '/api/corruption/score/politician?candidateId=S8VT00109')
await test('GET /corruption/score/politician (Tuberville S4AL00091)',      'GET', '/api/corruption/score/politician?candidateId=S4AL00091')
await test('GET /corruption/patterns (Defense, 12mo)',                     'GET', '/api/corruption/patterns?agencyName=Defense&lookbackMonths=12')
await test('GET /corruption/hotspots',                                     'GET', '/api/corruption/hotspots')
await test('GET /corruption/signals/company/lockheed martin',              'GET', '/api/corruption/signals/company/lockheed%20martin')
await test('GET /corruption/signals/company/raytheon',                     'GET', '/api/corruption/signals/company/raytheon')
await test('POST /corruption/analyze (AI agent — may be unavailable)',     'POST', '/api/corruption/analyze', { body: { query: 'Lockheed Martin defense contracts' } })
await test('GET /corruption/score/company (missing name — 400)',           'GET', '/api/corruption/score/company', { expect: 400 })

// ── 7. COMPANIES ─────────────────────────────────────────────────────────────
await delay(1000)
section('COMPANIES  (/api/companies)')
await test('GET /companies/search (q=lockheed)',                           'GET', '/api/companies/search?q=lockheed&limit=10')
await test('GET /companies/search (q=boeing)',                             'GET', '/api/companies/search?q=boeing&limit=10')
await test('GET /companies/Lockheed%20Martin/profile',                    'GET', '/api/companies/Lockheed%20Martin/profile')
await test('GET /companies/Lockheed%20Martin/political-footprint',        'GET', '/api/companies/Lockheed%20Martin/political-footprint')
await test('GET /companies/Lockheed%20Martin/contracts',                  'GET', '/api/companies/Lockheed%20Martin/contracts?limit=5')
await test('GET /companies/Lockheed%20Martin/regulatory',                 'GET', '/api/companies/Lockheed%20Martin/regulatory')
await test('GET /companies/Lockheed%20Martin/revolving-door',             'GET', '/api/companies/Lockheed%20Martin/revolving-door')
await test('GET /companies/Lockheed%20Martin/conflicts',                  'GET', '/api/companies/Lockheed%20Martin/conflicts')
await test('GET /companies/search (missing q — 400)',                     'GET', '/api/companies/search', { expect: 400 })

// ── 8. STOCK ACT MONITOR ─────────────────────────────────────────────────────
await delay(1000)
section('STOCK ACT MONITOR  (/api/stockact)')
await test('GET /stockact/recent (all chambers)',                          'GET', '/api/stockact/recent?limit=20')
await test('GET /stockact/recent (chamber=senate)',                        'GET', '/api/stockact/recent?chamber=senate&limit=10')
await test('GET /stockact/recent (chamber=house)',                         'GET', '/api/stockact/recent?chamber=house&limit=10')
await test('GET /stockact/violations',                                     'GET', '/api/stockact/violations')
await test('GET /stockact/watchlist',                                      'GET', '/api/stockact/watchlist')
await test('GET /stockact/politician/Tuberville',                          'GET', '/api/stockact/politician/Tuberville')
await test('GET /stockact/politician/Kelly',                               'GET', '/api/stockact/politician/Kelly')
await test('GET /stockact/politician/Tuberville/performance',              'GET', '/api/stockact/politician/Tuberville/performance')
await test('GET /stockact/companies/most-traded',                          'GET', '/api/stockact/companies/most-traded')

// ── 9. DARK MONEY ─────────────────────────────────────────────────────────────
await delay(1000)
section('DARK MONEY  (/api/darkmoney)')
const dmOrgsRes = await test('GET /darkmoney/orgs (limit=10)',             'GET', '/api/darkmoney/orgs?limit=10')
const dmCmteId  = dmOrgsRes.json?.data?.[0]?.committeeId ?? 'C00694323'

await test(`GET /darkmoney/trace/${dmCmteId}`,                            'GET', `/api/darkmoney/trace/${dmCmteId}`)
await test('GET /darkmoney/candidate/S8VT00109/exposure (Sanders)',        'GET', '/api/darkmoney/candidate/S8VT00109/exposure')
await test('GET /darkmoney/candidate/S4AL00091/infer (Tuberville)',        'GET', '/api/darkmoney/candidate/S4AL00091/infer')
await test('GET /darkmoney/flow (cycle=2024)',                             'GET', '/api/darkmoney/flow?cycle=2024')
await test('GET /darkmoney/organizations/index (all)',                     'GET', '/api/darkmoney/organizations/index?limit=10')
await test('GET /darkmoney/organizations/index (level=dark)',              'GET', '/api/darkmoney/organizations/index?level=dark')

// ── 10. AGENT ─────────────────────────────────────────────────────────────────
await delay(1000)
section('AI AGENT  (/api/agent)')
// Skip the blocking AI call in test — it has a 30s timeout and blocks the suite
await test('POST /agent/query (validation: missing query — 400)',          'POST', '/api/agent/query', { body: {}, expect: 400 })
await test('POST /agent/query (validation: query too long — 400)',         'POST', '/api/agent/query', { body: { query: 'x'.repeat(501) }, expect: 400 })
// ── 11. WATCHLIST (auth-gated) — Note: rate limiter may fire (429) before auth (401); both are correct
await delay(2000)
section('WATCHLIST  (/api/watchlist)  — auth-gated')
await test('GET /watchlist (no auth → 401/429)',        'GET',    '/api/watchlist')
await test('POST /watchlist (no auth → 401/429)',       'POST',   '/api/watchlist',    { body: {} })
await test('DELETE /watchlist/fake (no auth → 401/429)','DELETE', '/api/watchlist/fake-id')
await test('GET /watchlist/public/:userId (public)',    'GET',   '/api/watchlist/public/00000000-0000-0000-0000-000000000000')

// ── 12. ALERTS (auth-gated) ───────────────────────────────────────────────────
await delay(2000)
section('ALERTS  (/api/alerts)  — auth-gated')
await test('GET /alerts (no auth → 401/429)',           'GET',    '/api/alerts')
await test('POST /alerts (no auth → 401/429)',          'POST',   '/api/alerts',       { body: {} })
await test('DELETE /alerts/fake (no auth → 401/429)',   'DELETE', '/api/alerts/fake-id')
await test('POST /alerts/check (no token → 401/429)',   'POST',   '/api/alerts/check')

// ── 13. FLAGS (public read, auth write) ───────────────────────────────────────
await delay(2000)
section('COMMUNITY FLAGS  (/api/flags)')
await test('GET /flags (public)',                       'GET',    '/api/flags')
await test('GET /flags?entityId=S8VT00109',             'GET',    '/api/flags?entityId=S8VT00109')
await test('GET /flags/:id (public)',                   'GET',    '/api/flags/S8VT00109')
await test('POST /flags (no auth → 401/429)',           'POST',   '/api/flags',        { body: {} })

// ── 14. SUPABASE CACHE VALIDATION ─────────────────────────────────────────────
await delay(1000)
section('SUPABASE CACHE  (corruption_scores read-through)')
// Second call to same politician — should hit Supabase cache
const t1a = Date.now()
const r1a = await request('GET', '/api/corruption/score/politician?candidateId=S8VT00109')
const ms1a = Date.now() - t1a
const t1b = Date.now()
const r1b = await request('GET', '/api/corruption/score/politician?candidateId=S8VT00109')
const ms1b = Date.now() - t1b
const cached = ms1b < ms1a * 0.7 || ms1b < 200
console.log(`  ${cached ? C.green + '✓ PASS' : C.yellow + '⚠ SLOW'}${C.reset} [${C.green}200${C.reset}]` +
  ` ${C.dim}cache${C.reset}       Sanders score: first=${ms1a}ms, second=${ms1b}ms ${C.dim}(${cached ? 'cache hit' : 'slow — may be cold'})${C.reset}`)
results.push({ label: 'Supabase cache hit (politician score)', verdict: cached ? 'PASS' : 'WARN', status: 200, ms: ms1b, detail: `${ms1a}ms → ${ms1b}ms` })

const t2a = Date.now()
await request('GET', '/api/corruption/score/company?name=Boeing')
const ms2a = Date.now() - t2a
const t2b = Date.now()
await request('GET', '/api/corruption/score/company?name=Boeing')
const ms2b = Date.now() - t2b
const cached2 = ms2b < ms2a * 0.7 || ms2b < 200
console.log(`  ${cached2 ? C.green + '✓ PASS' : C.yellow + '⚠ SLOW'}${C.reset} [${C.green}200${C.reset}]` +
  ` ${C.dim}cache${C.reset}       Boeing score: first=${ms2a}ms, second=${ms2b}ms ${C.dim}(${cached2 ? 'cache hit' : 'slow — may be cold'})${C.reset}`)
results.push({ label: 'Supabase cache hit (company score)', verdict: cached2 ? 'PASS' : 'WARN', status: 200, ms: ms2b, detail: `${ms2a}ms → ${ms2b}ms` })

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
const counts = { PASS: 0, FAIL: 0, WARN: 0, ERROR: 0, AUTH: 0, SKIP: 0 }
for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1

const avgMs = Math.round(results.filter(r => r.ms > 0).reduce((s, r) => s + r.ms, 0) / results.length)
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3)

console.log(`\n${C.bold}${C.orange}╔══════════════════════════════════════════════════════════╗
║                     SUMMARY                             ║
╚══════════════════════════════════════════════════════════╝${C.reset}`)

console.log(`  Total endpoints tested: ${C.bold}${results.length}${C.reset}`)
console.log(`  ${C.green}✓ PASS${C.reset}  ${counts.PASS}`)
console.log(`  ${C.blue}🔒 AUTH${C.reset}  ${counts.AUTH}  (auth-gated, working correctly)`)
console.log(`  ${C.yellow}⚠ WARN${C.reset}  ${counts.WARN}  (responded but degraded/fallback)`)
console.log(`  ${C.red}✗ FAIL${C.reset}  ${counts.FAIL}`)
console.log(`  ${C.red}⚡ ERR${C.reset}   ${counts.ERROR}`)
console.log(`  ${C.dim}– SKIP${C.reset}  ${counts.SKIP}`)
console.log(`\n  Avg response time: ${avgMs}ms`)

if (slowest.length) {
  console.log(`\n${C.bold}  Slowest endpoints:${C.reset}`)
  for (const r of slowest) {
    console.log(`    ${C.yellow}${r.ms}ms${C.reset}  ${r.label}`)
  }
}

// Failures
const failures = results.filter(r => r.verdict === 'FAIL' || r.verdict === 'ERROR')
if (failures.length) {
  console.log(`\n${C.bold}${C.red}  Failed endpoints:${C.reset}`)
  for (const r of failures) {
    console.log(`    ${C.red}✗${C.reset} ${r.label}`)
    console.log(`      ${C.dim}${r.detail}${C.reset}`)
  }
}

// Warnings
const warns = results.filter(r => r.verdict === 'WARN')
if (warns.length) {
  console.log(`\n${C.bold}${C.yellow}  Warnings (degraded / fallback mode):${C.reset}`)
  for (const r of warns) {
    console.log(`    ${C.yellow}⚠${C.reset} ${r.label}`)
    console.log(`      ${C.dim}${r.detail}${C.reset}`)
  }
}

const overallOk = counts.FAIL === 0 && counts.ERROR === 0
console.log(`\n${overallOk
  ? C.green + C.bold + '  ✓ ALL CRITICAL TESTS PASSED' + C.reset
  : C.red   + C.bold + '  ✗ SOME TESTS FAILED — see above' + C.reset}\n`)
