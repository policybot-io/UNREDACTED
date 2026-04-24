// USASpending Contracts → Supabase `contracts` + R2 Parquet.
//
// Story unlocked: B. Pay-to-play — join contracts.recipient_name against
// FEC indiv.contributor_employer to find contractor-donors.
//
// Source: monthly archive ZIPs at files.usaspending.gov
// Award types: A=BPA Call, B=Purchase Order, C=Delivery Order, D=Definitive Contract

import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { getLatestArchiveUrl, downloadArchive } from './download.js'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'
import { parquetS3Path } from '../shared/duck.js'
import { getDB } from '../shared/duck.js'

// Key columns from USASpending contracts CSV (first-row headers).
// Full schema: https://www.usaspending.gov/data-dictionary
const KEY_COLS = [
  'contract_award_unique_key', 'award_id_piid', 'modification_number',
  'transaction_unique_key', 'usaspending_permalink',
  'recipient_name', 'recipient_uei', 'recipient_duns',
  'recipient_city_name', 'recipient_state_code', 'recipient_zip_4_code',
  'recipient_country_name',
  'awarding_agency_name', 'awarding_sub_agency_name',
  'funding_agency_name', 'funding_sub_agency_name',
  'period_of_performance_start_date', 'period_of_performance_current_end_date',
  'action_date', 'fiscal_year',
  'federal_action_obligation', 'base_and_all_options_value',
  'award_type', 'type_of_contract_pricing',
  'naics_code', 'naics_description',
  'product_or_service_code', 'product_or_service_code_description',
  'place_of_performance_city_name', 'place_of_performance_state_code',
]

export async function ingestContracts({ fiscalYear, dryRun = false }) {
  const source = 'usaspending_contracts'
  const cycleOrPeriod = `FY${fiscalYear}`
  console.log(`\n[${source}] fiscalYear=${fiscalYear} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle: fiscalYear, fileUrl: '' })

  try {
    const url = await getLatestArchiveUrl(fiscalYear, 'Contracts')
    console.log(`  [url] ${url}`)
    const zipPath = await downloadArchive(url)

    // Contracts archives contain multiple CSVs split by agency. Extract each.
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries().filter(e => e.entryName.endsWith('.csv'))
    console.log(`  [zip] ${entries.length} CSV files in archive`)

    const extractDir = path.join(path.dirname(zipPath), `contracts_${fiscalYear}`)
    fs.mkdirSync(extractDir, { recursive: true })
    zip.extractAllTo(extractDir, true)

    let totalRead = 0
    let totalUpserted = 0

    for (const entry of entries) {
      const csvPath = path.join(extractDir, entry.entryName)
      if (!fs.existsSync(csvPath)) continue

      // ─── Write Parquet partition to R2 via DuckDB ──────────────────────────
      const partKey = `usaspending/contracts/fy=${fiscalYear}/${path.basename(entry.entryName, '.csv')}.parquet`
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

      // ─── Hot tier: stream CSV and upsert key columns ───────────────────────
      const { rows: batch, count } = await streamCsv(csvPath, KEY_COLS)
      totalRead += count

      const contracts = batch.map(r => ({
        award_id:         r.contract_award_unique_key || r.award_id_piid || null,
        recipient_name:   r.recipient_name || null,
        recipient_state:  r.recipient_state_code || null,
        recipient_zip:    r.recipient_zip_4_code || null,
        recipient_uei:    r.recipient_uei || null,
        awarding_agency:  r.awarding_agency_name || null,
        sub_agency:       r.awarding_sub_agency_name || null,
        action_date:      r.action_date || null,
        fiscal_year:      r.fiscal_year ? Number(r.fiscal_year) : fiscalYear,
        amount:           parseFloat(r.federal_action_obligation) || 0,
        total_value:      parseFloat(r.base_and_all_options_value) || 0,
        award_type:       r.award_type || null,
        naics_code:       r.naics_code || null,
        naics_description:r.naics_description || null,
        description:      r.product_or_service_code_description || null,
        place_of_performance_state: r.place_of_performance_state_code || null,
      })).filter(r => r.award_id)

      if (!dryRun && contracts.length) {
        const { upserted } = await upsertBatched('contracts', contracts, {
          onConflict: 'award_id',
          batchSize: 2000,
        })
        totalUpserted += upserted
      }
      console.log(`    ${path.basename(entry.entryName)}: ${count} rows → ${contracts.length} contracts`)
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

// ─── CSV streaming helper ─────────────────────────────────────────────────────

async function streamCsv(filePath, keyCols) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    let headers = null
    const rows = []
    let count = 0

    rl.on('line', raw => {
      if (!headers) {
        headers = parseCsvRow(raw)
        return
      }
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
