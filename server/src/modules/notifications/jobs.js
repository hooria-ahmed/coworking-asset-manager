const db = require('../../config/db');
const { notify } = require('../../services/notify');
const {
  OVERDUE_CHECK_INTERVAL_MS,
  DUE_REMINDER_LEAD_DAYS,
  BORROW_STATUS,
} = require('../../config/constants');

const reminderText = (assetName) =>
  `Reminder: ${assetName} is due back tomorrow. Please return it to the front desk.`;

async function sendDueReminders() {
  const [loans] = await db.query(
    `SELECT b.borrow_id, b.user_id, a.name AS asset_name
     FROM borrow_records b JOIN assets a ON a.asset_id = b.asset_id
     WHERE b.status = ? AND b.returned_at IS NULL
       AND b.due_date = CURDATE() + INTERVAL ? DAY`,
    [BORROW_STATUS.ACTIVE, DUE_REMINDER_LEAD_DAYS],
  );
  let sent = 0;
  for (const b of loans) {
    const message = reminderText(b.asset_name);
    const [[already]] = await db.query(
      `SELECT COUNT(*) AS n FROM notifications
       WHERE user_id = ? AND type = 'due_reminder' AND message = ? AND created_at >= CURDATE()`,
      [b.user_id, message],
    );
    if (already.n > 0) continue;
    await notify(b.user_id, 'due_reminder', message);
    sent += 1;
  }
  return sent;
}

function start() {
  const run = () => sendDueReminders().catch(console.error);
  run();
  setInterval(run, OVERDUE_CHECK_INTERVAL_MS);
}

module.exports = { start, sendDueReminders };
