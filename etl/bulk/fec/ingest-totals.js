// FEC candidate & committee financial summaries → candidate_totals, pac_committees.
//
// Three summary files, different shapes:
//   weball : all candidates
//   webl   : House / Senate current campaigns (subset of weball)
//   webk   : PAC / party committees

import { WEBALL, WEBK, WEBL, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

async function ingestCandidateSummary({ cycle, prefix, schema, subfolder, source, dryRun }) {
  const url = bulkUrl(prefix, cycle)
  const innerName = bulkInnerFilename(prefix, cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...schema, viewName: `${prefix}_raw` })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM ${prefix}_raw`)
    console.log(`  [parsed] ${count} rows`)

    const parquetKey = `fec/${subfolder}/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM ${prefix}_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    const rows = await view.run(`
      SELECT
        CAND_ID            AS fec_candidate_id,
        TTL_RECEIPTS       AS total_receipts,
        TTL_DISB           AS total_disbursements,
        COH_COP            AS cash_on_hand_end,
        CAND_CONTRIB       AS self_contrib,
        CAND_LOANS         AS self_loans,
        TTL_INDIV_CONTRIB  AS total_individual_contrib,
        OTHER_POL_CMTE_CONTRIB AS other_committee_contrib,
        POL_PTY_CONTRIB    AS party_contrib,
        DEBTS_OWED_BY      AS debts_owed_by
      FROM ${prefix}_raw
      WHERE CAND_ID IS NOT NULL
    `)

    const totals = rows.map(r => ({
      candidate_id: r.fec_candidate_id,
      cycle,
      total_receipts:           Number(r.total_receipts           || 0),
      total_disbursements:      Number(r.total_disbursements      || 0),
      cash_on_hand:             Number(r.cash_on_hand_end         || 0),
      individual_contributions: Number(r.total_individual_contrib || 0),
      other_committees:         Number(r.other_committee_contrib  || 0),
      candidate_loans:          Number(r.self_loans               || 0),
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun) {
      const { upserted } = await upsertBatched('candidate_totals', totals, {
        onConflict: 'candidate_id,cycle',
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

export async function ingestAllCandidateTotals({ cycle, dryRun = false }) {
  return ingestCandidateSummary({
    cycle, prefix: 'weball', schema: WEBALL,
    subfolder: 'totals-all', source: 'fec_weball', dryRun,
  })
}

export async function ingestHSCandidateTotals({ cycle, dryRun = false }) {
  return ingestCandidateSummary({
    cycle, prefix: 'webl', schema: WEBL,
    subfolder: 'totals-hs', source: 'fec_webl', dryRun,
  })
}

export async function ingestPacTotals({ cycle, dryRun = false }) {
  const source = 'fec_webk'
  const url = bulkUrl('webk', cycle)
  const innerName = bulkInnerFilename('webk', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...WEBK, viewName: 'webk_raw' })
    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM webk_raw`)
    console.log(`  [parsed] ${count} rows`)

    const parquetKey = `fec/totals-pac/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM webk_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    const rows = await view.run(`
      SELECT
        CMTE_ID       AS committee_id,
        TTL_RECEIPTS  AS total_receipts,
        TTL_DISB      AS total_disbursements,
        COH_COP       AS cash_on_hand,
        DEBTS_OWED_BY AS debts_owed_by,
        IND_EXP       AS independent_expenditures
      FROM webk_raw
      WHERE CMTE_ID IS NOT NULL
    `)

    const committees = rows.map(r => ({
      committee_id: r.committee_id,
      cycle,
      total_receipts:      Number(r.total_receipts      || 0),
      total_disbursements: Number(r.total_disbursements || 0),
      cash_on_hand:        Number(r.cash_on_hand        || 0),
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun) {
      const { upserted } = await upsertBatched('pac_committees', committees, {
        onConflict: 'committee_id',
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
