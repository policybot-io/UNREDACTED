// FEC Operating Expenditures (oppexp) → disbursements_detail + R2 Parquet.
//
// Story unlocked: self-dealing & insider enrichment (RESEARCH_BULK_INGEST §7b-A).
// Journalists use this to find candidates paying vendors they own, family payroll,
// consultant rings, and suspicious single-vendor dominance.
//
// Hot tier: disbursements ≥ $2,000 (keeps ~20–30% of rows, ~95% of dollar volume).
// Cold tier: full Parquet to R2 (all rows, ~300 MB/cycle compressed).

import { OPPEXP, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestOppexp({ cycle, hotMinAmount = 2000, dryRun = false }) {
  const source = 'fec_oppexp'
  const url = bulkUrl('oppexp', cycle)
  const innerName = bulkInnerFilename('oppexp', cycle)
  console.log(`\n[${source}] cycle=${cycle} hotMinAmount=${hotMinAmount} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...OPPEXP, viewName: 'oppexp_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM oppexp_raw`)
    console.log(`  [parsed] ${count} oppexp rows`)

    // ─── Write full Parquet to R2 (cold tier) ─────────────────────────────────
    const parquetKey = `fec/oppexp/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM oppexp_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier: ≥ hotMinAmount only (self-dealing analysis) ────────────────
    const fecDate = s => {
      if (!s || String(s).length !== 8) return null
      const ss = String(s)
      return `${ss.slice(4, 8)}-${ss.slice(0, 2)}-${ss.slice(2, 4)}`
    }

    const rows = await view.run(`
      SELECT
        SUB_ID          AS sub_id,
        CMTE_ID         AS committee_id,
        NAME            AS recipient_name,
        CITY            AS city,
        STATE           AS state,
        TRANSACTION_DT  AS date_str,
        TRANSACTION_AMT AS amount,
        PURPOSE         AS description,
        CATEGORY        AS category,
        CATEGORY_DESC   AS category_desc
      FROM oppexp_raw
      WHERE SUB_ID IS NOT NULL
        AND TRANSACTION_AMT >= ${Number(hotMinAmount) || 0}
    `)

    const disbursements = rows.map(r => ({
      sub_id:                   Number(r.sub_id),
      committee_id:             r.committee_id || null,
      cycle,
      recipient_name:           r.recipient_name || null,
      recipient_city:           r.city || null,
      recipient_state:          r.state || null,
      disbursement_date:        fecDate(r.date_str),
      disbursement_amount:      Number(r.amount || 0),
      disbursement_description: r.description || null,
      purpose_category:         r.category || null,
      purpose_category_desc:    r.category_desc || null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && disbursements.length) {
      const { upserted } = await upsertBatched('disbursements_detail', disbursements, {
        onConflict: 'sub_id',
      })
      upsertedCount = upserted
    }

    console.log(`  [hot] ${disbursements.length} disbursements ≥ $${hotMinAmount} → ${upsertedCount} upserted`)

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
