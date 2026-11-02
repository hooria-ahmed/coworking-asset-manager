const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { notify } = require('../../services/notify');
const { audit } = require('../../services/audit');
const C = require('../../config/constants');
const { fmt, isValidDate, idParam, inTransaction, settleAssetStatus } = require('../requests/rules');
const { checkOverdue } = require('./jobs');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('Admin'));

const A = C.ASSET_STATUS;
const B = C.BORROW_STATUS;

const WAITING = `FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id
  WHERE r.status = 'Approved' AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)`;
const WAITING_COLUMNS = `r.request_id, r.user_id, u.name AS user_name, u.email AS user_email, u.contact_no, r.asset_id,
  a.name AS asset_name, a.asset_tag, a.location, a.status AS asset_status, r.purpose, r.start_date, r.end_date,
  DATEDIFF(r.end_date, r.start_date) + 1 AS duration_days`;

router.get('/to-issue', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${WAITING_COLUMNS}, r.end_date < CURDATE() AS missed ${WAITING} AND r.start_date <= CURDATE()
      ORDER BY r.start_date, r.request_id`
  );
  res.json(rows.map((r) => ({ ...r, missed: Boolean(r.missed) })));
});

router.get('/upcoming', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${WAITING_COLUMNS}, DATEDIFF(r.start_date, CURDATE()) AS days_until ${WAITING} AND r.start_date > CURDATE()
      ORDER BY r.start_date, r.request_id LIMIT 100`
  );
  res.json(rows);
});

router.post('/issue', async (req, res) => {
  const requestId = idParam(req.body?.request_id, 'request');
  const r = await inTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT r.*, u.name AS user_name, a.name AS asset_name, a.status AS asset_status,
              r.start_date > CURDATE() AS too_early, r.end_date < CURDATE() AS ended
         FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id
        WHERE r.request_id = ? FOR UPDATE`,
      [requestId]
    );
    const r = rows[0];
    if (!r) throw new ApiError(404, 'This request does not exist');
    if (r.status !== C.REQUEST_STATUS.APPROVED) throw new ApiError(409, `Only approved requests can be issued; this one is ${r.status}`);
    const [done] = await conn.query('SELECT 1 FROM borrow_records WHERE request_id = ?', [requestId]);
    if (done.length) throw new ApiError(409, 'This asset has already been issued for this request');
    if (r.too_early) throw new ApiError(409, `This booking starts on ${fmt(r.start_date)}; it can be issued from that day`);
    if (r.ended) throw new ApiError(409, 'This booking period has already ended. Cancel it on the Approvals screen.');
    if (r.asset_status === A.BORROWED) throw new ApiError(409, `${r.asset_name} is still on loan to someone else. Record that return first.`);
    if (r.asset_status === A.UNDER_MAINTENANCE || r.asset_status === A.RETIRED) {
      throw new ApiError(409, `${r.asset_name} is ${r.asset_status} and cannot be issued. Cancel the booking instead.`);
    }
    const [result] = await conn.query(
      'INSERT INTO borrow_records (request_id, asset_id, user_id, due_date, status) VALUES (?, ?, ?, ?, ?)',
      [requestId, r.asset_id, r.user_id, r.end_date, B.ACTIVE]
    );
    await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [A.BORROWED, r.asset_id]);
    return { ...r, borrow_id: result.insertId };
  });
  await audit(req.user.user_id, 'issue', 'borrow_record', r.borrow_id);
  await notify(r.user_id, 'asset_issued', `You collected ${r.asset_name}. Please return it by ${fmt(r.end_date)}.`);
  res.status(201).json({ borrow_id: r.borrow_id, due_date: r.end_date, message: `Issued ${r.asset_name} to ${r.user_name}` });
});

const LOAN_COLUMNS = `b.borrow_id, b.request_id, b.user_id, u.name AS user_name, u.email AS user_email, u.contact_no,
  b.asset_id, a.name AS asset_name, a.asset_tag, a.\`condition\` AS asset_condition, b.issued_at, b.due_date, b.status`;
const LOAN_JOINS = 'FROM borrow_records b JOIN users u ON u.user_id = b.user_id JOIN assets a ON a.asset_id = b.asset_id';

router.get('/active', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${LOAN_COLUMNS}, DATEDIFF(b.due_date, CURDATE()) AS days_left ${LOAN_JOINS}
      WHERE b.returned_at IS NULL ORDER BY b.due_date, b.borrow_id`
  );
  res.json(rows);
});

router.get('/overdue', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${LOAN_COLUMNS}, DATEDIFF(CURDATE(), b.due_date) AS days_overdue ${LOAN_JOINS}
      WHERE b.returned_at IS NULL AND (b.status = ? OR b.due_date < CURDATE())
      ORDER BY b.due_date, b.borrow_id`,
    [B.OVERDUE]
  );
  res.json(rows);
});

router.get('/returned', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const [rows] = await db.query(
    `SELECT b.borrow_id, b.request_id, u.name AS user_name, a.name AS asset_name, a.asset_tag, b.issued_at, b.due_date,
            b.returned_at, b.return_condition, GREATEST(0, DATEDIFF(DATE(b.returned_at), b.due_date)) AS late_days
       ${LOAN_JOINS} WHERE b.returned_at IS NOT NULL ORDER BY b.returned_at DESC, b.borrow_id DESC LIMIT ?`,
    [limit]
  );
  res.json(rows);
});

router.patch('/:id/return', async (req, res) => {
  const id = idParam(req.params.id, 'borrowing');
  const condition = req.body?.return_condition;
  if (!C.ASSET_CONDITION.includes(condition)) {
    throw new ApiError(400, `Condition on return must be one of: ${C.ASSET_CONDITION.join(', ')}`);
  }
  const returnDate = req.body?.return_date || null;
  if (returnDate !== null && !isValidDate(returnDate)) throw new ApiError(400, 'Return date must be a real date (YYYY-MM-DD)');
  const notes = String(req.body?.notes ?? '').trim().slice(0, 300);

  const b = await inTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT b.*, u.name AS user_name, a.name AS asset_name, DATE(b.issued_at) AS issued_on,
              ? > CURDATE() AS future
         FROM borrow_records b JOIN users u ON u.user_id = b.user_id JOIN assets a ON a.asset_id = b.asset_id
        WHERE b.borrow_id = ? FOR UPDATE`,
      [returnDate, id]
    );
    const b = rows[0];
    if (!b) throw new ApiError(404, 'This borrowing does not exist');
    if (b.returned_at) throw new ApiError(409, 'This asset has already been returned');
    if (returnDate && returnDate < b.issued_on) throw new ApiError(400, `Return date cannot be before the issue date (${fmt(b.issued_on)})`);
    if (returnDate && b.future) throw new ApiError(400, 'Return date cannot be in the future');
    await conn.query('SELECT asset_id FROM assets WHERE asset_id = ? FOR UPDATE', [b.asset_id]);

    await conn.query(
      `UPDATE borrow_records SET returned_at = ${returnDate ? 'TIMESTAMP(?, CURTIME())' : 'NOW()'}, return_condition = ?, status = ?
        WHERE borrow_id = ?`,
      returnDate ? [returnDate, condition, B.RETURNED, id] : [condition, B.RETURNED, id]
    );
    await conn.query('UPDATE asset_requests SET status = ? WHERE request_id = ?', [C.REQUEST_STATUS.COMPLETED, b.request_id]);
    await conn.query('UPDATE assets SET `condition` = ? WHERE asset_id = ?', [condition, b.asset_id]);

    const [[openRecord]] = await conn.query(
      "SELECT maintenance_id FROM maintenance_logs WHERE asset_id = ? AND status <> 'Closed' LIMIT 1", [b.asset_id]
    );
    let assetStatus;
    if (condition === 'Damaged' || openRecord) {
      assetStatus = A.UNDER_MAINTENANCE;
      await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [assetStatus, b.asset_id]);
      if (!openRecord) {
        await conn.query(
          'INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, status) VALUES (?, ?, ?, ?)',
          [b.asset_id, req.user.user_id, `Returned damaged by ${b.user_name}${notes ? `: ${notes}` : ''}`.slice(0, 500), C.MAINTENANCE_STATUS.OPEN]
        );
      } else if (condition === 'Damaged' || notes) {
        await conn.query(
          "UPDATE maintenance_logs SET notes = CONCAT_WS('\\n', notes, ?) WHERE maintenance_id = ?",
          [`Returned ${condition.toLowerCase()} by ${b.user_name}${notes ? `: ${notes}` : ''}`, openRecord.maintenance_id]
        );
      }
    } else {
      assetStatus = await settleAssetStatus(conn, b.asset_id, b.request_id);
    }
    return { ...b, assetStatus };
  });
  await audit(req.user.user_id, 'return', 'borrow_record', id);
  await notify(b.user_id, 'asset_returned', `Thanks for returning ${b.asset_name}. Your booking is complete.`);
  res.json({
    message: b.assetStatus === A.UNDER_MAINTENANCE
      ? `${b.asset_name} returned ${condition === 'Damaged' ? 'damaged' : 'with a reported problem'} and moved to Maintenance`
      : `${b.asset_name} returned and is now ${b.assetStatus}`,
    asset_status: b.assetStatus,
  });
});

router.post('/check-overdue', async (req, res) => {
  res.json({ marked: await checkOverdue() });
});

module.exports = router;
