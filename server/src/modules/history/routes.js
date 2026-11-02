// Usage History (FR-UH-01 to FR-UH-03)
// Owner: Hooria. Mounted at /api/history in app.js - do not rename this file.
// Read only (FR-UH-03): this file has GET routes and nothing else, so history can never be edited.
const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');

const router = express.Router();
router.use(requireAuth);
const admin = requireRole('Admin');

// FR-UH-02. The logged-in user's own requests and borrowings, newest first.
// Out: { requests: [{ request_id, asset_id, asset_tag, asset_name, category, purpose, start_date, end_date,
//                     status, rejection_reason, created_at, decided_at }],
//        borrowings: [{ borrow_id, request_id, asset_id, asset_tag, asset_name, category, issued_at,
//                      due_date, returned_at, return_condition, status }] }
router.get('/mine', async (req, res) => {
  const [requests] = await db.query(
    `SELECT r.request_id, a.asset_id, a.asset_tag, a.name AS asset_name, c.name AS category,
            r.purpose, r.start_date, r.end_date, r.status, r.rejection_reason, r.created_at, r.decided_at
     FROM asset_requests r
     JOIN assets a ON a.asset_id = r.asset_id
     JOIN categories c ON c.category_id = a.category_id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC, r.request_id DESC`,
    [req.user.user_id],
  );
  const [borrowings] = await db.query(
    `SELECT b.borrow_id, b.request_id, a.asset_id, a.asset_tag, a.name AS asset_name, c.name AS category,
            b.issued_at, b.due_date, b.returned_at, b.return_condition, b.status
     FROM borrow_records b
     JOIN assets a ON a.asset_id = b.asset_id
     JOIN categories c ON c.category_id = a.category_id
     WHERE b.user_id = ?
     ORDER BY b.issued_at DESC, b.borrow_id DESC`,
    [req.user.user_id],
  );
  res.json({ requests, borrowings });
});

// FR-UH-01 (admin only). Everything that happened to one asset.
// Out: { asset: { asset_id, asset_tag, name, category, location, condition, status, image_path },
//        borrowings: [{ borrow_id, user_id, user_name, user_email, issued_at, due_date, returned_at,
//                      return_condition, status }],
//        maintenance: [{ maintenance_id, issue_description, notes, cost, status, outcome, reported_by_name,
//                       reported_at, resolved_at }] }
router.get('/asset/:id', admin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, 'This asset does not exist'); // same answer as other modules
  const [[asset]] = await db.query(
    `SELECT a.asset_id, a.asset_tag, a.name, c.name AS category, a.location, a.\`condition\`, a.status,
            a.image_path
     FROM assets a JOIN categories c ON c.category_id = a.category_id
     WHERE a.asset_id = ?`,
    [id],
  );
  if (!asset) throw new ApiError(404, 'This asset does not exist');
  const [borrowings] = await db.query(
    `SELECT b.borrow_id, u.user_id, u.name AS user_name, u.email AS user_email,
            b.issued_at, b.due_date, b.returned_at, b.return_condition, b.status
     FROM borrow_records b JOIN users u ON u.user_id = b.user_id
     WHERE b.asset_id = ?
     ORDER BY b.issued_at DESC, b.borrow_id DESC`,
    [id],
  );
  const [maintenance] = await db.query(
    `SELECT m.maintenance_id, m.issue_description, m.notes, m.cost, m.status, m.outcome,
            u.name AS reported_by_name, m.reported_at, m.resolved_at
     FROM maintenance_logs m JOIN users u ON u.user_id = m.reported_by
     WHERE m.asset_id = ?
     ORDER BY m.reported_at DESC, m.maintenance_id DESC`,
    [id],
  );
  res.json({
    asset,
    borrowings,
    maintenance: maintenance.map((m) => ({ ...m, cost: Number(m.cost) })),
  });
});

module.exports = router;
