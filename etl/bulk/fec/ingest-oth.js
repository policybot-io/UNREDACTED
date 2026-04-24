// FEC committee-to-committee transactions (oth) → committee_transfers + R2 Parquet.
//
// `oth` contains any transaction from one committee to another — the core
// dataset for the dark-money flow Sankey (tier 2 → 3/4 edges).
// `OTHER_ID` is the counterparty committee ID.

import { OTH, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestOth({ cycle, dryRun = false }) {
  const source = 'fec_oth'
  const url = bulkUrl('oth', cycle)
  const innerName = bulkInnerFilename('oth', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...OTH, viewName: 'oth_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM oth_raw`)
    console.log(`  [parsed] ${count} oth rows`)

    const parquetKey = `fec/oth/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM oth_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // Filter to committee-to-committee transfers (ENTITY_TP of counterparty ~ committee)
    // OTHER_ID present + looks like a committee id (starts with 'C').
    const rows = await view.run(`
      SELECT
        SUB_ID          AS sub_id,
        CMTE_ID         AS from_cmte,
        OTHER_ID        AS to_cmte,
        TRANSACTION_TP  AS txn_type,
        TRANSACTION_AMT AS amount,
        TRANSACTION_DT  AS date_str,
        ENTITY_TP       AS entity_tp,
        MEMO_CD         AS memo_cd,
        MEMO_TEXT       AS memo_text
      FROM oth_raw
      WHERE SUB_ID IS NOT NULL
        AND OTHER_ID IS NOT NULL
        AND OTHER_ID LIKE 'C%'
    `)

    const fecDate = s => {
      if (!s || String(s).length !== 8) return null
      return `${String(s).slice(4, 8)}-${String(s).slice(0, 2)}-${String(s).slice(2, 4)}`
    }

    const transfers = rows.map(r => ({
      sub_id:            Number(r.sub_id),
      from_committee_id: r.from_cmte,
      to_committee_id:   r.to_cmte,
      transaction_type:  r.txn_type || null,
      transfer_amount:   Number(r.amount || 0),
      transfer_date:     fecDate(r.date_str),
      cycle,
      entity_type:       r.entity_tp || null,
      memo_code:         r.memo_cd || null,
      memo_text:         r.memo_text || null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && transfers.length) {
      const { upserted } = await upsertBatched('committee_transfers', transfers, {
        onConflict: 'sub_id',
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
