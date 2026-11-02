const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { notify } = require('../../services/notify');
const { audit } = require('../../services/audit');
const { isAssetFree } = require('../../services/availability');
const C = require('../../config/constants');
const { fmtRange, idParam, inTransaction, settleAssetStatus } = require('../requests/rules');

const router = express.Router();
router.use(requireAuth);
const admin = requireRole('Admin');
router.use(admin);

const MAX_REASON = 255;
const S = C.REQUEST_STATUS;

const REQUEST_COLUMNS = `r.request_id, r.user_id, u.name AS user_name, u.email AS user_email, r.asset_id, a.name AS asset_name,
  a.asset_tag, a.status AS asset_status, a.location, r.purpose, r.start_date, r.end_date,
  DATEDIFF(r.end_date, r.start_date) + 1 AS duration_days, r.status, r.created_at`;
const REQUEST_JOINS = `FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id`;

router.get('/pending', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${REQUEST_COLUMNS},
            (SELECT COUNT(*) FROM asset_requests o WHERE o.asset_id = r.asset_id AND o.request_id <> r.request_id
                AND o.status = 'Pending' AND o.start_date <= r.end_date AND o.end_date >= r.start_date) AS competing
       ${REQUEST_JOINS} WHERE r.status = ? ORDER BY r.created_at, r.request_id`,
    [S.PENDING]
  );
  for (const r of rows) {
    r.conflict = false;
    r.conflict_reason = null;
    if ([C.ASSET_STATUS.UNDER_MAINTENANCE, C.ASSET_STATUS.RETIRED].includes(r.asset_status)) {
      r.conflict = true;
      r.conflict_reason = `Asset is ${r.asset_status}`;
    } else if (!(await isAssetFree(r.asset_id, r.start_date, r.end_date, r.request_id))) {
      r.conflict = true;
      r.conflict_reason = 'Already booked for overlapping dates';
    }
  }
  res.json(rows);
});

router.get('/approved', async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${REQUEST_COLUMNS}, r.decided_at, d.name AS decided_by_name
       ${REQUEST_JOINS} LEFT JOIN users d ON d.user_id = r.decided_by
      WHERE r.status = ? AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)
      ORDER BY r.start_date, r.request_id`,
    [S.APPROVED]
  );
  res.json(rows);
});

router.get('/history', async (req, res) => {
  const where = ['r.status <> ?'];
  const params = [S.PENDING];
  if (req.query.status && Object.values(S).includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status); }
  if (req.query.search) {
    const k = `%${String(req.query.search).slice(0, 100)}%`;
    where.push('(u.name LIKE ? OR u.email LIKE ? OR a.name LIKE ? OR a.asset_tag LIKE ?)');
    params.push(k, k, k, k);
  }
  const [rows] = await db.query(
    `SELECT ${REQUEST_COLUMNS}, r.rejection_reason, r.decided_at, d.name AS decided_by_name
       ${REQUEST_JOINS} LEFT JOIN users d ON d.user_id = r.decided_by
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(r.decided_at, r.created_at) DESC, r.request_id DESC LIMIT 200`,
    params
  );
  res.json(rows);
});

async function lockRequest(conn, id) {
  const [rows] = await conn.query(
    `SELECT r.*, u.name AS user_name, a.name AS asset_name, a.location, a.status AS asset_status
       FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id
      WHERE r.request_id = ? FOR UPDATE`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, 'This request does not exist');
  await conn.query('SELECT asset_id FROM assets WHERE asset_id = ? FOR UPDATE', [rows[0].asset_id]);
  return rows[0];
}

router.patch('/:id/approve', async (req, res) => {
  const id = idParam(req.params.id, 'request');
  const r = await inTransaction(async (conn) => {
    const r = await lockRequest(conn, id);
    if (r.status !== S.PENDING) throw new ApiError(409, `This request is already ${r.status}`);
    if ([C.ASSET_STATUS.UNDER_MAINTENANCE, C.ASSET_STATUS.RETIRED].includes(r.asset_status)) {
      throw new ApiError(409, `${r.asset_name} is ${r.asset_status}, so it cannot be lent. Reject the request with a reason.`);
    }
    const [[{ ended }]] = await conn.query('SELECT ? < CURDATE() AS ended', [r.end_date]);
    if (ended) throw new ApiError(409, 'The requested dates have already passed. Reject the request instead.');
    if (!(await isAssetFree(r.asset_id, r.start_date, r.end_date, r.request_id, conn))) {
      throw new ApiError(409, `${r.asset_name} is already booked or on loan for overlapping dates`);
    }
    await conn.query(
      'UPDATE asset_requests SET status = ?, decided_by = ?, decided_at = NOW(), rejection_reason = NULL WHERE request_id = ?',
      [S.APPROVED, req.user.user_id, id]
    );
    if (r.asset_status === C.ASSET_STATUS.AVAILABLE) {
      await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [C.ASSET_STATUS.RESERVED, r.asset_id]);
    }
    return r;
  });
  await audit(req.user.user_id, 'approve', 'asset_request', id);
  await notify(r.user_id, 'request_approved',
    `Your request for ${r.asset_name} (${fmtRange(r.start_date, r.end_date)}) was approved. Collect it from ${r.location}.`);
  res.json({ message: `Approved ${r.asset_name} for ${r.user_name}` });
});

router.patch('/:id/reject', async (req, res) => {
  const id = idParam(req.params.id, 'request');
  const reason = String(req.body?.reason ?? '').trim();
  if (!reason) throw new ApiError(400, 'Please give a reason so the member knows why');
  if (reason.length > MAX_REASON) throw new ApiError(400, `Reason can be at most ${MAX_REASON} characters`);
  const r = await inTransaction(async (conn) => {
    const r = await lockRequest(conn, id);
    if (r.status !== S.PENDING) throw new ApiError(409, `This request is already ${r.status}`);
    await conn.query(
      'UPDATE asset_requests SET status = ?, rejection_reason = ?, decided_by = ?, decided_at = NOW() WHERE request_id = ?',
      [S.REJECTED, reason, req.user.user_id, id]
    );
    return r;
  });
  await audit(req.user.user_id, 'reject', 'asset_request', id);
  await notify(r.user_id, 'request_rejected', `Your request for ${r.asset_name} was rejected: ${reason}`.slice(0, 255));
  res.json({ message: `Rejected the request from ${r.user_name}` });
});

router.patch('/:id/cancel', async (req, res) => {
  const id = idParam(req.params.id, 'request');
  const reason = String(req.body?.reason ?? '').trim().slice(0, MAX_REASON) || null;
  const r = await inTransaction(async (conn) => {
    const r = await lockRequest(conn, id);
    if (r.status !== S.APPROVED) throw new ApiError(409, `Only approved bookings can be cancelled; this one is ${r.status}`);
    const [issued] = await conn.query('SELECT 1 FROM borrow_records WHERE request_id = ?', [id]);
    if (issued.length) throw new ApiError(409, 'This asset has already been collected. Record its return instead.');
    await conn.query(
      'UPDATE asset_requests SET status = ?, rejection_reason = ?, decided_by = ?, decided_at = NOW() WHERE request_id = ?',
      [S.CANCELLED, reason, req.user.user_id, id]
    );
    if (r.asset_status === C.ASSET_STATUS.RESERVED) await settleAssetStatus(conn, r.asset_id, id);
    return r;
  });
  await audit(req.user.user_id, 'cancel', 'asset_request', id);
  await notify(r.user_id, 'request_cancelled',
    `Your booking for ${r.asset_name} (${fmtRange(r.start_date, r.end_date)}) was cancelled by an admin${reason ? `: ${reason}` : ''}`.slice(0, 255));
  res.json({ message: `Cancelled the booking of ${r.asset_name} for ${r.user_name}` });
});

module.exports = router;
