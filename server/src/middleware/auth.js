// requireAuth: rejects requests without a valid JWT and sets req.user = { user_id, role, name }.
// requireRole('Admin'): use after requireAuth on admin-only routes (FR-AU-06).
//   router.get('/', requireAuth, requireRole('Admin'), handler)
// The token alone is not trusted: every request re-reads the account, so a deactivated member
// (FR-AU-08) is logged out at once instead of keeping access until the token expires.
const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  const [rows] = await db.query('SELECT user_id, name, role, account_status FROM users WHERE user_id = ?', [payload.user_id]);
  const user = rows[0];
  if (!user || user.account_status !== 'Active') {
    return res.status(401).json({ error: 'This account has been deactivated' });
  }
  req.user = { user_id: user.user_id, role: user.role, name: user.name };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
