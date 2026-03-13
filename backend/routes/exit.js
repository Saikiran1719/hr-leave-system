// backend/routes/exit.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

// ── GET /api/exit — list exits ────────────────────────────────
router.get('/', async (req, res) => {
  const uid  = req.user.userID;
  const isHR = req.user.role === 'hr';
  try {
    const where = isHR ? '' : `AND e.UserID=${uid}`;
    const r = await query(`
      SELECT e.*, u.FullName, u.EmployeeCode, d.DepartmentName,
             ab.FullName AS AcceptedByName
      FROM dbo.ExitRequests e
      JOIN dbo.Users u ON e.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      LEFT JOIN dbo.Users ab ON e.AcceptedByID=ab.UserID
      WHERE 1=1 ${where}
      ORDER BY e.CreatedAt DESC`);
    res.json({ success: true, exits: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/exit — submit resignation ──────────────────────
router.post('/', async (req, res) => {
  const { reason, remarks, resignDate, noticePeriodDays } = req.body;
  const uid = req.user.userID;
  if (!reason || !resignDate) return res.status(400).json({ error: 'reason and resignDate required' });

  // Validate date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resignDate))
    return res.status(400).json({ error: 'Invalid date format' });

  const noticeDays = parseInt(noticePeriodDays || 30);

  try {
    // Check no active exit already
    const existing = await query(`SELECT 1 FROM dbo.ExitRequests WHERE UserID=@uid
      AND Status NOT IN ('withdrawn','rejected')`, { uid });
    if (existing.recordset.length)
      return res.status(400).json({ error: 'You already have an active resignation request' });

    const r = await query(`
      INSERT INTO dbo.ExitRequests(UserID,ResignDate,LastWorkingDay,NoticePeriodDays,Reason,Remarks)
      OUTPUT INSERTED.ExitID
      VALUES(@uid,
             CONVERT(DATE,'${resignDate}',23),
             DATEADD(DAY,${noticeDays},CONVERT(DATE,'${resignDate}',23)),
             ${noticeDays},@reason,@remarks)`,
      { uid, reason, remarks: remarks||null });

    const exitID = r.recordset[0].ExitID;

    // Get employee info
    const empR = await query(`SELECT u.FullName, u.ManagerID FROM dbo.Users u WHERE u.UserID=@uid`, { uid });
    const emp = empR.recordset[0];

    // Notify HR and manager
    const notifySQL = `INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      SELECT UserID,N'🚪 Resignation Submitted',
        N'${emp?.FullName} has submitted a resignation request. Last working day: ' +
        CONVERT(NVARCHAR,DATEADD(DAY,${noticeDays},CONVERT(DATE,'${resignDate}',23)),106),
        'exit',${exitID}
      FROM dbo.Users WHERE Role='hr' AND IsActive=1`;
    await query(notifySQL);

    if (emp?.ManagerID) {
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@mid,N'🚪 Team Member Resignation',
          N'${emp.FullName} has submitted their resignation. Please review.',
          'exit',@eid)`, { mid: emp.ManagerID, eid: exitID });
    }

    await logAudit(uid,'resignation_submitted','ExitRequest',exitID,null,{reason,resignDate},req);
    res.status(201).json({ success: true, exitID });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/exit/:id/status — HR updates status ───────────
router.patch('/:id/status', role('hr'), async (req, res) => {
  const { status, hrComment } = req.body;
  const validStatuses = ['accepted','notice_period','completed','rejected'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    await query(`UPDATE dbo.ExitRequests SET Status=@s, HRComment=@c,
      AcceptedByID=@by, AcceptedAt=GETDATE(), UpdatedAt=GETDATE()
      WHERE ExitID=@id`,
      { s:status, c:hrComment||null, by:req.user.userID, id:parseInt(req.params.id) });

    const er = await query(`SELECT UserID FROM dbo.ExitRequests WHERE ExitID=@id`,
      { id: parseInt(req.params.id) });
    if (er.recordset[0]) {
      const msgs = { accepted:'Your resignation has been accepted.', notice_period:'You are now in your notice period.',
        completed:'Your exit process is complete. Best wishes!', rejected:'Your resignation has been rejected. Please speak with HR.' };
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@uid,N'🚪 Exit Status Updated',N'${msgs[status]||''}','exit_update',@eid)`,
        { uid: er.recordset[0].UserID, eid: parseInt(req.params.id) });
    }
    await logAudit(req.user.userID,`exit_${status}`,'ExitRequest',parseInt(req.params.id),null,{status},req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/exit/:id/checklist — update checklist ─────────
router.patch('/:id/checklist', role('hr'), async (req, res) => {
  const { assetsReturned, accessRevoked, fnfProcessed, exitInterview, exitInterviewNote, fnfAmount, fnfDate, fnfNote } = req.body;
  try {
    const sets = [], p = { id: parseInt(req.params.id) };
    if (assetsReturned !== undefined) { sets.push('AssetsReturned=@ar'); p.ar = assetsReturned?1:0; }
    if (accessRevoked  !== undefined) { sets.push('AccessRevoked=@av');  p.av = accessRevoked?1:0; }
    if (fnfProcessed   !== undefined) { sets.push('FnFProcessed=@fp');   p.fp = fnfProcessed?1:0; }
    if (exitInterview  !== undefined) { sets.push('ExitInterview=@ei');  p.ei = exitInterview?1:0; }
    if (exitInterviewNote !== undefined) { sets.push('ExitInterviewNote=@ein'); p.ein = exitInterviewNote||null; }
    if (fnfAmount !== undefined) { sets.push('FnFAmount=@fa'); p.fa = fnfAmount||null; }
    if (fnfNote   !== undefined) { sets.push('FnFNote=@fn');   p.fn = fnfNote||null; }
    if (fnfDate   !== undefined && fnfDate && /^\d{4}-\d{2}-\d{2}$/.test(fnfDate)) {
      sets.push(`FnFDate=CONVERT(DATE,'${fnfDate}',23)`);
    }
    if (!sets.length) return res.json({ message: 'Nothing to update' });
    sets.push('UpdatedAt=GETDATE()');
    await query(`UPDATE dbo.ExitRequests SET ${sets.join(',')} WHERE ExitID=@id`, p);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/exit/:id/withdraw — employee withdraws ────────
router.patch('/:id/withdraw', async (req, res) => {
  const uid = req.user.userID;
  try {
    const check = await query(`SELECT UserID, Status FROM dbo.ExitRequests WHERE ExitID=@id`,
      { id: parseInt(req.params.id) });
    const e = check.recordset[0];
    if (!e) return res.status(404).json({ error: 'Not found' });
    if (e.UserID !== uid) return res.status(403).json({ error: 'Not your request' });
    if (!['submitted','accepted'].includes(e.Status))
      return res.status(400).json({ error: 'Cannot withdraw at this stage' });
    await query(`UPDATE dbo.ExitRequests SET Status='withdrawn', UpdatedAt=GETDATE() WHERE ExitID=@id`,
      { id: parseInt(req.params.id) });
    // Notify HR
    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      SELECT UserID,N'🚪 Resignation Withdrawn',N'Employee has withdrawn their resignation request.','exit',${parseInt(req.params.id)}
      FROM dbo.Users WHERE Role='hr' AND IsActive=1`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
