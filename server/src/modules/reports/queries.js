// Dashboard and report figures (FR-RP-01 to FR-RP-04). Owner: Misbah.
// Read-only queries. Usage is measured from borrow_records (an asset counts as used when it was
// issued), so the figures fill in as soon as Hamza's Issue / Return screen records borrowings.
const db = require('../../config/db');
const C = require('../../config/constants');
const { ApiError } = require('../../utils/http');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PERIOD_DAYS = 30;
const MAX_DAILY_POINTS = 92; // longer periods are charted by month
const TOP_N = 10;
const MIN_YEAR = 2000; // reports only make sense for real dates; also keeps every date 4-digit
const MAX_YEAR = 2099;
const MAX_PERIOD_DAYS = 366 * 5; // longest report period (5 years) so one request cannot tie up the server

// ---------- Period (from / to query) ----------

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

// Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD. Defaults to the last 30 days, ending today.
function parsePeriod(query) {
  const to = query.to || isoDate(new Date());
  const from = query.from || shiftDays(to, -(DEFAULT_PERIOD_DAYS - 1));
  if (!isValidDate(from) || !isValidDate(to)) throw new ApiError(400, 'Dates must be valid dates (YYYY-MM-DD)');
  const years = [Number(from.slice(0, 4)), Number(to.slice(0, 4))];
  if (years.some((y) => y < MIN_YEAR || y > MAX_YEAR)) {
    throw new ApiError(400, `Dates must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  if (to < from) throw new ApiError(400, 'The end date cannot be before the start date');
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) throw new ApiError(400, 'A report can cover at most 5 years');
  // `toExclusive` lets DATETIME columns include the whole last day.
  return { from, to, toExclusive: shiftDays(to, 1) };
}

// Rows per day (or per month when the period is longer than MAX_DAILY_POINTS days) in [from, to],
// with empty periods filled in so charts show gaps. table/column are fixed names from this file, never user input.
async function countTimeline(table, column, period, where = '', params = []) {
  const days = daysBetween(period.from, period.to);
  const unit = days > MAX_DAILY_POINTS ? 'month' : 'day';
  const format = unit === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(${column}, ?) AS period, COUNT(*) AS times
       FROM ${table} WHERE ${column} >= ? AND ${column} < ? ${where} GROUP BY period ORDER BY period`,
    [format, period.from, period.toExclusive, ...params]
  );
  const found = new Map(rows.map((r) => [r.period, Number(r.times)]));
  const points = [];
  // Counted loop (not a string comparison of dates), so it always ends.
  for (let i = 0, d = period.from; i < days; i++, d = shiftDays(d, 1)) {
    const key = unit === 'day' ? d : d.slice(0, 7);
    if (!points.length || points[points.length - 1].period !== key) points.push({ period: key, times: found.get(key) || 0 });
  }
  return { unit, points };
}

// ---------- Dashboard (FR-RP-01, FR-RP-02) ----------

async function getSummary() {
  const [statusRows] = await db.query('SELECT status, COUNT(*) AS n FROM assets GROUP BY status');
  const statusCounts = Object.fromEntries(Object.values(C.ASSET_STATUS).map((s) => [s, 0]));
  for (const r of statusRows) statusCounts[r.status] = Number(r.n);

  const [pendingRequests] = await db.query(
    `SELECT r.request_id, u.name AS user_name, a.name AS asset_name, r.purpose, r.start_date, r.end_date, r.created_at
       FROM asset_requests r JOIN users u ON u.user_id = r.user_id JOIN assets a ON a.asset_id = r.asset_id
      WHERE r.status = ? ORDER BY r.created_at`,
    [C.REQUEST_STATUS.PENDING]
  );

  // Overdue = not returned and past the due date, even if the hourly overdue job has not marked it yet.
  const [overdue] = await db.query(
    `SELECT b.borrow_id, u.name AS user_name, u.email AS user_email, a.name AS asset_name, a.asset_tag,
            b.due_date, DATEDIFF(CURDATE(), b.due_date) AS days_overdue
       FROM borrow_records b JOIN users u ON u.user_id = b.user_id JOIN assets a ON a.asset_id = b.asset_id
      WHERE b.returned_at IS NULL AND (b.status = ? OR b.due_date < CURDATE())
      ORDER BY b.due_date`,
    [C.BORROW_STATUS.OVERDUE]
  );

  const [[counts]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM maintenance_logs WHERE status <> ?) AS openMaintenance,
       (SELECT COUNT(*) FROM borrow_records WHERE returned_at IS NULL) AS activeBorrowings,
       (SELECT COUNT(*) FROM borrow_records WHERE returned_at IS NULL AND due_date = CURDATE()) AS dueToday,
       (SELECT COUNT(*) FROM users WHERE role = ? AND account_status = ?) AS activeMembers`,
    [C.MAINTENANCE_STATUS.CLOSED, C.ROLE.MEMBER, C.ACCOUNT_STATUS.ACTIVE]
  );

  return {
    statusCounts,
    totalAssets: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    pendingRequests,
    overdue: overdue.map((o) => ({ ...o, days_overdue: Number(o.days_overdue) })),
    openMaintenance: Number(counts.openMaintenance),
    activeBorrowings: Number(counts.activeBorrowings),
    dueToday: Number(counts.dueToday),
    activeMembers: Number(counts.activeMembers),
  };
}

// ---------- Usage (FR-RP-03) ----------

async function getUsage(period, { limit = TOP_N } = {}) {
  const range = [period.from, period.toExclusive];

  const [mostUsed] = await db.query(
    `SELECT a.asset_id, a.asset_tag, a.name, c.name AS category, COUNT(*) AS times,
            SUM(DATEDIFF(COALESCE(DATE(b.returned_at), CURDATE()), DATE(b.issued_at)) + 1) AS days
       FROM borrow_records b JOIN assets a ON a.asset_id = b.asset_id JOIN categories c ON c.category_id = a.category_id
      WHERE b.issued_at >= ? AND b.issued_at < ?
      GROUP BY a.asset_id ORDER BY times DESC, days DESC, a.name
      ${limit ? 'LIMIT ?' : ''}`,
    limit ? [...range, limit] : range
  );

  const [byCategory] = await db.query(
    `SELECT c.name AS category, COUNT(b.borrow_id) AS times
       FROM categories c
       LEFT JOIN assets a ON a.category_id = c.category_id
       LEFT JOIN borrow_records b ON b.asset_id = a.asset_id AND b.issued_at >= ? AND b.issued_at < ?
      GROUP BY c.category_id ORDER BY times DESC, c.name`,
    range
  );

  const [requestRows] = await db.query(
    'SELECT status, COUNT(*) AS n FROM asset_requests WHERE created_at >= ? AND created_at < ? GROUP BY status',
    range
  );
  const requests = Object.fromEntries(Object.values(C.REQUEST_STATUS).map((s) => [s, 0]));
  for (const r of requestRows) requests[r.status] = Number(r.n);

  // Borrowings per day (or per month for long periods), with empty days filled in for the chart.
  const timeline = await countTimeline('borrow_records', 'issued_at', period);

  return {
    from: period.from,
    to: period.to,
    totalBorrowings: timeline.points.reduce((sum, p) => sum + p.times, 0),
    mostUsed: mostUsed.map((r) => ({ ...r, times: Number(r.times), days: Number(r.days) })),
    byCategory: byCategory.map((r) => ({ ...r, times: Number(r.times) })),
    requests,
    timeline,
  };
}

// ---------- Maintenance (FR-RP-04) ----------

async function getMaintenance(period) {
  const range = [period.from, period.toExclusive];
  const [[t]] = await db.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status = 'Open'), 0) AS openOnly,
            COALESCE(SUM(status = 'In Progress'), 0) AS inProgress,
            COALESCE(SUM(status = 'Closed'), 0) AS closed,
            COALESCE(SUM(outcome = 'Repaired'), 0) AS repaired,
            COALESCE(SUM(outcome = 'Retired'), 0) AS retired,
            COALESCE(SUM(cost), 0) AS totalCost
       FROM maintenance_logs WHERE reported_at >= ? AND reported_at < ?`,
    range
  );
  const [byAsset] = await db.query(
    `SELECT a.asset_id, a.name, COUNT(*) AS records, COALESCE(SUM(m.cost), 0) AS cost
       FROM maintenance_logs m JOIN assets a ON a.asset_id = m.asset_id
      WHERE m.reported_at >= ? AND m.reported_at < ?
      GROUP BY a.asset_id ORDER BY cost DESC, records DESC, a.name LIMIT ?`,
    [...range, TOP_N]
  );
  return {
    from: period.from,
    to: period.to,
    open: Number(t.openOnly) + Number(t.inProgress), // still being handled (Open or In Progress)
    inProgress: Number(t.inProgress),
    closed: Number(t.closed),
    total: Number(t.total),
    repaired: Number(t.repaired),
    retired: Number(t.retired),
    totalCost: Number(t.totalCost),
    byAsset: byAsset.map((r) => ({ ...r, records: Number(r.records), cost: Number(r.cost) })),
  };
}

// ---------- AI activity (FR-AI-08: chat logs kept for review and improvement) ----------

const AI_FEATURES = ['Assistant', 'Recommendation'];
const AI_PAGE_SIZE = 15;

// Recommendation logs store JSON; turn them into one readable line.
function readableAnswer(feature, response) {
  if (feature !== 'Recommendation' || !response) return { answer: response || '', source: null };
  try {
    const r = JSON.parse(response);
    const names = (r.recommendations || []).map((x, i) => `${i + 1}. ${x.name}`).join(', ');
    return { answer: names || r.message || 'No suitable asset found', source: r.source || null };
  } catch {
    return { answer: response, source: null };
  }
}

async function getAiActivity(period, { feature, search, page = 1 } = {}) {
  const range = [period.from, period.toExclusive];
  const [[t]] = await db.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(feature = 'Assistant'), 0) AS assistant,
            COALESCE(SUM(feature = 'Recommendation'), 0) AS recommendation,
            COALESCE(SUM(feature = 'Recommendation' AND response LIKE '{"source":"ai"%'), 0) AS aiRanked,
            COUNT(DISTINCT user_id) AS users
       FROM ai_chat_logs WHERE created_at >= ? AND created_at < ?`,
    range
  );
  const timeline = await countTimeline('ai_chat_logs', 'created_at', period);

  const where = ['l.created_at >= ?', 'l.created_at < ?'];
  const params = [...range];
  if (AI_FEATURES.includes(feature)) { where.push('l.feature = ?'); params.push(feature); }
  if (search && String(search).trim()) {
    where.push('(l.prompt LIKE ? OR l.response LIKE ? OR u.name LIKE ?)');
    const k = `%${String(search).trim().slice(0, 100)}%`;
    params.push(k, k, k);
  }
  const pageNo = Math.max(1, Number.parseInt(page, 10) || 1);
  const [[{ matching }]] = await db.query(
    `SELECT COUNT(*) AS matching FROM ai_chat_logs l JOIN users u ON u.user_id = l.user_id WHERE ${where.join(' AND ')}`,
    params
  );
  const [rows] = await db.query(
    `SELECT l.chat_id, u.name AS user_name, u.role, l.feature, l.prompt, l.response, l.created_at
       FROM ai_chat_logs l JOIN users u ON u.user_id = l.user_id
      WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.chat_id DESC LIMIT ? OFFSET ?`,
    [...params, AI_PAGE_SIZE, (pageNo - 1) * AI_PAGE_SIZE]
  );

  const recommendation = Number(t.recommendation);
  return {
    from: period.from,
    to: period.to,
    total: Number(t.total),
    byFeature: { Assistant: Number(t.assistant), Recommendation: recommendation },
    recommendationSource: { ai: Number(t.aiRanked), rules: recommendation - Number(t.aiRanked) },
    activeUsers: Number(t.users),
    timeline,
    items: rows.map(({ response, ...r }) => ({ ...r, ...readableAnswer(r.feature, response) })),
    page: pageNo,
    pageSize: AI_PAGE_SIZE,
    matching: Number(matching),
  };
}

// ---------- Member dashboard (SRS 3.1.1, screen 2: active borrowings, pending requests, due dates, notifications) ----------

async function getMemberSummary(userId) {
  const [borrowed] = await db.query(
    `SELECT b.borrow_id, a.asset_id, a.name AS asset_name, a.asset_tag, c.name AS category, a.location,
            DATE(b.issued_at) AS issued_on, b.due_date, DATEDIFF(b.due_date, CURDATE()) AS days_left
       FROM borrow_records b JOIN assets a ON a.asset_id = b.asset_id JOIN categories c ON c.category_id = a.category_id
      WHERE b.user_id = ? AND b.returned_at IS NULL ORDER BY b.due_date`,
    [userId]
  );
  // Open requests: waiting for a decision, or approved and not collected yet.
  const [openRequests] = await db.query(
    `SELECT r.request_id, a.asset_id, a.name AS asset_name, r.purpose, r.start_date, r.end_date, r.status, r.created_at
       FROM asset_requests r JOIN assets a ON a.asset_id = r.asset_id
      WHERE r.user_id = ? AND (r.status = ?
            OR (r.status = ? AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)))
      ORDER BY r.start_date, r.created_at`,
    [userId, C.REQUEST_STATUS.PENDING, C.REQUEST_STATUS.APPROVED]
  );
  const [notifications] = await db.query(
    'SELECT notification_id, type, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 5',
    [userId]
  );
  const [[counts]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE) AS unread,
       (SELECT COUNT(*) FROM borrow_records WHERE user_id = ?) AS totalBorrowings,
       (SELECT COUNT(*) FROM asset_requests WHERE user_id = ? AND status = ? AND decided_at >= NOW() - INTERVAL 30 DAY) AS rejectedRecently`,
    [userId, userId, userId, C.REQUEST_STATUS.REJECTED]
  );

  const items = borrowed.map((b) => ({ ...b, days_left: Number(b.days_left) }));
  return {
    borrowed: items,
    overdue: items.filter((b) => b.days_left < 0).length,
    dueSoon: items.filter((b) => b.days_left >= 0 && b.days_left <= 1).length,
    openRequests,
    pending: openRequests.filter((r) => r.status === C.REQUEST_STATUS.PENDING).length,
    approvedUpcoming: openRequests.filter((r) => r.status === C.REQUEST_STATUS.APPROVED).length,
    notifications: notifications.map((n) => ({ ...n, is_read: Boolean(n.is_read) })),
    unread: Number(counts.unread),
    totalBorrowings: Number(counts.totalBorrowings),
    rejectedRecently: Number(counts.rejectedRecently),
  };
}

// ---------- Rows for exports (FR-RP-05) ----------

async function maintenanceRecords(period) {
  const [rows] = await db.query(
    `SELECT m.maintenance_id, a.asset_tag, a.name AS asset_name, m.issue_description, m.status, m.outcome, m.cost,
            u.name AS reported_by, m.reported_at, m.resolved_at
       FROM maintenance_logs m JOIN assets a ON a.asset_id = m.asset_id JOIN users u ON u.user_id = m.reported_by
      WHERE m.reported_at >= ? AND m.reported_at < ? ORDER BY m.reported_at`,
    [period.from, period.toExclusive]
  );
  return rows;
}

async function assetRegister() {
  const [rows] = await db.query(
    `SELECT a.asset_tag, a.name, c.name AS category, a.location, a.condition, a.status, DATE(a.created_at) AS added_on
       FROM assets a JOIN categories c ON c.category_id = a.category_id ORDER BY a.asset_tag`
  );
  return rows;
}

async function aiLogRecords(period) {
  const [rows] = await db.query(
    `SELECT l.chat_id, u.name AS user_name, u.role, l.feature, l.prompt, l.response, l.created_at
       FROM ai_chat_logs l JOIN users u ON u.user_id = l.user_id
      WHERE l.created_at >= ? AND l.created_at < ? ORDER BY l.created_at`,
    [period.from, period.toExclusive]
  );
  return rows.map(({ response, ...r }) => ({ ...r, ...readableAnswer(r.feature, response) }));
}

module.exports = {
  parsePeriod, getSummary, getUsage, getMaintenance, getAiActivity, getMemberSummary,
  maintenanceRecords, assetRegister, aiLogRecords,
};
