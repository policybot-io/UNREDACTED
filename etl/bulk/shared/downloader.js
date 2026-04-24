import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import unzipper from 'unzipper'
import { env } from './env.js'

function ensureTmp() {
  fs.mkdirSync(env.tmpDir, { recursive: true })
}

export async function downloadZip(url, { cache = true } = {}) {
  ensureTmp()
  const name = path.basename(new URL(url).pathname)
  const zipPath = path.join(env.tmpDir, name)

  if (cache && fs.existsSync(zipPath)) {
    console.log(`  [cache] ${zipPath}`)
    return zipPath
  }

  console.log(`  [download] ${url}`)
  const res = await axios.get(url, { responseType: 'stream', timeout: 5 * 60_000, validateStatus: null })
  if (res.status === 404) {
    console.warn(`  [skip] 404 — ${url} not available for this cycle`)
    return null
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status} downloading ${url}`)
  await pipeline(res.data, fs.createWriteStream(zipPath))
  console.log(`  [downloaded] ${zipPath} (${fs.statSync(zipPath).size} bytes)`)
  return zipPath
}

/**
 * Download a direct (non-ZIP) file — CSV, TXT, etc.
 * Returns local file path, or null if the URL 404s (source not available this cycle).
 */
export async function downloadFile(url, { cache = true } = {}) {
  ensureTmp()
  const name = path.basename(new URL(url).pathname)
  const filePath = path.join(env.tmpDir, name)

  if (cache && fs.existsSync(filePath)) {
    console.log(`  [cache] ${filePath}`)
    return filePath
  }

  console.log(`  [download] ${url}`)
  const res = await axios.get(url, { responseType: 'stream', timeout: 10 * 60_000, validateStatus: null })
  if (res.status === 404) {
    console.warn(`  [skip] 404 — ${url} not available for this cycle`)
    return null
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status} downloading ${url}`)
  await pipeline(res.data, fs.createWriteStream(filePath))
  console.log(`  [downloaded] ${filePath} (${fs.statSync(filePath).size} bytes)`)
  return filePath
}

export async function extractZip(zipPath, innerName) {
  ensureTmp()
  // Use Open.file to read the ZIP directory without loading all content into memory.
  // Falls back to the first non-directory entry if innerName doesn't match — mirrors
  // the original adm-zip behaviour where entries[0] was the fallback.
  const directory = await unzipper.Open.file(zipPath)
  const files = directory.files.filter(f => !f.path.endsWith('/'))
  if (files.length === 0) throw new Error(`No file entries in ${zipPath}`)

  const entry = (innerName
    ? files.find(f => f.path === innerName || f.path.toLowerCase() === innerName.toLowerCase())
    : null) || files[0]

  if (innerName && entry.path !== innerName && entry.path.toLowerCase() !== innerName.toLowerCase()) {
    console.warn(`  [warn] ${innerName} not found in ZIP, using ${entry.path}`)
  }

  const outPath = path.join(env.tmpDir, path.basename(entry.path))
  await pipeline(entry.stream(), fs.createWriteStream(outPath))
  console.log(`  [extracted] ${outPath}`)
  return outPath
}

export async function fileChecksum(filePath) {
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(filePath), async function* (source) {
    for await (const chunk of source) hash.update(chunk)
  })
  return hash.digest('hex')
}
