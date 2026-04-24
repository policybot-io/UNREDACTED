// FEC Schedule E — Independent Expenditures (IEs) → independent_expenditures + R2 Parquet.
//
// Stories unlocked:
//   F. Attack-ad coordination — same media-buy vendors / timing across multiple SuperPACs
//      signals coordination that is nominally prohibited.
//
// URL: https://www.fec.gov/files/bulk-downloads/{YYYY}/independent_expenditure_{YYYY}.csv
// Direct CSV download — no ZIP extraction needed.

import { downloadFile, fileChecksum } from '../shared/downloader.js'
import { openCsvView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestIEs({ cycle, dryRun = false }) {
  const source = 'fec_ie'
  const url = `https://www.fec.gov/files/bulk-downloads/${cycle}/independent_expenditure_${cycle}.csv`
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

    // CSV has header row: cand_id,spe_id,sup_opp,exp_date,exp_amo,pur,pay,tran_id,file_num,...
    const view = await openCsvView({ filePath: txtPath, viewName: 'ie_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM ie_raw`)
    console.log(`  [parsed] ${count} IE rows`)

    // ─── Cold: full Parquet to R2 ─────────────────────────────────────────────
    const parquetKey = `fec/ie/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM ie_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Hot tier: all IEs go to Supabase ────────────────────────────────────
    // Dates in this CSV are DD-MON-YY (e.g. 27-SEP-24)
    const MON = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'}
    const parseDate = s => {
      if (!s) return null
      const m = String(s).trim().match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/)
      if (!m) return null
      return `20${m[3]}-${MON[m[2]] || '01'}-${m[1].padStart(2, '0')}`
    }
    // Synthetic sub_id from tran_id + file_num (no SUB_ID in this CSV)
    const stablePk = (tranId, fileNum) => {
      const s = `${fileNum || 0}:${tranId || ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0
      return Math.abs(h) + (Number(fileNum || 0) * 1e6)
    }

    const rows = await view.run(`
      SELECT
        spe_id        AS committee_id,
        cand_id       AS candidate_id,
        sup_opp       AS support_oppose,
        exp_date      AS date_str,
        exp_amo       AS amount,
        pur           AS purpose,
        pay           AS payee_name,
        tran_id       AS tran_id,
        file_num      AS file_num,
        fec_election_yr AS cycle_yr
      FROM ie_raw
      WHERE spe_id IS NOT NULL
    `)

    const ies = rows.map(r => ({
      sub_id:             stablePk(r.tran_id, r.file_num),
      committee_id:       r.committee_id  || null,
      candidate_id:       r.candidate_id  || null,
      support_oppose:     r.support_oppose || null,
      expenditure_date:   parseDate(r.date_str),
      expenditure_amount: Number(r.amount || 0),
      payee_name:         r.payee_name || null,
      purpose:            r.purpose    || null,
      cycle:              r.cycle_yr ? Number(r.cycle_yr) : cycle,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && ies.length) {
      const { upserted } = await upsertBatched('independent_expenditures', ies, {
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
