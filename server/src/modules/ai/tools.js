const db = require('../../config/db');
const C = require('../../config/constants');
const { isAssetFree } = require('../../services/availability');
const { today, isValidDate } = require('./dates');

const MAX_ROWS = 25;
const ASSET_STATUSES = Object.values(C.ASSET_STATUS);
const REQUEST_STATUSES = Object.values(C.REQUEST_STATUS);

class ToolInputError extends Error {}

const isAdmin = (user) => user.role === C.ROLE.ADMIN;

function optionalText(input, key, max = 100) {
  const v = input?.[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new ToolInputError(`${key} must be text`);
  return v.trim().slice(0, max) || null;
}

function requiredId(input, key) {
  const v = Number(input?.[key]);
  if (!Number.isInteger(v) || v <= 0) throw new ToolInputError(`${key} must be a positive whole number`);
  return v;
}

async function searchAssets(input, user) {
  const keyword = optionalText(input, 'keyword');
  const category = optionalText(input, 'category');
  const location = optionalText(input, 'location');
  const status = optionalText(input, 'status');
  if (status && !ASSET_STATUSES.includes(status)) {
    throw new ToolInputError(`status must be one of: ${ASSET_STATUSES.join(', ')}`);
  }

  const where = [];
  const params = [];
  if (!isAdmin(user)) { where.push('a.status <> ?'); params.push(C.ASSET_STATUS.RETIRED); }
  if (keyword) {
    for (const word of keyword.split(/\s+/).filter(Boolean).slice(0, 6)) {
      where.push('(a.name LIKE ? OR a.description LIKE ? OR c.name LIKE ? OR a.asset_tag LIKE ?)');
      const k = `%${word}%`;
      params.push(k, k, k, k);
    }
  }
  if (category) { where.push('c.name LIKE ?'); params.push(`%${category}%`); }
  if (location) { where.push('a.location LIKE ?'); params.push(`%${location}%`); }
  if (status) { where.push('a.status = ?'); params.push(status); }

  const [rows] = await db.query(
    `SELECT a.asset_id, a.asset_tag, a.name, c.name AS category, a.location, a.condition, a.status, a.description
       FROM assets a JOIN categories c ON c.category_id = a.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.name LIMIT ?`,
    [...params, MAX_ROWS + 1]
  );
  return {
    count: Math.min(rows.length, MAX_ROWS),
    more_not_shown: rows.length > MAX_ROWS,
    assets: rows.slice(0, MAX_ROWS),
  };
}

async function checkAvailability(input, user) {
  const assetId = requiredId(input, 'asset_id');
  const start = input?.start_date;
  const end = input?.end_date || start;
  if (!isValidDate(start) || !isValidDate(end)) throw new ToolInputError('start_date and end_date must be YYYY-MM-DD dates');
  if (end < start) throw new ToolInputError('end_date cannot be before start_date');

  const [[asset]] = await db.query(
    `SELECT a.asset_id, a.name, a.status, a.condition, a.location FROM assets a WHERE a.asset_id = ?`,
    [assetId]
  );
  if (!asset || (!isAdmin(user) && asset.status === C.ASSET_STATUS.RETIRED)) {
    return { found: false, message: `There is no asset with id ${assetId}.` };
  }

  let available = false;
  let reason;
  if (start < today()) reason = 'The start date is in the past.';
  else if (asset.status === C.ASSET_STATUS.RETIRED) reason = 'The asset is retired.';
  else if (asset.status === C.ASSET_STATUS.UNDER_MAINTENANCE) reason = 'The asset is under maintenance.';
  else if (!(await isAssetFree(asset.asset_id, start, end))) reason = 'The asset is already booked or borrowed during these dates.';
  else { available = true; reason = 'The asset is free for the whole period.'; }

  const [booked] = await db.query(
    `SELECT start_date, end_date FROM asset_requests
      WHERE asset_id = ? AND status = ? AND end_date >= CURDATE()
     UNION ALL
     SELECT DATE(issued_at), due_date FROM borrow_records
      WHERE asset_id = ? AND returned_at IS NULL
     ORDER BY start_date LIMIT 10`,
    [asset.asset_id, C.REQUEST_STATUS.APPROVED, asset.asset_id]
  );
  return { found: true, asset, start_date: start, end_date: end, available, reason, booked_periods: booked };
}

async function getMyRequests(input, user) {
  const status = optionalText(input, 'status');
  if (status && !REQUEST_STATUSES.includes(status)) {
    throw new ToolInputError(`status must be one of: ${REQUEST_STATUSES.join(', ')}`);
  }
  const [rows] = await db.query(
    `SELECT r.request_id, a.asset_id, a.name AS asset_name, r.purpose, r.start_date, r.end_date, r.status,
            r.rejection_reason, DATE(r.created_at) AS requested_on,
            b.due_date, b.status AS borrow_status, DATE(b.returned_at) AS returned_on
       FROM asset_requests r
       JOIN assets a ON a.asset_id = r.asset_id
       LEFT JOIN borrow_records b ON b.request_id = r.request_id
      WHERE r.user_id = ? ${status ? 'AND r.status = ?' : ''}
      ORDER BY r.created_at DESC LIMIT ?`,
    status ? [user.user_id, status, MAX_ROWS] : [user.user_id, MAX_ROWS]
  );
  return { count: rows.length, requests: rows };
}

async function listCategories() {
  const [rows] = await db.query(
    `SELECT c.category_id, c.name, c.description,
            COUNT(a.asset_id) AS assets,
            SUM(a.status = 'Available') AS available_now
       FROM categories c LEFT JOIN assets a ON a.category_id = c.category_id AND a.status <> 'Retired'
      GROUP BY c.category_id ORDER BY c.name`
  );
  return { categories: rows.map((r) => ({ ...r, assets: Number(r.assets), available_now: Number(r.available_now || 0) })) };
}

async function listRequests(input) {
  const status = optionalText(input, 'status');
  const keyword = optionalText(input, 'keyword');
  if (status && !REQUEST_STATUSES.includes(status)) {
    throw new ToolInputError(`status must be one of: ${REQUEST_STATUSES.join(', ')}`);
  }
  const where = [];
  const params = [];
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (keyword) {
    where.push('(a.name LIKE ? OR u.name LIKE ? OR r.purpose LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const [rows] = await db.query(
    `SELECT r.request_id, u.name AS member, a.name AS asset_name, r.purpose, r.start_date, r.end_date, r.status,
            DATE(r.created_at) AS requested_on
       FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.created_at DESC LIMIT ?`,
    [...params, MAX_ROWS]
  );
  return { count: rows.length, requests: rows };
}

async function listOverdue() {
  const [rows] = await db.query(
    `SELECT b.borrow_id, u.name AS member, a.name AS asset_name, b.due_date,
            DATEDIFF(CURDATE(), b.due_date) AS days_overdue
       FROM borrow_records b JOIN users u ON u.user_id = b.user_id JOIN assets a ON a.asset_id = b.asset_id
      WHERE b.returned_at IS NULL AND (b.status = 'Overdue' OR b.due_date < CURDATE())
      ORDER BY b.due_date LIMIT ?`,
    [MAX_ROWS]
  );
  return { count: rows.length, overdue: rows };
}

const STATUS_HELP = `Asset statuses: ${ASSET_STATUSES.join(', ')}.`;

const TOOLS = [
  { def: { name: 'search_assets', description: `Search assets. ${STATUS_HELP}`, input_schema: { type: 'object', properties: { keyword: { type: 'string' }, category: { type: 'string' }, location: { type: 'string' }, status: { type: 'string', enum: ASSET_STATUSES } }, additionalProperties: false } }, run: searchAssets },
  { def: { name: 'check_availability', description: 'Check availability', input_schema: { type: 'object', properties: { asset_id: { type: 'integer' }, start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['asset_id', 'start_date', 'end_date'], additionalProperties: false } }, run: checkAvailability },
  { def: { name: 'get_my_requests', description: 'My requests', input_schema: { type: 'object', properties: { status: { type: 'string', enum: REQUEST_STATUSES } }, additionalProperties: false } }, run: getMyRequests },
  { def: { name: 'list_categories', description: 'Categories', input_schema: { type: 'object', properties: {}, additionalProperties: false } }, run: listCategories },
  { adminOnly: true, def: { name: 'list_requests', description: 'All requests (admin)', input_schema: { type: 'object', properties: { status: { type: 'string', enum: REQUEST_STATUSES }, keyword: { type: 'string' } }, additionalProperties: false } }, run: listRequests },
  { adminOnly: true, def: { name: 'list_overdue', description: 'Overdue (admin)', input_schema: { type: 'object', properties: {}, additionalProperties: false } }, run: listOverdue },
];

function toolsFor(user) {
  return TOOLS.filter((t) => !t.adminOnly || isAdmin(user)).map((t) => t.def);
}

async function runTool(name, input, user) {
  const tool = TOOLS.find((t) => t.def.name === name && (!t.adminOnly || isAdmin(user)));
  if (!tool) return { output: null, content: `Unknown tool: ${name}`, isError: true };
  try {
    const output = await tool.run(input || {}, user);
    return { output, content: JSON.stringify(output), isError: false };
  } catch (err) {
    if (err instanceof ToolInputError) return { output: null, content: err.message, isError: true };
    throw err;
  }
}

module.exports = { toolsFor, runTool };
