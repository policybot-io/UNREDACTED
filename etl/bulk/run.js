#!/usr/bin/env node
// Bulk ingest CLI.
// Examples:
//   node etl/bulk/run.js --source fec-candidates --cycle 2024
//   node etl/bulk/run.js --all --cycle 2024 --cycle 2026
//   node etl/bulk/run.js --source fec-candidates --cycle 2024 --dry-run
//   node etl/bulk/run.js --source usa-contracts --fiscal-year 2024
//   node etl/bulk/run.js --source usa-delta --days-back 14
//   node etl/bulk/run.js --source fec-filings --date-range 20260401:20260415 --cycle 2026

import { ingestCandidates }       from './fec/ingest-candidates.js'
import { ingestCommittees }       from './fec/ingest-committees.js'
import { ingestLinks }            from './fec/ingest-links.js'
import { ingestAllCandidateTotals, ingestHSCandidateTotals, ingestPacTotals } from './fec/ingest-totals.js'
import { ingestPas2 }             from './fec/ingest-pas2.js'
import { ingestOth }              from './fec/ingest-oth.js'
import { ingestOppexp }           from './fec/ingest-oppexp.js'
import { ingestIndiv }            from './fec/ingest-indiv.js'
import { ingestIEs }              from './fec/ingest-ies.js'
import { ingestElectioneering }   from './fec/ingest-electioneering.js'
import { ingestCommCosts }        from './fec/ingest-comm-costs.js'
import { ingestLobbyistBundles }  from './fec/ingest-lobbyist-bundles.js'
import { ingestFilingRange }      from './fec/parse-filings.js'
import { ingestContracts }        from './usaspending/parse-contracts.js'
import { ingestAssistance }       from './usaspending/parse-assistance.js'
import { runDeltaIngest }         from './usaspending/bulk-api-job.js'

// ─── Source registry ──────────────────────────────────────────────────────────

const SOURCES = {
  // Phase 1 — core lookup + Sankey
  'fec-candidates':  (args) => ingestCandidates({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-committees':  (args) => ingestCommittees({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-links':       (args) => ingestLinks({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-totals-all':  (args) => ingestAllCandidateTotals({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-totals-hs':   (args) => ingestHSCandidateTotals({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-totals-pac':  (args) => ingestPacTotals({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-pas2':        (args) => ingestPas2({ cycle: args.cycle, hotMinAmount: args.hotMinAmount, dryRun: args.dryRun }),
  'fec-oth':         (args) => ingestOth({ cycle: args.cycle, dryRun: args.dryRun }),

  // Phase 2 — self-dealing / disbursements
  'fec-oppexp':      (args) => ingestOppexp({ cycle: args.cycle, hotMinAmount: args.hotMinAmount || 2000, dryRun: args.dryRun }),

  // Phase 3 — individual contributions (LARGE, 5–20 GB)
  'fec-indiv':       (args) => ingestIndiv({ cycle: args.cycle, hotMinAmount: args.hotMinAmount || 2000, dryRun: args.dryRun }),

  // Phase 4 — IEs, electioneering, comm costs, lobbyist bundles
  'fec-ies':             (args) => ingestIEs({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-electioneering':  (args) => ingestElectioneering({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-comm-costs':      (args) => ingestCommCosts({ cycle: args.cycle, dryRun: args.dryRun }),
  'fec-lobbyist-bundles':(args) => ingestLobbyistBundles({ cycle: args.cycle, dryRun: args.dryRun }),

  // Phase 5 — USASpending
  'usa-contracts':   (args) => ingestContracts({ fiscalYear: args.fiscalYear, dryRun: args.dryRun }),
  'usa-assistance':  (args) => ingestAssistance({ fiscalYear: args.fiscalYear, dryRun: args.dryRun }),
  'usa-delta':       (args) => runDeltaIngest({ daysBack: args.daysBack || 14, awardClass: 'both', dryRun: args.dryRun }),

  // Phase 6 — daily .fec filings (loans, debts, amendments)
  'fec-filings':     (args) => {
    const [start, end] = (args.dateRange || '').split(':')
    if (!start) throw new Error('--source fec-filings requires --date-range YYYYMMDD:YYYYMMDD')
    return ingestFilingRange({ startDate: start, endDate: end || start, cycle: args.cycle, dryRun: args.dryRun })
  },
}

// Phase 1 run order (small → large, preserving FK dependencies)
const PHASE_1_ORDER = [
  'fec-candidates', 'fec-committees', 'fec-links',
  'fec-totals-all', 'fec-totals-hs', 'fec-totals-pac',
  'fec-pas2', 'fec-oth',
]

// Full ingest order (phases 1–4 FEC + phases 5 USASpending)
// Phase 6 (.fec filings) is date-based and run separately via --source fec-filings.
const ALL_ORDER = [
  ...PHASE_1_ORDER,
  'fec-oppexp',
  'fec-ies', 'fec-electioneering', 'fec-comm-costs', 'fec-lobbyist-bundles',
  // indiv last — it's huge and should not block other sources
  'fec-indiv',
]

// ─── CLI arg parser ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    sources: [], cycles: [], fiscalYears: [], all: false, dryRun: false,
    hotMinAmount: 0, daysBack: 14, dateRange: null,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if      (a === '--source')           args.sources.push(argv[++i])
    else if (a === '--cycle')            args.cycles.push(Number(argv[++i]))
    else if (a === '--fiscal-year')      args.fiscalYears.push(Number(argv[++i]))
    else if (a === '--all')              args.all = true
    else if (a === '--dry-run')          args.dryRun = true
    else if (a === '--hot-min-amount')   args.hotMinAmount = Number(argv[++i])
    else if (a === '--days-back')        args.daysBack = Number(argv[++i])
    else if (a === '--date-range')       args.dateRange = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log(`Usage:
  node etl/bulk/run.js --source <name> --cycle <YYYY> [--dry-run]
  node etl/bulk/run.js --all --cycle 2024 --cycle 2026
  node etl/bulk/run.js --source usa-contracts --fiscal-year 2024
  node etl/bulk/run.js --source usa-delta --days-back 14
  node etl/bulk/run.js --source fec-filings --date-range 20260401:20260415 --cycle 2026

FEC sources: ${PHASE_1_ORDER.concat(['fec-oppexp','fec-indiv','fec-ies','fec-electioneering','fec-comm-costs','fec-lobbyist-bundles','fec-filings']).join(', ')}
USA sources: usa-contracts, usa-assistance, usa-delta
Options:
  --dry-run              Parse + preview counts, skip R2 + Supabase writes.
  --hot-min-amount N     Minimum $ for contributions/disbursements to enter Supabase hot tier.
  --days-back N          Days back for usa-delta (default 14).
  --date-range S:E       YYYYMMDD:YYYYMMDD date range for fec-filings.
`)
      process.exit(0)
    }
  }
  return args
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv)

  // Determine which sources to run
  let sources
  if (args.all) {
    sources = ALL_ORDER
  } else if (args.sources.length) {
    sources = args.sources
  } else {
    console.error('Must specify --source <name> or --all')
    process.exit(1)
  }

  // Determine which cycles/fiscal-years to iterate
  const cycles      = args.cycles.length      ? args.cycles      : [2026]
  const fiscalYears = args.fiscalYears.length  ? args.fiscalYears : cycles

  const results = []

  for (const name of sources) {
    const fn = SOURCES[name]
    if (!fn) {
      console.error(`Unknown source: ${name}. Run --help for list.`)
      process.exit(1)
    }

    // USASpending sources iterate over fiscal years, FEC sources over cycles
    const isUSA    = name.startsWith('usa-')
    const isDated  = name === 'fec-filings'
    const isGlobal = name === 'usa-delta'

    if (isGlobal) {
      // Run once — delta ignores cycles
      try {
        const res = await fn({ ...args, cycle: cycles[0] })
        results.push(Array.isArray(res) ? res : [res])
      } catch (err) {
        console.error(`[${name}] FAILED: ${err.message}`)
        results.push([{ source: name, error: err.message }])
      }
    } else if (isDated) {
      // Run once with date range, use first cycle
      try {
        const res = await fn({ ...args, cycle: cycles[0] })
        results.push(Array.isArray(res) ? res : [res])
      } catch (err) {
        console.error(`[${name}] FAILED: ${err.message}`)
        results.push([{ source: name, error: err.message }])
      }
    } else {
      const iters = isUSA ? fiscalYears : cycles
      for (const iter of iters) {
        try {
          const res = await fn({ ...args, cycle: iter, fiscalYear: iter })
          results.push(Array.isArray(res) ? res : [res])
        } catch (err) {
          console.error(`[${name}/${iter}] FAILED: ${err.message}`)
          results.push([{ source: name, cycle: iter, error: err.message }])
        }
      }
    }
  }

  const flat = results.flat()
  console.log('\n─── Summary ─────────────────────────────────')
  for (const r of flat) {
    if (r?.error) {
      console.log(`  ❌ ${r.source} cycle=${r.cycle ?? '?'}: ${r.error}`)
    } else if (r) {
      console.log(`  ✅ ${r.source} cycle=${r.cycle ?? '?'}: read=${r.rowsRead ?? '?'} hot=${r.rowsUpserted ?? '?'}`)
    }
  }

  const hasErrors = flat.some(r => r?.error)
  process.exit(hasErrors ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
