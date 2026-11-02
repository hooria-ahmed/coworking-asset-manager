// Manage Users (FR-AU-06, FR-AU-08)
// Owner: Hamza. Mounted at /api/users in app.js - do not rename this file.
// Password hashes never leave the server (NFR-SC-02). Users are never deleted, only deactivated (NFR-SF-05).
const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { notify } = require('../../services/notify');
const { audit } = require('../../services/audit');
const C = require('../../config/constants');
const { idParam, inTransaction, settleAssetStatus } = require('../requests/rules');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('Admin'));

// FR-AU-08. query: search? (name or email), role?, status?
// Out: [{ user_id, name, email, contact_no, role, account_status, created_at, active_loans, overdue_loans, pending_requests, total_borrowings }]
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.search) {
    const k = `%${String(req.query.search).slice(0, 100).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    params.push(k, k);
  }
  if (Object.values(C.ROLE).includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
  if (Object.values(C.ACCOUNT_STATUS).includes(req.query.status)) { where.push('u.account_status = ?'); params.push(req.query.status); }
  const [rows] = await db.query(
    `SELECT u.user_id, u.name, u.email, u.contact_no, u.role, u.account_status, u.created_at,
            (SELECT COUNT(*) FROM borrow_records b WHERE b.user_id = u.user_id AND b.returned_at IS NULL) AS active_loans,
            (SELECT COUNT(*) FROM borrow_records b WHERE b.user_id = u.user_id AND b.returned_at IS NULL
                AND (b.status = 'Overdue' OR b.due_date < CURDATE())) AS overdue_loans,
            (SELECT COUNT(*) FROM asset_requests r WHERE r.user_id = u.user_id AND r.status = 'Pending') AS pending_requests,
            (SELECT COUNT(*) FROM borrow_records b WHERE b.user_id = u.user_id) AS total_borrowings
       FROM users u ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.role, u.name`,
    params
  );
  res.json(rows);
});

// FR-AU-08. In: { account_status: "Active" | "Deactivated" }  Out: { message, cancelled_requests }
// Only member accounts can be changed, and never your own. Deactivating also cancels the member's
// pending requests and approved bookings not collected yet (so nothing can be issued to them);
// assets they still hold stay on loan until the admin records the return.
router.patch('/:id/status', async (req, res) => {
  const id = idParam(req.params.id, 'user');
  const next = req.body?.account_status;
  if (!Object.values(C.ACCOUNT_STATUS).includes(next)) throw new ApiError(400, 'Status must be Active or Deactivated');
  if (id === req.user.user_id) throw new ApiError(409, 'You cannot change your own account status');
  const [rows] = await db.query('SELECT user_id, name, role, account_status FROM users WHERE user_id = ?', [id]);
  const user = rows[0];
  if (!user) throw new ApiError(404, 'This user does not exist');
  if (user.role !== C.ROLE.MEMBER) throw new ApiError(409, 'Only member accounts can be activated or deactivated here');
  if (user.account_status === next) {
    return res.json({ message: `${user.name} is already ${next}`, cancelled_requests: 0 });
  }

  const cancelled = await inTransaction(async (conn) => {
    let count = 0;
    if (next === C.ACCOUNT_STATUS.DEACTIVATED) {
      const [open] = await conn.query(
        `SELECT r.request_id, r.asset_id, r.status, a.status AS asset_status
           FROM asset_requests r JOIN assets a ON a.asset_id = r.asset_id
          WHERE r.user_id = ? AND (r.status = 'Pending'
             OR (r.status = 'Approved' AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)))
          FOR UPDATE`,
        [id]
      );
      if (open.length) {
        await conn.query(
          "UPDATE asset_requests SET status = 'Cancelled', rejection_reason = 'Account deactivated', decided_at = COALESCE(decided_at, NOW()) WHERE request_id IN (?)",
          [open.map((r) => r.request_id)]
        );
        // A Reserved asset whose booking was cancelled goes back to Available (or stays Reserved for another booking).
        const reserved = [...new Set(open.filter((r) => r.status === 'Approved' && r.asset_status === C.ASSET_STATUS.RESERVED).map((r) => r.asset_id))];
        for (const assetId of reserved) await settleAssetStatus(conn, assetId);
      }
      count = open.length;
    }
    // Reactivating also clears any login lock-out.
    await conn.query(
      `UPDATE users SET account_status = ?${next === C.ACCOUNT_STATUS.ACTIVE ? ', failed_logins = 0, locked_until = NULL' : ''} WHERE user_id = ?`,
      [next, id]
    );
    return count;
  });
  await audit(req.user.user_id, next === C.ACCOUNT_STATUS.ACTIVE ? 'activate' : 'deactivate', 'user', id);
  if (next === C.ACCOUNT_STATUS.ACTIVE) await notify(id, 'account_reactivated', 'Your account was reactivated. Welcome back!');
  res.json({
    message: next === C.ACCOUNT_STATUS.ACTIVE
      ? `${user.name} can log in again`
      : `${user.name} was deactivated${cancelled ? ` and ${cancelled} open request${cancelled === 1 ? ' was' : 's were'} cancelled` : ''}`,
    cancelled_requests: cancelled,
  });
});

module.exports = router;
