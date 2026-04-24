import { createClient } from '@supabase/supabase-js'
import { env, supabaseReady } from './env.js'

let _client = null
export function sb() {
  if (!supabaseReady()) return null
  if (_client) return _client
  _client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  })
  return _client
}

/**
 * Deduplicate a batch by the onConflict key(s) so Postgres never sees two rows
 * with the same PK in one upsert — that causes "ON CONFLICT DO UPDATE command
 * cannot affect row a second time".  Last row wins on collision.
 */
function dedupBatch(rows, onConflict) {
  if (!onConflict) return rows
  const keys = onConflict.split(',').map(k => k.trim())
  const seen = new Map()
  for (const row of rows) {
    const key = keys.map(k => row[k]).join('\x00')
    seen.set(key, row)
  }
  return [...seen.values()]
}

/**
 * Batch-upsert rows into a Supabase table.
 * Returns { upserted, batches, skipped } — skipped = 0 or 1 (if Supabase disabled).
 *
 * batchSize default is 250 (down from 1000) to stay within Supabase Free tier's
 * statement_timeout on large tables like contributions (~1M+ rows).
 */
export async function upsertBatched(table, rows, { onConflict, batchSize = 250, ignoreDuplicates = false } = {}) {
  if (!supabaseReady()) {
    console.log(`  [supabase] skipped (disabled) — would upsert ${rows.length} rows into ${table}`)
    return { upserted: 0, batches: 0, skipped: 1 }
  }
  const client = sb()
  let upserted = 0
  let batches = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = dedupBatch(rows.slice(i, i + batchSize), onConflict)

    // Retry up to 4 times with exponential backoff — guards against transient
    // network drops and Supabase connection resets on high-volume ingest.
    let lastErr = null
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        const wait = 1000 * 2 ** (attempt - 1)  // 1s, 2s, 4s
        console.warn(`  [supabase] batch ${batches} attempt ${attempt + 1}, retrying in ${wait}ms…`)
        await new Promise(r => setTimeout(r, wait))
      }
      const { error } = await client.from(table).upsert(batch, { onConflict, ignoreDuplicates })
      if (!error) { lastErr = null; break }
      lastErr = error
    }
    if (lastErr) {
      console.error(`  [supabase] batch ${batches} failed after retries: ${lastErr.message}`)
      throw new Error(`Supabase upsert into ${table} failed: ${lastErr.message}`)
    }

    upserted += batch.length
    batches += 1
    if (batches % 20 === 0) console.log(`  [supabase] upserted ${upserted}/${rows.length} into ${table}`)

    // Small pause every 100 batches to avoid connection saturation
    if (batches % 100 === 0) await new Promise(r => setTimeout(r, 500))
  }
  return { upserted, batches, skipped: 0 }
}
