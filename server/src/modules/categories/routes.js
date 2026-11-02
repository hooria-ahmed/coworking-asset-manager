const express = require('express');
const db = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { audit } = require('../../services/audit');
const { idParam } = require('../requests/rules');

const router = express.Router();
router.use(requireAuth);
const admin = requireRole('Admin');

const NAME_MAX = 60;
const DESC_MAX = 255;

function cleanName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new ApiError(400, 'Category name is required');
  if (name.length > NAME_MAX) throw new ApiError(400, `Category name can be at most ${NAME_MAX} characters`);
  return name;
}

function cleanDescription(value) {
  const text = String(value ?? '').trim();
  if (text.length > DESC_MAX) throw new ApiError(400, `Description can be at most ${DESC_MAX} characters`);
  return text || null;
}

async function saveOrConflict(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'A category with this name already exists');
    throw err;
  }
}

router.get('/', async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.category_id, c.name, c.description,
            COUNT(a.asset_id) AS asset_count,
            COALESCE(SUM(a.status <> 'Retired'), 0) AS active_count
       FROM categories c LEFT JOIN assets a ON a.category_id = c.category_id
      GROUP BY c.category_id ORDER BY c.name`
  );
  res.json(rows.map((r) => ({ ...r, asset_count: Number(r.asset_count), active_count: Number(r.active_count) })));
});

router.post('/', admin, async (req, res) => {
  const name = cleanName(req.body?.name);
  const description = cleanDescription(req.body?.description);
  const [result] = await saveOrConflict(() =>
    db.query('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description])
  );
  await audit(req.user.user_id, 'create', 'category', result.insertId);
  res.status(201).json({ category_id: result.insertId });
});

router.patch('/:id', admin, async (req, res) => {
  const id = idParam(req.params.id, 'category');
  const sets = [];
  const params = [];
  if (req.body?.name !== undefined) { sets.push('name = ?'); params.push(cleanName(req.body.name)); }
  if (req.body?.description !== undefined) { sets.push('description = ?'); params.push(cleanDescription(req.body.description)); }
  if (!sets.length) throw new ApiError(400, 'Nothing to change: send a name or a description');
  const [result] = await saveOrConflict(() =>
    db.query(`UPDATE categories SET ${sets.join(', ')} WHERE category_id = ?`, [...params, id])
  );
  if (!result.affectedRows) throw new ApiError(404, 'This category does not exist');
  await audit(req.user.user_id, 'update', 'category', id);
  res.json({ message: 'Category saved' });
});

router.delete('/:id', admin, async (req, res) => {
  const id = idParam(req.params.id, 'category');
  const [[cat]] = await db.query(
    `SELECT c.name, COUNT(a.asset_id) AS n FROM categories c LEFT JOIN assets a ON a.category_id = c.category_id
      WHERE c.category_id = ? GROUP BY c.category_id`,
    [id]
  );
  if (!cat) throw new ApiError(404, 'This category does not exist');
  if (Number(cat.n) > 0) {
    throw new ApiError(409, `Category has assets: move or delete the ${cat.n} asset${cat.n == 1 ? '' : 's'} in "${cat.name}" first`);
  }
  await db.query('DELETE FROM categories WHERE category_id = ?', [id]);
  await audit(req.user.user_id, 'delete', 'category', id);
  res.json({ message: `Category "${cat.name}" deleted` });
});

module.exports = router;
