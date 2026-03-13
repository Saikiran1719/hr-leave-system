// backend/routes/encashment.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

// GET /api/encashment/types — leave types with encashment settings
router.get('/types', async (req, res) => {
  try {
    const r = await query(`
      SELECT lt.LeaveTypeID, lt.TypeCode, lt.TypeName, lt.ColorHex,
             lt.IsEncashable, lt.MaxCarryForward, lt.EncashRatePerDay,
             lb.RemainingDays, lb.UsedDays, lb.TotalDays, lb.CarryForwardDays, lb.EncashedDays,
             YEAR(GETDATE()) AS CurrentYear
      FROM dbo.LeaveTypes lt
      LEFT JOIN dbo.LeaveBalances lb ON lb.LeaveTypeID=lt.LeaveTypeID
        AND lb.UserID=@uid AND lb.Year=YEAR(GETDATE())
      WHERE lt.IsActive=1
    `, { uid: req.user.userID });
    res.json({ success: true, types: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encashment/my — my encashment requests
router.get('/my', async (req, res) => {
  try {
    const r = await query(`
      SELECT e.*, lt.TypeCode, lt.TypeName, lt.ColorHex,
             u.FullName AS ApproverName
      FROM dbo.LeaveEncashment e
      JOIN dbo.LeaveTypes lt ON e.LeaveTypeID=lt.LeaveTypeID
      LEFT JOIN dbo.Users u ON e.ApprovedByID=u.UserID
      WHERE e.UserID=@uid ORDER BY e.CreatedAt DESC
    `, { uid: req.user.userID });
    res.json({ success: true, requests: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encashment/all — all requests (HR)
router.get('/all', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT e.*, lt.TypeCode, lt.TypeName, lt.ColorHex,
             u.FullName AS EmployeeName, u.EmployeeCode,
             d.DepartmentName,
             apr.FullName AS ApproverName
      FROM dbo.LeaveEncashment e
      JOIN dbo.LeaveTypes lt ON e.LeaveTypeID=lt.LeaveTypeID
      JOIN dbo.Users u ON e.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.Users apr ON e.ApprovedByID=apr.UserID
      ORDER BY e.CreatedAt DESC
    `);
    res.json({ success: true, requests: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/encashment/request — employee requests encashment
router.post('/request', async (req, res) => {
  const { leaveTypeID, daysRequested, year } = req.body;
  const uid = req.user.userID;
  const yr  = year || new Date().getFullYear();
  if (!leaveTypeID || !daysRequested)
    return res.status(400).json({ error: 'leaveTypeID and daysRequested required' });
  try {
    // Check type is encashable
    const lt = await query(`SELECT IsEncashable, EncashRatePerDay, TypeCode FROM dbo.LeaveTypes WHERE LeaveTypeID=@id`, { id: leaveTypeID });
    if (!lt.recordset[0]?.IsEncashable)
      return res.status(400).json({ error: 'This leave type is not encashable' });

    // Check balance
    const bal = await query(`SELECT RemainingDays FROM dbo.LeaveBalances WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@yr`,
      { uid, lt: leaveTypeID, yr });
    const remaining = bal.recordset[0]?.RemainingDays || 0;
    if (daysRequested > remaining)
      return res.status(400).json({ error: `Only ${remaining} days available to encash` });

    // Check no pending request
    const existing = await query(`SELECT 1 FROM dbo.LeaveEncashment WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@yr AND Status='pending'`,
      { uid, lt: leaveTypeID, yr });
    if (existing.recordset.length)
      return res.status(400).json({ error: 'You already have a pending encashment request for this leave type' });

    const rate = lt.recordset[0].EncashRatePerDay || 0;
    await query(`
      INSERT INTO dbo.LeaveEncashment (UserID, LeaveTypeID, Year, DaysRequested, RatePerDay)
      VALUES (@uid, @lt, @yr, @days, @rate)
    `, { uid, lt: leaveTypeID, yr, days: daysRequested, rate });

    // Notify HR
    const hrs = await query(`SELECT UserID FROM dbo.Users WHERE Role='hr' AND IsActive=1`);
    const empR = await query(`SELECT FullName FROM dbo.Users WHERE UserID=@uid`, { uid });
    for (const h of hrs.recordset) {
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@hid, N'💰 Leave Encashment Request',
          N'${empR.recordset[0]?.FullName} requested encashment of ${daysRequested} ${lt.recordset[0].TypeCode} days',
          'encashment', @uid)`, { hid: h.UserID, uid });
    }

    await logAudit(uid, 'encashment_requested', 'LeaveEncashment', null,
      null, { leaveTypeID, daysRequested, yr }, req);
    res.status(201).json({ success: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PATCH /api/encashment/:id/action — HR approves/rejects
router.patch('/:id/action', role('hr'), async (req, res) => {
  const { action, comment } = req.body;
  const encashID = parseInt(req.params.id);
  const hrID = req.user.userID;
  try {
    const r = await query(`SELECT * FROM dbo.LeaveEncashment WHERE EncashID=@id`, { id: encashID });
    const enc = r.recordset[0];
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (enc.Status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    const status = action === 'approve' ? 'approved' : 'rejected';
    await query(`UPDATE dbo.LeaveEncashment SET Status=@s, ApprovedByID=@by, Comment=@c, ProcessedAt=GETDATE()
                 WHERE EncashID=@id`, { s: status, by: hrID, c: comment||null, id: encashID });

    if (status === 'approved') {
      // Deduct from leave balance
      await query(`UPDATE dbo.LeaveBalances SET UsedDays=UsedDays+@days, EncashedDays=EncashedDays+@days
                   WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@yr`,
        { days: enc.DaysRequested, uid: enc.UserID, lt: enc.LeaveTypeID, yr: enc.Year });
    }

    // Notify employee
    const hrName = await query(`SELECT FullName FROM dbo.Users WHERE UserID=@id`, { id: hrID });
    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      VALUES(@uid, N'💰 Encashment ${status==='approved'?'Approved ✅':'Rejected ❌'}',
        N'Your leave encashment request has been ${status} by ${hrName.recordset[0]?.FullName}',
        'encashment_result', @eid)`, { uid: enc.UserID, eid: encashID });

    await logAudit(hrID, `encashment_${status}`, 'LeaveEncashment', encashID, { status: 'pending' }, { status }, req);
    res.json({ success: true, status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/encashment/year-end — HR runs year-end carry forward
router.post('/year-end', role('hr'), async (req, res) => {
  const { fromYear, toYear } = req.body;
  const fy = fromYear || new Date().getFullYear();
  const ty = toYear   || fy + 1;
  const hrID = req.user.userID;
  try {
    // Get all balances with remaining days for encashable/carryforward types
    const balances = await query(`
      SELECT lb.UserID, lb.LeaveTypeID, lb.RemainingDays,
             lt.MaxCarryForward, lt.TypeCode
      FROM dbo.LeaveBalances lb
      JOIN dbo.LeaveTypes lt ON lb.LeaveTypeID=lt.LeaveTypeID
      WHERE lb.Year=@fy AND lb.RemainingDays > 0 AND lt.MaxCarryForward > 0
    `, { fy });

    let carried = 0;
    for (const b of balances.recordset) {
      const cfDays = Math.min(b.RemainingDays, b.MaxCarryForward);
      if (cfDays <= 0) continue;

      // Add carry forward to next year balance
      const existing = await query(`SELECT BalanceID, TotalDays FROM dbo.LeaveBalances
        WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@ty`,
        { uid: b.UserID, lt: b.LeaveTypeID, ty });

      if (existing.recordset.length) {
        await query(`UPDATE dbo.LeaveBalances SET TotalDays=TotalDays+@cf, CarryForwardDays=CarryForwardDays+@cf
                     WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@ty`,
          { cf: cfDays, uid: b.UserID, lt: b.LeaveTypeID, ty });
      } else {
        await query(`INSERT INTO dbo.LeaveBalances(UserID,LeaveTypeID,Year,TotalDays,CarryForwardDays)
                     VALUES(@uid,@lt,@ty,@cf,@cf)`,
          { uid: b.UserID, lt: b.LeaveTypeID, ty, cf: cfDays });
      }

      // Update this year's carry forward record
      await query(`UPDATE dbo.LeaveBalances SET CarryForwardDays=@cf WHERE UserID=@uid AND LeaveTypeID=@lt AND Year=@fy`,
        { cf: cfDays, uid: b.UserID, lt: b.LeaveTypeID, fy });
      carried++;
    }

    await logAudit(hrID, 'year_end_carry_forward', 'LeaveBalances', null,
      null, { fromYear: fy, toYear: ty, recordsProcessed: carried }, req);
    res.json({ success: true, message: `Carry forward complete. ${carried} balances updated.`, carried });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
