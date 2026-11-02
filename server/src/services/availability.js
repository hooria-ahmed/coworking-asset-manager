const db = require('../config/db');

async function isAssetFree(assetId, start, end, excludeRequestId = null, conn = db) {
  const [clash] = await conn.query(
    `SELECT 1 FROM asset_requests
      WHERE asset_id = ? AND request_id <> COALESCE(?, 0) AND status = 'Approved'
        AND start_date <= ? AND end_date >= ?
     UNION ALL
     SELECT 1 FROM borrow_records
      WHERE asset_id = ? AND returned_at IS NULL AND (status = 'Overdue' OR due_date >= ?)
     LIMIT 1`,
    [assetId, excludeRequestId, end, start, assetId, start]
  );
  return clash.length === 0;
}

async function getAvailableAssets(start, end, filters = {}) {
  const where = ["a.status NOT IN ('Retired','Under Maintenance')"];
  const params = [];
  if (filters.category_id) { where.push('a.category_id = ?'); params.push(filters.category_id); }
  if (filters.keyword) {
    where.push('(a.name LIKE ? OR a.description LIKE ? OR c.name LIKE ?)');
    const k = `%${filters.keyword}%`;
    params.push(k, k, k);
  }
  const [assets] = await db.query(
    `SELECT a.*, c.name AS category FROM assets a JOIN categories c ON c.category_id = a.category_id
      WHERE ${where.join(' AND ')} ORDER BY a.name`,
    params
  );
  const free = [];
  for (const a of assets) if (await isAssetFree(a.asset_id, start, end)) free.push(a);
  return free;
}

async function getBookedPeriods(assetId, conn = db) {
  const [rows] = await conn.query(
    `SELECT r.start_date, r.end_date, 'Reserved' AS kind FROM asset_requests r
      WHERE r.asset_id = ? AND r.status = 'Approved' AND r.end_date >= CURDATE()
        AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)
     UNION ALL
     SELECT DATE(b.issued_at), GREATEST(b.due_date, CURDATE()), 'Borrowed' FROM borrow_records b
      WHERE b.asset_id = ? AND b.returned_at IS NULL
     ORDER BY start_date`,
    [assetId, assetId]
  );
  return rows;
}
module.exports = { isAssetFree, getAvailableAssets, getBookedPeriods };
