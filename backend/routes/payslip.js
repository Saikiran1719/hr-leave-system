// backend/routes/payslip.js  — Pure Node.js, no extra packages needed
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// Multer for CSV upload (memory storage)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'))
      cb(null, true);
    else cb(new Error('Only CSV files allowed'));
  }
});

// ── GET /api/payslip/salary/export — download CSV template + data ──
router.get('/salary/export', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT u.EmployeeCode, u.FullName, d.DepartmentName,
             ISNULL(s.BasicSalary,0) AS BasicSalary,
             ISNULL(s.HRA,0) AS HRA, ISNULL(s.DA,0) AS DA,
             ISNULL(s.TA,0) AS TA, ISNULL(s.OtherAllowance,0) AS OtherAllowance,
             ISNULL(s.PFDeduction,0) AS PFDeduction,
             ISNULL(s.ESIDeduction,0) AS ESIDeduction,
             ISNULL(s.TaxDeduction,0) AS TaxDeduction,
             ISNULL(s.OtherDeduction,0) AS OtherDeduction
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.SalaryStructure s ON s.UserID=u.UserID AND s.IsActive=1
      WHERE u.IsActive=1
      ORDER BY u.FullName`);

    const header = 'EmployeeCode,EmployeeName,Department,BasicSalary,HRA,DA,TA,OtherAllowance,PFDeduction,ESIDeduction,TaxDeduction,OtherDeduction';
    const rows = r.recordset.map(e =>
      [e.EmployeeCode||'', `"${e.FullName||''}"`, `"${e.DepartmentName||''}"`,
       e.BasicSalary, e.HRA, e.DA, e.TA, e.OtherAllowance,
       e.PFDeduction, e.ESIDeduction, e.TaxDeduction, e.OtherDeduction].join(',')
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="salary_structures.csv"');
    res.send([header, ...rows].join('\r\n'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/payslip/salary/import — bulk import from CSV ────
router.post('/salary/import', role('hr'), csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
  try {
    const csv   = req.file.buffer.toString('utf-8');
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV is empty' });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g,''));
    const codeIdx  = headers.indexOf('employeecode');
    const basicIdx = headers.findIndex(h => h.includes('basic'));
    const hraIdx   = headers.findIndex(h => h === 'hra');
    const daIdx    = headers.findIndex(h => h === 'da');
    const taIdx    = headers.findIndex(h => h === 'ta');
    const othEIdx  = headers.findIndex(h => h.includes('otherallow'));
    const pfIdx    = headers.findIndex(h => h.includes('pf') || h.includes('provident'));
    const esiIdx   = headers.findIndex(h => h === 'esi');
    const taxIdx   = headers.findIndex(h => h.includes('tax'));
    const othDIdx  = headers.findIndex(h => h.includes('otherdeduc'));

    if (codeIdx === -1 || basicIdx === -1)
      return res.status(400).json({ error: 'CSV must have EmployeeCode and BasicSalary columns' });

    const results = { updated: 0, skipped: 0, errors: [] };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle quoted fields
      const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',');
      const clean = cols.map(c => c.replace(/^"|"$/g,'').trim());

      const empCode = clean[codeIdx];
      const basic   = parseFloat(clean[basicIdx]) || 0;
      if (!empCode || !basic) { results.skipped++; continue; }

      // Find employee by code
      const empR = await query(`SELECT UserID FROM dbo.Users WHERE EmployeeCode=@code AND IsActive=1`,
        { code: empCode });
      if (!empR.recordset.length) {
        results.errors.push(`Row ${i+1}: Employee code "${empCode}" not found`);
        continue;
      }
      const uid = empR.recordset[0].UserID;

      const sal = {
        uid, basic,
        hra:   hraIdx  >= 0 ? parseFloat(clean[hraIdx])||0  : 0,
        da:    daIdx   >= 0 ? parseFloat(clean[daIdx])||0   : 0,
        ta:    taIdx   >= 0 ? parseFloat(clean[taIdx])||0   : 0,
        othE:  othEIdx >= 0 ? parseFloat(clean[othEIdx])||0 : 0,
        pf:    pfIdx   >= 0 ? parseFloat(clean[pfIdx])||0   : 0,
        esi:   esiIdx  >= 0 ? parseFloat(clean[esiIdx])||0  : 0,
        tax:   taxIdx  >= 0 ? parseFloat(clean[taxIdx])||0  : 0,
        othD:  othDIdx >= 0 ? parseFloat(clean[othDIdx])||0 : 0,
        by:    req.user.userID,
      };

      await query(`UPDATE dbo.SalaryStructure SET IsActive=0 WHERE UserID=@uid`, { uid });
      await query(`INSERT INTO dbo.SalaryStructure
        (UserID,BasicSalary,HRA,DA,TA,OtherAllowance,PFDeduction,ESIDeduction,TaxDeduction,OtherDeduction,UpdatedByID)
        VALUES(@uid,@basic,@hra,@da,@ta,@othE,@pf,@esi,@tax,@othD,@by)`, sal);
      results.updated++;
    }

    await logAudit(req.user.userID,'salary_bulk_import','SalaryStructure',null,null,
      { updated: results.updated, skipped: results.skipped }, req);
    res.json({ success: true, ...results,
      message: `${results.updated} updated, ${results.skipped} skipped${results.errors.length?' ('+results.errors.length+' errors)':''}` });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/salary — all salary structures (HR) ─────
router.get('/salary', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT s.*, u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.SalaryStructure s
      JOIN dbo.Users u ON s.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE s.IsActive=1 ORDER BY u.FullName`);
    res.json({ success: true, salaries: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/payslip/salary — set salary structure (HR) ─────
router.post('/salary', role('hr'), async (req, res) => {
  const { userID, basicSalary, hra, da, ta, otherAllowance,
          pfDeduction, esiDeduction, taxDeduction, otherDeduction } = req.body;
  if (!userID || !basicSalary) return res.status(400).json({ error: 'userID and basicSalary required' });
  try {
    await query(`UPDATE dbo.SalaryStructure SET IsActive=0 WHERE UserID=@uid`, { uid: userID });
    await query(`INSERT INTO dbo.SalaryStructure
      (UserID,BasicSalary,HRA,DA,TA,OtherAllowance,PFDeduction,ESIDeduction,TaxDeduction,OtherDeduction,UpdatedByID)
      VALUES(@uid,@basic,@hra,@da,@ta,@oth,@pf,@esi,@tax,@othd,@by)`,
      { uid: userID, basic: basicSalary, hra: hra||0, da: da||0, ta: ta||0,
        oth: otherAllowance||0, pf: pfDeduction||0, esi: esiDeduction||0,
        tax: taxDeduction||0, othd: otherDeduction||0, by: req.user.userID });
    await logAudit(req.user.userID, 'salary_updated', 'SalaryStructure', userID, null, req.body, req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/list ─────────────────────────────────────
router.get('/list', async (req, res) => {
  const uid   = req.user.userID;
  const isHR  = req.user.role === 'hr';
  const month = req.query.month ? parseInt(req.query.month) : null;
  const year  = req.query.year  ? parseInt(req.query.year)  : null;
  try {
    let where = isHR ? '' : `AND p.UserID=${uid}`;
    if (month) where += ` AND p.Month=${month}`;
    if (year)  where += ` AND p.Year=${year}`;
    const r = await query(`
      SELECT p.PayslipID, p.Month, p.Year, p.NetSalary, p.GrossSalary,
             p.PresentDays, p.AbsentDays, p.WorkingDays, p.Status,
             p.GeneratedAt, p.PublishedAt, p.Remarks,
             u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE 1=1 ${where}
      ORDER BY p.Year DESC, p.Month DESC, u.FullName`);
    res.json({ success: true, payslips: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/payslip/generate ────────────────────────────────
router.post('/generate', role('hr'), async (req, res) => {
  const { month, year, userIDs } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });
  try {
    let empWhere = userIDs?.length ? `AND u.UserID IN (${userIDs.join(',')})` : '';
    const emps = await query(`
      SELECT u.UserID, u.FullName, u.EmployeeCode, u.Role, d.DepartmentName
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE u.IsActive=1 ${empWhere}`);

    const fixedFrom = month === 1
      ? `${year-1}-12-26`
      : `${year}-${String(month-1).padStart(2,'0')}-26`;
    const fixedTo = `${year}-${String(month).padStart(2,'0')}-25`;

    // Total calendar days in pay period (e.g. Jan 26 – Feb 25 = 31 days)
    const wdR = await query(`
      SELECT DATEDIFF(DAY, CONVERT(DATE,'${fixedFrom}',23), CONVERT(DATE,'${fixedTo}',23)) + 1 AS WD`);
    const totalWD = wdR.recordset[0]?.WD || 26;

    const results = [];
    for (const emp of emps.recordset) {
      const salR = await query(`SELECT * FROM dbo.SalaryStructure WHERE UserID=@uid AND IsActive=1`, { uid: emp.UserID });
      const sal = salR.recordset[0];
      if (!sal) { results.push({ userID: emp.UserID, name: emp.FullName, error: 'No salary' }); continue; }

      // Read ALL attendance counts directly from AttendanceSummary for the pay period
      const attR = await query(`
        SELECT
          COUNT(CASE WHEN Status IN ('PRESENT','LATE','EARLY_EXIT','LATE_EARLY') THEN 1 END)             AS PresentDays,
          COUNT(CASE WHEN Status='ABSENT'   THEN 1 END)                                                  AS AbsentDays,
          COUNT(CASE WHEN Status='ON_LEAVE' THEN 1 END)                                                  AS LeaveDays,
          COUNT(CASE WHEN LeaveType='OOD'   THEN 1 END)                                                  AS OODDays,
          COUNT(CASE WHEN Status IN ('LATE','LATE_EARLY') THEN 1 END)                                    AS LateDays,
          COUNT(CASE WHEN Status='HOLIDAY'  THEN 1 END)                                                  AS Holidays
        FROM dbo.AttendanceSummary
        WHERE UserID=@uid AND AttDate BETWEEN @f AND @t`,
        { uid: emp.UserID, f: fixedFrom, t: fixedTo });
      const att = attR.recordset[0] || {};

      // Working days = total calendar days in pay period (Jan 26 – Feb 25 = 31 days)
      const totalWD = wdR.recordset[0]?.WD || 30;

      // LOP = absent days × per-day rate (holidays & leaves are NOT deducted)
      const perDay = parseFloat(sal.BasicSalary) / totalWD;
      const lop    = Math.round(perDay * parseInt(att.AbsentDays||0) * 100) / 100;
      const basic  = parseFloat(sal.BasicSalary||0);
      const hra    = parseFloat(sal.HRA||0);
      const da     = parseFloat(sal.DA||0);
      const ta     = parseFloat(sal.TA||0);
      const othE   = parseFloat(sal.OtherAllowance||0);
      const gross  = basic + hra + da + ta + othE;
      const pf     = parseFloat(sal.PFDeduction||0);
      const esi    = parseFloat(sal.ESIDeduction||0);
      const tax    = parseFloat(sal.TaxDeduction||0);
      const othD   = parseFloat(sal.OtherDeduction||0);
      const totalD = pf + esi + tax + lop + othD;
      const net    = Math.max(0, gross - totalD);

      const ex = await query(`SELECT PayslipID FROM dbo.Payslips WHERE UserID=@uid AND Month=@m AND Year=@y`,
        { uid: emp.UserID, m: month, y: year });
      if (ex.recordset.length) {
        await query(`UPDATE dbo.Payslips SET WorkingDays=@wd,PresentDays=@pd,AbsentDays=@ad,
          LeaveDays=@ld,OODDays=@od,LateDays=@lat,BasicSalary=@basic,HRA=@hra,DA=@da,TA=@ta,
          OtherAllowance=@othe,GrossSalary=@gross,PFDeduction=@pf,ESIDeduction=@esi,
          TaxDeduction=@tax,LopDeduction=@lop,OtherDeduction=@othd,TotalDeduction=@tded,
          NetSalary=@net,Status='draft',GeneratedByID=@by,GeneratedAt=GETDATE()
          WHERE UserID=@uid AND Month=@m AND Year=@y`,
          { wd:totalWD,pd:att.PresentDays||0,ad:att.AbsentDays||0,ld:att.LeaveDays||0,
            od:att.OODDays||0,lat:att.LateDays||0,basic,hra,da,ta,othe:othE,gross,
            pf,esi,tax,lop,othd:othD,tded:totalD,net,by:req.user.userID,
            uid:emp.UserID,m:month,y:year });
      } else {
        await query(`INSERT INTO dbo.Payslips
          (UserID,Month,Year,WorkingDays,PresentDays,AbsentDays,LeaveDays,OODDays,LateDays,
           BasicSalary,HRA,DA,TA,OtherAllowance,GrossSalary,PFDeduction,ESIDeduction,
           TaxDeduction,LopDeduction,OtherDeduction,TotalDeduction,NetSalary,GeneratedByID)
          VALUES(@uid,@m,@y,@wd,@pd,@ad,@ld,@od,@lat,@basic,@hra,@da,@ta,@othe,@gross,
                 @pf,@esi,@tax,@lop,@othd,@tded,@net,@by)`,
          { uid:emp.UserID,m:month,y:year,wd:totalWD,pd:att.PresentDays||0,ad:att.AbsentDays||0,
            ld:att.LeaveDays||0,od:att.OODDays||0,lat:att.LateDays||0,basic,hra,da,ta,
            othe:othE,gross,pf,esi,tax,lop,othd:othD,tded:totalD,net,by:req.user.userID });
      }
      results.push({ userID: emp.UserID, name: emp.FullName, net, gross, status: 'generated' });
    }
    await logAudit(req.user.userID, 'payslips_generated', 'Payslips', null, null, { month, year, count: results.length }, req);
    res.json({ success: true, results, message: `${results.filter(r=>r.status==='generated').length} payslips generated` });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/payslip/:id/publish ───────────────────────────
router.patch('/:id/publish', role('hr'), async (req, res) => {
  try {
    await query(`UPDATE dbo.Payslips SET Status='published',PublishedAt=GETDATE() WHERE PayslipID=@id`,
      { id: parseInt(req.params.id) });
    const pR = await query(`SELECT UserID,Month,Year FROM dbo.Payslips WHERE PayslipID=@id`,
      { id: parseInt(req.params.id) });
    const p = pR.recordset[0];
    if (p) {
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@uid,N'💵 Payslip Available',
          N'Your payslip for ${MONTHS[p.Month-1]} ${p.Year} is now available.',
          'payslip',@pid)`, { uid: p.UserID, pid: parseInt(req.params.id) });
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/:id/html — returns HTML payslip ─────────
// Browser opens this, user prints / saves as PDF using Ctrl+P
router.get('/:id/html', async (req, res) => {
  const uid  = req.user.userID;
  const isHR = req.user.role === 'hr';
  try {
    const r = await query(`
      SELECT p.*, u.FullName, u.EmployeeCode, u.Role,
             d.DepartmentName, u.UserID AS EmpUserID
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE p.PayslipID=@id`, { id: parseInt(req.params.id) });
    const p = r.recordset[0];
    if (!p) return res.status(404).send('Payslip not found');
    if (!isHR && p.EmpUserID !== uid) return res.status(403).send('Access denied');
    if (!isHR && p.Status !== 'published') return res.status(403).send('Not yet published');

    // Re-read live attendance for the pay period (Jan 26 – Feb 25 for February)
    const attFrom = p.Month === 1
      ? `${p.Year-1}-12-26`
      : `${p.Year}-${String(p.Month-1).padStart(2,'0')}-26`;
    const attTo = `${p.Year}-${String(p.Month).padStart(2,'0')}-25`;

    const liveAtt = await query(`
      SELECT
        COUNT(CASE WHEN Status IN ('PRESENT','LATE','EARLY_EXIT','LATE_EARLY') THEN 1 END) AS PresentDays,
        COUNT(CASE WHEN Status='ABSENT'   THEN 1 END)  AS AbsentDays,
        COUNT(CASE WHEN Status='ON_LEAVE' THEN 1 END)  AS LeaveDays,
        COUNT(CASE WHEN LeaveType='OOD'   THEN 1 END)  AS OODDays,
        COUNT(CASE WHEN Status='WEEKEND'  THEN 1 END)  AS WeekOff
      FROM dbo.AttendanceSummary
      WHERE UserID=@uid AND AttDate BETWEEN @f AND @t`,
      { uid: p.EmpUserID, f: attFrom, t: attTo });
    const live = liveAtt.recordset[0] || {};

    // Override stored values with live attendance counts
    p.PresentDays = live.PresentDays ?? p.PresentDays;
    p.AbsentDays  = live.AbsentDays  ?? p.AbsentDays;
    p.LeaveDays   = live.LeaveDays   ?? p.LeaveDays;
    p.OODDays     = live.OODDays     ?? p.OODDays;
    // Week Off = WEEKEND rows from AttendanceSummary, fallback to counting Sundays in period
    p.WeekOff     = live.WeekOff > 0 ? live.WeekOff : Math.floor(p.WorkingDays / 7);

    const settR = await query(`SELECT SettingKey,SettingValue FROM dbo.Settings`);
    const S = Object.fromEntries(settR.recordset.map(s=>[s.SettingKey,s.SettingValue]));

    const fmt = v => `₹${parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2})}`;
    const mn  = MONTHS[p.Month-1];

    const earnRows = [
      ['Basic Salary', p.BasicSalary],
      ['HRA (House Rent Allowance)', p.HRA],
      ['Dearness Allowance', p.DA],
      ['Travel Allowance', p.TA],
      ['Other Allowance', p.OtherAllowance],
    ].filter(([,v]) => parseFloat(v||0) > 0);

    const dedRows = [
      ['Provident Fund (PF)', p.PFDeduction],
      ['ESI', p.ESIDeduction],
      ['Income Tax (TDS)', p.TaxDeduction],
      ['Loss of Pay (LOP)', p.LopDeduction],
      ['Other Deductions', p.OtherDeduction],
    ].filter(([,v]) => parseFloat(v||0) > 0);

    const maxRows = Math.max(earnRows.length, dedRows.length, 1);
    while (earnRows.length < maxRows) earnRows.push(['','']);
    while (dedRows.length  < maxRows) dedRows.push(['','']);

    const tableRows = Array.from({length: maxRows}, (_,i) => {
      const [ek,ev] = earnRows[i]||['',''];
      const [dk,dv] = dedRows[i]||['',''];
      return `<tr>
        <td class="earn-label">${ek}</td>
        <td class="earn-val">${ek ? fmt(ev) : ''}</td>
        <td class="ded-label">${dk}</td>
        <td class="ded-val">${dk ? fmt(dv) : ''}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Payslip - ${p.FullName} - ${mn} ${p.Year}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; background: #f1f5f9; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm 14mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2.5px solid #1a3c6e; padding-bottom: 10px; margin-bottom: 10px; }
  .co-name { font-size: 18px; font-weight: 800; color: #1a3c6e; }
  .co-addr { font-size: 10px; color: #64748b; margin-top: 3px; }
  .co-meta { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .slip-title { background: #1a3c6e; color: #fff; text-align: center; padding: 8px; border-radius: 4px; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin-bottom: 10px; }
  .emp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
  .emp-row { display: grid; grid-template-columns: 110px 1fr; }
  .emp-row:not(:last-child) { border-bottom: 1px solid #f1f5f9; }
  .emp-key { background: #f0f4ff; padding: 5px 8px; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .emp-val { padding: 5px 8px; font-size: 10px; font-weight: 700; color: #1e293b; }
  .att-grid { display: grid; grid-template-columns: repeat(6,1fr); border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 10px; text-align: center; }
  .att-cell { padding: 6px 4px; border-right: 1px solid #e2e8f0; background: #f8faff; }
  .att-cell:last-child { border-right: none; }
  .att-num { font-size: 18px; font-weight: 800; }
  .att-lbl { font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
  .ed-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .ed-table th { padding: 7px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .th-earn { background: #16a34a; color: #fff; text-align: left; width: 37%; }
  .th-earn-val { background: #16a34a; color: #fff; text-align: right; width: 13%; }
  .th-ded { background: #dc2626; color: #fff; text-align: left; width: 37%; padding-left: 16px; }
  .th-ded-val { background: #dc2626; color: #fff; text-align: right; width: 13%; }
  .ed-table td { padding: 5px 10px; font-size: 10px; border-bottom: 1px solid #f1f5f9; }
  .earn-label { color: #1e293b; width: 37%; }
  .earn-val { text-align: right; color: #16a34a; font-weight: 700; width: 13%; }
  .ded-label { color: #1e293b; padding-left: 16px; width: 37%; }
  .ded-val { text-align: right; color: #dc2626; font-weight: 700; width: 13%; }
  .total-row td { font-weight: 800; font-size: 11px; padding: 7px 10px; border-top: 1.5px solid; }
  .total-earn { background: #f0fdf4; border-color: #16a34a !important; color: #16a34a; }
  .total-earn-val { background: #f0fdf4; text-align: right; color: #16a34a; }
  .total-ded { background: #fff1f2; border-color: #dc2626 !important; color: #dc2626; padding-left: 16px; }
  .total-ded-val { background: #fff1f2; text-align: right; color: #dc2626; }
  .net-bar { background: #1a3c6e; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 4px; margin-bottom: 8px; }
  .net-label { font-size: 12px; font-weight: 700; }
  .net-amount { font-size: 20px; font-weight: 800; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #1a3c6e; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 700; z-index: 999; }
  @media print { body { background: #fff; } .print-btn { display: none; } .page { padding: 8mm 10mm; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="co-name">${S.company_name||'Company'}</div>
      <div class="co-addr">${S.company_address||''}</div>
    </div>
    <div style="text-align:right">
      ${S.company_pan?`<div class="co-meta">PAN: ${S.company_pan}</div>`:''}
      ${S.company_pf_number?`<div class="co-meta">PF No: ${S.company_pf_number}</div>`:''}
      <div class="co-meta">Generated: ${new Date(p.GeneratedAt).toLocaleDateString('en-IN')}</div>
    </div>
  </div>

  <!-- Title -->
  <div class="slip-title">SALARY SLIP — ${mn.toUpperCase()} ${p.Year}</div>

  <!-- Employee Details -->
  <div class="emp-grid">
    <div>
      <div class="emp-row"><div class="emp-key">Employee Name</div><div class="emp-val">${p.FullName}</div></div>
      <div class="emp-row"><div class="emp-key">Employee ID</div><div class="emp-val">${p.EmployeeCode?'#'+p.EmployeeCode:'—'}</div></div>
      <div class="emp-row"><div class="emp-key">Designation</div><div class="emp-val">${(p.Role||'').toUpperCase()}</div></div>
      <div class="emp-row"><div class="emp-key">Department</div><div class="emp-val">${p.DepartmentName||'—'}</div></div>
    </div>
    <div>
      <div class="emp-row"><div class="emp-key">Pay Period</div><div class="emp-val">${mn} ${p.Year}</div></div>
      <div class="emp-row"><div class="emp-key">Working Days</div><div class="emp-val">${p.WorkingDays}</div></div>
      <div class="emp-row"><div class="emp-key">Days Present</div><div class="emp-val">${p.PresentDays}</div></div>
      <div class="emp-row"><div class="emp-key">Days Absent</div><div class="emp-val">${p.AbsentDays}</div></div>
    </div>
  </div>

  <!-- Attendance Summary — 6 columns with WO -->
  <div class="att-grid" style="grid-template-columns:repeat(6,1fr)">
    <div class="att-cell"><div class="att-num" style="color:#16a34a">${p.PresentDays}</div><div class="att-lbl">Present</div></div>
    <div class="att-cell"><div class="att-num" style="color:#dc2626">${p.AbsentDays}</div><div class="att-lbl">Absent</div></div>
    <div class="att-cell"><div class="att-num" style="color:#2563eb">${p.LeaveDays}</div><div class="att-lbl">On Leave</div></div>
    <div class="att-cell"><div class="att-num" style="color:#0ea5e9">${p.OODDays}</div><div class="att-lbl">OOD</div></div>
    <div class="att-cell"><div class="att-num" style="color:#6366f1">${p.WeekOff||0}</div><div class="att-lbl">Week Off</div></div>
    <div class="att-cell"><div class="att-num" style="color:#7c3aed">${p.WorkingDays}</div><div class="att-lbl">Working Days</div></div>
  </div>

  <!-- Earnings & Deductions -->
  <table class="ed-table">
    <thead>
      <tr>
        <th class="th-earn">Earnings</th>
        <th class="th-earn-val">Amount</th>
        <th class="th-ded">Deductions</th>
        <th class="th-ded-val">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td class="total-earn">GROSS SALARY</td>
        <td class="total-earn-val">${fmt(p.GrossSalary)}</td>
        <td class="total-ded">TOTAL DEDUCTIONS</td>
        <td class="total-ded-val">${fmt(p.TotalDeduction)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Net Salary -->
  <div class="net-bar">
    <div class="net-label">NET SALARY PAYABLE</div>
    <div class="net-amount">${fmt(p.NetSalary)}</div>
  </div>

  ${p.Remarks ? `<div style="font-size:9px;color:#64748b;margin-bottom:8px"><b>Remarks:</b> ${p.Remarks}</div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>This is a computer-generated payslip and does not require a signature.</span>
    <span>${S.company_name||'Company'} | ${mn} ${p.Year}</span>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) { console.error(e); res.status(500).send('Error: '+e.message); }
});

module.exports = router;

// ── GET /api/payslip/reports/monthly — Monthly salary summary ──
router.get('/reports/monthly', role('hr'), async (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  try {
    const r = await query(`
      SELECT
        u.FullName, u.EmployeeCode, d.DepartmentName,
        p.BasicSalary, p.HRA, p.DA, p.TA, p.OtherAllowance,
        p.GrossSalary, p.PFDeduction, p.ESIDeduction,
        p.TaxDeduction, p.LopDeduction, p.OtherDeduction,
        p.TotalDeduction, p.NetSalary,
        p.PresentDays, p.AbsentDays, p.WorkingDays, p.Status
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE p.Month=@m AND p.Year=@y AND u.IsActive=1
      ORDER BY d.DepartmentName, u.FullName`,
      { m, y });

    const rows = r.recordset;
    const totals = rows.reduce((acc, row) => {
      acc.gross    += row.GrossSalary    || 0;
      acc.net      += row.NetSalary      || 0;
      acc.pf       += row.PFDeduction    || 0;
      acc.esi      += row.ESIDeduction   || 0;
      acc.tax      += row.TaxDeduction   || 0;
      acc.lop      += row.LopDeduction   || 0;
      acc.deduction+= row.TotalDeduction || 0;
      return acc;
    }, { gross:0, net:0, pf:0, esi:0, tax:0, lop:0, deduction:0 });

    res.json({ success:true, month:m, year:y, employees:rows.length, rows, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/reports/department — Dept-wise breakdown ──
router.get('/reports/department', role('hr'), async (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  try {
    const r = await query(`
      SELECT
        d.DepartmentName,
        COUNT(p.PayslipID) AS EmployeeCount,
        SUM(p.GrossSalary)    AS TotalGross,
        SUM(p.NetSalary)      AS TotalNet,
        SUM(p.PFDeduction)    AS TotalPF,
        SUM(p.ESIDeduction)   AS TotalESI,
        SUM(p.TaxDeduction)   AS TotalTax,
        SUM(p.LopDeduction)   AS TotalLOP,
        SUM(p.TotalDeduction) AS TotalDeductions,
        AVG(p.NetSalary)      AS AvgNet
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE p.Month=@m AND p.Year=@y
      GROUP BY d.DepartmentName
      ORDER BY TotalNet DESC`,
      { m, y });
    res.json({ success:true, month:m, year:y, rows: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/reports/lop — LOP deduction report ────────
router.get('/reports/lop', role('hr'), async (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year)  || new Date().getFullYear();
  try {
    const r = await query(`
      SELECT
        u.FullName, u.EmployeeCode, d.DepartmentName,
        p.WorkingDays, p.PresentDays, p.AbsentDays, p.LeaveDays,
        p.BasicSalary, p.LopDeduction, p.NetSalary,
        CAST(p.LopDeduction AS DECIMAL(10,2)) AS LopAmount,
        p.AbsentDays AS LopDays
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE p.Month=@m AND p.Year=@y AND p.LopDeduction > 0
      ORDER BY p.LopDeduction DESC`,
      { m, y });
    res.json({ success:true, month:m, year:y, rows: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/payslip/reports/ytd — Year-to-date per employee ───
router.get('/reports/ytd', role('hr'), async (req, res) => {
  const { year, userID } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  try {
    let sql = `
      SELECT
        u.FullName, u.EmployeeCode, d.DepartmentName,
        p.Month,
        SUM(p.GrossSalary)    AS Gross,
        SUM(p.NetSalary)      AS Net,
        SUM(p.PFDeduction)    AS PF,
        SUM(p.TaxDeduction)   AS Tax,
        SUM(p.LopDeduction)   AS LOP
      FROM dbo.Payslips p
      JOIN dbo.Users u ON p.UserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE p.Year=@y`;
    if (userID) sql += ` AND p.UserID=@uid`;
    sql += ` GROUP BY u.FullName, u.EmployeeCode, d.DepartmentName, p.Month
             ORDER BY u.FullName, p.Month`;

    const params = userID ? { y, uid: parseInt(userID) } : { y };
    const r = await query(sql, params);

    // Group by employee
    const byEmp = {};
    r.recordset.forEach(row => {
      const key = row.EmployeeCode || row.FullName;
      if (!byEmp[key]) byEmp[key] = {
        FullName: row.FullName, EmployeeCode: row.EmployeeCode,
        DepartmentName: row.DepartmentName, months: [],
        totalGross:0, totalNet:0, totalPF:0, totalTax:0, totalLOP:0
      };
      byEmp[key].months.push({ month: row.Month, gross: row.Gross, net: row.Net, pf: row.PF, tax: row.Tax, lop: row.LOP });
      byEmp[key].totalGross += row.Gross || 0;
      byEmp[key].totalNet   += row.Net   || 0;
      byEmp[key].totalPF    += row.PF    || 0;
      byEmp[key].totalTax   += row.Tax   || 0;
      byEmp[key].totalLOP   += row.LOP   || 0;
    });

    res.json({ success:true, year:y, employees: Object.values(byEmp) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
