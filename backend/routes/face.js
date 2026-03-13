// backend/routes/face.js — Face Attendance API
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

// Public kiosk endpoint — no auth needed for punch (uses face match)
// Protected endpoints still need auth

// ── GET /api/face/descriptors — get all enrolled faces (for matching) ──
// Used by kiosk to load all face vectors
router.get('/descriptors', async (req, res) => {
  try {
    const r = await query(`
      SELECT fd.FaceID, fd.UserID, fd.Descriptor,
             u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.FaceDescriptors fd
      JOIN dbo.Users u ON fd.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE fd.IsActive=1 AND u.IsActive=1
    `);
    res.json({ success: true, faces: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/face/enroll — enroll a face (HR only) ──────────
router.post('/enroll', auth, role('hr'), async (req, res) => {
  const { userID, descriptor, photoBase64 } = req.body;
  if (!userID || !descriptor) return res.status(400).json({ error: 'userID and descriptor required' });
  try {
    // Deactivate old descriptor
    await query(`UPDATE dbo.FaceDescriptors SET IsActive=0 WHERE UserID=@uid`, { uid: userID });
    // Insert new
    await query(`INSERT INTO dbo.FaceDescriptors(UserID, Descriptor, PhotoBase64, EnrolledByID)
      VALUES(@uid, @desc, @photo, @by)`,
      { uid: userID, desc: JSON.stringify(descriptor), photo: photoBase64||null, by: req.user.userID });
    await logAudit(req.user.userID, 'face_enrolled', 'FaceDescriptor', userID, null, { userID }, req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/face/enroll/:uid — remove face enrollment ────
router.delete('/enroll/:uid', auth, role('hr'), async (req, res) => {
  try {
    await query(`UPDATE dbo.FaceDescriptors SET IsActive=0 WHERE UserID=@uid`, { uid: parseInt(req.params.uid) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/face/punch — record a face punch (kiosk) ───────
router.post('/punch', async (req, res) => {
  const { userID, punchType, confidence, photoBase64, deviceInfo } = req.body;
  if (!userID || !punchType) return res.status(400).json({ error: 'userID and punchType required' });
  if (!['IN','OUT'].includes(punchType)) return res.status(400).json({ error: 'punchType must be IN or OUT' });
  try {
    // Insert punch record
    await query(`INSERT INTO dbo.FacePunches(UserID, PunchType, Confidence, PhotoBase64, DeviceInfo)
      VALUES(@uid, @type, @conf, @photo, @dev)`,
      { uid: userID, type: punchType, conf: confidence||null, photo: photoBase64||null, dev: deviceInfo||null });

    // Also insert into AttendanceLogs (so existing attendance compute works)
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.AttendanceLogs WHERE UserID=@uid AND CAST(PunchTime AS DATE)=CONVERT(DATE,'${dateStr}',23) AND PunchType=@type)
      INSERT INTO dbo.AttendanceLogs(UserID, PunchTime, PunchType, Source)
      VALUES(@uid, GETDATE(), @type, 'FACE')`,
      { uid: userID, type: punchType });

    // Get employee name for response
    const empR = await query(`SELECT FullName FROM dbo.Users WHERE UserID=@uid`, { uid: userID });
    res.json({ success: true, employee: empR.recordset[0]?.FullName, punchType, time: now.toISOString() });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── GET /api/face/today — today's punches (HR dashboard) ─────
router.get('/today', auth, async (req, res) => {
  try {
    const r = await query(`
      SELECT fp.PunchID, fp.PunchType, fp.PunchTime, fp.Confidence,
             u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.FacePunches fp
      JOIN dbo.Users u ON fp.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE CAST(fp.PunchTime AS DATE)=CAST(GETDATE() AS DATE)
      ORDER BY fp.PunchTime DESC
    `);
    // Summarize: who is IN right now
    const byEmp = {};
    r.recordset.forEach(p => {
      if (!byEmp[p.UserID]) byEmp[p.UserID] = { ...p, lastPunch: p.PunchType, punches: [] };
      byEmp[p.UserID].punches.push(p);
      byEmp[p.UserID].lastPunch = p.PunchType;
      byEmp[p.UserID].lastTime  = p.PunchTime;
    });
    res.json({ success: true, punches: r.recordset, summary: Object.values(byEmp) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/face/enrolled — list enrolled employees ─────────
router.get('/enrolled', auth, role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT fd.FaceID, fd.EnrolledAt, fd.PhotoBase64,
             u.UserID, u.FullName, u.EmployeeCode, d.DepartmentName
      FROM dbo.FaceDescriptors fd
      JOIN dbo.Users u ON fd.UserID=u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID=d.DepartmentID
      WHERE fd.IsActive=1 AND u.IsActive=1
      ORDER BY u.FullName
    `);
    res.json({ success: true, enrolled: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
