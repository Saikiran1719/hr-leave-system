// backend/utils/audit.js
const { query } = require('../config/db');

async function logAudit(userID, action, entity, entityID, oldValue, newValue, req) {
  try {
    const ip  = req?.ip || req?.headers?.['x-forwarded-for'] || null;
    const ua  = req?.headers?.['user-agent']?.slice(0,300) || null;
    const old = oldValue ? JSON.stringify(oldValue) : null;
    const nw  = newValue ? JSON.stringify(newValue) : null;
    await query(`
      INSERT INTO dbo.AuditLog (UserID, Action, Entity, EntityID, OldValue, NewValue, IPAddress, UserAgent)
      VALUES (@uid, @act, @ent, @eid, @old, @new, @ip, @ua)
    `, { uid: userID||null, act: action, ent: entity, eid: entityID||null, old, new: nw, ip, ua });
  } catch(e) {
    // Non-blocking — audit failures never break main flow
    console.error('[Audit]', e.message);
  }
}

module.exports = { logAudit };
