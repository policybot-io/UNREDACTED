// USASpending Bulk Download API — incremental delta ingests.
//
// Uses the custom award data API to download only recent changes (last N days)
// rather than re-downloading the full monthly archive. Ideal for weekly cron runs.
//
// API docs: https://api.usaspending.gov/api/v2/bulk_download/awards/

import path from 'path'
import { submitBulkJob, waitForBulkJob, downloadArchive } from './download.js'
import { ingestContracts } from './parse-contracts.js'
import { ingestAssistance } from './parse-assistance.js'
import { startRun, finishRun } from '../shared/run-tracker.js'

// Award type codes
const CONTRACT_TYPES   = ['A', 'B', 'C', 'D']
const ASSISTANCE_TYPES = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '11']

/**
 * Run a delta ingest for the last N days using the bulk download API.
 * Submits a job, polls until ready, downloads, then calls the same
 * parse-contracts / parse-assistance pipelines.
 *
 * @param {Object} opts
 * @param {number} opts.daysBack    - How many days back to fetch (default 14)
 * @param {string} opts.awardClass  - 'contracts' | 'assistance' | 'both'
 * @param {boolean} opts.dryRun
 */
export async function runDeltaIngest({ daysBack = 14, awardClass = 'both', dryRun = false } = {}) {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - daysBack)

  const startDate = start.toISOString().slice(0, 10)
  const endDate   = now.toISOString().slice(0, 10)

  console.log(`\n[usaspending_delta] ${startDate} → ${endDate} class=${awardClass} ${dryRun ? '(DRY RUN)' : ''}`)

  const jobs = []
  if (awardClass === 'contracts' || awardClass === 'both') {
    jobs.push({ type: 'contracts', awardTypes: CONTRACT_TYPES })
  }
  if (awardClass === 'assistance' || awardClass === 'both') {
    jobs.push({ type: 'assistance', awardTypes: ASSISTANCE_TYPES })
  }

  for (const job of jobs) {
    const source = `usaspending_delta_${job.type}`
    const runId = dryRun ? null : await startRun({ source, cycle: endDate, fileUrl: '' })
    try {
      if (dryRun) {
        console.log(`  [dry-run] would submit ${job.type} job for ${startDate}→${endDate}`)
        continue
      }

      const fileName = await submitBulkJob({
        awardTypes: job.awardTypes,
        dateType:   'action_date',
        startDate,
        endDate,
      })

      const downloadUrl = await waitForBulkJob(fileName)
      const zipPath = await downloadArchive(downloadUrl)

      // Re-use the same parse pipeline with a synthetic fiscal year
      const fiscalYear = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()

      let result
      if (job.type === 'contracts') {
        // Override the archive path by patching the zip path
        result = await _parseZipDirect(zipPath, 'contracts', fiscalYear)
      } else {
        result = await _parseZipDirect(zipPath, 'assistance', fiscalYear)
      }

      await finishRun(runId, {
        status: 'ok', rowsRead: result.rowsRead, rowsUpserted: result.rowsUpserted,
      })
    } catch (err) {
      await finishRun(runId, { status: 'error', error: err.message })
      console.error(`[${source}] FAILED: ${err.message}`)
    }
  }
}

// Internal: parse a ZIP downloaded from the bulk API using the same CSV pipeline.
// We override the archive URL in parse-contracts/parse-assistance by injecting the path.
async function _parseZipDirect(zipPath, type, fiscalYear) {
  // The parse-contracts/parse-assistance functions call getLatestArchiveUrl + downloadArchive.
  // For delta runs, we've already downloaded the file. We stub by overriding env-level cache.
  // Simplest approach: write a sentinel in the tmp dir with the known filename, then call the parser.
  // In practice, the downloader caches by filename, so we symlink/copy to match expected name.
  // For now, delegate back to the full parse path with pre-cached zip.
  if (type === 'contracts') {
    return ingestContracts({ fiscalYear, _zipOverride: zipPath })
  }
  return ingestAssistance({ fiscalYear, _zipOverride: zipPath })
}
