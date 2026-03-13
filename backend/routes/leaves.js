// backend/routes/leaves.js
const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const { query, exec } = require('../config/db');
const { auth, role }  = require('../middleware/auth');
const mailer          = require('../utils/mailer');

// File upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ['.pdf','.jpg','.jpeg','.png','.doc','.docx'].includes(
      path.extname(file.originalname).toLowerCase()
    ));
  }
});

router.use(auth);

/* GET /api/leaves/types — returns only gender-appropriate types for logged-in user */
router.get('/types', async (req, res) => {
  try {
    // Get user's gender
    const ug = await query('SELECT Gender FROM dbo.Users WHERE UserID=@id', { id: req.user.userID });
    const gender = ug.recordset[0]?.Gender || null;

    const r = await query(
      `SELECT * FROM dbo.LeaveTypes
       WHERE IsActive=1
         AND (AllowedGender IS NULL
              OR AllowedGender = @g
              OR @g IS NULL)
       ORDER BY TypeCode`,
      { g: gender }
    );
    res.json(r.recordset);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/leaves/balance */
router.get('/balance', async (req, res) => {
  const uid  = req.query.userID ? parseInt(req.query.userID) : req.user.userID;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  if (req.user.role === 'employee' && uid !== req.user.userID)
    return res.status(403).json({ error: 'Access denied' });
  try {
    // Get user's gender to filter gender-restricted leave types
    const gRes = await query('SELECT Gender FROM dbo.Users WHERE UserID=@id', { id: uid });
    const gender = gRes.recordset[0]?.Gender || null;

    const r = await query(
      `SELECT lb.TotalDays, lb.UsedDays, lb.RemainingDays,
              lt.LeaveTypeID, lt.TypeCode, lt.TypeName, lt.ColorHex, lt.MaxDaysPerYear,
              lt.AllowedGender
       FROM dbo.LeaveBalances lb
       JOIN dbo.LeaveTypes lt ON lb.LeaveTypeID=lt.LeaveTypeID
       WHERE lb.UserID=@uid AND lb.Year=@year AND lt.IsActive=1
         AND (lt.AllowedGender IS NULL
              OR lt.AllowedGender = @g
              OR @g IS NULL)
       ORDER BY lt.TypeCode`,
      { uid, year, g: gender }
    );
    res.json(r.recordset);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/leaves/my */
router.get('/my', async (req, res) => {
  const { status, year } = req.query;
  let sql = `SELECT la.ApplicationID, la.FromDate, la.ToDate, la.TotalDays, la.IsHalfDay,
                    la.HalfDaySession, la.Reason, la.Status, la.AppliedOn, la.ApproverComment,
                    la.AttachmentPath, lt.TypeCode, lt.TypeName, lt.ColorHex,
                    ab.FullName AS ApproverName
             FROM dbo.LeaveApplications la
             JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
             LEFT JOIN dbo.Users ab ON la.ApprovedByID=ab.UserID
             WHERE la.UserID=@uid`;
  const p = { uid: req.user.userID };
  if (status) { sql += ' AND la.Status=@status'; p.status = status; }
  if (year)   { sql += ' AND YEAR(la.FromDate)=@year'; p.year = parseInt(year); }
  sql += ' ORDER BY la.AppliedOn DESC';
  try { res.json((await query(sql, p)).recordset); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/leaves/apply */
router.post('/apply', upload.single('attachment'), async (req, res) => {
  const { leaveTypeID, fromDate, toDate, totalDays, isHalfDay, halfDaySession, reason } = req.body;
  if (!leaveTypeID || !fromDate || !toDate || !reason)
    return res.status(400).json({ error: 'leaveTypeID, fromDate, toDate, reason required' });

    // Gender restriction check
    const gCheck = await query(
      `SELECT lt.AllowedGender, u.Gender
       FROM dbo.LeaveTypes lt, dbo.Users u
       WHERE lt.LeaveTypeID=@lt AND u.UserID=@uid`,
      { lt: parseInt(leaveTypeID), uid: req.user.userID }
    );
    if (gCheck.recordset[0]) {
      const { AllowedGender, Gender } = gCheck.recordset[0];
      if (AllowedGender && Gender && AllowedGender !== Gender) {
        return res.status(403).json({
          error: `This leave type is only available for ${AllowedGender} employees`
        });
      }
    }
  try {
    const r = await exec('dbo.sp_ApplyLeave', {
      UserID: req.user.userID, LeaveTypeID: parseInt(leaveTypeID),
      FromDate: fromDate, ToDate: toDate,
      TotalDays: parseFloat(totalDays) || 1,
      IsHalfDay: isHalfDay === 'true', HalfDaySession: halfDaySession || null,
      Reason: reason, AttachmentPath: req.file?.filename || null,
    });
    const result = r.recordset[0];
    if (result.Result === 'INSUFFICIENT_BALANCE')
      return res.status(400).json({ error: 'Insufficient leave balance' });

    // Notify manager (in-app)
    const mgrRow = await query(
      `SELECT u.ManagerID, u.FullName AS EmpName, u.EmployeeCode,
              u.Email AS EmpEmail,
              m.FullName AS MgrName, m.Email AS MgrEmail,
              lt.TypeName
       FROM dbo.Users u
       LEFT JOIN dbo.Users m ON m.UserID = u.ManagerID
       JOIN dbo.LeaveTypes lt ON lt.LeaveTypeID = @lt
       WHERE u.UserID = @uid`,
      { uid: req.user.userID, lt: parseInt(leaveTypeID) }
    );
    const emp = mgrRow.recordset[0] || {};

    if (emp.ManagerID) {
      await query(
        `INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID) VALUES(@uid,@title,@msg,'info',@rid)`,
        { uid: emp.ManagerID, title: 'New Leave Application',
          msg: `${emp.EmpName} applied for leave (${fromDate} to ${toDate}).`,
          rid: result.ApplicationID }
      );
    }

    // Send emails (fire-and-forget — never blocks the response)
    const hrEmails = await query(
      `SELECT Email FROM dbo.Users WHERE Role='hr' AND IsActive=1`
    );

    mailer.notifyManagerNewApplication({
      managerEmail: emp.MgrEmail,
      managerName:  emp.MgrName,
      employeeName: emp.EmpName,
      employeeCode: emp.EmployeeCode,
      leaveType:    emp.TypeName,
      fromDate, toDate,
      totalDays:  parseFloat(totalDays) || 1,
      reason,
      isHalfDay:  isHalfDay === 'true',
    }).catch(() => {});

    mailer.notifyHRNewApplication({
      hrEmails:     hrEmails.recordset.map(r => r.Email),
      employeeName: emp.EmpName,
      employeeCode: emp.EmployeeCode,
      leaveType:    emp.TypeName,
      fromDate, toDate,
      totalDays:    parseFloat(totalDays) || 1,
      reason,
      managerName:  emp.MgrName,
    }).catch(() => {});

    res.status(201).json({ message: 'Leave applied', applicationID: result.ApplicationID });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/leaves/:id/cancel */
router.patch('/:id/cancel', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const r = await query('SELECT UserID,Status FROM dbo.LeaveApplications WHERE ApplicationID=@id', { id });
    const app = r.recordset[0];
    if (!app) return res.status(404).json({ error: 'Not found' });
    if (app.UserID !== req.user.userID && req.user.role === 'employee')
      return res.status(403).json({ error: 'Access denied' });
    if (!['pending','approved'].includes(app.Status))
      return res.status(400).json({ error: 'Cannot cancel this application' });
    await exec('dbo.sp_UpdateLeaveStatus',
      { ApplicationID: id, Status: 'cancelled', ApprovedByID: req.user.userID, ApproverComment: 'Cancelled by employee' });
    res.json({ message: 'Cancelled' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/leaves/pending  (manager/hr) */
router.get('/pending', role('manager','hr'), async (req, res) => {
  let sql = `SELECT la.ApplicationID, la.FromDate, la.ToDate, la.TotalDays,
                    la.IsHalfDay, la.Reason, la.Status, la.AppliedOn,
                    lt.TypeCode, lt.TypeName, lt.ColorHex,
                    u.FullName AS EmployeeName, u.UserID AS EmployeeID,
                    d.DepartmentName, lb.RemainingDays
             FROM dbo.LeaveApplications la
             JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
             JOIN dbo.Users u       ON la.UserID=u.UserID
             LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
             LEFT JOIN dbo.LeaveBalances lb ON lb.UserID=la.UserID
                  AND lb.LeaveTypeID=la.LeaveTypeID AND lb.Year=YEAR(la.FromDate)
             WHERE la.Status='pending'`;
  const p = {};
  if (req.user.role === 'manager') { sql += ' AND u.ManagerID=@mgr'; p.mgr = req.user.userID; }
  sql += ' ORDER BY la.AppliedOn';
  try { res.json((await query(sql, p)).recordset); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/leaves/all  (manager/hr) */
router.get('/all', role('manager','hr'), async (req, res) => {
  const { status, year } = req.query;
  let sql = `SELECT la.ApplicationID, la.FromDate, la.ToDate, la.TotalDays,
                    la.IsHalfDay, la.Reason, la.Status, la.AppliedOn, la.ApproverComment,
                    lt.TypeCode, lt.TypeName, lt.ColorHex,
                    u.FullName AS EmployeeName, d.DepartmentName,
                    ab.FullName AS ApproverName
             FROM dbo.LeaveApplications la
             JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
             JOIN dbo.Users u       ON la.UserID=u.UserID
             LEFT JOIN dbo.Departments d  ON u.DepartmentID=d.DepartmentID
             LEFT JOIN dbo.Users ab       ON la.ApprovedByID=ab.UserID
             WHERE 1=1`;
  const p = {};
  if (req.user.role === 'manager') { sql += ' AND u.ManagerID=@mgr'; p.mgr = req.user.userID; }
  if (status) { sql += ' AND la.Status=@status'; p.status = status; }
  if (year)   { sql += ' AND YEAR(la.FromDate)=@year'; p.year = parseInt(year); }
  sql += ' ORDER BY la.AppliedOn DESC';
  try { res.json((await query(sql, p)).recordset); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/leaves/:id/status  (manager/hr) */
router.patch('/:id/status', role('manager','hr'), async (req, res) => {
  const { status, comment } = req.body;
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  try {
    await exec('dbo.sp_UpdateLeaveStatus',
      { ApplicationID: parseInt(req.params.id), Status: status,
        ApprovedByID: req.user.userID, ApproverComment: comment || null });

    // Fetch full details for emails
    const det = await query(
      `SELECT u.FullName AS EmpName, u.Email AS EmpEmail, u.EmployeeCode,
              lt.TypeName,
              la.FromDate, la.ToDate, la.TotalDays, la.IsHalfDay,
              ab.FullName AS ApproverName
       FROM dbo.LeaveApplications la
       JOIN dbo.Users u       ON la.UserID=u.UserID
       JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
       JOIN dbo.Users ab      ON ab.UserID=@approver
       WHERE la.ApplicationID=@id`,
      { id: parseInt(req.params.id), approver: req.user.userID }
    );
    const d = det.recordset[0];

    if (d) {
      const hrEmails = await query(
        `SELECT Email FROM dbo.Users WHERE Role='hr' AND IsActive=1`
      );

      mailer.notifyEmployeeStatusUpdate({
        employeeEmail: d.EmpEmail,
        employeeName:  d.EmpName,
        leaveType:     d.TypeName,
        fromDate:      d.FromDate,
        toDate:        d.ToDate,
        totalDays:     d.TotalDays,
        isHalfDay:     d.IsHalfDay,
        status,
        approverName:  d.ApproverName,
        comment,
      }).catch(() => {});

      mailer.notifyHRStatusUpdate({
        hrEmails:     hrEmails.recordset.map(r => r.Email),
        employeeName: d.EmpName,
        employeeCode: d.EmployeeCode,
        leaveType:    d.TypeName,
        fromDate:     d.FromDate,
        toDate:       d.ToDate,
        totalDays:    d.TotalDays,
        status,
        approverName: d.ApproverName,
        comment,
      }).catch(() => {});
    }

    res.json({ message: `Leave ${status}` });
    // Audit log (non-blocking)
    const { logAudit } = require('../utils/audit');
    logAudit(req.user.userID, `leave_${status}`, 'LeaveApplication', parseInt(req.params.id),
      { status: 'pending' }, { status, comment }, req).catch(()=>{});
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/leaves/bulk-status — bulk approve/reject (manager/hr) */
router.patch('/bulk-status', role('manager','hr'), async (req, res) => {
  const { ids, status, comment } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: 'ids array required' });
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  const results = { success: [], failed: [] };
  for (const id of ids) {
    try {
      await exec('dbo.sp_UpdateLeaveStatus',
        { ApplicationID: parseInt(id), Status: status,
          ApprovedByID: req.user.userID, ApproverComment: comment || null });
      results.success.push(id);
      const { logAudit } = require('../utils/audit');
      logAudit(req.user.userID, `leave_bulk_${status}`, 'LeaveApplication', parseInt(id),
        { status: 'pending' }, { status, comment }, req).catch(()=>{});
    } catch(e) {
      results.failed.push({ id, error: e.message });
    }
  }
  res.json({ success: true, results, message: `${results.success.length} leaves ${status}, ${results.failed.length} failed` });
});

/* GET /api/leaves/calendar */
router.get('/calendar', async (req, res) => {
  const m   = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y   = parseInt(req.query.year)  || new Date().getFullYear();
  const uid = req.user.userID;
  const role = req.user.role;
  try {
    // Get user's department
    const meR = await query(`SELECT DepartmentID FROM dbo.Users WHERE UserID=@uid`, { uid });
    const myDeptID = meR.recordset[0]?.DepartmentID;

    const leaves = await query(
      `SELECT la.ApplicationID, la.FromDate, la.ToDate, la.IsHalfDay,
              lt.TypeCode, lt.TypeName, lt.ColorHex,
              u.FullName AS EmployeeName, u.UserID,
              u.EmployeeCode, u.DepartmentID,
              d.DepartmentName
       FROM dbo.LeaveApplications la
       JOIN dbo.LeaveTypes lt ON la.LeaveTypeID = lt.LeaveTypeID
       JOIN dbo.Users u       ON la.UserID = u.UserID
       LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
       WHERE la.Status = 'approved'
         AND (la.IsOOD IS NULL OR la.IsOOD = 0)
         AND YEAR(la.FromDate) = @y
         AND MONTH(la.FromDate) <= @m
         AND MONTH(la.ToDate)   >= @m`,
      { y, m, uid }
    );

    // OOD approved — separate query, no dept filter here
    const oods = await query(
      `SELECT la.ApplicationID, la.FromDate, la.ToDate, la.OODLocation,
              u.FullName AS EmployeeName, u.UserID, u.EmployeeCode, u.DepartmentID,
              d.DepartmentName
       FROM dbo.LeaveApplications la
       JOIN dbo.Users u ON la.UserID = u.UserID
       LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
       WHERE la.IsOOD = 1 AND la.Status = 'approved'
         AND YEAR(la.FromDate) = @y
         AND MONTH(la.FromDate) <= @m
         AND MONTH(la.ToDate)   >= @m`,
      { y, m, uid }
    );

    const hols = await query('SELECT HolidayName,HolidayDate FROM dbo.Holidays WHERE Year=@y ORDER BY HolidayDate', { y });

    const depts = await query(`SELECT DISTINCT d.DepartmentID, d.DepartmentName
      FROM dbo.Users u JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE u.IsActive=1 ORDER BY d.DepartmentName`);

    res.json({
      leaves: leaves.recordset,
      oods:   oods.recordset,
      holidays: hols.recordset,
      departments: depts.recordset,
      myDeptID,
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/leaves/holidays */
router.get('/holidays', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const r = await query('SELECT * FROM dbo.Holidays WHERE Year=@year ORDER BY HolidayDate', { year });
    res.json(r.recordset);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/leaves/holidays  (hr only) — ADDITION */
router.post('/holidays', role('hr'), async (req, res) => {
  const { holidayName, holidayDate, year } = req.body;
  if (!holidayName || !holidayDate)
    return res.status(400).json({ error: 'holidayName and holidayDate are required' });
  try {
    const r = await query(
      `INSERT INTO dbo.Holidays (HolidayName, HolidayDate, Year)
       OUTPUT INSERTED.HolidayID
       VALUES (@name, @date, @year)`,
      { name: holidayName, date: holidayDate, year: parseInt(year) || new Date().getFullYear() }
    );
    res.status(201).json({ message: 'Holiday added', holidayID: r.recordset[0].HolidayID });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A holiday on that date already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/* DELETE /api/leaves/holidays/:id  (hr only) — ADDITION */
router.delete('/holidays/:id', role('hr'), async (req, res) => {
  try {
    await query('DELETE FROM dbo.Holidays WHERE HolidayID = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Holiday deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ================================================================
// OOD (ON OFFICIAL DUTY) ROUTES
// ================================================================

/* POST /api/leaves/ood — apply for OOD */
router.post('/ood', auth, async (req, res) => {
  const { fromDate, toDate, totalDays, reason, oodLocation } = req.body;
  const userID = req.user.userID;

  if (!fromDate || !toDate || !reason?.trim())
    return res.status(400).json({ error: 'From date, to date and reason are required' });

  try {
    // Get OOD leave type ID
    const lt = await query(`SELECT LeaveTypeID FROM dbo.LeaveTypes WHERE TypeCode='OOD'`);
    if (!lt.recordset.length) return res.status(400).json({ error: 'OOD leave type not configured. Run migration_ood.sql first.' });
    const leaveTypeID = lt.recordset[0].LeaveTypeID;

    const days = totalDays || 1;

    // Insert OOD application
    const r = await query(`
      INSERT INTO dbo.LeaveApplications
        (UserID, LeaveTypeID, FromDate, ToDate, TotalDays, Reason, Status, IsOOD, OODManagerStatus, OODHRStatus, OODLocation)
      OUTPUT INSERTED.ApplicationID
      VALUES
        (@uid, @lt, @from, @to, @days, @reason, 'pending', 1, 'pending', 'pending', @loc)
    `, { uid: userID, lt: leaveTypeID, from: fromDate, to: toDate, days, reason: reason.trim(), loc: oodLocation || null });

    const appID = r.recordset[0].ApplicationID;

    // Get employee + manager info
    const empR = await query(`
      SELECT u.FullName, u.EmployeeCode, u.Email,
             m.FullName AS ManagerName, m.Email AS ManagerEmail,
             m.UserID AS ManagerID
      FROM dbo.Users u
      LEFT JOIN dbo.Users m ON u.ManagerID = m.UserID
      WHERE u.UserID = @uid`, { uid: userID });
    const emp = empR.recordset[0];

    // Get all HR emails
    const hrR = await query(`SELECT Email FROM dbo.Users WHERE Role='hr' AND IsActive=1`);
    const hrEmails = hrR.recordset.map(r => r.Email);

    // Notify manager
    if (emp?.ManagerEmail) {
      const { notifyManagerNewApplication } = require('../utils/mailer');
      await notifyManagerNewApplication({
        managerEmail: emp.ManagerEmail, managerName: emp.ManagerName,
        employeeName: emp.FullName, employeeCode: emp.EmployeeCode,
        leaveType: `OOD – On Official Duty${oodLocation ? ' @ ' + oodLocation : ''}`,
        fromDate, toDate, totalDays: days, reason,
      });
    }

    // Notify HR
    const { notifyHRNewApplication } = require('../utils/mailer');
    for (const to of hrEmails) {
      await notifyHRNewApplication({
        hrEmails: [to], employeeName: emp?.FullName, employeeCode: emp?.EmployeeCode,
        leaveType: `OOD – On Official Duty${oodLocation ? ' @ ' + oodLocation : ''}`,
        fromDate, toDate, totalDays: days, reason, managerName: emp?.ManagerName,
      });
    }

    // Notify employee
    await query(`
      INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
      VALUES (@uid, N'🚗 OOD Request Submitted',
        N'Your OOD request for ${fromDate} to ${toDate} has been submitted. Awaiting Manager & HR approval.',
        'ood', @appID)
    `, { uid: userID, appID });

    res.status(201).json({ success: true, applicationID: appID });
  } catch (e) {
    console.error('[OOD apply]', e);
    res.status(500).json({ error: e.message });
  }
});

/* GET /api/leaves/ood — get OOD applications */
router.get('/ood', auth, async (req, res) => {
  const userID  = req.user.userID;
  const isHR    = req.user.role === 'hr';
  const isMgr   = req.user.role === 'manager' || isHR;

  try {
    let sql = `
      SELECT a.ApplicationID, a.FromDate, a.ToDate, a.TotalDays, a.Reason,
             a.Status, a.OODManagerStatus, a.OODHRStatus, a.OODLocation,
             a.AppliedOn, a.ApproverComment,
             u.FullName AS EmployeeName, u.EmployeeCode,
             d.DepartmentName,
             m.FullName AS ManagerName,
             mgrApr.FullName AS ManagerApproverName,
             hrApr.FullName  AS HRApproverName
      FROM dbo.LeaveApplications a
      JOIN dbo.Users u ON a.UserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      LEFT JOIN dbo.Users m ON u.ManagerID = m.UserID
      LEFT JOIN dbo.Users mgrApr ON a.OODManagerApprovedBy = mgrApr.UserID
      LEFT JOIN dbo.Users hrApr  ON a.OODHRApprovedBy = hrApr.UserID
      WHERE a.IsOOD = 1`;

    if (isHR) {
      // HR sees all OOD
    } else if (isMgr) {
      // Manager sees own team OOD
      sql += ` AND (a.UserID = ${userID} OR u.ManagerID = ${userID})`;
    } else {
      // Employee sees own
      sql += ` AND a.UserID = ${userID}`;
    }

    sql += ` ORDER BY a.AppliedOn DESC`;

    const r = await query(sql);
    res.json({ success: true, applications: r.recordset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* PATCH /api/leaves/ood/:id/approve — manager or HR approves OOD */
router.patch('/ood/:id/approve', auth, async (req, res) => {
  const appID   = parseInt(req.params.id);
  const userID  = req.user.userID;
  const isHR    = req.user.role === 'hr';
  const isMgr   = req.user.role === 'manager' || isHR;
  const { action, comment } = req.body; // action: 'approve' | 'reject'

  if (!isMgr) return res.status(403).json({ error: 'Only managers or HR can approve OOD' });

  try {
    const appR = await query(`
      SELECT a.*, u.FullName AS EmpName, u.Email AS EmpEmail, u.EmployeeCode,
             u.ManagerID, u.UserID AS EmpUserID
      FROM dbo.LeaveApplications a
      JOIN dbo.Users u ON a.UserID = u.UserID
      WHERE a.ApplicationID = @id AND a.IsOOD = 1`, { id: appID });

    const app = appR.recordset[0];
    if (!app) return res.status(404).json({ error: 'OOD application not found' });
    if (app.Status === 'approved' || app.Status === 'rejected')
      return res.status(400).json({ error: `Already ${app.Status}` });

    const status = action === 'approve' ? 'approved' : 'rejected';

    if (isHR) {
      await query(`UPDATE dbo.LeaveApplications SET OODHRStatus=@s, OODHRApprovedBy=@by WHERE ApplicationID=@id`,
        { s: status, by: userID, id: appID });
    } else {
      // Manager approval
      await query(`UPDATE dbo.LeaveApplications SET OODManagerStatus=@s, OODManagerApprovedBy=@by WHERE ApplicationID=@id`,
        { s: status, by: userID, id: appID });
    }

    // Re-fetch updated record
    const updR = await query(`SELECT OODManagerStatus, OODHRStatus FROM dbo.LeaveApplications WHERE ApplicationID=@id`, { id: appID });
    const upd  = updR.recordset[0];

    // Final status: both approved → approved; either rejected → rejected
    let finalStatus = 'pending';
    if (upd.OODManagerStatus === 'rejected' || upd.OODHRStatus === 'rejected') {
      finalStatus = 'rejected';
    } else if (upd.OODManagerStatus === 'approved' && upd.OODHRStatus === 'approved') {
      finalStatus = 'approved';
    }

    if (finalStatus !== 'pending') {
      await query(`
        UPDATE dbo.LeaveApplications
        SET Status=@s, ApprovedByID=@by, ApproverComment=@c, ApprovedAt=GETDATE(), UpdatedAt=GETDATE()
        WHERE ApplicationID=@id`,
        { s: finalStatus, by: userID, c: comment || null, id: appID });

      // If fully approved → mark attendance as PRESENT for those dates
      if (finalStatus === 'approved') {
        await query(`
          MERGE dbo.AttendanceSummary AS tgt
          USING (
            SELECT d.DateVal
            FROM (
              SELECT DATEADD(DAY, number, @from) AS DateVal
              FROM master..spt_values
              WHERE type='P' AND number <= DATEDIFF(DAY, @from, @to)
            ) d
            WHERE DATEPART(WEEKDAY, d.DateVal) != 1  -- exclude Sundays
          ) AS src ON tgt.UserID=@uid AND tgt.AttDate=src.DateVal
          WHEN MATCHED THEN UPDATE SET Status='PRESENT', LeaveType='OOD', ComputedAt=GETDATE()
          WHEN NOT MATCHED THEN INSERT(UserID,AttDate,Status,LeaveType,ComputedAt)
            VALUES(@uid,''+CONVERT(NVARCHAR,src.DateVal,23),'PRESENT','OOD',GETDATE())
        `, { from: app.FromDate, to: app.ToDate, uid: app.EmpUserID });
      }

      // Notify employee
      await query(`
        INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
        VALUES (@uid,
          N'🚗 OOD ${finalStatus === 'approved' ? 'Approved ✅' : 'Rejected ❌'}',
          N'Your OOD request has been ${finalStatus}. ${finalStatus === 'approved' ? 'It is counted as Present.' : ''}',
          'ood_result', @appID)
      `, { uid: app.EmpUserID, appID });
    } else {
      // Partial approval — notify employee of progress
      const who = isHR ? 'HR' : 'Manager';
      await query(`
        INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
        VALUES (@uid, N'🚗 OOD ${who} Approved',
          N'Your OOD request has been approved by ${who}. Waiting for ${isHR ? 'Manager' : 'HR'} approval.',
          'ood', @appID)
      `, { uid: app.EmpUserID, appID });
    }

    res.json({ success: true, finalStatus, message: finalStatus === 'pending' ? 'Partial approval recorded' : `OOD ${finalStatus}` });
  } catch (e) {
    console.error('[OOD approve]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
