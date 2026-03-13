// backend/utils/seed.js
// Run: node backend/utils/seed.js
require('dotenv').config();
const bcrypt  = require('bcryptjs');
const { query, getPool } = require('../config/db');

const USERS = [
  { email: 'hr@acme.com',    password: 'hr@1234'  },
  { email: 'ravi@acme.com',  password: 'pass123'  },
  { email: 'arjun@acme.com', password: 'pass123'  },
  { email: 'priya@acme.com', password: 'pass123'  },
  { email: 'kiran@acme.com', password: 'pass123'  },
];

(async () => {
  try {
    await getPool();
    console.log('\nSeeding passwords...\n');
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const r = await query(
        'UPDATE dbo.Users SET PasswordHash = @h WHERE Email = @e',
        { h: hash, e: u.email }
      );
      const updated = r.rowsAffected[0];
      if (updated) console.log(`✅  ${u.email}`);
      else         console.log(`⚠️   ${u.email} — not found (run schema.sql first!)`);
    }
    console.log('\n✅  Done! You can now login at http://localhost:3000\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌  Error:', err.message);
    console.error('\n👉  Check your .env DB settings and make sure SQL Server is running.\n');
    process.exit(1);
  }
})();