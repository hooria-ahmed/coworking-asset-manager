const db = require('../../config/db');
const { notify } = require('../../services/notify');
const { OVERDUE_CHECK_INTERVAL_MS, BORROW_STATUS } = require('../../config/constants');

async function checkOverdue() {
  const [late] = await db.query(
    `SELECT b.borrow_id, b.user_id, b.due_date, a.name AS asset_name
       FROM borrow_records b JOIN assets a ON a.asset_id = b.asset_id
      WHERE b.status = ? AND b.returned_at IS NULL AND b.due_date < CURDATE()`,
    [BORROW_STATUS.ACTIVE]
  );
  let marked = 0;
  for (const b of late) {
    const [result] = await db.query('UPDATE borrow_records SET status = ? WHERE borrow_id = ? AND status = ?', [
      BORROW_STATUS.OVERDUE, b.borrow_id, BORROW_STATUS.ACTIVE,
    ]);
    if (!result.affectedRows) continue;
    marked += 1;
    const due = new Date(`${b.due_date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    await notify(b.user_id, 'overdue', `${b.asset_name} was due back on ${due}. Please return it to the front desk as soon as possible.`);
  }
  return marked;
}

function start() {
  const run = () => checkOverdue().catch(console.error);
  run();
  setInterval(run, OVERDUE_CHECK_INTERVAL_MS);
}

module.exports = { start, checkOverdue };
