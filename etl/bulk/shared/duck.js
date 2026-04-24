// DuckDB helper — reads pipe-delimited FEC text, writes Parquet to R2, yields rows.
//
// Uses DuckDB's native R2 secret type (supported since v0.10). Falls back to
// generic S3 config if R2 type isn't available.

import duckdb from 'duckdb'
import { env } from './env.js'

let _db = null

export function getDB() {
  if (_db) return _db
  _db = new duckdb.Database(':memory:')
  return _db
}

function run(conn, sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.all(sql, ...params, (err, rows) => (err ? reject(err) : resolve(rows)))
  })
}

function exec(conn, sql) {
  return new Promise((resolve, reject) => {
    conn.exec(sql, err => (err ? reject(err) : resolve()))
  })
}

async function configureR2(conn) {
  await exec(conn, `INSTALL httpfs; LOAD httpfs;`)
  // DuckDB's R2 secret type needs account ID only; endpoint is derived.
  // Use generic S3 secret for broad compatibility.
  const endpointHost = new URL(env.r2.endpoint).host
  await exec(conn, `
    CREATE OR REPLACE SECRET r2_secret (
      TYPE S3,
      KEY_ID '${env.r2.accessKeyId.replace(/'/g, "''")}',
      SECRET '${env.r2.secretAccessKey.replace(/'/g, "''")}',
      ENDPOINT '${endpointHost}',
      URL_STYLE 'path',
      USE_SSL true,
      REGION 'auto'
    );
  `)
}

/**
 * Load a pipe-delimited FEC text file into a DuckDB temp view and return a
 * connection configured for R2 writes. Caller runs queries + COPY TO s3://.
 */
export async function openFecView({ filePath, columns, types = {}, viewName = 'fec_raw' }) {
  const db = getDB()
  const conn = db.connect()
  await configureR2(conn)

  const colDefs = columns.map(c => `'${c}': '${types[c] || 'VARCHAR'}'`).join(', ')

  const sql = `
    CREATE OR REPLACE VIEW ${viewName} AS
    SELECT * FROM read_csv(
      '${filePath.replace(/'/g, "''")}',
      delim = '|',
      header = false,
      columns = { ${colDefs} },
      ignore_errors = true,
      nullstr = ''
    );
  `
  await exec(conn, sql)

  return {
    conn,
    run: (q, p) => run(conn, q, p),
    exec: q => exec(conn, q),
    close: () => conn.close(),
  }
}

/**
 * Load a comma-delimited CSV file (with header row) into a DuckDB temp view.
 * Used for FEC files that are published as comma-delimited CSVs rather than
 * the classic pipe-delimited bulk format (IEs, electioneering, comm costs, bundles).
 */
export async function openCsvView({ filePath, viewName = 'csv_raw', delim = ',' }) {
  const db = getDB()
  const conn = db.connect()
  await configureR2(conn)

  await exec(conn, `
    CREATE OR REPLACE VIEW ${viewName} AS
    SELECT * FROM read_csv(
      '${filePath.replace(/'/g, "''")}',
      delim = '${delim}',
      header = true,
      ignore_errors = true,
      nullstr = ''
    );
  `)

  return {
    conn,
    run: (q, p) => run(conn, q, p),
    exec: q => exec(conn, q),
    close: () => conn.close(),
  }
}

export function parquetS3Path(key) {
  return `s3://${env.r2.bucket}/${key}`
}
