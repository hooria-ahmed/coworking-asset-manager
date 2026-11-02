const express = require('express');
const db = require('../../config/db');
const { requireAuth } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');

const router = express.Router();
router.use(requireAuth);

const LIST_LIMIT = 100;

router.get('/', async (req, res) => {
  const [rows] = await db.query(
    `SELECT notification_id, type, message, is_read, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC, notification_id DESC
     LIMIT ?`,
    [req.user.user_id, LIST_LIMIT],
  );
  res.json(rows.map((n) => ({ ...n, is_read: Boolean(n.is_read) })));
});

router.get('/unread-count', async (req, res) => {
  const [[row]] = await db.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [req.user.user_id],
  );
  res.json({ count: Number(row.count) });
});

router.patch('/read-all', async (req, res) => {
  const [result] = await db.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
    [req.user.user_id],
  );
  const n = result.affectedRows;
  res.json({
    message: n
      ? `Marked ${n} notification${n === 1 ? '' : 's'} as read`
      : 'Everything was already read',
  });
});

router.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid notification id');
  const [result] = await db.query(
    'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
    [id, req.user.user_id],
  );
  if (!result.affectedRows) throw new ApiError(404, 'Notification not found');
  res.json({ message: 'Marked as read' });
});

module.exports = router;
