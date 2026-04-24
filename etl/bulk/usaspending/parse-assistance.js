// USASpending Financial Assistance (grants, loans, etc.) → Supabase `grants` + R2 Parquet.
//
// Award types: 02=Block Grant, 03=Formula Grant, 04=Project Grant, 05=Cooperative Agreement,
//              06=Direct Payment, 07=Direct Loan, 08=Guaranteed/Insured Loan, 09=Insurance,
//              10=Direct Payment Unrestricted, 11=Other Reimbursable, Direct Payment

import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { getLatestArchiveUrl, downloadArchive } from './download.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'
import { parquetS3Path, getDB } from '../shared/duck.js'

const KEY_COLS = [
  'award_unique_key', 'award_id_fain', 'modification_number',
  'recipient_name', 'recipient_uei', 'recipient_duns',
  'recipient_city_name', 'recipient_state_code', 'recipient_zip_4_code',
  'recipient_country_name',
  'awarding_agency_name', 'awarding_sub_agency_name',
  'funding_agency_name',
  'period_of_performance_start_date', 'period_of_performance_current_end_date',
  'action_date', 'fiscal_year',
  'federal_action_obligation', 'total_obligated_amount', 'total_outlayed_amount',
  'award_type_code', 'award_type',
  'assistance_type_code', 'assistance_type_description',
  'cfda_number', 'cfda_title',
  'place_of_performance_city_name', 'place_of_performance_state_code',
  'primary_place_of_performance_zip_4',
]

export async function ingestAssistance({ fiscalYear, dryRun = false }) {
  const source = 'usaspending_assistance'
  console.log(`\n[${source}] fiscalYear=${fiscalYear} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle: fiscalYear, fileUrl: '' })

  try {
    const url = await getLatestArchiveUrl(fiscalYear, 'Assistance')
    console.log(`  [url] ${url}`)
    const zipPath = await downloadArchive(url)

    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries().filter(e => e.entryName.endsWith('.csv'))
    console.log(`  [zip] ${entries.length} CSV files in archive`)

    const extractDir = path.join(path.dirname(zipPath), `assistance_${fiscalYear}`)
    fs.mkdirSync(extractDir, { recursive: true })
    zip.extractAllTo(extractDir, true)

    let totalRead = 0
    let totalUpserted = 0

    for (const entry of entries) {
      const csvPath = path.join(extractDir, entry.entryName)
      if (!fs.existsSync(csvPath)) continue

      // ─── Cold: Parquet to R2 ──────────────────────────────────────────────
      const partKey = `usaspending/assistance/fy=${fiscalYear}/${path.basename(entry.entryName, '.csv')}.parquet`
      if (!dryRun) {
        const db = getDB()
        const conn = db.connect()
        await new Promise((res, rej) => conn.exec(`INSTALL httpfs; LOAD httpfs;`, e => e ? rej(e) : res()))
        await new Promise((res, rej) => conn.exec(`
          COPY (SELECT * FROM read_csv_auto('${csvPath.replace(/\\/g, '/')}', header=true, ignore_errors=true))
          TO '${parquetS3Path(partKey)}'
          (FORMAT PARQUET, COMPRESSION 'ZSTD', OVERWRITE_OR_IGNORE);
        `, e => e ? rej(e) : res()))
        conn.close()
        console.log(`  [r2] wrote ${partKey}`)
      }

      // ─── Hot tier: stream + upsert ────────────────────────────────────────
      const { rows: batch, count } = await streamCsv(csvPath, KEY_COLS)
      totalRead += count

      const grants = batch.map(r => ({
        award_id:          r.award_unique_key || r.award_id_fain || null,
        recipient_name:    r.recipient_name || null,
        recipient_state:   r.recipient_state_code || null,
        recipient_zip:     r.recipient_zip_4_code || null,
        recipient_uei:     r.recipient_uei || null,
        awarding_agency:   r.awarding_agency_name || null,
        sub_agency:        r.awarding_sub_agency_name || null,
        action_date:       r.action_date || null,
        fiscal_year:       r.fiscal_year ? Number(r.fiscal_year) : fiscalYear,
        amount:            parseFloat(r.federal_action_obligation) || 0,
        total_amount:      parseFloat(r.total_obligated_amount) || 0,
        award_type:        r.award_type || null,
        assistance_type:   r.assistance_type_description || null,
        cfda_number:       r.cfda_number || null,
        cfda_title:        r.cfda_title || null,
        place_of_performance_state: r.place_of_performance_state_code || null,
      })).filter(r => r.award_id)

      if (!dryRun && grants.length) {
        const { upserted } = await upsertBatched('grants', grants, {
          onConflict: 'award_id',
          batchSize: 2000,
        })
        totalUpserted += upserted
      }
      console.log(`    ${path.basename(entry.entryName)}: ${count} rows → ${grants.length} grants`)
    }

    await finishRun(runId, {
      status: 'ok', rowsRead: totalRead, rowsParquet: totalRead,
      rowsUpserted: totalUpserted,
    })
    console.log(`[${source}] done: read=${totalRead} hot=${totalUpserted}`)
    return { source, cycle: fiscalYear, rowsRead: totalRead, rowsUpserted: totalUpserted }
  } catch (err) {
    await finishRun(runId, { status: 'error', error: err.message })
    throw err
  }
}

async function streamCsv(filePath, keyCols) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    let headers = null
    const rows = []
    let count = 0
    rl.on('line', raw => {
      if (!headers) { headers = parseCsvRow(raw); return }
      count++
      const vals = parseCsvRow(raw)
      const row = {}
      for (const col of keyCols) {
        const idx = headers.indexOf(col)
        row[col] = idx >= 0 ? (vals[idx] || '') : ''
      }
      rows.push(row)
    })
    rl.on('close', () => resolve({ rows, count }))
    rl.on('error', reject)
  })
}

function parseCsvRow(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ; continue }
    if (c === ',' && !inQ) { cols.push(cur); cur = ''; continue }
    cur += c
  }
  cols.push(cur)
  return cols
}
