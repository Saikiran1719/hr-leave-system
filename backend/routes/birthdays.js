// backend/routes/birthdays.js
const router = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

// ── Internal scheduler bypass ─────────────────────────────────
function authOrInternal(req, res, next) {
  if (req.headers.authorization === 'Bearer internal-scheduler') return next();
  return auth(req, res, next);
}

router.use((req, res, next) => {
  if (req.path === '/trigger-notifications') return authOrInternal(req, res, next);
  return auth(req, res, next);
});

// ── GET /api/birthday/today — who has birthday today ──────────
router.get('/today', async (req, res) => {
  try {
    const r = await query(`
      SELECT u.UserID, u.FullName, u.EmployeeCode,
             u.DateOfBirth,
             DATEDIFF(YEAR, u.DateOfBirth, GETDATE()) AS Age,
             d.DepartmentName
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE u.IsActive = 1
        AND u.DateOfBirth IS NOT NULL
        AND MONTH(u.DateOfBirth) = MONTH(GETDATE())
        AND DAY(u.DateOfBirth)   = DAY(GETDATE())
    `);
    res.json({ success: true, birthdays: r.recordset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/birthday/upcoming — all upcoming this year ──────
router.get('/upcoming', async (req, res) => {
  const isHR = req.user.role === 'hr';
  try {
    const r = await query(`
      SELECT u.UserID, u.FullName, u.EmployeeCode,
             u.DateOfBirth,
             d.DepartmentName,
             CASE
               WHEN DATEFROMPARTS(YEAR(GETDATE()), MONTH(u.DateOfBirth), DAY(u.DateOfBirth)) >= CAST(GETDATE() AS DATE)
                 THEN DATEDIFF(DAY, CAST(GETDATE() AS DATE),
                      DATEFROMPARTS(YEAR(GETDATE()), MONTH(u.DateOfBirth), DAY(u.DateOfBirth)))
               ELSE
                 DATEDIFF(DAY, CAST(GETDATE() AS DATE),
                      DATEFROMPARTS(YEAR(GETDATE())+1, MONTH(u.DateOfBirth), DAY(u.DateOfBirth)))
             END AS DaysUntil
      FROM dbo.Users u
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE u.IsActive = 1
        AND u.DateOfBirth IS NOT NULL
        AND u.UserID != ${req.user.userID}
      ORDER BY DaysUntil ASC
    `);
    // HR sees all year (365 days), others see 30 days
    const limit   = isHR ? 365 : 30;
    const upcoming = r.recordset.filter(x => x.DaysUntil > 0 && x.DaysUntil <= limit);
    res.json({ success: true, upcoming, isHR });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/birthday/wish — send a wish ────────────────────
router.post('/wish', async (req, res) => {
  const { toUserID, wishText } = req.body;
  const fromUserID = req.user.userID;
  const wishYear   = new Date().getFullYear();

  if (!toUserID || !wishText?.trim())
    return res.status(400).json({ error: 'toUserID and wishText required' });
  if (parseInt(toUserID) === fromUserID)
    return res.status(400).json({ error: 'Cannot wish yourself' });

  try {
    // Check birthday is today
    const bday = await query(`
      SELECT FullName FROM dbo.Users
      WHERE UserID = ${toUserID} AND IsActive = 1
        AND MONTH(DateOfBirth) = MONTH(GETDATE())
        AND DAY(DateOfBirth)   = DAY(GETDATE())
    `);
    if (!bday.recordset.length)
      return res.status(400).json({ error: "It's not their birthday today!" });

    const birthdayPerson = bday.recordset[0].FullName;

    // Get wisher name
    const wisherR = await query(`SELECT FullName FROM dbo.Users WHERE UserID = ${fromUserID}`);
    const wisherName = wisherR.recordset[0]?.FullName || 'A colleague';

    // Insert wish (ignore duplicate)
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.BirthdayWishes WHERE ToUserID=${toUserID} AND FromUserID=${fromUserID} AND WishYear=${wishYear})
        INSERT INTO dbo.BirthdayWishes (ToUserID, FromUserID, WishText, WishYear)
        VALUES (${toUserID}, ${fromUserID}, N'${wishText.replace(/'/g,"''")}', ${wishYear})
    `);

    // Send notification to birthday person
    await query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.Notifications WHERE UserID=${toUserID} AND Type='birthday_wish'
                     AND RelatedID=${fromUserID} AND CAST(CreatedAt AS DATE)=CAST(GETDATE() AS DATE))
        INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
        VALUES (${toUserID}, N'🎂 Birthday Wish from ${wisherName}!',
                N'${wisherName} wished: ${wishText.replace(/'/g,"''")}', 'birthday_wish', ${fromUserID})
    `);

    res.json({ success: true, message: 'Wish sent!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/birthday/wishes/:userID — get all wishes for a user today ──
router.get('/wishes/:userID', async (req, res) => {
  const year = new Date().getFullYear();
  try {
    const r = await query(`
      SELECT w.WishID, w.WishText, w.CreatedAt,
             u.FullName AS FromName, u.EmployeeCode AS FromCode,
             d.DepartmentName AS FromDept
      FROM dbo.BirthdayWishes w
      JOIN dbo.Users u ON w.FromUserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE w.ToUserID = ${req.params.userID}
        AND w.WishYear = ${year}
      ORDER BY w.CreatedAt DESC
    `);
    res.json({ success: true, wishes: r.recordset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/birthday/my-wishes — logged-in user's wishes ────
router.get('/my-wishes', async (req, res) => {
  const year = new Date().getFullYear();
  try {
    const r = await query(`
      SELECT w.WishID, w.WishText, w.CreatedAt,
             u.FullName AS FromName, u.EmployeeCode AS FromCode,
             d.DepartmentName AS FromDept
      FROM dbo.BirthdayWishes w
      JOIN dbo.Users u ON w.FromUserID = u.UserID
      LEFT JOIN dbo.Departments d ON u.DepartmentID = d.DepartmentID
      WHERE w.ToUserID = ${req.user.userID}
        AND w.WishYear = ${year}
      ORDER BY w.CreatedAt DESC
    `);
    res.json({ success: true, wishes: r.recordset, count: r.recordset.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/birthday/trigger-notifications — called by scheduler ──
router.post('/trigger-notifications', async (req, res) => {
  try {
    // Find today's birthdays not yet notified this year
    const year = new Date().getFullYear();
    const bdays = await query(`
      SELECT u.UserID, u.FullName, u.EmployeeCode,
             DATEDIFF(YEAR, u.DateOfBirth, GETDATE()) AS Age
      FROM dbo.Users u
      WHERE u.IsActive = 1 AND u.DateOfBirth IS NOT NULL
        AND MONTH(u.DateOfBirth) = MONTH(GETDATE())
        AND DAY(u.DateOfBirth)   = DAY(GETDATE())
        AND NOT EXISTS (SELECT 1 FROM dbo.BirthdayNotified bn WHERE bn.UserID=u.UserID AND bn.BirthYear=${year})
    `);

    if (!bdays.recordset.length) return res.json({ success: true, notified: 0 });

    // Get all active employees to notify
    const allUsers = await query(`SELECT UserID FROM dbo.Users WHERE IsActive=1`);

    for (const bday of bdays.recordset) {
      const age = bday.Age;
      const msg = `🎂 Today is ${bday.FullName}'s birthday! Wish them a happy ${age}${age===1?'st':age===2?'nd':age===3?'rd':'th'} birthday!`;

      // Notify ALL employees
      for (const u of allUsers.recordset) {
        if (u.UserID === bday.UserID) {
          // Special message for the birthday person
          await query(`
            INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
            VALUES (${u.UserID}, N'🎂 Happy Birthday!',
                    N'Wishing you a wonderful ${age}${age===1?'st':age===2?'nd':age===3?'rd':'th'} birthday! Your colleagues can send you wishes today.',
                    'birthday_self', ${bday.UserID})
          `);
        } else {
          await query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Notifications WHERE UserID=${u.UserID} AND Type='birthday'
                           AND RelatedID=${bday.UserID} AND CAST(CreatedAt AS DATE)=CAST(GETDATE() AS DATE))
              INSERT INTO dbo.Notifications (UserID, Title, Message, Type, RelatedID)
              VALUES (${u.UserID}, N'🎂 Birthday Alert!', N'${msg.replace(/'/g,"''")}', 'birthday', ${bday.UserID})
          `);
        }
      }

      // Mark as notified for this year
      await query(`
        INSERT INTO dbo.BirthdayNotified (UserID, BirthYear) VALUES (${bday.UserID}, ${year})
      `);
    }

    res.json({ success: true, notified: bdays.recordset.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
