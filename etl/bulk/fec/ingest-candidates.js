// FEC Candidate Master (cn) → Supabase `politicians` + R2 Parquet.
//
// Source: https://www.fec.gov/files/bulk-downloads/{cycle}/cn{YY}.zip

import { CN, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

const OFFICE_TO_CHAMBER = { H: 'house', S: 'senate', P: 'president' }
const OFFICE_TO_FULL    = { H: 'House',  S: 'Senate', P: 'President' }

export async function ingestCandidates({ cycle, dryRun = false }) {
  const source = 'fec_cn'
  const url = bulkUrl('cn', cycle)
  const innerName = bulkInnerFilename('cn', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)

  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...CN, viewName: 'cn_raw' })

    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM cn_raw`)
    console.log(`  [parsed] ${count} candidate rows`)

    // ─── Write Parquet to R2 ───────────────────────────────────────────────────
    const parquetKey = `fec/candidates/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM cn_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    // ─── Transform for Supabase hot tier ───────────────────────────────────────
    const rows = await view.run(`
      SELECT
        CAND_ID              AS fec_candidate_id,
        CAND_NAME            AS name,
        CAND_PTY_AFFILIATION AS party,
        CAND_OFFICE_ST       AS state,
        CAND_OFFICE_DISTRICT AS district,
        CAND_OFFICE          AS office_code,
        CAND_ICI             AS incumbent_challenger,
        CAND_STATUS          AS status,
        CAND_PCC             AS principal_committee_id,
        CAND_ELECTION_YR     AS election_year
      FROM cn_raw
      WHERE CAND_ID IS NOT NULL
    `)

    const politicians = rows.map(r => ({
      fec_candidate_id: r.fec_candidate_id,
      name: r.name || '',
      party: r.party || null,
      state: r.state || null,
      district: r.district || null,
      chamber: OFFICE_TO_CHAMBER[r.office_code] || null,
      office:  OFFICE_TO_FULL[r.office_code]    || null,
      in_office: r.status === 'C', // 'C' = active candidate / statutory candidate
      next_election: r.election_year ? Number(r.election_year) : null,
    }))

    view.close()

    let upsertedCount = 0
    if (!dryRun) {
      const { upserted } = await upsertBatched('politicians', politicians, {
        onConflict: 'fec_candidate_id',
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
