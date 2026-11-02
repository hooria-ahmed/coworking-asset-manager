const db = require('../../config/db');
const { ApiError } = require('../../utils/http');
const C = require('../../config/constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmt(s) {
  return new Date(`${String(s).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtRange(start, end) {
  return start === end ? fmt(start) : `${fmt(start)} to ${fmt(end)}`;
}

async function today(conn = db) {
  const [[row]] = await conn.query('SELECT CURDATE() AS d');
  return row.d;
}

function idParam(value, what = 'record') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, `This ${what} does not exist`);
  return id;
}

async function inTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function settleAssetStatus(conn, assetId, excludeRequestId = null) {
  const [waiting] = await conn.query(
    `SELECT 1 FROM asset_requests r
      WHERE r.asset_id = ? AND r.request_id <> COALESCE(?, 0) AND r.status = ? AND r.end_date >= CURDATE()
        AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)
      LIMIT 1`,
    [assetId, excludeRequestId, C.REQUEST_STATUS.APPROVED]
  );
  const next = waiting.length ? C.ASSET_STATUS.RESERVED : C.ASSET_STATUS.AVAILABLE;
  await conn.query('UPDATE assets SET status = ? WHERE asset_id = ?', [next, assetId]);
  return next;
}

module.exports = { isValidDate, addDays, fmt, fmtRange, today, idParam, inTransaction, settleAssetStatus };
