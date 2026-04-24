// FEC Committee→Candidate Contributions & IEs (pas2) → contributions + R2 Parquet.

import { PAS2, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestPas2({ cycle, hotMinAmount = 0, dryRun = false }) {
  const source = 'fec_pas2'
  const url = bulkUrl('pas2', cycle)
  const innerName = bulkInnerFilename('pas2', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...PAS2, viewName: 'pas2_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM pas2_raw`)
    console.log(`  [parsed] ${count} pas2 rows`)

    const parquetKey = `fec/pas2/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM pas2_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // Hot tier: only PAC→candidate contribs with amount ≥ hotMinAmount.
    const rows = await view.run(`
      SELECT
        SUB_ID                               AS sub_id,
        CMTE_ID                              AS committee_id,
        CAND_ID                              AS candidate_id,
        NAME                                 AS contributor_name,
        EMPLOYER                             AS employer,
        OCCUPATION                           AS occupation,
        CITY                                 AS city,
        STATE                                AS state,
        ZIP_CODE                             AS zip,
        TRANSACTION_AMT                      AS amount,
        TRANSACTION_DT                       AS date_str,
        TRANSACTION_TP                       AS receipt_type,
        MEMO_TEXT                            AS memo_text
      FROM pas2_raw
      WHERE CAND_ID IS NOT NULL
        AND SUB_ID IS NOT NULL
        AND TRANSACTION_AMT >= ${Number(hotMinAmount) || 0}
    `)

    const fecDate = s => {
      // FEC dates are MMDDYYYY
      if (!s || String(s).length !== 8) return null
      const mm = String(s).slice(0, 2)
      const dd = String(s).slice(2, 4)
      const yyyy = String(s).slice(4, 8)
      return `${yyyy}-${mm}-${dd}`
    }

    const contribs = rows.map(r => ({
      contribution_id:       String(r.sub_id),
      contributor_name:      r.contributor_name || '',
      contributor_employer:  r.employer || null,
      contributor_occupation:r.occupation || null,
      contributor_city:      r.city || null,
      contributor_state:     r.state || null,
      contributor_zip:       r.zip || null,
      amount:                Number(r.amount || 0),
      date:                  fecDate(r.date_str),
      committee_id:          r.committee_id || null,
      candidate_id:          r.candidate_id || null,
      receipt_type:          r.receipt_type || null,
      memo_text:             r.memo_text || null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun && contribs.length) {
      const { upserted } = await upsertBatched('contributions', contribs, {
        onConflict: 'contribution_id',
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
