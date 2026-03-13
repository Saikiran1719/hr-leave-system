// backend/routes/audit.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');

router.use(auth);

// GET /api/audit — paginated audit log (HR only)
router.get('/', role('hr'), async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const entity = req.query.entity || '';
  const from   = req.query.from   || '';
  const to     = req.query.to     || '';

  try {
    let where = 'WHERE 1=1';
    const p = { offset, limit };
    if (search) { where += ' AND (a.Action LIKE @s OR u.FullName LIKE @s)'; p.s = `%${search}%`; }
    if (entity) { where += ' AND a.Entity = @ent'; p.ent = entity; }
    if (from)   { where += ' AND CAST(a.CreatedAt AS DATE) >= @from'; p.from = from; }
    if (to)     { where += ' AND CAST(a.CreatedAt AS DATE) <= @to';   p.to   = to; }

    const r = await query(`
      SELECT a.LogID, a.Action, a.Entity, a.EntityID,
             a.OldValue, a.NewValue, a.IPAddress, a.CreatedAt,
             u.FullName AS UserName, u.EmployeeCode, u.Role AS UserRole
      FROM dbo.AuditLog a
      LEFT JOIN dbo.Users u ON a.UserID = u.UserID
      ${where}
      ORDER BY a.CreatedAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, p);

    const countR = await query(`
      SELECT COUNT(*) AS Total FROM dbo.AuditLog a
      LEFT JOIN dbo.Users u ON a.UserID = u.UserID
      ${where}
    `, p);

    res.json({
      success: true,
      logs: r.recordset,
      total: countR.recordset[0].Total,
      page, limit
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/entities — distinct entities for filter
router.get('/entities', role('hr'), async (req, res) => {
  try {
    const r = await query(`SELECT DISTINCT Entity FROM dbo.AuditLog ORDER BY Entity`);
    res.json({ entities: r.recordset.map(x => x.Entity) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
