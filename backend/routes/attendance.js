// backend/routes/attendance.js
const router = require('express').Router();
const { query, exec } = require('../config/db');
const { auth, role }  = require('../middleware/auth');

router.use(auth);

// ── helpers ─────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10); }

function defaultPeriod() {
  const now = new Date();
  const m   = now.getMonth(), y = now.getFullYear();
  return {
    from: new Date(y, m-1, 26).toISOString().slice(0,10),
    to:   new Date(y, m,   25).toISOString().slice(0,10),
  };
}

// ── recompute helper ─────────────────────────────────────────────
async function recompute(from, to) {
  await exec('dbo.sp_ComputeAttendance', { FromDate: from, ToDate: to });
}

// ================================================================
// RAW PUNCH LOGS
// ================================================================

/* GET /api/attendance/my?from=&to=  — own attendance (all roles) */
router.get('/my', async (req, res) => {
  const { from, to } = req.query;
  // Use local date math to avoid IST timezone shifting month boundaries
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const localFrom = `${y}-${String(m+1).padStart(2,'0')}-01`;
  const lastDay   = new Date(y, m+1, 0).getDate();
  const localTo   = `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  const f = from || localFrom;
  const t = to   || localTo;
  try {
    const r = await query(`
      SELECT s.AttDate,
             CONVERT(NVARCHAR(5), s.FirstIn, 108) AS FirstIn,
             CONVERT(NVARCHAR(5), s.LastOut, 108) AS LastOut,
             s.WorkMinutes,
             s.Status, s.IsLate, s.IsEarlyExit,
             s.LateMinutes, s.EarlyExitMins, s.LeaveType
      FROM dbo.AttendanceSummary s
      WHERE s.UserID=@uid AND s.AttDate BETWEEN @f AND @t
      ORDER BY s.AttDate`,
      { uid: req.user.userID, f, t }
    );
    res.json(r.recordset);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/attendance/logs?from=&to=&userID= */
router.get('/logs', role('hr','manager'), async (req, res) => {
  const { from, to, userID } = req.query;
  const f = from || todayStr(), t = to || todayStr();
  try {
    let sql = `
      SELECT al.LogID, al.UserID, al.PunchTime, al.PunchType, al.Source,
             u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.AttendanceLogs al
      JOIN dbo.Users u ON al.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE CAST(al.PunchTime AS DATE) BETWEEN @f AND @t`;
    const p = { f, t };
    if (userID) { sql += ' AND al.UserID=@uid'; p.uid = parseInt(userID); }
    if (req.user.role === 'manager') { sql += ' AND u.ManagerID=@mgr'; p.mgr = req.user.userID; }
    sql += ' ORDER BY al.PunchTime DESC';
    res.json((await query(sql, p)).recordset);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/attendance/logs  — add single manual punch (HR) */
router.post('/logs', role('hr'), async (req, res) => {
  const { userID, punchTime, punchType } = req.body;
  if (!userID || !punchTime || !punchType)
    return res.status(400).json({ error: 'userID, punchTime, punchType required' });
  if (!['IN','OUT','BRK'].includes(punchType))
    return res.status(400).json({ error: 'punchType must be IN, OUT or BRK' });
  try {
    await query(
      `INSERT INTO dbo.AttendanceLogs(UserID,PunchTime,PunchType,Source)
       VALUES(@uid,@pt,@ptype,'MANUAL')`,
      { uid: parseInt(userID), pt: punchTime, ptype: punchType }
    );
    const date = punchTime.slice(0,10);
    await recompute(date, date);
    res.status(201).json({ message: 'Punch recorded' });
  } catch(e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Duplicate punch at this time' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

/* DELETE /api/attendance/logs/:id  (HR) */
router.delete('/logs/:id', role('hr'), async (req, res) => {
  try {
    const r = await query('SELECT PunchTime FROM dbo.AttendanceLogs WHERE LogID=@id', { id: parseInt(req.params.id) });
    if (!r.recordset[0]) return res.status(404).json({ error: 'Not found' });
    const date = r.recordset[0].PunchTime.toISOString().slice(0,10);
    await query('DELETE FROM dbo.AttendanceLogs WHERE LogID=@id', { id: parseInt(req.params.id) });
    await recompute(date, date);
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ================================================================
// CSV IMPORT
// ================================================================

/* POST /api/attendance/import  (HR) — bulk import punch logs from CSV rows */
router.post('/import', role('hr'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const results = { added: 0, skipped: 0, errors: [] };
  const datesAffected = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const line = i + 2;
    try {
      const empCode  = (row.EmployeeCode || row['Employee Code'] || row.USERID || '').trim();
      const punchRaw = (row.PunchTime || row.CHECKTIME || row.DateTime || row.punch_time || '').trim();
      const typeRaw  = (row.PunchType  || row.CHECKTYPE || row.Type || 'IN').trim().toUpperCase();

      if (!empCode)  { results.errors.push({ row: line, reason: 'EmployeeCode missing' }); results.skipped++; continue; }
      if (!punchRaw) { results.errors.push({ row: line, reason: 'PunchTime missing' }); results.skipped++; continue; }

      // Resolve punchType — ESSL uses 0=IN,1=OUT or C/O or IN/OUT
      let punchType = 'IN';
      if (['OUT','O','1','EXIT','CHECK OUT'].includes(typeRaw)) punchType = 'OUT';
      else if (['BRK','BREAK','B'].includes(typeRaw))           punchType = 'BRK';

      // Parse punch time — CSV from COSEC is in IST (local time), NOT UTC.
      // new Date(str) treats naive datetime as UTC → shifts by -5:30.
      // Fix: parse manually and store as IST-correct datetime string.
      function parseISTStr(s) {
        // Handles "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD HH:MM" or "DD-MM-YYYY HH:MM:SS"
        s = s.trim();
        // DD-MM-YYYY → YYYY-MM-DD
        if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
          const [d,mo,y,...rest] = s.split(/[-\s:]/);
          s = `${y}-${mo}-${d} ${rest.slice(0,2).join(':')}`;
        }
        // Replace T with space
        s = s.replace('T',' ');
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return null;
        // Build Date in local timezone by passing individual parts
        const dt = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
        // Now convert to ISO but shift +5:30 IST offset so SQL Server gets the right local time
        // We store as "YYYY-MM-DDTHH:MM:SS" without Z so SQL Server treats it as local time
        return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}`;
      }
      const punchISO = parseISTStr(punchRaw);
      if (!punchISO) { results.errors.push({ row: line, reason: `Invalid date "${punchRaw}"` }); results.skipped++; continue; }
      const punchTime = { iso: punchISO, date: punchISO.slice(0,10) };

      // Resolve employee
      const u = await query('SELECT UserID FROM dbo.Users WHERE EmployeeCode=@c AND IsActive=1', { c: empCode });
      if (!u.recordset[0]) { results.errors.push({ row: line, reason: `Employee code "${empCode}" not found` }); results.skipped++; continue; }
      const userID = u.recordset[0].UserID;

      // Insert (ignore duplicates)
      try {
        await query(
          `INSERT INTO dbo.AttendanceLogs(UserID,PunchTime,PunchType,Source)
           VALUES(@uid,@pt,@ptype,'CSV')`,
          { uid: userID, pt: punchTime.iso, ptype: punchType }  // IST local time, no Z
        );
        datesAffected.add(punchTime.date);
        results.added++;
      } catch(dup) {
        if (dup.message?.includes('UNIQUE')) { results.skipped++; }
        else throw dup;
      }
    } catch(e) { results.errors.push({ row: line, reason: e.message }); }
  }

  // Recompute summaries for all affected dates
  if (datesAffected.size > 0) {
    const dates = [...datesAffected].sort();
    await recompute(dates[0], dates[dates.length-1]);
  }

  res.json({ message: `Import done: ${results.added} added, ${results.skipped} skipped`, ...results });
});

// ================================================================
// DAILY SUMMARY
// ================================================================

/* GET /api/attendance/summary?from=&to=&userID=&dept= */
router.get('/summary', role('hr','manager'), async (req, res) => {
  const { from, to, userID, dept } = req.query;
  const f = from || todayStr(), t = to || todayStr();
  try {
    let sql = `
      SELECT s.SummaryID, s.UserID, s.AttDate,
             CONVERT(NVARCHAR(5), s.FirstIn, 108) AS FirstIn,
             CONVERT(NVARCHAR(5), s.LastOut, 108) AS LastOut,
             s.WorkMinutes, s.Status, s.IsLate, s.IsEarlyExit,
             s.LateMinutes, s.EarlyExitMins, s.LeaveType,
             u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.AttendanceSummary s
      JOIN dbo.Users u ON s.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE s.AttDate BETWEEN @f AND @t`;
    const p = { f, t };
    if (userID) { sql += ' AND s.UserID=@uid'; p.uid = parseInt(userID); }
    if (dept)   { sql += ' AND u.DepartmentID=@dept'; p.dept = parseInt(dept); }
    if (req.user.role === 'manager') { sql += ' AND u.ManagerID=@mgr'; p.mgr = req.user.userID; }
    sql += ' ORDER BY s.AttDate DESC, u.FullName';
    res.json((await query(sql, p)).recordset);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/attendance/compute  (HR) — trigger recompute */
router.post('/compute', role('hr'), async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    await recompute(from, to);
    res.json({ message: `Attendance computed for ${from} to ${to}` });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ================================================================
// SALARY PERIOD ATTENDANCE REPORT
// ================================================================

/* GET /api/attendance/payroll?from=&to= */
router.get('/payroll', role('hr'), async (req, res) => {
  const p = req.query.from && req.query.to ? { from: req.query.from, to: req.query.to } : defaultPeriod();
  try {
    const r = await query(`
      SELECT
        u.EmployeeCode, u.FullName, d.DepartmentName,
        COUNT(CASE WHEN s.Status IN ('PRESENT','LATE','EARLY_EXIT','LATE_EARLY') THEN 1 END) AS PresentDays,
        COUNT(CASE WHEN s.Status='ABSENT'    THEN 1 END) AS AbsentDays,
        COUNT(CASE WHEN s.Status='ON_LEAVE'  THEN 1 END) AS LeaveDays,
        COUNT(CASE WHEN s.Status='LATE'      OR s.Status='LATE_EARLY' THEN 1 END) AS LateDays,
        COUNT(CASE WHEN s.Status='EARLY_EXIT'OR s.Status='LATE_EARLY' THEN 1 END) AS EarlyExitDays,
        COUNT(CASE WHEN s.Status='HOLIDAY'   THEN 1 END) AS Holidays,
        ISNULL(SUM(CASE WHEN s.Status NOT IN ('ABSENT','ON_LEAVE','HOLIDAY','WEEKEND')
                   THEN s.WorkMinutes END), 0) AS TotalWorkMinutes,
        SUM(ISNULL(s.LateMinutes,0))    AS TotalLateMinutes,
        SUM(ISNULL(s.EarlyExitMins,0))  AS TotalEarlyMins
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.AttendanceSummary s ON s.UserID=u.UserID
             AND s.AttDate BETWEEN @f AND @t
             AND s.Status NOT IN ('WEEKEND')
      WHERE u.IsActive=1
      GROUP BY u.UserID, u.EmployeeCode, u.FullName, d.DepartmentName
      ORDER BY u.FullName`,
      { f: p.from, t: p.to }
    );
    res.json({ from: p.from, to: p.to, data: r.recordset });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/attendance/payroll/export?from=&to= */
router.get('/payroll/export', role('hr'), async (req, res) => {
  const p = req.query.from && req.query.to ? { from: req.query.from, to: req.query.to } : defaultPeriod();
  try {
    const r = await query(`
      SELECT
        u.EmployeeCode, u.FullName, d.DepartmentName,
        COUNT(CASE WHEN s.Status IN ('PRESENT','LATE','EARLY_EXIT','LATE_EARLY') THEN 1 END) AS PresentDays,
        COUNT(CASE WHEN s.Status='ABSENT'    THEN 1 END) AS AbsentDays,
        COUNT(CASE WHEN s.Status='ON_LEAVE'  THEN 1 END) AS LeaveDays,
        COUNT(CASE WHEN s.Status='LATE'      OR s.Status='LATE_EARLY' THEN 1 END) AS LateDays,
        COUNT(CASE WHEN s.Status='EARLY_EXIT'OR s.Status='LATE_EARLY' THEN 1 END) AS EarlyExitDays,
        COUNT(CASE WHEN s.Status='HOLIDAY'   THEN 1 END) AS Holidays,
        ISNULL(SUM(CASE WHEN s.Status NOT IN ('ABSENT','ON_LEAVE','HOLIDAY','WEEKEND')
                   THEN s.WorkMinutes END),0) AS TotalWorkMinutes
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.AttendanceSummary s ON s.UserID=u.UserID
             AND s.AttDate BETWEEN @f AND @t
             AND s.Status NOT IN ('WEEKEND')
      WHERE u.IsActive=1
      GROUP BY u.UserID, u.EmployeeCode, u.FullName, d.DepartmentName
      ORDER BY u.FullName`,
      { f: p.from, t: p.to }
    );
    const rows = r.recordset;
    const hdrs = ['EmployeeCode','FullName','Department','PresentDays','AbsentDays','LeaveDays',
                  'LateDays','EarlyExitDays','Holidays','TotalWorkHours'];
    const csv = [
      hdrs.join(','),
      ...rows.map(r => [
        `"${r.EmployeeCode||''}"`, `"${r.FullName}"`, `"${r.DepartmentName||''}"`,
        r.PresentDays, r.AbsentDays, r.LeaveDays,
        r.LateDays, r.EarlyExitDays, r.Holidays,
        (r.TotalWorkMinutes/60).toFixed(1)
      ].join(','))
    ].join('\r\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition',`attachment; filename="payroll_attendance_${p.from}_to_${p.to}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ error: 'Export failed' }); }
});

module.exports = router;
