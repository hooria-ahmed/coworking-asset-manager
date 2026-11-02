// Maintenance Management (FR-MT-01 to FR-MT-05)
// Owner: Azlaan. Mounted at /api/maintenance in app.js - do not rename this file.
// A record is Open -> In Progress -> Closed (outcome Repaired or Retired). While a record is open the
// asset is Under Maintenance and cannot be lent (NFR-SF-03). Records come from three places:
// an admin (POST /), a member's problem report (POST /report) and a Damaged return (Hamza's borrowing module).
const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { notify, notifyAdmins } = require('../../services/notify');
const { audit } = require('../../services/audit');
const C = require('../../config/constants');
const { idParam, inTransaction, settleAssetStatus } = require('../requests/rules');
const { cancelBookingsForRetired, notifyCancelled } = require('../assets/service');

const router = express.Router();
router.use(requireAuth);
const admin = requireRole('Admin');
const member = requireRole('Member');

const A = C.ASSET_STATUS;
const M = C.MAINTENANCE_STATUS;
const ISSUE_MAX = 500;
const NOTES_MAX = 2000;
const COST_MAX = 99_999_999.99; // DECIMAL(10,2)

function issueText(value) {
  const s = String(value ?? '').trim();
  if (!s) throw new ApiError(400, 'Please describe the problem');
  if (s.length < 5) throw new ApiError(400, 'Please describe the problem in a few words');
  if (s.length > ISSUE_MAX) throw new ApiError(400, `Problem description can be at most ${ISSUE_MAX} characters`);
  return s;
}

function notesText(value) {
  const s = String(value ?? '').trim();
  if (s.length > NOTES_MAX) throw new ApiError(400, `Notes can be at most ${NOTES_MAX} characters`);
  return s || null;
}

// OR-IN-03: cost in PKR with two decimals, 0 or more (FR-MT-03). Only numbers or numeric text
// are accepted (true / [] / {} would otherwise turn into 1 or 0).
function costValue(value) {
  if (value === '' || value === null) return 0;
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value))) {
    throw new ApiError(400, 'Cost must be a number, 0 or more');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Cost must be 0 or more');
  if (n > COST_MAX) throw new ApiError(400, 'Cost is too large');
  return Math.round(n * 100) / 100;
}

// Where a record came from, for the screen: 'report' (member), 'return' (Damaged return) or 'admin'.
const SOURCE_SQL = `CASE WHEN u.role = 'Member' THEN 'report'
  WHEN m.issue_description LIKE 'Returned damaged by %' THEN 'return' ELSE 'admin' END`;

const LIST_SQL = `SELECT m.maintenance_id, m.asset_id, a.name AS asset_name, a.asset_tag, a.status AS asset_status,
    a.\`condition\` AS asset_condition, a.location, c.name AS category, m.issue_description, m.notes, m.cost, m.status, m.outcome,
    m.reported_by, u.name AS reported_by_name, u.role AS reported_by_role, m.reported_at, m.resolved_at,
    ${SOURCE_SQL} AS source,
    DATEDIFF(COALESCE(m.resolved_at, NOW()), m.reported_at) AS days_open,
    (SELECT bu.name FROM borrow_records b JOIN users bu ON bu.user_id = b.user_id
      WHERE b.asset_id = m.asset_id AND b.returned_at IS NULL LIMIT 1) AS borrower_name,
    (SELECT b.due_date FROM borrow_records b WHERE b.asset_id = m.asset_id AND b.returned_at IS NULL LIMIT 1) AS borrower_due
  FROM maintenance_logs m JOIN assets a ON a.asset_id = m.asset_id JOIN categories c ON c.category_id = a.category_id
  JOIN users u ON u.user_id = m.reported_by`;

const shape = (r) => ({ ...r, cost: Number(r.cost) });

// FR-MT-01. query: status? (Open | In Progress | Closed | active = Open + In Progress), asset_id?, search?
// Out: [{ maintenance_id, asset_id, asset_name, asset_tag, asset_status, asset_condition, location, category,
//   issue_description, notes, cost, status, outcome, reported_by_name, reported_by_role, reported_at, resolved_at,
//   source, days_open, borrower_name, borrower_due }]  (open ones first, newest first, max 300)
router.get('/', admin, async (req, res) => {
  const where = [];
  const params = [];
  const { status, asset_id: assetId, search } = req.query;
  if (status === 'active') where.push("m.status <> 'Closed'");
  else if (status) {
    if (!Object.values(M).includes(status)) throw new ApiError(400, 'Unknown status filter');
    where.push('m.status = ?'); params.push(status);
  }
  if (assetId) { where.push('m.asset_id = ?'); params.push(Number(assetId) || 0); }
  const s = String(search ?? '').trim().slice(0, 100);
  if (s) {
    where.push('(a.name LIKE ? OR a.asset_tag LIKE ? OR m.issue_description LIKE ? OR u.name LIKE ?)');
    const like = `%${s.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await db.query(
    `${LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.status = 'Closed', FIELD(m.status, 'Open', 'In Progress', 'Closed'), COALESCE(m.resolved_at, m.reported_at) DESC, m.maintenance_id DESC
      LIMIT 300`,
    params
  );
  res.json(rows.map(shape));
});

// FR-MT-05. The member's own problem reports. Out: [{ maintenance_id, asset_id, asset_name, asset_tag,
//   issue_description, status, outcome, reported_at, resolved_at }]  (newest first)
router.get('/mine', async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.maintenance_id, m.asset_id, a.name AS asset_name, a.asset_tag, m.issue_description, m.status, m.outcome,
            m.reported_at, m.resolved_at
       FROM maintenance_logs m JOIN assets a ON a.asset_id = m.asset_id
      WHERE m.reported_by = ? ORDER BY m.reported_at DESC, m.maintenance_id DESC LIMIT 100`,
    [req.user.user_id]
  );
  res.json(rows);
});

// FR-MT-01, 02. In: { asset_id, issue_description, notes?, cost? }  Out: 201 { maintenance_id, message }
// The asset becomes Under Maintenance. Refused if it is on loan, retired, or already has an open record.
router.post('/', admin, async (req, res) => {
  const assetId = idParam(req.body?.asset_id, 'asset');
  const issue = issueText(req.body?.issue_description);
  const notes = notesText(req.body?.notes);
  const cost = req.body?.cost === undefined ? 0 : costValue(req.body.cost);
  const r = await inTransaction(async (conn) => {
    const [[asset]] = await conn.query('SELECT asset_id, name, status FROM assets WHERE asset_id = ? FOR UPDATE', [assetId]);
    if (!asset) throw new ApiError(404, 'This asset does not exist');
    if (asset.status === A.BORROWED) {
      throw new ApiError(409, `${asset.name} is on loan. Record its return first (a Damaged return opens a maintenance record by itself)`);
    }
    if (asset.status === A.RETIRED) throw new ApiError(409, `${asset.name} is retired`);
    const [[open]] = await conn.query("SELECT maintenance_id FROM maintenance_logs WHERE asset_id = ? AND status <> 'Closed' LIMIT 1", [assetId]);
    if (open) throw new ApiError(409, `${asset.name} already has an open maintenance record (#${open.maintenance_id})`);
    const [[waiting]] = await conn.query(
      `SELECT COUNT(*) AS n FROM asset_requests r WHERE r.asset_id = ? AND r.status = 'Approved' AND r.end_date >= CURDATE()
          AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)`,
      [assetId]
    );
    const [result] = await conn.query(
      'INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, notes, cost, status) VALUES (?, ?, ?, ?, ?, ?)',
      [assetId, req.user.user_id, issue, notes, cost, M.OPEN]
    );
    await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [A.UNDER_MAINTENANCE, assetId]); // FR-MT-02
    return { id: result.insertId, asset, waiting: Number(waiting.n) };
  });
  await audit(req.user.user_id, 'create', 'maintenance', r.id);
  res.status(201).json({
    maintenance_id: r.id,
    message: r.waiting
      ? `${r.asset.name} is now Under Maintenance. It has ${r.waiting} approved booking(s) waiting: repair it in time or cancel them in Approvals`
      : `${r.asset.name} is now Under Maintenance`,
  });
});

// FR-MT-03. In: { notes?, cost?, status?: "In Progress" }  Out: { message }
router.patch('/:id', admin, async (req, res) => {
  const id = idParam(req.params.id, 'maintenance record');
  const sets = [];
  const params = [];
  const b = req.body || {};
  if (b.notes !== undefined) { sets.push('notes = ?'); params.push(notesText(b.notes)); }
  if (b.cost !== undefined) { sets.push('cost = ?'); params.push(costValue(b.cost)); }
  if (b.issue_description !== undefined) { sets.push('issue_description = ?'); params.push(issueText(b.issue_description)); }
  if (b.status !== undefined && b.status !== M.OPEN) {
    if (b.status !== M.IN_PROGRESS) throw new ApiError(400, 'Status can only be set to In Progress here. Use Close to finish the record');
    sets.push('status = ?'); params.push(M.IN_PROGRESS);
  }
  if (!sets.length) throw new ApiError(400, 'Nothing to change');
  const [[rec]] = await db.query('SELECT status FROM maintenance_logs WHERE maintenance_id = ?', [id]);
  if (!rec) throw new ApiError(404, 'This maintenance record does not exist');
  if (rec.status === M.CLOSED) throw new ApiError(409, 'This record is closed and can no longer be changed');
  if (b.status === M.OPEN && rec.status === M.IN_PROGRESS) throw new ApiError(409, 'Work has already started on this record');
  await db.query(`UPDATE maintenance_logs SET ${sets.join(', ')} WHERE maintenance_id = ?`, [...params, id]);
  await audit(req.user.user_id, 'update', 'maintenance', id);
  res.json({ message: b.status === M.IN_PROGRESS && rec.status === M.OPEN ? 'Work started' : 'Maintenance record saved' });
});

// FR-MT-04. In: { outcome: "Repaired" | "Retired", notes?, cost?, condition? }  Out: { message, asset_status }
// One transaction (NFR-SF-02): the record is Closed with resolved_at, and the asset becomes
// Available (Reserved if a booking waits) or Retired. A repaired asset that was Damaged becomes Good
// unless another condition is sent. Retiring cancels the asset's waiting requests.
// If a member reported a problem and still has the asset, Repaired leaves it with them (Borrowed).
router.patch('/:id/close', admin, async (req, res) => {
  const id = idParam(req.params.id, 'maintenance record');
  const outcome = req.body?.outcome;
  if (outcome !== 'Repaired' && outcome !== 'Retired') throw new ApiError(400, 'Outcome must be Repaired or Retired');
  const notes = req.body?.notes !== undefined ? notesText(req.body.notes) : undefined;
  const cost = req.body?.cost !== undefined ? costValue(req.body.cost) : undefined;
  const condition = req.body?.condition;
  if (condition !== undefined && !C.ASSET_CONDITION.includes(condition)) {
    throw new ApiError(400, `Condition must be one of: ${C.ASSET_CONDITION.join(', ')}`);
  }

  const r = await inTransaction(async (conn) => {
    const [[rec]] = await conn.query(
      `SELECT m.*, u.role AS reporter_role FROM maintenance_logs m JOIN users u ON u.user_id = m.reported_by
        WHERE m.maintenance_id = ? FOR UPDATE`,
      [id]
    );
    if (!rec) throw new ApiError(404, 'This maintenance record does not exist');
    if (rec.status === M.CLOSED) throw new ApiError(409, 'This record is already closed');
    const [[asset]] = await conn.query('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [rec.asset_id]);

    let assetStatus = asset.status;
    let cancelled = [];
    if (outcome === 'Retired') {
      if (asset.status === A.BORROWED) throw new ApiError(409, `${asset.name} is still on loan. Record its return before retiring it`);
      cancelled = await cancelBookingsForRetired(conn, asset.asset_id);
      assetStatus = A.RETIRED;
      await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [assetStatus, asset.asset_id]);
    } else {
      const nextCondition = condition || (asset.condition === 'Damaged' ? 'Good' : asset.condition);
      await conn.query('UPDATE assets SET `condition` = ? WHERE asset_id = ?', [nextCondition, asset.asset_id]);
      if (asset.status === A.UNDER_MAINTENANCE) assetStatus = await settleAssetStatus(conn, asset.asset_id);
    }
    await conn.query(
      `UPDATE maintenance_logs SET status = ?, outcome = ?, resolved_at = NOW()
         ${notes !== undefined ? ', notes = ?' : ''}${cost !== undefined ? ', cost = ?' : ''}
        WHERE maintenance_id = ?`,
      [M.CLOSED, outcome, ...(notes !== undefined ? [notes] : []), ...(cost !== undefined ? [cost] : []), id]
    );
    return { rec, asset, assetStatus, cancelled };
  });

  await audit(req.user.user_id, outcome === 'Retired' ? 'retire' : 'close', 'maintenance', id);
  await notifyCancelled(r.cancelled);
  if (r.rec.reporter_role === C.ROLE.MEMBER) {
    await notify(r.rec.reported_by, 'problem_resolved',
      outcome === 'Repaired'
        ? `The problem you reported with ${r.asset.name} was fixed. Thank you!`
        : `${r.asset.name}, which you reported, could not be repaired and was retired. Thank you for telling us.`);
  }
  const messages = {
    [A.AVAILABLE]: `${r.asset.name} repaired and Available again`,
    [A.RESERVED]: `${r.asset.name} repaired and Reserved for the next booking`,
    [A.BORROWED]: `Record closed. ${r.asset.name} stays with the borrower`,
    [A.RETIRED]: `${r.asset.name} retired${r.cancelled.length ? ` and ${r.cancelled.length} waiting request(s) were cancelled` : ''}`,
  };
  res.json({ message: messages[r.assetStatus] || 'Record closed', asset_status: r.assetStatus });
});

// FR-MT-05, FR-NT-02. In: { asset_id, issue_description }  Out: 201 { maintenance_id, message }
// Only for an asset the member is borrowing now. Creates an Open record for an admin to review and
// notifies the admins. The asset stays Borrowed; when it is returned it goes to Maintenance, not back
// on the shelf, because its record is still open (NFR-SF-03).
// Runs with the asset row locked, so pressing Send twice cannot open two records.
router.post('/report', member, async (req, res) => {
  const assetId = idParam(req.body?.asset_id, 'asset');
  const issue = issueText(req.body?.issue_description);
  const r = await inTransaction(async (conn) => {
    await conn.query('SELECT asset_id FROM assets WHERE asset_id = ? FOR UPDATE', [assetId]);
    const [[loan]] = await conn.query(
      `SELECT b.borrow_id, a.name AS asset_name, a.asset_tag, u.name AS user_name
         FROM borrow_records b JOIN assets a ON a.asset_id = b.asset_id JOIN users u ON u.user_id = b.user_id
        WHERE b.asset_id = ? AND b.user_id = ? AND b.returned_at IS NULL LIMIT 1`,
      [assetId, req.user.user_id]
    );
    if (!loan) throw new ApiError(403, 'You can only report a problem with an asset you are borrowing now');
    const [[open]] = await conn.query("SELECT maintenance_id FROM maintenance_logs WHERE asset_id = ? AND status <> 'Closed' LIMIT 1", [assetId]);
    if (open) throw new ApiError(409, `A problem with ${loan.asset_name} has already been reported and is being looked at`);
    const [result] = await conn.query(
      'INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, status) VALUES (?, ?, ?, ?)',
      [assetId, req.user.user_id, issue, M.OPEN]
    );
    return { id: result.insertId, loan };
  });
  await notifyAdmins('problem_report', `${r.loan.user_name} reported a problem with ${r.loan.asset_name} (${r.loan.asset_tag}): ${issue}`);
  res.status(201).json({
    maintenance_id: r.id,
    message: `Thanks, the team has been told about ${r.loan.asset_name}. Please return it at the front desk as usual`,
  });
});

module.exports = router;
