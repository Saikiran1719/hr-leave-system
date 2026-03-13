// backend/routes/reviews.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

// ── GET /api/reviews/cycles ───────────────────────────────────
router.get('/cycles', async (req, res) => {
  try {
    const r = await query(`
      SELECT rc.*, u.FullName AS CreatedByName,
             COUNT(rf.FormID) AS TotalForms,
             SUM(CASE WHEN rf.Status='reviewed' OR rf.Status='acknowledged' THEN 1 ELSE 0 END) AS Completed
      FROM dbo.ReviewCycles rc
      LEFT JOIN dbo.Users u ON rc.CreatedByID=u.UserID
      LEFT JOIN dbo.ReviewForms rf ON rf.CycleID=rc.CycleID
      GROUP BY rc.CycleID,rc.CycleName,rc.ReviewType,rc.StartDate,rc.EndDate,rc.Status,rc.CreatedByID,rc.CreatedAt,u.FullName
      ORDER BY rc.CreatedAt DESC`);
    res.json({ success: true, cycles: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/reviews/cycles — create cycle (HR) ─────────────
router.post('/cycles', role('hr'), async (req, res) => {
  const { cycleName, reviewType, startDate, endDate } = req.body;
  if (!cycleName || !startDate || !endDate)
    return res.status(400).json({ error: 'cycleName, startDate and endDate required' });
  try {
    const r = await query(`INSERT INTO dbo.ReviewCycles(CycleName,ReviewType,StartDate,EndDate,CreatedByID)
      OUTPUT INSERTED.CycleID
      VALUES(@n,@t,CONVERT(DATE,'${startDate}',23),CONVERT(DATE,'${endDate}',23),@by)`,
      { n:cycleName, t:reviewType||'annual', by:req.user.userID });
    res.status(201).json({ success: true, cycleID: r.recordset[0].CycleID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/reviews/cycles/:id — update status ────────────
router.patch('/cycles/:id', role('hr'), async (req, res) => {
  const { status } = req.body;
  try {
    await query(`UPDATE dbo.ReviewCycles SET Status=@s WHERE CycleID=@id`,
      { s: status, id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/reviews/cycles/:id/initiate — create forms for all ──
router.post('/cycles/:id/initiate', role('hr'), async (req, res) => {
  const cycleID = parseInt(req.params.id);
  try {
    // Get all active employees with managers
    const emps = await query(`
      SELECT u.UserID, u.ManagerID FROM dbo.Users u
      WHERE u.IsActive=1 AND u.ManagerID IS NOT NULL`);
    let created = 0;
    for (const e of emps.recordset) {
      const exists = await query(`SELECT 1 FROM dbo.ReviewForms WHERE CycleID=@c AND EmployeeID=@e`,
        { c: cycleID, e: e.UserID });
      if (!exists.recordset.length) {
        await query(`INSERT INTO dbo.ReviewForms(CycleID,EmployeeID,ReviewerID) VALUES(@c,@e,@r)`,
          { c: cycleID, e: e.UserID, r: e.ManagerID });
        // Notify employee
        await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
          VALUES(@uid,N'⭐ Performance Review Started',
            N'A new performance review cycle has been initiated. Please submit your self-assessment.',
            'review',@cid)`, { uid: e.UserID, cid: cycleID });
        created++;
      }
    }
    await query(`UPDATE dbo.ReviewCycles SET Status='active' WHERE CycleID=@id`, { id: cycleID });
    res.json({ success: true, formsCreated: created });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/reviews/my — employee's own review forms ─────────
router.get('/my', async (req, res) => {
  const uid = req.user.userID;
  try {
    const r = await query(`
      SELECT rf.*, rc.CycleName, rc.ReviewType, rc.StartDate, rc.EndDate, rc.Status AS CycleStatus,
             mgr.FullName AS ReviewerName
      FROM dbo.ReviewForms rf
      JOIN dbo.ReviewCycles rc ON rf.CycleID=rc.CycleID
      JOIN dbo.Users mgr ON rf.ReviewerID=mgr.UserID
      WHERE rf.EmployeeID=@uid ORDER BY rf.CreatedAt DESC`, { uid });
    res.json({ success: true, forms: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/reviews/team — manager's team forms ──────────────
router.get('/team', async (req, res) => {
  const uid = req.user.userID;
  const isHR = req.user.role === 'hr';
  try {
    let where = isHR ? '' : `AND rf.ReviewerID=${uid}`;
    const r = await query(`
      SELECT rf.FormID, rf.Status, rf.SelfRating, rf.MgrRating, rf.HRRating, rf.FinalRating,
             rf.SelfSubmitAt, rf.MgrReviewAt, rf.CreatedAt,
             rc.CycleID, rc.CycleName, rc.ReviewType, rc.Status AS CycleStatus,
             emp.FullName AS EmployeeName, emp.EmployeeCode,
             d.DepartmentName, mgr.FullName AS ReviewerName
      FROM dbo.ReviewForms rf
      JOIN dbo.ReviewCycles rc ON rf.CycleID=rc.CycleID
      JOIN dbo.Users emp ON rf.EmployeeID=emp.UserID
      LEFT JOIN dbo.Departments d ON emp.DepartmentID=d.DepartmentID
      JOIN dbo.Users mgr ON rf.ReviewerID=mgr.UserID
      WHERE 1=1 ${where}
      ORDER BY rf.CreatedAt DESC`);
    res.json({ success: true, forms: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/reviews/forms/:id — full form detail ─────────────
router.get('/forms/:id', async (req, res) => {
  const uid  = req.user.userID;
  const isHR = req.user.role === 'hr';
  try {
    const r = await query(`
      SELECT rf.*, rc.CycleName, rc.ReviewType, rc.Status AS CycleStatus,
             emp.FullName AS EmployeeName, emp.EmployeeCode,
             d.DepartmentName, mgr.FullName AS ReviewerName
      FROM dbo.ReviewForms rf
      JOIN dbo.ReviewCycles rc ON rf.CycleID=rc.CycleID
      JOIN dbo.Users emp ON rf.EmployeeID=emp.UserID
      LEFT JOIN dbo.Departments d ON emp.DepartmentID=d.DepartmentID
      JOIN dbo.Users mgr ON rf.ReviewerID=mgr.UserID
      WHERE rf.FormID=@id`, { id: parseInt(req.params.id) });
    const form = r.recordset[0];
    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (!isHR && form.ReviewerID !== uid && form.EmployeeID !== uid)
      return res.status(403).json({ error: 'Access denied' });
    res.json({ success: true, form });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/reviews/forms/:id/self — employee self assessment ──
router.patch('/forms/:id/self', async (req, res) => {
  const { selfGoals, selfAchieve, selfStrengths, selfImprove, selfRating } = req.body;
  const uid = req.user.userID;
  try {
    const check = await query(`SELECT EmployeeID, Status FROM dbo.ReviewForms WHERE FormID=@id`,
      { id: parseInt(req.params.id) });
    const f = check.recordset[0];
    if (!f) return res.status(404).json({ error: 'Form not found' });
    if (f.EmployeeID !== uid) return res.status(403).json({ error: 'Not your form' });
    if (f.Status !== 'pending') return res.status(400).json({ error: 'Already submitted' });

    await query(`UPDATE dbo.ReviewForms SET
      SelfGoals=@sg, SelfAchieve=@sa, SelfStrengths=@ss, SelfImprove=@si,
      SelfRating=@sr, Status='self_submitted', SelfSubmitAt=GETDATE()
      WHERE FormID=@id`,
      { sg:selfGoals||null, sa:selfAchieve||null, ss:selfStrengths||null,
        si:selfImprove||null, sr:selfRating||null, id:parseInt(req.params.id) });

    // Notify manager
    const mgr = await query(`SELECT ReviewerID FROM dbo.ReviewForms WHERE FormID=@id`,
      { id: parseInt(req.params.id) });
    const empName = await query(`SELECT FullName FROM dbo.Users WHERE UserID=@uid`, { uid });
    if (mgr.recordset[0]) {
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@mid,N'⭐ Self Assessment Submitted',
          N'${empName.recordset[0]?.FullName} has submitted their self-assessment. Please complete your review.',
          'review',@fid)`, { mid: mgr.recordset[0].ReviewerID, fid: parseInt(req.params.id) });
    }
    await logAudit(uid,'review_self_submitted','ReviewForm',parseInt(req.params.id),null,{selfRating},req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/reviews/forms/:id/manager — manager review ─────
router.patch('/forms/:id/manager', async (req, res) => {
  const { mgrGoals, mgrAchieve, mgrStrengths, mgrImprove, mgrRating, mgrComment } = req.body;
  const uid = req.user.userID;
  try {
    const check = await query(`SELECT ReviewerID, EmployeeID, Status FROM dbo.ReviewForms WHERE FormID=@id`,
      { id: parseInt(req.params.id) });
    const f = check.recordset[0];
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.ReviewerID !== uid && req.user.role !== 'hr')
      return res.status(403).json({ error: 'Not your review' });

    await query(`UPDATE dbo.ReviewForms SET
      MgrGoals=@mg, MgrAchieve=@ma, MgrStrengths=@ms, MgrImprove=@mi,
      MgrRating=@mr, MgrComment=@mc, Status='reviewed', MgrReviewAt=GETDATE()
      WHERE FormID=@id`,
      { mg:mgrGoals||null, ma:mgrAchieve||null, ms:mgrStrengths||null,
        mi:mgrImprove||null, mr:mgrRating||null, mc:mgrComment||null, id:parseInt(req.params.id) });

    // Notify HR + employee
    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      SELECT UserID,N'⭐ Review Completed',N'Manager review is done. Awaiting HR final rating.','review',${parseInt(req.params.id)}
      FROM dbo.Users WHERE Role='hr' AND IsActive=1`);
    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      VALUES(@uid,N'⭐ Your Review is Ready',N'Your manager has completed your performance review. Please check.','review',@fid)`,
      { uid: f.EmployeeID, fid: parseInt(req.params.id) });

    await logAudit(uid,'review_manager_submitted','ReviewForm',parseInt(req.params.id),null,{mgrRating},req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/reviews/forms/:id/hr — HR final rating ─────────
router.patch('/forms/:id/hr', role('hr'), async (req, res) => {
  const { hrRating, hrComment, finalRating } = req.body;
  try {
    const check = await query(`SELECT EmployeeID FROM dbo.ReviewForms WHERE FormID=@id`,
      { id: parseInt(req.params.id) });
    if (!check.recordset[0]) return res.status(404).json({ error: 'Not found' });

    await query(`UPDATE dbo.ReviewForms SET HRRating=@hr, HRComment=@hc, FinalRating=@fr,
      Status='reviewed', HRReviewAt=GETDATE() WHERE FormID=@id`,
      { hr:hrRating||null, hc:hrComment||null, fr:finalRating||null, id:parseInt(req.params.id) });

    await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
      VALUES(@uid,N'⭐ Performance Review Finalized',
        N'Your performance review has been finalized. Final Rating: ${finalRating||''}. Please acknowledge.',
        'review',@fid)`,
      { uid: check.recordset[0].EmployeeID, fid: parseInt(req.params.id) });

    await logAudit(req.user.userID,'review_hr_finalized','ReviewForm',parseInt(req.params.id),null,{hrRating,finalRating},req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/reviews/forms/:id/acknowledge ─────────────────
router.patch('/forms/:id/acknowledge', async (req, res) => {
  const { comment } = req.body;
  const uid = req.user.userID;
  try {
    const check = await query(`SELECT EmployeeID FROM dbo.ReviewForms WHERE FormID=@id`,
      { id: parseInt(req.params.id) });
    if (check.recordset[0]?.EmployeeID !== uid)
      return res.status(403).json({ error: 'Not your form' });
    await query(`UPDATE dbo.ReviewForms SET Status='acknowledged', EmpAckAt=GETDATE(), EmpAckComment=@c WHERE FormID=@id`,
      { c:comment||null, id:parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
