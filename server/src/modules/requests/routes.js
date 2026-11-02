// Asset Request (FR-RQ-01 to FR-RQ-06)
// Owner: Hamza. Mounted at /api/requests in app.js - do not rename this file.
// A member asks for an asset for 1-30 days; the request waits as Pending until an
// admin decides (approvals/). Status rules live in ./rules.js (SRS Figure 3.4).
// An asset that is Reserved or Borrowed can still be requested for dates when it is free
// (otherwise one booking weeks away would block everyone until then); only assets that are
// Under Maintenance or Retired cannot be requested.
const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError, requireFields } = require('../../utils/http');
const { notifyAdmins } = require('../../services/notify');
const { isAssetFree, getBookedPeriods } = require('../../services/availability');
const C = require('../../config/constants');
const { isValidDate, addDays, fmtRange, today, idParam, inTransaction } = require('./rules');

const router = express.Router();
router.use(requireAuth);
const member = requireRole('Member');

const MAX_PURPOSE = 255;
const NOT_LENDABLE = [C.ASSET_STATUS.UNDER_MAINTENANCE, C.ASSET_STATUS.RETIRED];
const requestable = (status) => !NOT_LENDABLE.includes(status); // FR-RQ-01

// For the request form: the asset, whether it can be requested and when it is already taken.
// In: -  Out: { asset: { asset_id, asset_tag, name, category, location, condition, status, description, image_path },
//              can_request, booked: [{ start_date, end_date, kind }], today, min_days, max_days }
router.get('/asset/:assetId', async (req, res) => {
  const id = idParam(req.params.assetId, 'asset');
  const [rows] = await db.query(
    `SELECT a.asset_id, a.asset_tag, a.name, c.name AS category, a.location, a.\`condition\`, a.status,
            a.description, a.image_path
       FROM assets a JOIN categories c ON c.category_id = a.category_id WHERE a.asset_id = ?`,
    [id]
  );
  const asset = rows[0];
  if (!asset || (asset.status === C.ASSET_STATUS.RETIRED && req.user.role !== C.ROLE.ADMIN)) {
    throw new ApiError(404, 'This asset does not exist');
  }
  res.json({
    asset,
    can_request: requestable(asset.status), // FR-RQ-01 (free dates are checked when the form is sent)
    booked: await getBookedPeriods(id),
    today: await today(),
    min_days: C.MIN_BORROW_DAYS,
    max_days: C.MAX_BORROW_DAYS,
  });
});

// FR-RQ-02, 03, 04. In: { asset_id, purpose, start_date: "YYYY-MM-DD", duration_days: 1-30 }
// Out: { request_id, status: "Pending", start_date, end_date }
router.post('/', member, async (req, res) => {
  requireFields(req.body, ['asset_id', 'purpose', 'start_date', 'duration_days']);
  const assetId = Number(req.body.asset_id);
  const purpose = String(req.body.purpose).trim();
  const start = String(req.body.start_date);
  const days = Number(req.body.duration_days);

  if (!Number.isInteger(assetId) || assetId <= 0) throw new ApiError(400, 'Please choose an asset');
  if (!purpose) throw new ApiError(400, 'Please say what you need the asset for');
  if (purpose.length > MAX_PURPOSE) throw new ApiError(400, `Purpose can be at most ${MAX_PURPOSE} characters`);
  if (!isValidDate(start)) throw new ApiError(400, 'Start date must be a real date (YYYY-MM-DD)');
  if (!Number.isInteger(days) || days < C.MIN_BORROW_DAYS || days > C.MAX_BORROW_DAYS) {
    throw new ApiError(400, `Duration must be between ${C.MIN_BORROW_DAYS} and ${C.MAX_BORROW_DAYS} days`);
  }
  if (start < (await today())) throw new ApiError(400, 'Start date cannot be in the past'); // FR-RQ-03
  const end = addDays(start, days - 1);

  const [[me]] = await db.query('SELECT name, account_status FROM users WHERE user_id = ?', [req.user.user_id]);
  if (!me || me.account_status !== C.ACCOUNT_STATUS.ACTIVE) throw new ApiError(403, 'This account has been deactivated');

  // The checks and the insert run in one transaction with the asset row locked, so a double-click
  // (or two tabs) cannot create the same request twice.
  const { requestId, asset } = await inTransaction(async (conn) => {
    const [assets] = await conn.query('SELECT asset_id, name, status FROM assets WHERE asset_id = ? FOR UPDATE', [assetId]);
    const asset = assets[0];
    if (!asset || asset.status === C.ASSET_STATUS.RETIRED) throw new ApiError(404, 'This asset does not exist');
    if (!requestable(asset.status)) { // FR-RQ-01
      throw new ApiError(409, `${asset.name} is ${asset.status} right now and cannot be requested. Try a similar asset.`);
    }
    if (!(await isAssetFree(assetId, start, end, null, conn))) {
      throw new ApiError(409, `${asset.name} is already booked for some of those dates. Pick other dates.`);
    }
    const [mine] = await conn.query(
      `SELECT 1 FROM asset_requests WHERE user_id = ? AND asset_id = ? AND status IN ('Pending','Approved')
          AND start_date <= ? AND end_date >= ? LIMIT 1`,
      [req.user.user_id, assetId, end, start]
    );
    if (mine.length) throw new ApiError(409, `You already have a request for ${asset.name} on these dates`);

    const [result] = await conn.query(
      'INSERT INTO asset_requests (user_id, asset_id, purpose, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.user_id, assetId, purpose, start, end, C.REQUEST_STATUS.PENDING]
    );
    return { requestId: result.insertId, asset };
  });
  await notifyAdmins('new_request', `${me.name} requested ${asset.name} for ${fmtRange(start, end)}`); // FR-RQ-04, FR-NT-02
  res.status(201).json({ request_id: requestId, status: C.REQUEST_STATUS.PENDING, start_date: start, end_date: end });
});

// FR-RQ-06. The logged-in user's own requests, newest first (NFR-SC-04).
// Out: [{ request_id, asset_id, asset_name, asset_tag, category, location, purpose, start_date, end_date, duration_days,
//         status, rejection_reason, created_at, decided_at, borrow_status, issued_at, due_date, returned_at }]
router.get('/mine', async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.request_id, r.asset_id, a.name AS asset_name, a.asset_tag, c.name AS category, a.location,
            r.purpose, r.start_date, r.end_date, DATEDIFF(r.end_date, r.start_date) + 1 AS duration_days,
            r.status, r.rejection_reason, r.created_at, r.decided_at,
            b.status AS borrow_status, b.issued_at, b.due_date, b.returned_at
       FROM asset_requests r
       JOIN assets a ON a.asset_id = r.asset_id
       JOIN categories c ON c.category_id = a.category_id
       LEFT JOIN borrow_records b ON b.request_id = r.request_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC, r.request_id DESC`,
    [req.user.user_id]
  );
  res.json(rows);
});

// FR-RQ-05. Cancel your own request while it is Pending.  Out: { message }
router.patch('/:id/cancel', member, async (req, res) => {
  const id = idParam(req.params.id, 'request');
  const [rows] = await db.query(
    `SELECT r.status, a.name AS asset_name FROM asset_requests r JOIN assets a ON a.asset_id = r.asset_id
      WHERE r.request_id = ? AND r.user_id = ?`,
    [id, req.user.user_id]
  );
  const request = rows[0];
  if (!request) throw new ApiError(404, 'This request does not exist'); // someone else's looks the same (NFR-SC-04)
  if (request.status !== C.REQUEST_STATUS.PENDING) {
    throw new ApiError(409, `Only pending requests can be cancelled; this one is ${request.status}`);
  }
  const [result] = await db.query(
    'UPDATE asset_requests SET status = ? WHERE request_id = ? AND status = ?',
    [C.REQUEST_STATUS.CANCELLED, id, C.REQUEST_STATUS.PENDING]
  );
  if (!result.affectedRows) throw new ApiError(409, 'This request was just decided by an admin. Refresh the page.');
  res.json({ message: `Your request for ${request.asset_name} was cancelled` });
});

module.exports = router;
