const db = require('../config/db');

async function audit(userId, action, entity, entityId = null) {
  await db.query('INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)', [
    userId, action, entity, entityId,
  ]);
}

module.exports = { audit };
