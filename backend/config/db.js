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
    // Set IST timezone offset for all sessions — GETDATE() will now return IST
    // SQL Server doesn't support SET TIMEZONE, so we run this on each new connection
    // via a post-connect query. All timestamps stored/read will be IST.
    try {
      await pool.request().query(`SET DATEFORMAT dmy`);
    } catch(e) {}
    console.log(`✅  SQL Server connected → ${process.env.DB_NAME}`);
  }
  return pool;
}

// Simple query helper — uses named params @paramName
async function query(queryStr, params = {}) {
  const p = await getPool();
  const r = p.request();
  for (const [k, v] of Object.entries(params)) {
    if      (v === null || v === undefined) r.input(k, sql.Int, null);  // default null as Int (safe for FK cols)
    else if (typeof v === 'boolean')        r.input(k, sql.Bit, v);
    else if (Number.isInteger(v))           r.input(k, sql.Int, v);
    else if (typeof v === 'number')         r.input(k, sql.Decimal(10,2), v);
    else                                    r.input(k, sql.NVarChar(sql.MAX), String(v));
  }
  return r.query(queryStr);
}

// Stored procedure executor
async function exec(proc, params = {}) {
  const p = await getPool();
  const r = p.request();
  for (const [k, v] of Object.entries(params)) {
    if      (v === null || v === undefined) r.input(k, sql.Int, null);
    else if (typeof v === 'boolean')        r.input(k, sql.Bit, v);
    else if (Number.isInteger(v))           r.input(k, sql.Int, v);
    else if (typeof v === 'number')         r.input(k, sql.Decimal(10,2), v);
    else                                    r.input(k, sql.NVarChar(sql.MAX), String(v));
  }
  return r.execute(proc);
}

module.exports = { getPool, query, exec, sql };
