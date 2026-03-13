// backend/routes/notices.js
const router = require('express').Router();
const path   = require('path');
const multer = require('multer');
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');

// File upload for notice attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) => cb(null, `notice_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

router.use(auth);

// ── GET /api/notices — all active notices ────────────────────
router.get('/', async (req, res) => {
  const uid = req.user.userID;
  try {
    const r = await query(`
      SELECT n.NoticeID, n.Title, n.Body, n.Category, n.IsPinned,
             n.AttachmentPath, n.AttachmentName, n.AttachmentType,
             n.CreatedAt, n.UpdatedAt,
             u.FullName AS CreatedByName, u.EmployeeCode AS CreatedByCode,
             CASE WHEN nr.ReadID IS NOT NULL THEN 1 ELSE 0 END AS IsRead,
             (SELECT COUNT(*) FROM dbo.NoticeReads WHERE NoticeID=n.NoticeID) AS ReadCount,
             (SELECT COUNT(*) FROM dbo.Users WHERE IsActive=1) AS TotalUsers
      FROM dbo.Notices n
      JOIN dbo.Users u ON n.CreatedByID = u.UserID
      LEFT JOIN dbo.NoticeReads nr ON nr.NoticeID=n.NoticeID AND nr.UserID=${uid}
      WHERE n.IsActive = 1
      ORDER BY n.IsPinned DESC, n.CreatedAt DESC
    `);
    res.json({ success: true, notices: r.recordset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/notices — create notice (HR only) ──────────────
router.post('/', role('hr'), upload.single('attachment'), async (req, res) => {
  const { title, body, category, isPinned } = req.body;
  const uid = req.user.userID;
  if (!title?.trim() || !body?.trim())
    return res.status(400).json({ error: 'Title and body are required' });

  let attachPath = null, attachName = null, attachType = null;
  if (req.file) {
    attachPath = req.file.filename;
    attachName = req.file.originalname;
    const ext = path.extname(req.file.originalname).toLowerCase();
    attachType = ['.jpg','.jpeg','.png','.gif'].includes(ext) ? 'image'
               : ext === '.pdf' ? 'pdf' : 'doc';
  }

  try {
    const r = await query(`
      INSERT INTO dbo.Notices (Title, Body, Category, AttachmentPath, AttachmentName, AttachmentType, CreatedByID, IsPinned)
      OUTPUT INSERTED.NoticeID
      VALUES (@title, @body, @cat, @ap, @an, @at, @uid, @pin)
    `, {
      title: title.trim(), body: body.trim(),
      cat: category || 'General',
      ap: attachPath, an: attachName, at: attachType,
      uid, pin: isPinned === 'true' || isPinned === true ? 1 : 0
    });

    const noticeID = r.recordset[0].NoticeID;

    // Notify ALL active employees — single bulk INSERT (avoids PK issues from loop)
    const shortMsg = body.trim().slice(0,120).replace(/'/g,"''") + (body.length>120?'...':'');
    const titleEsc = title.trim().replace(/'/g,"''");
    await query(`
      INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
      SELECT UserID,
             N'📢 New Notice: ${titleEsc}',
             N'${shortMsg}',
             'notice', ${noticeID}
      FROM dbo.Users
      WHERE IsActive=1 AND UserID != ${uid}
    `);

    res.status(201).json({ success: true, noticeID });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/notices/:id — edit notice (HR only) ───────────
router.patch('/:id', role('hr'), upload.single('attachment'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, body, category, isPinned } = req.body;
  const sets = [], p = { id };

  if (title)    { sets.push('Title=@t');    p.t = title.trim(); }
  if (body)     { sets.push('Body=@b');     p.b = body.trim(); }
  if (category) { sets.push('Category=@c'); p.c = category; }
  if (isPinned !== undefined) { sets.push('IsPinned=@pin'); p.pin = isPinned==='true'||isPinned===true?1:0; }

  if (req.file) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    sets.push('AttachmentPath=@ap','AttachmentName=@an','AttachmentType=@at');
    p.ap = req.file.filename;
    p.an = req.file.originalname;
    p.at = ['.jpg','.jpeg','.png','.gif'].includes(ext) ? 'image' : ext==='.pdf' ? 'pdf' : 'doc';
  }

  if (!sets.length) return res.json({ message: 'Nothing to update' });
  sets.push('UpdatedAt=GETDATE()');

  try {
    await query(`UPDATE dbo.Notices SET ${sets.join(',')} WHERE NoticeID=@id`, p);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/notices/:id — soft delete (HR only) ──────────
router.delete('/:id', role('hr'), async (req, res) => {
  try {
    await query(`UPDATE dbo.Notices SET IsActive=0 WHERE NoticeID=@id`, { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/notices/:id/read — mark as read ────────────────
router.post('/:id/read', async (req, res) => {
  const uid = req.user.userID;
  const nid = parseInt(req.params.id);
  try {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.NoticeReads WHERE NoticeID=@nid AND UserID=@uid)
        INSERT INTO dbo.NoticeReads (NoticeID, UserID) VALUES (@nid, @uid)
    `, { nid, uid });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
