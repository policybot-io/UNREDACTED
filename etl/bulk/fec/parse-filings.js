// FEC Daily .fec Filing Archive Parser → loans + debts + amendment metadata.
//
// Stories unlocked:
//   E. Self-funding / loans — candidate personal loans (Schedule C), phantom loans never repaid
//   G. Amendment anomalies — committees that repeatedly amend their reports
//
// Source: FEC daily electronic filing archive at https://docquery.fec.gov/dcdev/posted/
// Format: each day publishes a ZIP of .fec files (pipe-delimited structured electronic filings)
//
// .fec file structure:
//   HDR line:  HDR|FEC_Ver_#|soft_name|soft_ver|report_id|report_number
//   Form line: {FORM_TYPE}|{FILER_CMTE_ID}|{INDV_LAST_OR_ORG}|...
//   Schedule lines: {SCHED_TYPE/TRANS_ID/...}
//   [F99]  end marker
//
// Schedule C = Loans. Schedule D = Debts/Obligations.
// Line type prefix: 'SC/' = loan item, 'SD/' = debt item, 'F' prefix = form header.
//
// NOTE: Full .fec format spec at https://www.fec.gov/resources/cms-content/documents/
//       The exact column positions vary by form type and FEC version — we parse dynamically.

import fs from 'fs'
import path from 'path'
import https from 'https'
import AdmZip from 'adm-zip'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { upsertBatched } from '../shared/supabase.js'
import { startRun, finishRun } from '../shared/run-tracker.js'
import { env } from '../shared/env.js'

const TMP = path.join(env.tmpDir, 'fec-filings')
const DAILY_BASE = 'https://docquery.fec.gov/dcdev/posted'

// Schedule C column positions (FEC v8.3, the dominant version)
// Full spec: https://www.fec.gov/resources/cms-content/documents/fecfile-ElectrData.pdf
const SC_COLS = [
  'form_type', 'filer_committee_id', 'transaction_id', 'back_reference_tran_id',
  'back_reference_sched_name', 'entity_type', 'lender_organization_name',
  'lender_last_name', 'lender_first_name', 'lender_middle_name', 'lender_prefix', 'lender_suffix',
  'lender_street_1', 'lender_street_2', 'lender_city', 'lender_state', 'lender_zip',
  'election_code', 'election_other_description', 'loan_date', 'loan_amount', 'loan_payment_to_date',
  'loan_balance', 'loan_incurred_date', 'loan_due_date', 'loan_interest_rate',
  'secured_loan', 'lender_committee_id', 'candidate_id',
  'personal_funds', 'memo_code', 'memo_text_description',
]

const SD_COLS = [
  'form_type', 'filer_committee_id', 'transaction_id', 'creditor_entity_type',
  'creditor_organization_name', 'creditor_last_name', 'creditor_first_name',
  'creditor_middle_name', 'creditor_prefix', 'creditor_suffix',
  'creditor_street_1', 'creditor_street_2', 'creditor_city', 'creditor_state', 'creditor_zip',
  'debt_purpose', 'beginning_balance', 'incurred_amount', 'payment_amount', 'balance_at_close',
  'memo_code', 'memo_text_description',
]

/**
 * Ingest a single day's FEC filing archive.
 * @param {string} dateStr - YYYYMMDD date string
 * @param {boolean} dryRun
 */
export async function ingestDailyFilings({ dateStr, cycle, dryRun = false }) {
  const source = 'fec_daily_filings'
  // Date can be YYYY-MM-DD or YYYYMMDD
  const d = dateStr.replace(/-/g, '')
  const yyyy = d.slice(0, 4)
  const mmdd = d.slice(4, 8)
  const url = `${DAILY_BASE}/${yyyy}/${mmdd}.zip`

  console.log(`\n[${source}] date=${dateStr} ${dryRun ? '(DRY RUN)' : ''}`)
  const runId = dryRun ? null : await startRun({ source, cycle, fileUrl: url })

  try {
    fs.mkdirSync(TMP, { recursive: true })
    const zipPath = path.join(TMP, `${d}.zip`)

    if (!fs.existsSync(zipPath)) {
      await downloadFile(url, zipPath)
    } else {
      console.log(`  [cache] ${zipPath}`)
    }

    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.fec'))
    console.log(`  [zip] ${entries.length} .fec files`)

    const extractDir = path.join(TMP, d)
    fs.mkdirSync(extractDir, { recursive: true })
    zip.extractAllTo(extractDir, true)

    const loans = []
    const debts = []
    const amendments = []
    let filesProcessed = 0

    for (const entry of entries) {
      const fecPath = path.join(extractDir, entry.entryName)
      if (!fs.existsSync(fecPath)) continue
      const { loans: l, debts: d2, amendment } = await parseFecFile(fecPath, cycle)
      loans.push(...l)
      debts.push(...d2)
      if (amendment) amendments.push(amendment)
      filesProcessed++
    }

    console.log(`  [parsed] ${filesProcessed} files → ${loans.length} loans, ${debts.length} debts, ${amendments.length} amendments`)

    let loanUpserted = 0
    let debtUpserted = 0

    if (!dryRun) {
      if (loans.length) {
        const { upserted } = await upsertBatched('loans', loans, { onConflict: 'sub_id' })
        loanUpserted = upserted
      }
      if (debts.length) {
        const { upserted } = await upsertBatched('debts', debts, { onConflict: 'sub_id' })
        debtUpserted = upserted
      }
      // Amendment metadata goes to bulk_ingest_runs notes for now
      // (future: dedicated filing_amendments table)
    }

    const totalUpserted = loanUpserted + debtUpserted
    await finishRun(runId, {
      status: 'ok', rowsRead: loans.length + debts.length, rowsUpserted: totalUpserted,
    })
    console.log(`[${source}] done: loans=${loanUpserted} debts=${debtUpserted}`)
    return { source, cycle, rowsRead: loans.length + debts.length, rowsUpserted: totalUpserted }
  } catch (err) {
    await finishRun(runId, { status: 'error', error: err.message })
    throw err
  }
}

/**
 * Ingest a date range of daily filing archives.
 * Used by the GH Actions cron to catch up on the last N days.
 */
export async function ingestFilingRange({ startDate, endDate, cycle, dryRun = false }) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const results = []

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const r = await ingestDailyFilings({ dateStr: ds, cycle, dryRun })
      results.push(r)
    } catch (err) {
      console.warn(`  [skip] ${ds}: ${err.message}`)
    }
  }

  return results
}

// ─── .fec file parser ─────────────────────────────────────────────────────────

async function parseFecFile(fecPath, cycle) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(fecPath), crlfDelay: Infinity })
    const loans = []
    const debts = []
    let committeeId = null
    let formType = null
    let isAmendment = false
    let lineCount = 0

    rl.on('line', raw => {
      lineCount++
      const fields = raw.split('|')
      const lineType = (fields[0] || '').toUpperCase()

      // Form header — extract filer committee ID and check amendment indicator
      if (lineType.startsWith('F') && !lineType.startsWith('F99')) {
        committeeId = fields[1] || null
        formType = lineType
        isAmendment = lineType.includes('A') || (fields[2] || '').toUpperCase() === 'A'
        return
      }

      // Schedule C — loans
      if (lineType.startsWith('SC')) {
        const r = parseDelimited(fields, SC_COLS)
        if (r.loan_amount) {
          loans.push({
            sub_id:        synthId(fecPath, lineCount),
            committee_id:  r.filer_committee_id || committeeId || null,
            candidate_id:  r.candidate_id || null,
            lender_name:   r.lender_organization_name || [r.lender_first_name, r.lender_last_name].filter(Boolean).join(' ') || null,
            loan_amount:   parseFloat(r.loan_amount) || 0,
            loan_date:     isoDate(r.loan_date),
            due_date:      isoDate(r.loan_due_date),
            interest_rate: parseFloat(r.loan_interest_rate) || null,
            balance:       parseFloat(r.loan_balance) || 0,
            cycle,
          })
        }
        return
      }

      // Schedule D — debts
      if (lineType.startsWith('SD')) {
        const r = parseDelimited(fields, SD_COLS)
        if (r.balance_at_close) {
          debts.push({
            sub_id:       synthId(fecPath, lineCount),
            committee_id: r.filer_committee_id || committeeId || null,
            creditor_name:r.creditor_organization_name || [r.creditor_first_name, r.creditor_last_name].filter(Boolean).join(' ') || null,
            debt_purpose: r.debt_purpose || null,
            debt_amount:  parseFloat(r.incurred_amount) || 0,
            amount_owed:  parseFloat(r.balance_at_close) || 0,
            incurred_date:isoDate(r.incurred_date),
            cycle,
          })
        }
        return
      }
    })

    rl.on('close', () => resolve({
      loans,
      debts,
      amendment: isAmendment ? { committeeId, formType, file: path.basename(fecPath) } : null,
    }))
    rl.on('error', reject)
  })
}

function parseDelimited(fields, cols) {
  const r = {}
  cols.forEach((col, i) => { r[col] = fields[i + 1] || '' })
  return r
}

// Synthetic integer PK from file path hash + line number
function synthId(filePath, lineNum) {
  let h = 0
  const s = path.basename(filePath, '.fec')
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0
  return Math.abs(h) * 100000 + lineNum
}

// Parse FEC date (MMDDYYYY or YYYY-MM-DD or YYYYMMDD)
function isoDate(s) {
  if (!s) return null
  s = String(s).trim()
  if (s.length === 8 && !s.includes('-')) {
    // MMDDYYYY
    return `${s.slice(4)}-${s.slice(0, 2)}-${s.slice(2, 4)}`
  }
  if (s.includes('-')) return s.slice(0, 10)
  return null
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const handle = res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(dest)
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }
    https.get(url, { headers: { 'User-Agent': 'unredacted-etl/1.0' } }, handle).on('error', reject)
  })
}
