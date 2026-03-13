// backend/routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { query } = require('../config/db');
const { auth }  = require('../middleware/auth');
const mailer    = require('../utils/mailer');

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body; // 'email' field carries employeeCode
  if (!email || !password) return res.status(400).json({ error: 'Employee ID and password required' });
  try {
    const r = await query(
      `SELECT u.UserID, u.FullName, u.Email, u.PasswordHash, u.Role,
              u.Phone, u.JoinedDate, u.IsActive,
              d.DepartmentName, m.FullName AS ManagerName
       FROM dbo.Users u
       LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
       LEFT JOIN dbo.Users m       ON u.ManagerID    = m.UserID
       WHERE (u.EmployeeCode = @email OR u.Email = @email) AND u.IsActive = 1`, { email }
    );
    const u = r.recordset[0];
    if (!u || !u.IsActive) return res.status(401).json({ error: 'Invalid credentials' });
    if (!await bcrypt.compare(password, u.PasswordHash))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userID: u.UserID, email: u.Email, role: u.Role, fullName: u.FullName },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({
      token,
      user: { userID: u.UserID, fullName: u.FullName, email: u.Email, role: u.Role,
              department: u.DepartmentName, phone: u.Phone, joinedDate: u.JoinedDate,
              managerName: u.ManagerName }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/auth/forgot-password */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const r = await query(
      `SELECT u.UserID, u.FullName, u.Email FROM dbo.Users u WHERE u.Email=@email AND u.IsActive=1`,
      { email }
    );
    // Always return success to prevent email enumeration
    if (!r.recordset[0]) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const user  = r.recordset[0];
    const token = uuid();

    // Fix: embed expiry as CONVERT literal — IST +1 hour (db.js passes strings as NVarChar which clashes with DATETIME)
    const expIST = new Date(Date.now() + 3600000); // 1 hour from now
    const expStr = expIST.toISOString().slice(0,19).replace('T',' '); // "2026-03-12 15:30:00"
    await query(
      `UPDATE dbo.Users SET ResetToken=@t, ResetTokenExp=CONVERT(DATETIME,'${expStr}',120) WHERE Email=@email`,
      { t: token, email }
    );

    // Send reset email
    const s = await mailer.getSettings();
    const portalUrl = s.portal_url || 'http://localhost:3000';

    mailer.sendResetEmail({
      to:        user.Email,
      name:      user.FullName,
      token,
      portalUrl,
    }).catch(err => console.log('[Reset Email] Failed:', err.message));

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/auth/reset-password */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
  try {
    // Fix: compare ResetTokenExp (DATETIME) with GETDATE() directly — no NVarChar param
    const nowStr = new Date().toISOString().slice(0,19).replace('T',' ');
    const r = await query(
      `SELECT UserID, FullName, Email FROM dbo.Users
       WHERE ResetToken=@t AND ResetTokenExp > CONVERT(DATETIME,'${nowStr}',120)`,
      { t: token }
    );
    if (!r.recordset[0]) return res.status(400).json({ error: 'Invalid or expired token' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE dbo.Users SET PasswordHash=@h, ResetToken=NULL, ResetTokenExp=NULL WHERE ResetToken=@t`,
      { h: hash, t: token }
    );
    res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

/* POST /api/auth/change-password */
router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password min 6 chars' });
  try {
    const r = await query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@id', { id: req.user.userID });
    if (!await bcrypt.compare(currentPassword, r.recordset[0].PasswordHash))
      return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE dbo.Users SET PasswordHash=@h WHERE UserID=@id', { h: hash, id: req.user.userID });
    res.json({ message: 'Password changed' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
