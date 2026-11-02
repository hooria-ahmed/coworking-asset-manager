// Asset Management + Search and Details (FR-AM-01 to FR-AM-06, FR-AS-01 to FR-AS-05)
// Owner: Azlaan. Mounted at /api/assets in app.js - do not rename this file.
// Status changes follow SRS Figure 3.3: an admin can only add an asset or retire an Available one here.
// Reserved / Borrowed come from bookings (Hamza) and Under Maintenance from the Maintenance screen.
const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError, requireFields } = require('../../utils/http');
const { audit } = require('../../services/audit');
const { getBookedPeriods } = require('../../services/availability');
const C = require('../../config/constants');
const { idParam, inTransaction } = require('../requests/rules');
const {
  UPLOAD_DIR, saveImage, removeImageFile, cancelBookingsForRetired, notifyCancelled,
} = require('./service');

const router = express.Router();
const A = C.ASSET_STATUS;

// Asset pictures are public files (an <img> tag cannot send a login token). Names are random.
router.use('/images', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

router.use(requireAuth);
const admin = requireRole('Admin');
const isAdmin = (req) => req.user.role === C.ROLE.ADMIN;

const LIMITS = { asset_tag: 30, name: 100, location: 100, description: 2000, search: 100 };
const STATUSES = Object.values(A);
// Statuses an admin may give a new asset. Reserved and Borrowed only come from bookings.
const CREATE_STATUSES = [A.AVAILABLE, A.UNDER_MAINTENANCE, A.RETIRED];
// A member may request an asset for free dates unless it cannot be lent at all (FR-RQ-01).
const REQUESTABLE = [A.AVAILABLE, A.RESERVED, A.BORROWED];

const COLUMNS = `a.asset_id, a.asset_tag, a.name, a.category_id, c.name AS category, a.location, a.\`condition\`, a.status,
  a.description, a.image_path, a.created_at, a.updated_at,
  (SELECT MIN(b.due_date) FROM borrow_records b WHERE b.asset_id = a.asset_id AND b.returned_at IS NULL) AS due_back,
  (SELECT MIN(r.start_date) FROM asset_requests r WHERE r.asset_id = a.asset_id AND r.status = 'Approved' AND r.end_date >= CURDATE()
     AND NOT EXISTS (SELECT 1 FROM borrow_records b2 WHERE b2.request_id = r.request_id)) AS next_booking`;
const FROM = 'FROM assets a JOIN categories c ON c.category_id = a.category_id';

function text(value, field, label, { required = true } = {}) {
  const s = String(value ?? '').trim();
  if (required && !s) throw new ApiError(400, `${label} is required`);
  if (s.length > LIMITS[field]) throw new ApiError(400, `${label} can be at most ${LIMITS[field]} characters`);
  return s;
}

// Checks the form fields (FR-AM-01, 03, 04). partial = only check the fields that were sent (PUT).
async function readAssetBody(body = {}, { partial = false } = {}) {
  if (!partial) requireFields(body, ['asset_tag', 'name', 'category_id', 'location', 'condition']);
  const out = {};
  const has = (f) => body[f] !== undefined;
  if (has('asset_tag')) {
    out.asset_tag = text(body.asset_tag, 'asset_tag', 'Asset tag').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_./-]*$/.test(out.asset_tag)) {
      throw new ApiError(400, 'Asset tag can only use letters, numbers and - _ . /');
    }
  }
  if (has('name')) out.name = text(body.name, 'name', 'Asset name');
  if (has('location')) out.location = text(body.location, 'location', 'Location');
  if (has('description')) out.description = text(body.description, 'description', 'Description', { required: false }) || null;
  if (has('condition')) {
    if (!C.ASSET_CONDITION.includes(body.condition)) {
      throw new ApiError(400, `Condition must be one of: ${C.ASSET_CONDITION.join(', ')}`); // FR-AM-03
    }
    out.condition = body.condition;
  }
  if (has('status') && body.status !== null && body.status !== '') {
    if (!STATUSES.includes(body.status)) throw new ApiError(400, `Status must be one of: ${STATUSES.join(', ')}`); // FR-AM-04
    out.status = body.status;
  }
  if (has('category_id')) {
    const id = Number(body.category_id);
    const [[cat]] = Number.isInteger(id) && id > 0
      ? await db.query('SELECT category_id FROM categories WHERE category_id = ?', [id])
      : [[]];
    if (!cat) throw new ApiError(400, 'Please choose a category from the list');
    out.category_id = id;
  }
  return out;
}

// MySQL error 1062 = duplicate key: asset_tag is UNIQUE (FR-AM-02).
function tagConflict(err) {
  if (err.code === 'ER_DUP_ENTRY') return new ApiError(409, 'Asset tag already exists');
  return err;
}

// FR-AS-01, 02, 03, 05. query: search?, category_id?, location?, status?, condition?, page?, sort? (name | newest | tag)
// Out: { items: [asset], total, page, pageSize, pages, statusCounts }  (Retired hidden from members)
// statusCounts counts the matches for every status, ignoring the status filter (for the filter chips).
router.get('/', async (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  if (!isAdmin(req)) where.push(`a.status <> '${A.RETIRED}'`); // FR-AS-05
  const search = String(q.search ?? '').trim().slice(0, LIMITS.search);
  if (search) { // FR-AS-01: name, tag and description (and the category name, so "laptop" finds every laptop)
    where.push('(a.name LIKE ? OR a.asset_tag LIKE ? OR a.description LIKE ? OR c.name LIKE ?)');
    const like = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(like, like, like, like);
  }
  if (q.category_id) { where.push('a.category_id = ?'); params.push(Number(q.category_id) || 0); }
  if (q.location) { where.push('a.location = ?'); params.push(String(q.location)); }
  if (q.condition) {
    if (!C.ASSET_CONDITION.includes(q.condition)) throw new ApiError(400, 'Unknown condition filter');
    where.push('a.`condition` = ?'); params.push(q.condition);
  }
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // FR-AS-02: the status filter combines with the others (AND).
  let filtered = base;
  const fParams = [...params];
  if (q.status) {
    if (!STATUSES.includes(q.status)) throw new ApiError(400, 'Unknown status filter');
    filtered = `${base ? `${base} AND` : 'WHERE'} a.status = ?`;
    fParams.push(q.status);
  }

  const sort = { newest: 'a.created_at DESC, a.asset_id DESC', tag: 'a.asset_tag' }[q.sort] || 'a.name, a.asset_tag';
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${FROM} ${filtered}`, fParams);
  const [items] = await db.query(
    `SELECT ${COLUMNS} ${FROM} ${filtered} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    [...fParams, C.PAGE_SIZE, (page - 1) * C.PAGE_SIZE]
  );
  const [counts] = await db.query(`SELECT a.status, COUNT(*) AS n ${FROM} ${base} GROUP BY a.status`, params);
  const statusCounts = Object.fromEntries(STATUSES.filter((s) => isAdmin(req) || s !== A.RETIRED).map((s) => [s, 0]));
  for (const c of counts) statusCounts[c.status] = Number(c.n);

  res.json({
    items, total: Number(total), page, pageSize: C.PAGE_SIZE, pages: Math.max(1, Math.ceil(total / C.PAGE_SIZE)), statusCounts,
  });
});

// FR-AS-02. Out: ["Floor 1 - Lab A", ...]  (for the location filter and the asset form)
router.get('/locations', async (req, res) => {
  const [rows] = await db.query(
    `SELECT DISTINCT location FROM assets ${isAdmin(req) ? '' : `WHERE status <> '${A.RETIRED}'`} ORDER BY location`
  );
  res.json(rows.map((r) => r.location));
});

// FR-AS-04. Out: { ...asset, category, reserved_dates: [{ start_date, end_date, kind }], can_request,
//   stats: { times_borrowed, maintenance_records },
//   admin only: open_maintenance, current_loan;  member only: my_loan, my_open_report }
router.get('/:id', async (req, res) => {
  const id = idParam(req.params.id, 'asset');
  const [[asset]] = await db.query(`SELECT ${COLUMNS}, c.description AS category_description ${FROM} WHERE a.asset_id = ?`, [id]);
  if (!asset || (!isAdmin(req) && asset.status === A.RETIRED)) throw new ApiError(404, 'This asset does not exist'); // FR-AS-05

  const reserved_dates = await getBookedPeriods(id);
  const [[stats]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM borrow_records WHERE asset_id = ?) AS times_borrowed,
            (SELECT COUNT(*) FROM maintenance_logs WHERE asset_id = ?) AS maintenance_records`,
    [id, id]
  );
  const [[openMaint]] = await db.query(
    `SELECT m.maintenance_id, m.issue_description, m.status, m.reported_at, u.name AS reported_by_name, u.role AS reported_by_role
       FROM maintenance_logs m JOIN users u ON u.user_id = m.reported_by
      WHERE m.asset_id = ? AND m.status <> 'Closed' ORDER BY m.reported_at DESC LIMIT 1`,
    [id]
  );
  const out = {
    ...asset,
    reserved_dates,
    can_request: REQUESTABLE.includes(asset.status) && !isAdmin(req), // FR-RQ-01 (free dates checked on submit)
    stats: { times_borrowed: Number(stats.times_borrowed), maintenance_records: Number(stats.maintenance_records) },
  };
  if (isAdmin(req)) {
    const [[loan]] = await db.query(
      `SELECT b.borrow_id, b.due_date, b.status, DATE(b.issued_at) AS issued_on, u.name AS user_name, u.email AS user_email
         FROM borrow_records b JOIN users u ON u.user_id = b.user_id
        WHERE b.asset_id = ? AND b.returned_at IS NULL LIMIT 1`,
      [id]
    );
    out.open_maintenance = openMaint || null;
    out.current_loan = loan || null;
  } else {
    const [[mine]] = await db.query(
      `SELECT borrow_id, due_date, status FROM borrow_records WHERE asset_id = ? AND user_id = ? AND returned_at IS NULL LIMIT 1`,
      [id, req.user.user_id]
    );
    out.my_loan = mine || null;
    out.my_open_report = Boolean(openMaint);
  }
  res.json(out);
});

// FR-AM-01, 02, 03, 04. In: { asset_tag, name, category_id, location, condition, status?, description?, image? }
// image: "data:image/png;base64,..." (JPG/PNG, max 2 MB) or an https:// link.  Out: 201 { asset_id }
// status "Under Maintenance" also opens a maintenance record, so the asset shows on the Maintenance screen.
router.post('/', admin, async (req, res) => {
  const body = await readAssetBody(req.body);
  const status = body.status || A.AVAILABLE;
  if (!CREATE_STATUSES.includes(status)) {
    throw new ApiError(400, 'A new asset can only be Available, Under Maintenance or Retired. Reserved and Borrowed come from bookings');
  }
  const image = saveImage(req.body?.image);
  let assetId;
  try {
    assetId = await inTransaction(async (conn) => {
      const [result] = await conn.query(
        'INSERT INTO assets (asset_tag, name, category_id, location, `condition`, status, description, image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [body.asset_tag, body.name, body.category_id, body.location, body.condition, status, body.description ?? null, image.path ?? null]
      );
      if (status === A.UNDER_MAINTENANCE) {
        await conn.query(
          'INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, status) VALUES (?, ?, ?, ?)',
          [result.insertId, req.user.user_id, 'Added to the inventory as needing repair', C.MAINTENANCE_STATUS.OPEN]
        );
      }
      return result.insertId;
    });
  } catch (err) {
    if (image.file) removeImageFile(image.path);
    throw tagConflict(err);
  }
  await audit(req.user.user_id, 'create', 'asset', assetId);
  res.status(201).json({ asset_id: assetId });
});

// FR-AM-05. In: any of the POST fields (only the ones sent are changed).  Out: { message, status }
// Status: may stay the same, or Available -> Retired (FR-AM-06; cancels its waiting requests).
// Usage history (requests, loans, maintenance) is never edited here.
router.put('/:id', admin, async (req, res) => {
  const id = idParam(req.params.id, 'asset');
  const body = await readAssetBody(req.body, { partial: true });
  const image = saveImage(req.body?.image);
  let result;
  try {
    result = await inTransaction(async (conn) => {
      const [[asset]] = await conn.query('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [id]);
      if (!asset) throw new ApiError(404, 'This asset does not exist');
      let cancelled = [];
      if (body.status && body.status !== asset.status) {
        if (body.status === A.RETIRED && asset.status === A.AVAILABLE) {
          cancelled = await cancelBookingsForRetired(conn, id);
        } else if (body.status === A.RETIRED) {
          throw new ApiError(409, `${asset.name} is ${asset.status}. It can only be retired when it is back and Available (FR-AM-06)`);
        } else if (body.status === A.UNDER_MAINTENANCE) {
          throw new ApiError(409, 'To send an asset for repair, open a record on the Maintenance screen');
        } else if (asset.status === A.UNDER_MAINTENANCE) {
          throw new ApiError(409, 'This asset is under maintenance. Close its maintenance record to make it Available again');
        } else if (asset.status === A.RETIRED) {
          throw new ApiError(409, 'A retired asset cannot be brought back into use');
        } else {
          throw new ApiError(409, 'Reserved and Borrowed are set by bookings, not by hand');
        }
      }
      const fields = { ...body };
      if (image.path !== undefined) fields.image_path = image.path;
      const keys = Object.keys(fields);
      if (keys.length) {
        await conn.query(
          `UPDATE assets SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE asset_id = ?`,
          [...keys.map((k) => fields[k]), id]
        );
      }
      return { asset, cancelled, status: body.status || asset.status };
    });
  } catch (err) {
    if (image.file) removeImageFile(image.path);
    throw tagConflict(err);
  }
  if (image.path !== undefined && result.asset.image_path !== image.path) removeImageFile(result.asset.image_path);
  await audit(req.user.user_id, result.status === A.RETIRED && result.asset.status !== A.RETIRED ? 'retire' : 'update', 'asset', id);
  await notifyCancelled(result.cancelled);
  const extra = result.cancelled.length ? ` and ${result.cancelled.length} waiting request(s) were cancelled` : '';
  res.json({
    message: result.status === A.RETIRED && result.asset.status !== A.RETIRED ? `Asset retired${extra}` : 'Asset saved',
    status: result.status,
  });
});

// FR-AM-06. Out: { message, retired }  (409 if Reserved or Borrowed)
// An asset with any usage history is retired instead of deleted, so the history is kept (OR-DB-06).
router.delete('/:id', admin, async (req, res) => {
  const id = idParam(req.params.id, 'asset');
  const result = await inTransaction(async (conn) => {
    const [[asset]] = await conn.query('SELECT * FROM assets WHERE asset_id = ? FOR UPDATE', [id]);
    if (!asset) throw new ApiError(404, 'This asset does not exist');
    if (asset.status === A.RESERVED || asset.status === A.BORROWED) {
      throw new ApiError(409, `${asset.name} is ${asset.status} and cannot be deleted. Once it is returned and Available you can retire it`);
    }
    if (asset.status === A.UNDER_MAINTENANCE) {
      throw new ApiError(409, `${asset.name} is under maintenance. Close its record as Retired instead of deleting it`);
    }
    const [[h]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM asset_requests WHERE asset_id = ?) + (SELECT COUNT(*) FROM maintenance_logs WHERE asset_id = ?) AS n`,
      [id, id]
    );
    if (Number(h.n) > 0) {
      if (asset.status === A.RETIRED) throw new ApiError(409, `${asset.name} is already retired. Its history is kept, so it cannot be deleted`);
      const cancelled = await cancelBookingsForRetired(conn, id);
      await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [A.RETIRED, id]);
      return { asset, retired: true, cancelled };
    }
    await conn.query('DELETE FROM assets WHERE asset_id = ?', [id]);
    return { asset, retired: false, cancelled: [] };
  });
  await audit(req.user.user_id, result.retired ? 'retire' : 'delete', 'asset', id);
  await notifyCancelled(result.cancelled);
  if (!result.retired) removeImageFile(result.asset.image_path);
  res.json({
    message: result.retired
      ? `${result.asset.name} has usage history, so it was retired instead of deleted`
      : `${result.asset.name} deleted`,
    retired: result.retired,
  });
});

module.exports = router;
