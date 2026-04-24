// FEC Individual Contributions (indiv) → contributions hot tier + R2 Parquet.
//
// Stories unlocked:
//   B. Pay-to-play (employer donations × USASpending contracts cross-join)
//   D. Bundler networks / industry capture (contributor_employer clustering)
//   J. Cash flood anomalies (time-series z-scores on receipts)
//
// LARGE FILE WARNING: indiv is 5–20 GB uncompressed per cycle. DuckDB streams it
// natively; we never load the full file into Node memory. The hot tier filters
// to TRANSACTION_AMT >= hotMinAmount (default $2,000) which yields ~1M rows/cycle.
// Full corpus goes to R2 Parquet (~6 GB compressed, zstd).
//
// URL: https://www.fec.gov/files/bulk-downloads/{cycle}/indiv{yy}.zip
// NOTE: FEC also uses prefix 'itcont' in older docs — verify on
//   https://www.fec.gov/data/browse-data/?tab=bulk-data if 404s occur.

import { INDIV, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

const FALLBACK_PREFIX = 'itcont'  // older FEC naming — used if indiv{yy}.zip 404s

export async function ingestIndiv({ cycle, hotMinAmount = 2000, dryRun = false }) {
  const source = 'fec_indiv'
  const url = bulkUrl('indiv', cycle)
  const innerName = bulkInnerFilename('indiv', cycle)
  console.log(`\n[${source}] cycle=${cycle} hotMinAmount=${hotMinAmount} ${dryRun ? '(DRY RUN)' : ''}`)
  console.log(`  ⚠  Large file (~5–20 GB uncompressed). DuckDB streams. Expect 10–30 min.`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...INDIV, viewName: 'indiv_raw' })

    // Count first (DuckDB scans the view, not all in memory)
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM indiv_raw`)
    console.log(`  [parsed] ${count} indiv rows`)

    // ─── Write full Parquet to R2 in chunked partitions ─────────────────────
    // DuckDB COPY TO handles large files by streaming internally.
    // Use HIVE_PARTITIONING on year-derived from transaction date for future
    // partition-pruning on analytics queries.
    const parquetKey = `fec/indiv/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      console.log(`  [r2] writing Parquet (this may take several minutes)…`)
      await view.exec(`
        COPY (
          SELECT *, ${cycle} AS _cycle FROM indiv_raw
        )
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier: individual contribs ≥ hotMinAmount ────────────────────────
    // Filter + transform in DuckDB; result set fits in Node memory (~1M rows × ~15 cols).
    const fecDate = s => {
      if (!s || String(s).length !== 8) return null
      const ss = String(s)
      return `${ss.slice(4, 8)}-${ss.slice(0, 2)}-${ss.slice(2, 4)}`
    }

    const rows = await view.run(`
      SELECT
        SUB_ID           AS sub_id,
        CMTE_ID          AS committee_id,
        NAME             AS contributor_name,
        CITY             AS city,
        STATE            AS state,
        ZIP_CODE         AS zip,
        EMPLOYER         AS employer,
        OCCUPATION       AS occupation,
        TRANSACTION_DT   AS date_str,
        TRANSACTION_AMT  AS amount,
        TRANSACTION_TP   AS receipt_type,
        OTHER_ID         AS candidate_id,
        MEMO_TEXT        AS memo_text
      FROM indiv_raw
      WHERE TRANSACTION_AMT >= ${Number(hotMinAmount) || 0}
        AND SUB_ID IS NOT NULL
    `)

    console.log(`  [hot] ${rows.length} rows with amount ≥ $${hotMinAmount}`)

    const contribs = rows.map(r => ({
      contribution_id:        String(r.sub_id),
      contributor_name:       r.contributor_name || '',
      contributor_employer:   r.employer   || null,
      contributor_occupation: r.occupation || null,
      contributor_city:       r.city  || null,
      contributor_state:      r.state || null,
      contributor_zip:        r.zip   || null,
      amount:                 Number(r.amount || 0),
      date:                   fecDate(r.date_str),
      committee_id:           r.committee_id || null,
      // Individual contributions don't have a candidate_id in the main field
      // (they go to committees, not directly to candidates). OTHER_ID may
      // hold a conduit committee or candidate ID for memo transactions.
      candidate_id:           r.candidate_id && r.candidate_id.startsWith('P') ? r.candidate_id : null,
      receipt_type:           r.receipt_type || null,
      memo_text:              r.memo_text   || null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && contribs.length) {
      const { upserted } = await upsertBatched('contributions', contribs, {
        onConflict:       'contribution_id',
        batchSize:        100,    // small batches to stay within Supabase Free statement_timeout
        ignoreDuplicates: true,   // DO NOTHING on conflict — far faster than DO UPDATE on re-runs
      })
      upsertedCount = upserted
    }

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
