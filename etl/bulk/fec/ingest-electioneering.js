// FEC Electioneering Communications → electioneering_comms + R2 Parquet.
//
// Story unlocked: disguised-issue-ad exposure — corp/union "issue ads" that
// mention candidates near elections without explicitly saying "vote for/against."
// These circumvent normal disclosure rules.
//
// URL: https://www.fec.gov/files/bulk-downloads/{YYYY}/ElectioneeringComm_{YYYY}.csv
// Direct CSV download — no ZIP extraction needed.

import { downloadFile, fileChecksum } from '../shared/downloader.js'
import { openCsvView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestElectioneering({ cycle, dryRun = false }) {
  const source = 'fec_electioneering'
  const url = `https://www.fec.gov/files/bulk-downloads/${cycle}/ElectioneeringComm_${cycle}.csv`
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

    // CSV header: CANDIDATE_ID,COMMITTEE_ID,SB_IMAGE_NUM,PAYEE_NAME,
    //             DISBURSEMENT_DESCRIPTION,COMMUNICATION_DATE,REPORTED_DISBURSEMENT_AMOUNT,...
    const view = await openCsvView({ filePath: txtPath, viewName: 'ec_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM ec_raw`)
    console.log(`  [parsed] ${count} electioneering rows`)

    // ─── Cold: full Parquet to R2 ─────────────────────────────────────────────
    const parquetKey = `fec/electioneering/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM ec_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier ─────────────────────────────────────────────────────────────
    // Dates in this CSV are DD-MON-YY (e.g. 21-FEB-24)
    const MON = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'}
    const parseDate = s => {
      if (!s) return null
      const m = String(s).trim().match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/)
      if (!m) return null
      return `20${m[3]}-${MON[m[2]] || '01'}-${m[1].padStart(2, '0')}`
    }
    // Synthetic sub_id from SB_IMAGE_NUM (no SUB_ID in this CSV)
    const stablePk = s => {
      const str = String(s ?? '')  // coerce BigInt → string before hashing
      let h = 0
      for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0
      return Math.abs(h)
    }

    const rows = await view.run(`
      SELECT
        COMMITTEE_ID                  AS committee_id,
        CANDIDATE_ID                  AS candidate_mentioned,
        SB_IMAGE_NUM                  AS image_num,
        PAYEE_NAME                    AS payee_name,
        DISBURSEMENT_DESCRIPTION      AS purpose,
        COMMUNICATION_DATE            AS date_str,
        REPORTED_DISBURSEMENT_AMOUNT  AS amount
      FROM ec_raw
      WHERE COMMITTEE_ID IS NOT NULL
    `)

    const ecs = rows.map(r => ({
      sub_id:             stablePk(r.image_num),
      committee_id:       r.committee_id        || null,
      candidate_mentioned:r.candidate_mentioned || null,
      comm_date:          parseDate(r.date_str),
      amount:             Number(r.amount || 0),
      payee_name:         r.payee_name || null,
      purpose:            r.purpose    || null,
      cycle,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && ecs.length) {
      const { upserted } = await upsertBatched('electioneering_comms', ecs, {
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
