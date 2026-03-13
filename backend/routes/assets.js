// backend/routes/assets.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth, role } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

router.use(auth);

// GET /api/assets/categories
router.get('/categories', async (req, res) => {
  try {
    const r = await query(`SELECT * FROM dbo.AssetCategories ORDER BY CategoryName`);
    res.json({ success: true, categories: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/assets/categories — add new category (HR)
router.post('/categories', role('hr'), async (req, res) => {
  const { categoryName, icon } = req.body;
  if (!categoryName) return res.status(400).json({ error: 'categoryName required' });
  try {
    await query(`INSERT INTO dbo.AssetCategories(CategoryName,Icon) VALUES(@n,@i)`,
      { n: categoryName, i: icon || '[PKG]' });
    res.status(201).json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/assets — all assets (HR)
router.get('/', role('hr','manager'), async (req, res) => {
  const { status, category, search } = req.query;
  try {
    let where = 'WHERE 1=1';
    const p = {};
    if (status)   { where += ' AND a.Status=@st';   p.st = status; }
    if (category) { where += ' AND a.CategoryID=@cat'; p.cat = parseInt(category); }
    if (search)   { where += ' AND (a.AssetName LIKE @s OR a.AssetCode LIKE @s OR a.SerialNumber LIKE @s)'; p.s = `%${search}%`; }
    const r = await query(`
      SELECT a.*, c.CategoryName, c.Icon,
             u.FullName AS AssignedTo, u.EmployeeCode AS AssignedCode,
             aa.AssignedDate, aa.AssignID AS ActiveAssignID
      FROM dbo.Assets a
      LEFT JOIN dbo.AssetCategories c ON a.CategoryID=c.CategoryID
      LEFT JOIN dbo.AssetAssignments aa ON aa.AssetID=a.AssetID AND aa.IsActive=1
      LEFT JOIN dbo.Users u ON aa.UserID=u.UserID
      ${where}
      ORDER BY a.AssetCode`, p);
    res.json({ success: true, assets: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/assets/my — assets assigned to me
router.get('/my', async (req, res) => {
  try {
    const r = await query(`
      SELECT a.*, c.CategoryName, c.Icon, aa.AssignedDate, aa.Notes AS AssignNotes
      FROM dbo.AssetAssignments aa
      JOIN dbo.Assets a ON aa.AssetID=a.AssetID
      LEFT JOIN dbo.AssetCategories c ON a.CategoryID=c.CategoryID
      WHERE aa.UserID=@uid AND aa.IsActive=1
      ORDER BY aa.AssignedDate DESC`, { uid: req.user.userID });
    res.json({ success: true, assets: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/assets — add new asset (HR)
router.post('/', role('hr'), async (req, res) => {
  const { assetCode, assetName, categoryID, brand, model, serialNumber,
          purchaseDate, purchasePrice, warrantyUntil, condition, notes } = req.body;
  if (!assetCode || !assetName) return res.status(400).json({ error: 'assetCode and assetName required' });

  // Validate dates
  const validDate = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const pdSql  = validDate(purchaseDate)  ? `CONVERT(DATE,'${purchaseDate}',23)`  : 'NULL';
  const wuSql  = validDate(warrantyUntil) ? `CONVERT(DATE,'${warrantyUntil}',23)` : 'NULL';

  try {
    await query(`INSERT INTO dbo.Assets(AssetCode,AssetName,CategoryID,Brand,Model,SerialNumber,
      PurchaseDate,PurchasePrice,WarrantyUntil,Condition,Notes)
      VALUES(@code,@name,@cat,@brand,@model,@serial,${pdSql},@price,${wuSql},@cond,@notes)`,
      { code:assetCode, name:assetName, cat:categoryID||null, brand:brand||null,
        model:model||null, serial:serialNumber||null,
        price:purchasePrice||null, cond:condition||'good', notes:notes||null });
    await logAudit(req.user.userID,'asset_created','Asset',null,null,{ assetCode,assetName },req);
    res.status(201).json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/assets/:id — update asset (HR)
router.patch('/:id', role('hr'), async (req, res) => {
  const { assetName, brand, model, serialNumber, purchaseDate, purchasePrice,
          warrantyUntil, status, condition, notes } = req.body;
  const validDate = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  try {
    const sets = [], p = { id: parseInt(req.params.id) };
    if (assetName)              { sets.push('AssetName=@n');      p.n  = assetName; }
    if (brand!==undefined)      { sets.push('Brand=@br');         p.br = brand||null; }
    if (model!==undefined)      { sets.push('Model=@mo');         p.mo = model||null; }
    if (serialNumber!==undefined){ sets.push('SerialNumber=@sn'); p.sn = serialNumber||null; }
    if (purchaseDate)           { sets.push(validDate(purchaseDate)  ? `PurchaseDate=CONVERT(DATE,'${purchaseDate}',23)`  : 'PurchaseDate=NULL'); }
    if (purchasePrice!==undefined){ sets.push('PurchasePrice=@pp'); p.pp = purchasePrice||null; }
    if (warrantyUntil!==undefined){ sets.push(validDate(warrantyUntil) ? `WarrantyUntil=CONVERT(DATE,'${warrantyUntil}',23)` : 'WarrantyUntil=NULL'); }
    if (status)                 { sets.push('Status=@st');        p.st = status; }
    if (condition)              { sets.push('Condition=@co');     p.co = condition; }
    if (notes!==undefined)      { sets.push('Notes=@no');         p.no = notes||null; }
    sets.push('UpdatedAt=GETDATE()');
    await query(`UPDATE dbo.Assets SET ${sets.join(',')} WHERE AssetID=@id`, p);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/assets/:id/assign — assign to employee (HR)
router.post('/:id/assign', role('hr'), async (req, res) => {
  const { userID, notes, assignedDate } = req.body;
  const assetID = parseInt(req.params.id);
  if (!userID) return res.status(400).json({ error: 'userID required' });
  try {
    // Check asset is available
    const ar = await query(`SELECT Status FROM dbo.Assets WHERE AssetID=@id`, { id: assetID });
    if (ar.recordset[0]?.Status === 'assigned')
      return res.status(400).json({ error: 'Asset is already assigned' });

    await query(`INSERT INTO dbo.AssetAssignments(AssetID,UserID,AssignedDate,Notes,AssignedByID)
      VALUES(@aid,@uid,@dt,@notes,@by)`,
      { aid:assetID, uid:userID, dt:assignedDate||new Date().toISOString().slice(0,10),
        notes:notes||null, by:req.user.userID });
    await query(`UPDATE dbo.Assets SET Status='assigned',UpdatedAt=GETDATE() WHERE AssetID=@id`, { id:assetID });

    // Get asset & employee info
    const det = await query(`
      SELECT a.AssetName, a.AssetCode, u.FullName FROM dbo.Assets a, dbo.Users u
      WHERE a.AssetID=@aid AND u.UserID=@uid`, { aid:assetID, uid:userID });
    const d = det.recordset[0];
    if (d) {
      await query(`INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
        VALUES(@uid,N'📦 Asset Assigned: ${d.AssetCode}',
          N'${d.AssetName} (${d.AssetCode}) has been assigned to you. Please handle with care.',
          'asset',@aid)`, { uid:userID, aid:assetID });
    }
    await logAudit(req.user.userID,'asset_assigned','AssetAssignment',assetID,null,{ userID,assetID },req);
    res.status(201).json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/assets/:id/return — return asset (HR)
router.post('/:id/return', role('hr'), async (req, res) => {
  const { condition, notes } = req.body;
  const assetID = parseInt(req.params.id);
  try {
    await query(`UPDATE dbo.AssetAssignments SET IsActive=0, ReturnedDate=GETDATE(),
      ReturnedToID=@by, Condition=@cond, Notes=ISNULL(Notes+' | Return: ','Return: ')+ISNULL(@notes,'')
      WHERE AssetID=@aid AND IsActive=1`,
      { by:req.user.userID, cond:condition||'good', notes:notes||null, aid:assetID });
    await query(`UPDATE dbo.Assets SET Status='available', Condition=@cond, UpdatedAt=GETDATE() WHERE AssetID=@aid`,
      { cond:condition||'good', aid:assetID });
    await logAudit(req.user.userID,'asset_returned','Asset',assetID,null,{ condition },req);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/assets/:id/history — assignment history
router.get('/:id/history', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT aa.*, u.FullName AS EmployeeName, u.EmployeeCode,
             ab.FullName AS AssignedByName, rt.FullName AS ReturnedToName
      FROM dbo.AssetAssignments aa
      JOIN dbo.Users u ON aa.UserID=u.UserID
      LEFT JOIN dbo.Users ab ON aa.AssignedByID=ab.UserID
      LEFT JOIN dbo.Users rt ON aa.ReturnedToID=rt.UserID
      WHERE aa.AssetID=@id ORDER BY aa.CreatedAt DESC`,
      { id: parseInt(req.params.id) });
    res.json({ success: true, history: r.recordset });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/assets/stats — summary counts (HR)
router.get('/stats', role('hr'), async (req, res) => {
  try {
    const r = await query(`
      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN Status='available'   THEN 1 ELSE 0 END) AS Available,
        SUM(CASE WHEN Status='assigned'    THEN 1 ELSE 0 END) AS Assigned,
        SUM(CASE WHEN Status='maintenance' THEN 1 ELSE 0 END) AS Maintenance,
        SUM(CASE WHEN Status='retired'     THEN 1 ELSE 0 END) AS Retired,
        SUM(ISNULL(PurchasePrice,0)) AS TotalValue
      FROM dbo.Assets`);
    res.json({ success: true, stats: r.recordset[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
