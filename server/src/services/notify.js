// Shared service: create an in-app notification (FR-NT-01, FR-NT-02).
// Owner: Hooria (Notifications). Anyone may CALL it; only the owner changes it.
//   const { notify, notifyAdmins } = require('../../services/notify');
//   await notify(userId, 'request_approved', 'Your request for Dell XPS 15 was approved');
const db = require('../config/db');

const MAX_MESSAGE = 255; // notifications.message is VARCHAR(255)

// Long asset names / locations must never make the insert fail: it usually runs right after
// a committed change, so a failure here would report an error for something that succeeded.
function fit(message) {
  const s = String(message ?? '');
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 3)}...` : s;
}

async function notify(userId, type, message) {
  await db.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [userId, type, fit(message)]);
}

async function notifyAdmins(type, message) {
  const [admins] = await db.query("SELECT user_id FROM users WHERE role = 'Admin' AND account_status = 'Active'");
  await Promise.all(admins.map((a) => notify(a.user_id, type, message)));
}

module.exports = { notify, notifyAdmins };
