// FEC Lobbyist/Registrant Bundled Contributions → lobbyist_bundles + R2 Parquet.
//
// Story unlocked: D. Bundler networks & industry capture.
// Registered lobbyists who bundle contributions from their clients to the lawmakers
// who oversee those clients — the most direct link between corporate lobbying and
// congressional campaign finance.
//
// URL: https://www.fec.gov/files/bulk-downloads/data.fec.gov/lobbyist_bundle.csv
// Single file across all cycles (no per-cycle URL) — direct CSV download.

import { downloadFile, fileChecksum } from '../shared/downloader.js'
import { openCsvView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

// The lobbyist_bundle file uses TRAN_ID (not SUB_ID) as the unique row key.
// We synthesize a stable integer PK from FILE_NUM + TRAN_ID.
function stablePk(fileNum, tranId) {
  // Simple deterministic hash: treat TRAN_ID string as key seeded by FILE_NUM.
  // This is not a cryptographic hash — just needs to be stable across re-runs.
  const s = `${fileNum || 0}:${tranId || ''}`
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  // Make positive and combine with FILE_NUM for additional uniqueness
  return Math.abs(h) + (Number(fileNum || 0) * 1e6)
}

// Single cross-cycle file — all years bundled together
const LOBBYIST_URL = 'https://www.fec.gov/files/bulk-downloads/data.fec.gov/lobbyist_bundle.csv'

export async function ingestLobbyistBundles({ cycle, dryRun = false }) {
  const source = 'fec_lobbyist_bundle'
  const url = LOBBYIST_URL
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const txtPath = await downloadFile(url)
    if (!txtPath) {
      await finishRun(runId, { status: 'ok', rowsRead: 0, rowsParquet: 0, rowsUpserted: 0 })
      console.log(`[${source}] skipped — file not available`)
      return { source, cycle, rowsRead: 0, rowsUpserted: 0 }
    }
    const checksum = await fileChecksum(txtPath)

    // FEC bulk lobbyist_bundle.csv is a committee-level summary (no individual lobbyist
    // records). Columns: Committee_Id, Report_Type, Quarterly_Contribution,
    // Semi_Annual_Contribution — no lobbyist_name or candidate_id.
    // Write to R2 Parquet for future use; skip Supabase hot tier (schema mismatch).
    const view = await openCsvView({ filePath: txtPath, viewName: 'lb_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM lb_raw`)
    console.log(`  [parsed] ${count} lobbyist bundle rows (committee summaries)`)

    // ─── Cold: full Parquet to R2 ─────────────────────────────────────────────
    const parquetKey = `fec/lobbyist_bundles/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM lb_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier: skipped — bulk CSV only has committee totals, not individual
    // lobbyist records. The lobbyist_bundles table expects lobbyist_name + candidate_id.
    console.log(`  [skip] hot tier — lobbyist_bundle.csv is committee summaries only`)
    view.close()

    const upsertedCount = 0

    await finishRun(runId, {
      status: 'ok', rowsRead: Number(count), rowsParquet: Number(count),
      rowsUpserted: upsertedCount, checksum,
    })
    console.log(`[${source}] done: read=${count} parquet=${count} hot=${upsertedCount}`)
    return { source, cycle, rowsRead: Number(count), rowsUpserted: upsertedCount }
  } catch (err) {
    await finishRun(runId, { status: 'error', error: err.message })
    throw err
  }
}
