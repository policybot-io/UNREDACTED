// USASpending bulk file downloader.
// Two modes:
//   1. Monthly archive ZIPs (full snapshot) — for initial backfill
//   2. Custom Award Data API (delta) — for weekly incremental refreshes
//
// Docs: https://files.usaspending.gov/
//       https://api.usaspending.gov/api/v2/bulk_download/awards/

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { env } from '../shared/env.js'

const TMP = env.tmpDir

// ─── Monthly archive URLs ────────────────────────────────────────────────────
// Full fiscal-year snapshots, published monthly.
// Pattern: https://files.usaspending.gov/award_data_archive/FY{YYYY}_All_{type}_Full_{YYYYMMDD}.zip
// 'type' = 'Contracts' | 'Assistance'
// 'date' = the archive publication date (YYYYMMDD) — use 'latest' discovery below.

const ARCHIVE_BASE = 'https://files.usaspending.gov/award_data_archive'

/**
 * Returns the latest known archive filename for the given fiscal year and award type.
 * USASpending publishes a database_download_metadata.json we can poll to get current dates.
 */
export async function getLatestArchiveUrl(fiscalYear, type = 'Contracts') {
  // Fetch metadata to find latest archive date
  const metaUrl = `${ARCHIVE_BASE}/database_download_metadata.json`
  const meta = await fetchJson(metaUrl)
  // meta is an object keyed by filename — find the one matching our criteria
  const prefix = `FY${fiscalYear}_All_${type}_Full_`
  const matches = Object.keys(meta).filter(k => k.startsWith(prefix) && k.endsWith('.zip'))
  if (!matches.length) {
    // Fall back to a reasonable guess at the latest month
    const now = new Date()
    const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '')
    return `${ARCHIVE_BASE}/${prefix}${yyyymmdd}.zip`
  }
  // Sort by date suffix descending → pick latest
  matches.sort((a, b) => b.localeCompare(a))
  return `${ARCHIVE_BASE}/${matches[0]}`
}

// ─── Bulk Download API (delta / filtered) ────────────────────────────────────

const BULK_API = 'https://api.usaspending.gov/api/v2/bulk_download/awards/'
const STATUS_API = 'https://api.usaspending.gov/api/v2/bulk_download/status/'

/**
 * Submit a bulk download job for a filtered slice of awards.
 * Returns a file_name token used to poll status.
 */
export async function submitBulkJob({ awardTypes, dateType = 'action_date', startDate, endDate, agencies = [] }) {
  const body = {
    award_types:  awardTypes,      // ['A','B','C','D'] for contracts, ['02','03','04','05'] for assistance
    date_type:    dateType,
    date_range:   { start_date: startDate, end_date: endDate },
    ...(agencies.length ? { filters: { agencies } } : {}),
  }
  const res = await postJson(BULK_API, body)
  if (!res.file_name) throw new Error(`submitBulkJob: unexpected response: ${JSON.stringify(res)}`)
  console.log(`  [usaspending] job submitted: ${res.file_name}`)
  return res.file_name
}

/**
 * Poll until the job is finished, then return the download URL.
 * Polls every 10 s, times out after 10 min.
 */
export async function waitForBulkJob(fileName, { pollIntervalMs = 10000, timeoutMs = 600000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await fetchJson(`${STATUS_API}?file_name=${encodeURIComponent(fileName)}`)
    if (status.status === 'finished') {
      console.log(`  [usaspending] job finished: ${status.file_url}`)
      return status.file_url
    }
    if (status.status === 'failed') throw new Error(`USASpending bulk job failed: ${status.message}`)
    console.log(`  [usaspending] status=${status.status} (${status.percent_complete || 0}%)…`)
    await sleep(pollIntervalMs)
  }
  throw new Error(`USASpending bulk job timed out after ${timeoutMs / 1000}s`)
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/**
 * Download a ZIP from a URL to the tmp directory.
 * Skips if the file already exists (same name = same content for archive files).
 */
export async function downloadArchive(url) {
  fs.mkdirSync(path.join(TMP, 'usaspending'), { recursive: true })
  const filename = url.split('/').pop().split('?')[0]
  const dest = path.join(TMP, 'usaspending', filename)
  if (fs.existsSync(dest)) {
    console.log(`  [download] cache hit: ${filename}`)
    return dest
  }
  console.log(`  [download] fetching ${url}…`)
  await streamToFile(url, dest)
  console.log(`  [download] saved ${filename} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`)
  return dest
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'unredacted-etl/1.0' } }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(new Error(`fetchJson parse error: ${e.message}`)) }
      })
    }).on('error', reject)
  })
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'unredacted-etl/1.0' } }
    const req = https.request(opts, res => {
      let resp = ''
      res.on('data', d => resp += d)
      res.on('end', () => {
        try { resolve(JSON.parse(resp)) } catch (e) { reject(new Error(`postJson parse error: ${e.message}`)) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function streamToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    const handleRes = res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        return streamToFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }
    client.get(url, { headers: { 'User-Agent': 'unredacted-etl/1.0' } }, handleRes).on('error', reject)
  })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
