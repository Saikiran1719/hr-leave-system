// backend/server.js
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const { getPool } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts. Try later.' } }));

// ── Static files ───────────────────────────────────────────
// uploads folder stays at HR-LEAVE-SYSTEM/uploads (root level)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Frontend is now inside backend/frontend/
app.use(express.static(path.join(__dirname, 'frontend')));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/leaves',     require('./routes/leaves'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/birthdays',  require('./routes/birthdays'));
app.use('/api/notices',    require('./routes/notices'));
app.use('/api/encashment', require('./routes/encashment'));
app.use('/api/audit',      require('./routes/audit'));
app.use('/api/payslip',    require('./routes/payslip'));
app.use('/api/shifts',     require('./routes/shifts'));
app.use('/api/assets',     require('./routes/assets'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/exit',       require('./routes/exit'));
app.use('/api/face',       require('./routes/face'));

// ── Serve frontend SPA (catch-all) ─────────────────────────
// MUST be after all /api routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'API route not found' });
  } else {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  }
});

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────
(async () => {
  try {
    await getPool();
    app.listen(PORT, () => {
      console.log(`\n🚀  HRnova Server  →  http://localhost:${PORT}`);
      console.log(`🗄️   DB            →  ${process.env.DB_NAME} @ ${process.env.DB_SERVER}`);
      console.log(`📁  Frontend       →  ${path.join(__dirname, 'frontend')}\n`);
      scheduleBirthdayCheck();
    });
  } catch (err) {
    console.error('❌  Startup failed:', err.message);
    process.exit(1);
  }
})();

// ── Birthday Scheduler — checks at 9 AM every day ─────────
function scheduleBirthdayCheck() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next - now;

  setTimeout(async () => {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/birthdays/trigger-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': 'Bearer internal-scheduler' }
      });
      console.log('[Birthday] Scheduler ran →', await res.json());
    } catch (e) {
      console.error('[Birthday] Scheduler error:', e.message);
    }
    scheduleBirthdayCheck();
  }, msUntil);

  const hh = String(next.getHours()).padStart(2,'0');
  const mm = String(next.getMinutes()).padStart(2,'0');
  console.log(`[Birthday] Next check at ${next.toDateString()} ${hh}:${mm}`);
}
