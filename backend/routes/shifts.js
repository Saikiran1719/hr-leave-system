// backend/routes/shifts.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

// GET /api/shifts — all shifts
router.get('/', async (req, res) => {
  try {
    const r = await query(`SELECT ShiftID, ShiftName, ShiftCode,
      CONVERT(NVARCHAR(5), StartTime, 108) AS StartTime,
      CONVERT(NVARCHAR(5), EndTime,   108) AS EndTime,
      GraceLateMin, GraceEarlyMin, WorkMinutes, ColorHex, IsNightShift, IsActive
      FROM dbo.Shifts WHERE IsActive=1 ORDER BY StartTime`);
    res.json({ success: true, shifts: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/shifts — create shift (HR)
router.post('/', role('hr'), async (req, res) => {
  const { shiftName, shiftCode, startTime, endTime, graceLateMin, graceEarlyMin, workMinutes, colorHex, isNightShift } = req.body;
  if (!shiftName || !shiftCode || !startTime || !endTime)
    return res.status(400).json({ error: 'Name, code, start and end time required' });
  try {
    await query(`INSERT INTO dbo.Shifts(ShiftName,ShiftCode,StartTime,EndTime,GraceLateMin,GraceEarlyMin,WorkMinutes,ColorHex,IsNightShift)
      VALUES(@n,@c,@s,@e,@gl,@ge,@wm,@col,@night)`,
      { n:shiftName, c:shiftCode.toUpperCase(), s:startTime, e:endTime,
        gl:graceLateMin||15, ge:graceEarlyMin||15, wm:workMinutes||480,
        col:colorHex||'#6366f1', night:isNightShift?1:0 });
    await logAudit(req.user.userID,'shift_created','Shift',null,null,req.body,req);
    res.status(201).json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/shifts/:id — update shift (HR)
router.patch('/:id', role('hr'), async (req, res) => {
  const { shiftName, startTime, endTime, graceLateMin, graceEarlyMin, workMinutes, colorHex, isNightShift } = req.body;
  try {
    await query(`UPDATE dbo.Shifts SET ShiftName=@n,StartTime=@s,EndTime=@e,
      GraceLateMin=@gl,GraceEarlyMin=@ge,WorkMinutes=@wm,ColorHex=@col,IsNightShift=@night
      WHERE ShiftID=@id`,
      { n:shiftName, s:startTime, e:endTime, gl:graceLateMin, ge:graceEarlyMin,
        wm:workMinutes, col:colorHex, night:isNightShift?1:0, id:parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/shifts/:id — deactivate shift (HR)
router.delete('/:id', role('hr'), async (req, res) => {
  try {
    await query(`UPDATE dbo.Shifts SET IsActive=0 WHERE ShiftID=@id`, { id:parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/shifts/assignments — all assignments (HR)
router.get('/assignments', role('hr','manager'), async (req, res) => {
  try {
    const r = await query(`
      SELECT sa.AssignID, sa.EffectiveFrom, sa.EffectiveTo,
             u.UserID, u.FullName, u.EmployeeCode, d.DepartmentName,
             s.ShiftID, s.ShiftName, s.ShiftCode,
             CONVERT(NVARCHAR(5), s.StartTime, 108) AS StartTime,
             CONVERT(NVARCHAR(5), s.EndTime,   108) AS EndTime,
             s.ColorHex,
             ab.FullName AS AssignedByName
      FROM dbo.ShiftAssignments sa
      JOIN dbo.Users u  ON sa.UserID=u.UserID
      JOIN dbo.Shifts s ON sa.ShiftID=s.ShiftID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.Users ab ON sa.AssignedByID=ab.UserID
      WHERE u.IsActive=1
        AND (sa.EffectiveTo IS NULL OR sa.EffectiveTo >= CAST(GETDATE() AS DATE))
      ORDER BY u.FullName`);
    res.json({ success: true, assignments: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/shifts/my — logged in user's current shift
router.get('/my', async (req, res) => {
  try {
    const r = await query(`
      SELECT TOP 1 s.ShiftID, s.ShiftName, s.ShiftCode,
             CONVERT(NVARCHAR(5), s.StartTime, 108) AS StartTime,
             CONVERT(NVARCHAR(5), s.EndTime,   108) AS EndTime,
             s.GraceLateMin, s.GraceEarlyMin, s.WorkMinutes, s.ColorHex, s.IsNightShift,
             sa.EffectiveFrom, sa.EffectiveTo
      FROM dbo.ShiftAssignments sa
      JOIN dbo.Shifts s ON sa.ShiftID=s.ShiftID
      WHERE sa.UserID=@uid
        AND sa.EffectiveFrom <= CAST(GETDATE() AS DATE)
        AND (sa.EffectiveTo IS NULL OR sa.EffectiveTo >= CAST(GETDATE() AS DATE))
      ORDER BY sa.EffectiveFrom DESC`,
      { uid: req.user.userID });
    res.json({ success: true, shift: r.recordset[0] || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/shifts/assign — assign shift to employee (HR)
router.post('/assign', role('hr'), async (req, res) => {
  const { userID, shiftID, effectiveFrom, effectiveTo } = req.body;
  if (!userID || !shiftID) return res.status(400).json({ error: 'userID and shiftID required' });
  try {
    // Validate date format
    const fromDate = effectiveFrom || new Date().toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate))
      return res.status(400).json({ error: 'Invalid date format' });

    // End previous active assignment — embed date literal directly (safe, validated above)
    await query(`UPDATE dbo.ShiftAssignments
      SET EffectiveTo = DATEADD(DAY, -1, CONVERT(DATE, '${fromDate}', 23))
      WHERE UserID=${parseInt(userID)}
        AND (EffectiveTo IS NULL OR EffectiveTo >= CONVERT(DATE, '${fromDate}', 23))`);

    await query(`INSERT INTO dbo.ShiftAssignments(UserID, ShiftID, EffectiveFrom, EffectiveTo, AssignedByID)
      VALUES(${parseInt(userID)}, ${parseInt(shiftID)},
             CONVERT(DATE, '${fromDate}', 23),
             ${effectiveTo ? `CONVERT(DATE, '${effectiveTo}', 23)` : 'NULL'},
             ${req.user.userID})`);
    // Notify employee
    const sr = await query(`SELECT ShiftName,ShiftCode FROM dbo.Shifts WHERE ShiftID=@id`, { id:shiftID });
    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      VALUES(@uid,N'🕐 Shift Assigned',
        N'You have been assigned to ${sr.recordset[0]?.ShiftName} (${sr.recordset[0]?.ShiftCode}) effective from ${effectiveFrom||'today'}.',
        'shift',@sid)`, { uid: userID, sid: shiftID });
    await logAudit(req.user.userID,'shift_assigned','ShiftAssignment',null,null,{ userID,shiftID,effectiveFrom },req);
    res.status(201).json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/shifts/unassigned — employees without a shift
router.get('/unassigned', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT u.UserID, u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE u.IsActive=1
        AND NOT EXISTS (
          SELECT 1 FROM dbo.ShiftAssignments sa
          WHERE sa.UserID=u.UserID
            AND sa.EffectiveFrom <= CAST(GETDATE() AS DATE)
            AND (sa.EffectiveTo IS NULL OR sa.EffectiveTo >= CAST(GETDATE() AS DATE))
        )
      ORDER BY u.FullName`);
    res.json({ success: true, employees: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
