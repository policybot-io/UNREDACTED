// FEC Committee Master (cm) → Supabase `pac_committees` + R2 Parquet.

import { CM, bulkUrl, bulkInnerFilename } from '../shared/fec-schemas.js'
import { downloadZip, extractZip, fileChecksum } from '../shared/downloader.js'
import { openFecView, parquetS3Path } from '../shared/duck.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

// FEC committee_type codes:
// O = SuperPAC (independent-expenditure only)
// U = Carey-type (hybrid; separate segregated accounts)
// V = Hybrid PAC (making only independent expenditures)
// W = Hybrid PAC (making contributions + independent expenditures)
// N = PAC - nonqualified   Q = PAC - qualified   D = Leadership
// H = House   S = Senate   P = Presidential   X = Party-nonqualified   Y = Party-qualified
// Z = National party non-federal   I/E/C = carrier/electioneering/communication

const SUPER_PAC_TYPES  = new Set(['O', 'U', 'V', 'W'])
const LEADERSHIP_TYPES = new Set(['D'])

export async function ingestCommittees({ cycle, dryRun = false }) {
  const source = 'fec_cm'
  const url = bulkUrl('cm', cycle)
  const innerName = bulkInnerFilename('cm', cycle)
  console.log(`\n[${source}] cycle=${cycle} ${dryRun ? '(DRY RUN)' : ''}`)

  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    const zipPath = await downloadZip(url)
    const txtPath = await extractZip(zipPath, innerName)
    const checksum = await fileChecksum(zipPath)

    const view = await openFecView({ filePath: txtPath, ...CM, viewName: 'cm_raw' })

    const [{ count }] = await view.run(`SELECT COUNT(*) AS count FROM cm_raw`)
    console.log(`  [parsed] ${count} committee rows`)

    const parquetKey = `fec/committees/cycle=${cycle}/part-0001.parquet`
    if (!dryRun) {
      await view.exec(`
        COPY (SELECT *, ${cycle} AS _cycle FROM cm_raw)
        TO '${parquetS3Path(parquetKey)}'
        (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
      `)
      console.log(`  [r2] wrote ${parquetKey}`)
    }

    const rows = await view.run(`
      SELECT
        CMTE_ID               AS committee_id,
        CMTE_NM               AS name,
        CMTE_TP               AS committee_type,
        CMTE_DSGN             AS designation,
        CMTE_PTY_AFFILIATION  AS party,
        CONNECTED_ORG_NM      AS connected_org_name,
        CAND_ID               AS linked_cand_id
      FROM cm_raw
      WHERE CMTE_ID IS NOT NULL
    `)

    const committees = rows.map(r => ({
      committee_id: r.committee_id,
      name: r.name || '',
      committee_type: r.committee_type || null,
      designation: r.designation || null,
      party: r.party || null,
      connected_org_name: r.connected_org_name || null,
      cycle,
      is_super_pac:      SUPER_PAC_TYPES.has(r.committee_type),
      is_leadership_pac: LEADERSHIP_TYPES.has(r.designation) || LEADERSHIP_TYPES.has(r.committee_type),
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
