// FEC Communication Costs → communication_costs + R2 Parquet.
//
// Communication costs are internal corporate/union communications supporting or
// opposing candidates — separate from IEs. Tracked for corporate advocacy exposure.
//
// URL: https://www.fec.gov/files/bulk-downloads/{YYYY}/CommunicationCosts_{YYYY}.csv
// Direct CSV download — no ZIP extraction needed.

import { downloadFile, fileChecksum } from '../shared/downloader.js'
import { openCsvView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestCommCosts({ cycle, dryRun = false }) {
  const source = 'fec_comm_costs'
  const url = `https://www.fec.gov/files/bulk-downloads/${cycle}/CommunicationCosts_${cycle}.csv`
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const txtPath = await downloadFile(url)
    if (!txtPath) {
      await finishRun(runId, { status: 'ok', rowsRead: 0, rowsParquet: 0, rowsUpserted: 0 })
      console.log(`[${source}] skipped — file not available for cycle ${cycle}`)
      return { source, cycle, rowsRead: 0, rowsUpserted: 0 }
    }
    const checksum = await fileChecksum(txtPath)

    // CSV header: CMTE_ID,CAND_ID,SUPPORT_OPPOSE_IND,TRANSACTION_DT,TRANSACTION_AMT,
    //             SCHED_TP_CD,SUB_ID,FILE_NUM,RPT_YR,... (comma-delimited with headers)
    const view = await openCsvView({ filePath: txtPath, viewName: 'cc_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM cc_raw`)
    console.log(`  [parsed] ${count} communication cost rows`)

    // ─── Cold: full Parquet to R2 ─────────────────────────────────────────────
    const parquetKey = `fec/comm_costs/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM cc_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier ─────────────────────────────────────────────────────────────
    // TRANSACTION_DT is YYYYMMDD (e.g. 20241016)
    const fecDate = s => {
      if (!s || String(s).length !== 8) return null
      const ss = String(s)
      return `${ss.slice(0, 4)}-${ss.slice(4, 6)}-${ss.slice(6, 8)}`
    }

    const rows = await view.run(`
      SELECT
        SUB_ID           AS sub_id,
        CMTE_ID          AS committee_id,
        CAND_ID          AS candidate_id,
        SUPPORT_OPPOSE_IND AS support_oppose,
        TRANSACTION_DT   AS date_str,
        TRANSACTION_AMT  AS amount,
        SCHED_TP_CD      AS comm_type,
        RPT_YR           AS rpt_yr
      FROM cc_raw
      WHERE SUB_ID IS NOT NULL
    `)

    const costs = rows.map(r => ({
      sub_id:        Number(r.sub_id),
      committee_id:  r.committee_id   || null,
      candidate_id:  r.candidate_id   || null,
      support_oppose:r.support_oppose || null,
      comm_date:     fecDate(r.date_str),
      amount:        Number(r.amount || 0),
      comm_type:     r.comm_type || null,
      cycle:         r.rpt_yr ? Number(r.rpt_yr) : cycle,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && costs.length) {
      const { upserted } = await upsertBatched('communication_costs', costs, {
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
