// One shared MySQL connection pool. Every module imports this; never create your own.
//   const db = require('../../config/db');
//   const [rows] = await db.query('SELECT * FROM assets WHERE asset_id = ?', [id]);
// Always use ? placeholders (never build SQL with string concatenation) - NFR-SC SQL injection rule.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'asset_manager',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  timezone: 'Z',
});

// Make CURDATE()/NOW() use the same clock as the Node server. Without this, a MySQL server on
// UTC and a Node server on Pakistan time disagree about "today" between 00:00 and 05:00, so
// the request form and the AI recommendation give different answers for the same date.
function nodeOffset() {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
pool.pool.on('connection', (conn) => {
  const offset = nodeOffset();
  conn.query(`SET time_zone = '${offset}'`, (err) => { // fixed format, never user input
    // Some servers refuse offsets beyond +13:00; then keep the server's zone rather than fail every query.
    if (err) console.warn(`[db] Could not set time_zone ${offset}: ${err.message}. Keep the Node and MySQL time zones the same.`);
  });
});

module.exports = pool;
