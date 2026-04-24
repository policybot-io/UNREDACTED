// FEC Candidate-Committee Linkages (ccl) → candidate_committee_links + R2 Parquet.

import { CCL, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

export async function ingestLinks({ cycle, dryRun = false }) {
  const source = 'fec_ccl'
  const url = bulkUrl('ccl', cycle)
  const innerName = bulkInnerFilename('ccl', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)

  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...CCL, viewName: 'ccl_raw' })

    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM ccl_raw`)
    console.log(`  [parsed] ${count} linkage rows`)

    const parquetKey = `fec/links/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM ccl_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    const rows = await view.run(`
      SELECT
        CAND_ID          AS fec_candidate_id,
        CMTE_ID          AS committee_id,
        CMTE_DSGN        AS link_type,
        LINKAGE_ID       AS linkage_id,
        CAND_ELECTION_YR AS election_year
      FROM ccl_raw
      WHERE CAND_ID IS NOT NULL AND CMTE_ID IS NOT NULL
    `)

    const links = rows.map(r => ({
      fec_candidate_id: r.fec_candidate_id,
      committee_id: r.committee_id,
      cycle,
      link_type: r.link_type || null,
      linkage_id: r.linkage_id ? Number(r.linkage_id) : null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun) {
      const { upserted } = await upsertBatched('candidate_committee_links', links, {
        onConflict: 'fec_candidate_id,committee_id,cycle',
      })
      upsertedCount = upserted
    }

    await finishRun(runId, {
      status: 'ok',
      rowsRead: Number(count),
      rowsParquet: Number(count),
      rowsUpserted: upsertedCount,
      checksum,
    })

    console.log(`[${source}] done: read=${count} parquet=${count} hot=${upsertedCount}`)
    return { source, cycle, rowsRead: Number(count), rowsUpserted: upsertedCount }
  } catch (err) {
    await finishRun(runId, { status: 'error', error: err.message })
    throw err
  }
}
