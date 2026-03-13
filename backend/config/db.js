// backend/config/db.js
require('dotenv').config();
const sql = require('mssql');

const config = {
  server:   process.env.DB_SERVER || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME   || 'HRLeaveDB',
  user:     process.env.DB_USER   || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT    === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    try { await pool.request().query(`SET DATEFORMAT dmy`); } catch(e) {}
    console.log(`✅  SQL Server connected → ${process.env.DB_NAME}`);
  }
  return pool;
}

// ── Date-like string detection ───────────────────────────────────
// Matches: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM:SS', 'YYYY-MM-DD HH:MM:SS'
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

function bindParam(r, k, v) {
  if (v === null || v === undefined) {
    // Use NVarChar(null) — SQL Server will cast NULL to any column type correctly
    r.input(k, sql.NVarChar(50), null);
  } else if (typeof v === 'boolean') {
    r.input(k, sql.Bit, v);
  } else if (typeof v === 'string' && DATE_RE.test(v.trim())) {
    // Date/datetime string — pass as NVarChar so SQL Server auto-casts to DATE/DATETIME
    r.input(k, sql.NVarChar(50), v.trim());
  } else if (Number.isInteger(v)) {
    r.input(k, sql.Int, v);
  } else if (typeof v === 'number') {
    r.input(k, sql.Decimal(18, 4), v);
  } else {
    r.input(k, sql.NVarChar(sql.MAX), String(v));
  }
}

// Simple query helper — uses named params @paramName
async function query(queryStr, params = {}) {
  const p = await getPool();
  const r = p.request();
  for (const [k, v] of Object.entries(params)) bindParam(r, k, v);
  return r.query(queryStr);
}

// Stored procedure executor
async function exec(proc, params = {}) {
  const p = await getPool();
  const r = p.request();
  for (const [k, v] of Object.entries(params)) bindParam(r, k, v);
  return r.execute(proc);
}

module.exports = { getPool, query, exec, sql };
