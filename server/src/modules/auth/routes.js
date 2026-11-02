// Authentication (FR-AU-01 to FR-AU-07). Built in the shared skeleton so every module can log in.
// Owner: integrator. POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { ApiError, requireFields } = require('../../utils/http');
const C = require('../../config/constants');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 100, email: 150, contact_no: 20, password: 72 }; // column sizes; bcrypt uses 72 bytes

// Lock-out (FR-AU-05). MAX_LOGIN_ATTEMPTS wrong passwords from one address lock THAT address out of
// the account for LOCKOUT_MINUTES, so a stranger cannot lock the real admin out from elsewhere.
// The account itself also locks after ACCOUNT_FAILURE_LIMIT failures from any addresses
// (slows down an attack spread over many machines). No per-address limit across accounts:
// members of the space usually share one office address. Behind a reverse proxy set
// TRUST_PROXY (see app.js) so req.ip is the visitor's address, not the proxy's.
const ACCOUNT_FAILURE_LIMIT = 25;
const WINDOW_MS = C.LOCKOUT_MINUTES * 60 * 1000;
const failures = new Map(); // key -> { count, until }

function hit(key, limit) {
  const now = Date.now();
  let f = failures.get(key);
  if (!f || f.until < now) f = { count: 0, until: now + WINDOW_MS };
  f.count += 1;
  if (f.count >= limit) f.until = now + WINDOW_MS; // the lock lasts a full window from the last try
  failures.set(key, f);
}
const blocked = (key, limit) => {
  const f = failures.get(key);
  return Boolean(f && f.until >= Date.now() && f.count >= limit);
};
setInterval(() => {
  const now = Date.now();
  for (const [k, f] of failures) if (f.until < now) failures.delete(k);
}, WINDOW_MS).unref();

function text(body, field, label, { required = true } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ApiError(400, `${label} is required`);
    return null;
  }
  if (typeof v !== 'string') throw new ApiError(400, `${label} must be text`);
  if (v.length > LIMITS[field]) throw new ApiError(400, `${label} can be at most ${LIMITS[field]} characters`);
  return v;
}

function publicUser(u) {
  return { user_id: u.user_id, name: u.name, email: u.email, role: u.role };
}

router.post('/register', async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['name', 'email', 'password']);
  const name = text(body, 'name', 'Name').trim();
  const email = text(body, 'email', 'Email').trim().toLowerCase();
  const password = text(body, 'password', 'Password');
  const contactNo = text(body, 'contact_no', 'Contact number', { required: false });
  if (!name) throw new ApiError(400, 'Name is required');
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Please enter a valid email');
  if (password.length < C.MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password must be at least ${C.MIN_PASSWORD_LENGTH} characters`);
  }
  const [existing] = await db.query('SELECT 1 FROM users WHERE email = ?', [email]);
  if (existing.length) throw new ApiError(409, 'This email is already registered');
  const hash = await bcrypt.hash(password, C.BCRYPT_COST);
  const [result] = await db.query(
    'INSERT INTO users (name, email, contact_no, password_hash) VALUES (?, ?, ?, ?)',
    [name, email, contactNo ? contactNo.trim() : null, hash]
  );
  res.status(201).json({ user_id: result.insertId, message: 'Account created, please log in' });
});

router.post('/login', async (req, res) => {
  const body = req.body || {};
  requireFields(body, ['email', 'password']);
  const email = text(body, 'email', 'Email').trim().toLowerCase();
  const password = text(body, 'password', 'Password');
  const ip = req.ip || 'unknown';
  const pairKey = `pair:${ip}:${email}`;
  const tooMany = new ApiError(423, `Too many failed attempts. Try again in ${C.LOCKOUT_MINUTES} minutes`);
  if (blocked(pairKey, C.MAX_LOGIN_ATTEMPTS)) throw tooMany;
  // Count the attempt right away, with no await in between, so parallel guesses cannot all slip
  // past the limit before any of them is counted; a correct password clears the count below.
  hit(pairKey, C.MAX_LOGIN_ATTEMPTS);

  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const invalid = new ApiError(401, 'Invalid email or password'); // FR-AU-05: do not say which one
  if (user && user.locked_until && new Date(user.locked_until + 'Z') > new Date()) throw tooMany;
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!ok) {
    if (user) {
      // One atomic statement, so parallel attempts cannot skip the count.
      await db.query(
        `UPDATE users SET failed_logins = failed_logins + 1,
                locked_until = IF(failed_logins >= ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, locked_until)
          WHERE user_id = ?`,
        [ACCOUNT_FAILURE_LIMIT, C.LOCKOUT_MINUTES, user.user_id]
      );
    }
    throw invalid;
  }
  // Only someone who knows the password learns that the account is deactivated.
  if (user.account_status !== C.ACCOUNT_STATUS.ACTIVE) throw new ApiError(403, 'This account has been deactivated');
  failures.delete(pairKey);
  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE user_id = ?', [user.user_id]);
  const token = jwt.sign(
    { user_id: user.user_id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
  if (!rows[0]) throw new ApiError(404, 'User not found');
  res.json(publicUser(rows[0]));
});

module.exports = router;
