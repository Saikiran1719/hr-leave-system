// backend/routes/users.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const mailer = require('../utils/mailer');

router.use(auth);

/* GET /api/users/me */
router.get('/me', async (req, res) => {
  try {
    const r = await query(
      `SELECT u.UserID,u.EmployeeCode,u.FullName,u.Email,u.Role,u.Phone,u.JoinedDate,u.DateOfBirth,
              d.DepartmentName, m.FullName AS ManagerName
       FROM dbo.Users u
       LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
       LEFT JOIN dbo.Users m ON u.ManagerID=m.UserID
       WHERE u.UserID=@id AND u.IsActive=1`, { id: req.user.userID }
    );
    res.json(r.recordset[0] || null);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/me */
router.patch('/me', async (req, res) => {
  const { fullName, phone } = req.body;
  try {
    await query('UPDATE dbo.Users SET FullName=@n,Phone=@p WHERE UserID=@id',
      { n: fullName, p: phone, id: req.user.userID });
    res.json({ message: 'Profile updated' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/departments */
router.get('/departments', async (req, res) => {
  try {
    const r = await query('SELECT * FROM dbo.Departments ORDER BY DepartmentName');
    res.json(r.recordset);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/notifications */
router.get('/notifications', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit)||50, 200);
  try {
    const r = await query(
      `SELECT TOP (${limit}) NotifID, UserID, Title, Message, Type, RelatedID, IsRead, CreatedAt
       FROM dbo.Notifications WHERE UserID=@uid ORDER BY CreatedAt DESC`,
      { uid: req.user.userID }
    );
    res.json({ notifications: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* PATCH /api/users/notifications/read */
router.patch('/notifications/read', async (req, res) => {
  try {
    await query('UPDATE dbo.Notifications SET IsRead=1 WHERE UserID=@uid', { uid: req.user.userID });
    res.json({ message: 'Marked read' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users  (hr/manager) */
router.get('/', role('hr','manager'), async (req, res) => {
  const { search, dept, userRole, isActive } = req.query;
  // isActive: 'true' = active only (default), 'false' = inactive only, 'all' = both
  let activeFilter = 'WHERE u.IsActive=1';
  if (isActive === 'false') activeFilter = 'WHERE u.IsActive=0';
  if (isActive === 'all')   activeFilter = 'WHERE 1=1';

  let sql = `SELECT u.UserID,u.EmployeeCode,u.FullName,u.Email,u.Role,u.Phone,u.JoinedDate,u.IsActive,u.DateOfBirth,
                    d.DepartmentName, d.DepartmentID,
                    m.FullName AS ManagerName, m.UserID AS ManagerID
             FROM dbo.Users u
             LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
             LEFT JOIN dbo.Users m ON u.ManagerID=m.UserID
             ${activeFilter}`;
  const p = {};
  if (search)   { sql += ' AND (u.FullName LIKE @s OR u.Email LIKE @s OR u.EmployeeCode LIKE @s)'; p.s = `%${search}%`; }
  if (dept)     { sql += ' AND u.DepartmentID=@dept'; p.dept = parseInt(dept); }
  if (userRole) { sql += ' AND u.Role=@role'; p.role = userRole; }
  sql += ' ORDER BY u.FullName';
  try { res.json((await query(sql, p)).recordset); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/users  (hr) */
router.post('/', role('hr'), async (req, res) => {
  const { fullName, email, password, userRole, departmentID, managerID, phone, joinedDate, employeeCode } = req.body;
  if (!fullName || !email || !password || !userRole)
    return res.status(400).json({ error: 'fullName, email, password, role required' });
  try {
    const exists = await query('SELECT 1 FROM dbo.Users WHERE Email=@e', { e: email });
    if (exists.recordset.length) return res.status(400).json({ error: 'Email already registered' });

    // Check employee code uniqueness if provided
    if (employeeCode) {
      const codeExists = await query('SELECT 1 FROM dbo.Users WHERE EmployeeCode=@c', { c: employeeCode });
      if (codeExists.recordset.length) return res.status(400).json({ error: 'Employee code already in use' });
    }

    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO dbo.Users(FullName,Email,PasswordHash,Role,DepartmentID,ManagerID,Phone,JoinedDate,EmployeeCode)
       OUTPUT INSERTED.UserID
       VALUES(@n,@e,@h,@r,@d,@m,@p,@j,@ec)`,
      { n: fullName, e: email, h: hash, r: userRole,
        d: departmentID ? parseInt(departmentID) : null,
        m: managerID    ? parseInt(managerID)    : null,
        p: phone || null,
        j: joinedDate || new Date().toISOString().slice(0,10),
        ec: employeeCode || null }
    );
    const newID = r.recordset[0].UserID;
    // Auto-assign code if not provided
    if (!employeeCode) {
      await query("UPDATE dbo.Users SET EmployeeCode='EMP'+RIGHT('0000'+CAST(@uid AS NVARCHAR),4) WHERE UserID=@uid AND EmployeeCode IS NULL", { uid: newID });
    }
    await query(
      `INSERT INTO dbo.LeaveBalances(UserID,LeaveTypeID,Year,TotalDays)
       SELECT @uid,LeaveTypeID,YEAR(GETDATE()),MaxDaysPerYear FROM dbo.LeaveTypes WHERE IsActive=1`,
      { uid: newID }
    );

    // Get final employee code (may have been auto-generated)
    const empR = await query(`SELECT EmployeeCode FROM dbo.Users WHERE UserID=@uid`, { uid: newID });
    const finalCode = empR.recordset[0]?.EmployeeCode || employeeCode;

    // Send welcome email with credentials (non-blocking — don't fail if email fails)
    mailer.sendWelcomeEmail({
      employeeEmail: email,
      employeeName:  fullName,
      employeeCode:  finalCode,
      password,         // plain text password before hashing
      role:          userRole,
    }).catch(err => console.log('[Welcome Email] Failed:', err.message));

    res.status(201).json({ message: 'Employee added', userID: newID, emailSent: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/:id  (hr) */
router.patch('/:id', role('hr'), async (req, res) => {
  const { fullName, phone, userRole, departmentID, managerID, isActive, employeeCode, dateOfBirth } = req.body;
  const uid = parseInt(req.params.id);
  try {
    // Check employee code uniqueness if provided
    if (employeeCode) {
      const codeExists = await query(
        'SELECT 1 FROM dbo.Users WHERE EmployeeCode=@c AND UserID<>@id', { c: employeeCode, id: uid }
      );
      if (codeExists.recordset.length) return res.status(400).json({ error: 'Employee code already in use' });
    }

    // Build SET clause dynamically — only touch columns that were actually sent
    const sets = [];
    const p    = { id: uid };

    if (fullName     !== undefined) { sets.push('FullName=@n');      p.n  = fullName || null; }
    if (phone        !== undefined) { sets.push('Phone=@p');         p.p  = phone || null; }
    if (userRole     !== undefined) { sets.push('Role=@r');          p.r  = userRole; }
    if (departmentID !== undefined) { sets.push('DepartmentID=@d');  p.d  = departmentID ? parseInt(departmentID) : null; }
    if (managerID    !== undefined) { sets.push('ManagerID=@m');     p.m  = managerID ? parseInt(managerID) : null; }
    if (isActive     !== undefined) { sets.push('IsActive=@a');      p.a  = isActive ? 1 : 0; }
    if (employeeCode !== undefined) { sets.push('EmployeeCode=@ec'); p.ec = employeeCode || null; }
    if (dateOfBirth  !== undefined) { sets.push('DateOfBirth=@dob'); p.dob = dateOfBirth || null; }

    if (sets.length === 0) return res.json({ message: 'Nothing to update' });

    await query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE UserID=@id`, p);
    res.json({ message: 'Updated' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* DELETE /api/users/:id  (hr only) — soft-delete: sets IsActive=0 */
router.delete('/:id', role('hr'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Prevent HR from deleting themselves
    if (id === req.user.userID)
      return res.status(400).json({ error: 'You cannot delete your own account' });

    // Check user exists
    const r = await query('SELECT FullName FROM dbo.Users WHERE UserID=@id AND IsActive=1', { id });
    if (!r.recordset[0])
      return res.status(404).json({ error: 'Employee not found' });

    // Soft-delete: mark inactive (preserves all leave history / audit trail)
    await query('UPDATE dbo.Users SET IsActive=0 WHERE UserID=@id', { id });

    res.json({ message: `${r.recordset[0].FullName} has been deactivated` });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/:id/balance  (hr/manager) */
router.get('/:id/balance', role('hr','manager'), async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const r = await query(
      `SELECT lb.BalanceID,lb.TotalDays,lb.UsedDays,lb.RemainingDays,lb.Year,
              lt.TypeCode,lt.TypeName,lt.ColorHex,lt.LeaveTypeID
       FROM dbo.LeaveBalances lb
       JOIN dbo.LeaveTypes lt ON lb.LeaveTypeID=lt.LeaveTypeID
       WHERE lb.UserID=@uid AND lb.Year=@year AND lt.IsActive=1`,
      { uid: parseInt(req.params.id), year }
    );
    res.json(r.recordset);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* PATCH /api/users/:id/balance  (hr) */
router.patch('/:id/balance', role('hr'), async (req, res) => {
  const { leaveTypeID, totalDays, year } = req.body;
  try {
    await query(
      'UPDATE dbo.LeaveBalances SET TotalDays=@d WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@y',
      { d: parseInt(totalDays), uid: parseInt(req.params.id),
        lt: parseInt(leaveTypeID), y: parseInt(year) || new Date().getFullYear() }
    );
    res.json({ message: 'Balance updated' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/reports  (hr) */
router.get('/reports', role('hr'), async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const [summary, byType, byDept, byEmployee] = await Promise.all([
      query(`SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE IsActive=1) AS TotalEmployees,
        (SELECT COUNT(*) FROM dbo.LeaveApplications WHERE YEAR(AppliedOn)=@y) AS Total,
        (SELECT COUNT(*) FROM dbo.LeaveApplications WHERE Status='approved' AND YEAR(AppliedOn)=@y) AS Approved,
        (SELECT COUNT(*) FROM dbo.LeaveApplications WHERE Status='pending') AS Pending,
        (SELECT COUNT(*) FROM dbo.LeaveApplications WHERE Status='rejected' AND YEAR(AppliedOn)=@y) AS Rejected,
        (SELECT ISNULL(SUM(TotalDays),0) FROM dbo.LeaveApplications WHERE Status='approved' AND YEAR(AppliedOn)=@y) AS TotalDays`, { y: year }),
      query(`SELECT lt.TypeName,lt.TypeCode,lt.ColorHex,COUNT(*) AS Requests,ISNULL(SUM(la.TotalDays),0) AS Days
             FROM dbo.LeaveApplications la JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
             WHERE la.Status='approved' AND YEAR(la.AppliedOn)=@y
             GROUP BY lt.TypeName,lt.TypeCode,lt.ColorHex ORDER BY Days DESC`, { y: year }),
      query(`SELECT d.DepartmentName, COUNT(DISTINCT u.UserID) AS Employees,
                    COUNT(la.ApplicationID) AS Requests, ISNULL(SUM(la.TotalDays),0) AS Days
             FROM dbo.Departments d
             LEFT JOIN dbo.Users u ON u.DepartmentID=d.DepartmentID AND u.IsActive=1
             LEFT JOIN dbo.LeaveApplications la ON la.UserID=u.UserID AND la.Status='approved' AND YEAR(la.AppliedOn)=@y
             GROUP BY d.DepartmentName ORDER BY Days DESC`, { y: year }),
      // Employee-wise summary
      query(`SELECT u.UserID, u.EmployeeCode, u.FullName, d.DepartmentName,
                    COUNT(la.ApplicationID) AS TotalRequests,
                    ISNULL(SUM(CASE WHEN la.Status='approved' THEN la.TotalDays ELSE 0 END),0) AS DaysApproved,
                    ISNULL(SUM(CASE WHEN la.Status='rejected' THEN 1 ELSE 0 END),0) AS Rejected,
                    ISNULL(SUM(CASE WHEN la.Status='pending'  THEN 1 ELSE 0 END),0) AS Pending
             FROM dbo.Users u
             LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
             LEFT JOIN dbo.LeaveApplications la ON la.UserID=u.UserID AND YEAR(la.AppliedOn)=@y
             WHERE u.IsActive=1
             GROUP BY u.UserID,u.EmployeeCode,u.FullName,d.DepartmentName
             ORDER BY DaysApproved DESC`, { y: year }),
    ]);
    res.json({
      summary: summary.recordset[0],
      byType: byType.recordset,
      byDept: byDept.recordset,
      byEmployee: byEmployee.recordset
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/reports/employee/:id  (hr) — full leave history for one employee */
router.get('/reports/employee/:id', role('hr'), async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const [profile, leaves, balance] = await Promise.all([
      query(`SELECT u.UserID,u.EmployeeCode,u.FullName,u.Email,u.Phone,u.JoinedDate,
                    d.DepartmentName,m.FullName AS ManagerName,u.Role
             FROM dbo.Users u
             LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
             LEFT JOIN dbo.Users m ON u.ManagerID=m.UserID
             WHERE u.UserID=@id`, { id: parseInt(req.params.id) }),
      query(`SELECT la.ApplicationID,la.FromDate,la.ToDate,la.TotalDays,la.IsHalfDay,
                    la.Reason,la.Status,la.AppliedOn,la.ApproverComment,
                    lt.TypeCode,lt.TypeName,lt.ColorHex,
                    ab.FullName AS ApproverName
             FROM dbo.LeaveApplications la
             JOIN dbo.LeaveTypes lt ON la.LeaveTypeID=lt.LeaveTypeID
             LEFT JOIN dbo.Users ab ON la.ApprovedByID=ab.UserID
             WHERE la.UserID=@id AND YEAR(la.FromDate)=@y
             ORDER BY la.AppliedOn DESC`, { id: parseInt(req.params.id), y: year }),
      query(`SELECT lt.TypeCode,lt.TypeName,lt.ColorHex,
                    lb.TotalDays,lb.UsedDays,lb.RemainingDays
             FROM dbo.LeaveBalances lb
             JOIN dbo.LeaveTypes lt ON lb.LeaveTypeID=lt.LeaveTypeID
             WHERE lb.UserID=@id AND lb.Year=@y AND lt.IsActive=1
             ORDER BY lt.TypeName`, { id: parseInt(req.params.id), y: year }),
    ]);
    res.json({ profile: profile.recordset[0], leaves: leaves.recordset, balance: balance.recordset });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/reports/attendance  (hr) — salary/attendance period report */
router.get('/reports/attendance', role('hr'), async (req, res) => {
  // fromDate and toDate define the attendance period (e.g. 26 Feb – 25 Mar)
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
  try {
    const rows = await query(
      `SELECT u.EmployeeCode, u.FullName, d.DepartmentName,
              m.FullName AS ManagerName,
              lt.TypeCode, lt.TypeName, lt.ColorHex,
              la.ApplicationID,
              CONVERT(NVARCHAR,la.FromDate,23) AS FromDate,
              CONVERT(NVARCHAR,la.ToDate,23)   AS ToDate,
              la.TotalDays, la.IsHalfDay, la.Status, la.Reason,
              la.ApproverComment,
              ab.FullName AS ApprovedBy,
              CONVERT(NVARCHAR,la.AppliedOn,23) AS AppliedOn
       FROM dbo.LeaveApplications la
       JOIN dbo.Users u        ON la.UserID=u.UserID
       JOIN dbo.LeaveTypes lt  ON la.LeaveTypeID=lt.LeaveTypeID
       LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
       LEFT JOIN dbo.Users m   ON u.ManagerID=m.UserID
       LEFT JOIN dbo.Users ab  ON la.ApprovedByID=ab.UserID
       WHERE u.IsActive=1
         AND la.Status IN ('approved','rejected')
         AND (
           (la.FromDate >= @from AND la.FromDate <= @to) OR
           (la.ToDate   >= @from AND la.ToDate   <= @to) OR
           (la.FromDate <= @from AND la.ToDate   >= @to)
         )
       ORDER BY u.FullName, la.FromDate`,
      { from, to }
    );
    res.json(rows.recordset);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* GET /api/users/reports/attendance/export  (hr) — CSV export of attendance period */
router.get('/reports/attendance/export', role('hr'), async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
  try {
    const rows = await query(
      `SELECT u.EmployeeCode, u.FullName, d.DepartmentName,
              m.FullName AS ManagerName,
              lt.TypeCode, lt.TypeName,
              CONVERT(NVARCHAR,la.FromDate,23) AS FromDate,
              CONVERT(NVARCHAR,la.ToDate,23)   AS ToDate,
              la.TotalDays, la.IsHalfDay, la.Status,
              la.Reason, la.ApproverComment,
              ab.FullName AS ApprovedBy,
              CONVERT(NVARCHAR,la.AppliedOn,23) AS AppliedOn
       FROM dbo.LeaveApplications la
       JOIN dbo.Users u        ON la.UserID=u.UserID
       JOIN dbo.LeaveTypes lt  ON la.LeaveTypeID=lt.LeaveTypeID
       LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
       LEFT JOIN dbo.Users m   ON u.ManagerID=m.UserID
       LEFT JOIN dbo.Users ab  ON la.ApprovedByID=ab.UserID
       WHERE u.IsActive=1
         AND la.Status IN ('approved','rejected')
         AND (
           (la.FromDate >= @from AND la.FromDate <= @to) OR
           (la.ToDate   >= @from AND la.ToDate   <= @to) OR
           (la.FromDate <= @from AND la.ToDate   >= @to)
         )
       ORDER BY u.FullName, la.FromDate`,
      { from, to }
    );
    const headers = ['EmployeeCode','FullName','Department','Manager','LeaveType','TypeCode',
                     'FromDate','ToDate','TotalDays','HalfDay','Status','Reason','ApproverNote','ApprovedBy','AppliedOn'];
    const csvLines = [
      headers.join(','),
      ...rows.recordset.map(r => [
        `"${r.EmployeeCode||''}"`, `"${r.FullName}"`, `"${r.DepartmentName||''}"`,
        `"${r.ManagerName||''}"`, `"${r.TypeName}"`, `"${r.TypeCode}"`,
        `"${r.FromDate}"`, `"${r.ToDate}"`, r.TotalDays,
        r.IsHalfDay ? 'Yes' : 'No', `"${r.Status}"`,
        `"${(r.Reason||'').replace(/"/g,'""')}"`,
        `"${(r.ApproverComment||'').replace(/"/g,'""')}"`,
        `"${r.ApprovedBy||''}"`, `"${r.AppliedOn}"`
      ].join(','))
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${from}_to_${to}.csv"`);
    res.send(csvLines.join('\r\n'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Export failed' }); }
});

/* GET /api/users/export  (hr) — download all employees as CSV */
router.get('/export', role('hr'), async (req, res) => {
  try {
    const r = await query(
      `SELECT u.EmployeeCode, u.FullName, u.Email, u.Role, u.Phone,
              CONVERT(NVARCHAR,u.JoinedDate,23) AS JoinedDate,
              d.DepartmentName,
              m.FullName AS ManagerName,
              CASE u.IsActive WHEN 1 THEN 'Active' ELSE 'Inactive' END AS Status
       FROM dbo.Users u
       LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
       LEFT JOIN dbo.Users m ON u.ManagerID=m.UserID
       ORDER BY u.EmployeeCode`
    );
    const rows = r.recordset;
    const headers = ['EmployeeCode','FullName','Email','Role','Phone','JoinedDate','Department','Manager','Status'];
    const csvLines = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h === 'Department' ? 'DepartmentName' : h === 'Manager' ? 'ManagerName' : h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="employees_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csvLines.join('\r\n'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Export failed' }); }
});

/* POST /api/users/import  (hr) — bulk import employees from CSV rows */
router.post('/import', role('hr'), async (req, res) => {
  const { rows } = req.body; // array of objects with same headers as export
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const results = { added: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2; // 1-based + header row
    try {
      const fullName  = (row.FullName  || row['Full Name']  || '').trim();
      const email     = (row.Email     || '').trim().toLowerCase();
      const empCode   = (row.EmployeeCode || row['Employee Code'] || row['Employee ID'] || '').trim();
      const userRole  = (row.Role      || 'employee').trim().toLowerCase();
      const phone     = (row.Phone     || '').trim();
      const joinedDate= (row.JoinedDate || row['Date of Joining'] || '').trim();
      const deptName  = (row.Department || row.DepartmentName || '').trim();

      if (!fullName || !email) {
        results.errors.push({ row: lineNum, reason: 'FullName and Email are required' }); continue;
      }
      if (!['employee','manager','hr'].includes(userRole)) {
        results.errors.push({ row: lineNum, reason: `Invalid role "${userRole}" — use employee/manager/hr` }); continue;
      }

      // Check duplicates
      const emailExists = await query('SELECT 1 FROM dbo.Users WHERE Email=@e', { e: email });
      if (emailExists.recordset.length) {
        results.skipped++; results.errors.push({ row: lineNum, reason: `Email "${email}" already exists — skipped` }); continue;
      }
      if (empCode) {
        const codeExists = await query('SELECT 1 FROM dbo.Users WHERE EmployeeCode=@c', { c: empCode });
        if (codeExists.recordset.length) {
          results.errors.push({ row: lineNum, reason: `Employee code "${empCode}" already in use — skipped` }); results.skipped++; continue;
        }
      }

      // Resolve department
      let deptID = null;
      if (deptName) {
        const d = await query('SELECT DepartmentID FROM dbo.Departments WHERE DepartmentName=@n', { n: deptName });
        if (d.recordset[0]) deptID = d.recordset[0].DepartmentID;
      }

      const defaultPw = 'Welcome@123';
      const hash = await bcrypt.hash(defaultPw, 10);
      const r = await query(
        `INSERT INTO dbo.Users(FullName,Email,PasswordHash,Role,DepartmentID,Phone,JoinedDate,EmployeeCode)
         OUTPUT INSERTED.UserID
         VALUES(@n,@e,@h,@r,@d,@p,@j,@ec)`,
        { n: fullName, e: email, h: hash, r: userRole,
          d: deptID, p: phone || null,
          j: joinedDate || new Date().toISOString().slice(0,10),
          ec: empCode || null }
      );
      const newID = r.recordset[0].UserID;
      if (!empCode) {
        await query("UPDATE dbo.Users SET EmployeeCode='EMP'+RIGHT('0000'+CAST(@uid AS NVARCHAR),4) WHERE UserID=@uid AND EmployeeCode IS NULL", { uid: newID });
      }
      await query(
        `INSERT INTO dbo.LeaveBalances(UserID,LeaveTypeID,Year,TotalDays)
         SELECT @uid,LeaveTypeID,YEAR(GETDATE()),MaxDaysPerYear FROM dbo.LeaveTypes WHERE IsActive=1`,
        { uid: newID }
      );
      results.added++;
    } catch (e) {
      results.errors.push({ row: lineNum, reason: e.message });
    }
  }

  res.json({
    message: `Import complete: ${results.added} added, ${results.skipped} skipped`,
    ...results
  });
});

/* GET /api/users/balance/export  (hr) — download all employee balances as CSV */
router.get('/balance/export', role('hr'), async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const r = await query(
      `SELECT u.EmployeeCode, u.FullName, u.Email,
              lt.TypeCode, lt.TypeName,
              lb.TotalDays, lb.UsedDays, lb.RemainingDays, lb.Year
       FROM dbo.LeaveBalances lb
       JOIN dbo.Users u       ON lb.UserID      = u.UserID
       JOIN dbo.LeaveTypes lt ON lb.LeaveTypeID = lt.LeaveTypeID
       WHERE lb.Year = @year AND u.IsActive = 1 AND lt.IsActive = 1
       ORDER BY u.EmployeeCode, lt.TypeCode`, { year }
    );
    const rows = r.recordset;
    const headers = ['EmployeeCode','FullName','Email','LeaveType','TotalDays','UsedDays','RemainingDays','Year'];
    const csvLines = [
      headers.join(','),
      ...rows.map(row => [
        `"${row.EmployeeCode || ''}"`,
        `"${row.FullName}"`,
        `"${row.Email}"`,
        `"${row.TypeCode}"`,
        row.TotalDays,
        row.UsedDays,
        row.RemainingDays,
        row.Year,
      ].join(','))
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leave_balances_${year}.csv"`);
    res.send(csvLines.join('\r\n'));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Export failed' }); }
});

/* POST /api/users/balance/import  (hr) — bulk upsert balances by EmployeeCode */
router.post('/balance/import', role('hr'), async (req, res) => {
  const { rows, year: reqYear } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No rows provided' });

  const year = parseInt(reqYear) || new Date().getFullYear();
  const results = { updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    try {
      const empCode   = (row.EmployeeCode || row['Employee Code'] || row['Employee ID'] || '').trim();
      const leaveType = (row.LeaveType || row.TypeCode || row['Leave Type'] || '').trim().toUpperCase();
      const totalDays = parseInt(row.TotalDays ?? row['Total Days'] ?? '');

      if (!empCode)                      { results.errors.push({ row: lineNum, reason: 'EmployeeCode is required' }); results.skipped++; continue; }
      if (!leaveType)                    { results.errors.push({ row: lineNum, reason: 'LeaveType (TypeCode) is required' }); results.skipped++; continue; }
      if (isNaN(totalDays) || totalDays < 0) { results.errors.push({ row: lineNum, reason: `Invalid TotalDays "${row.TotalDays}"` }); results.skipped++; continue; }

      // Resolve employee
      const uRes = await query('SELECT UserID FROM dbo.Users WHERE EmployeeCode=@c AND IsActive=1', { c: empCode });
      if (!uRes.recordset[0]) { results.errors.push({ row: lineNum, reason: `Employee code "${empCode}" not found` }); results.skipped++; continue; }
      const userID = uRes.recordset[0].UserID;

      // Resolve leave type
      const ltRes = await query('SELECT LeaveTypeID FROM dbo.LeaveTypes WHERE TypeCode=@t AND IsActive=1', { t: leaveType });
      if (!ltRes.recordset[0]) { results.errors.push({ row: lineNum, reason: `Leave type "${leaveType}" not found` }); results.skipped++; continue; }
      const leaveTypeID = ltRes.recordset[0].LeaveTypeID;

      // Upsert the balance row
      await query(
        `IF EXISTS (SELECT 1 FROM dbo.LeaveBalances WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@y)
           UPDATE dbo.LeaveBalances SET TotalDays=@d WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@y
         ELSE
           INSERT INTO dbo.LeaveBalances(UserID,LeaveTypeID,Year,TotalDays) VALUES(@uid,@lt,@y,@d)`,
        { uid: userID, lt: leaveTypeID, y: year, d: totalDays }
      );
      results.updated++;
    } catch (e) {
      results.errors.push({ row: lineNum, reason: e.message });
    }
  }

  res.json({
    message: `Import complete: ${results.updated} updated, ${results.skipped} skipped`,
    ...results
  });
});

/* GET /api/users/settings  (hr) — load all settings */
router.get('/settings', role('hr'), async (req, res) => {
  try {
    const r = await query('SELECT SettingKey, SettingValue FROM dbo.Settings');
    const s = {};
    r.recordset.forEach(row => { s[row.SettingKey] = row.SettingValue; });
    res.json(s);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/users/settings  (hr) — save settings */
router.post('/settings', role('hr'), async (req, res) => {
  const settings = req.body; // { key: value, ... }
  try {
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `IF EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey=@k)
           UPDATE dbo.Settings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey=@k
         ELSE
           INSERT INTO dbo.Settings(SettingKey,SettingValue) VALUES(@k,@v)`,
        { k: key, v: value === null || value === undefined ? '' : String(value) }
      );
    }
    res.json({ message: 'Settings saved' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/users/settings/test-email  (hr) — send test email */
router.post('/settings/test-email', role('hr'), async (req, res) => {
  const mailer = require('../utils/mailer');
  try {
    const s = await mailer.getSettings();
    if (!s.smtp_user || !s.smtp_pass)
      return res.status(400).json({ error: 'SMTP not configured — enter credentials first' });
    const me = await query(
      'SELECT Email, FullName FROM dbo.Users WHERE UserID=@id', { id: req.user.userID }
    );
    const email = me.recordset[0]?.Email;
    if (!email) return res.status(400).json({ error: 'Your account has no email' });
    await mailer.sendTestEmail(email);
    res.json({ message: `Test email sent to ${email}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
