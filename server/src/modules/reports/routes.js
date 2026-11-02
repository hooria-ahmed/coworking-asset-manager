const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');
const { audit } = require('../../services/audit');
const { getUsage: getAiUsage } = require('../ai/usage');
const { parsePeriod, getSummary, getUsage, getMaintenance, getAiActivity, getMemberSummary } = require('./queries');
const { REPORTS, toCsv, toPdf } = require('./export');

const router = express.Router();
router.use(requireAuth);
const admin = requireRole('Admin');

router.get('/me', async (req, res) => {
  const [summary, ai] = await Promise.all([getMemberSummary(req.user.user_id), getAiUsage(req.user.user_id)]);
  res.json({ ...summary, ai });
});

router.get('/summary', admin, async (req, res) => {
  res.json(await getSummary());
});

router.get('/usage', admin, async (req, res) => {
  res.json(await getUsage(parsePeriod(req.query)));
});

router.get('/maintenance', admin, async (req, res) => {
  res.json(await getMaintenance(parsePeriod(req.query)));
});

router.get('/ai', admin, async (req, res) => {
  const { feature, search, page } = req.query;
  res.json(await getAiActivity(parsePeriod(req.query), { feature, search, page }));
});

router.get('/export', admin, async (req, res) => {
  const type = req.query.type || 'usage';
  const format = req.query.format || 'csv';
  if (!REPORTS[type]) throw new ApiError(400, 'Report type must be usage, maintenance, assets or ai');
  if (!['csv', 'pdf'].includes(format)) throw new ApiError(400, 'Format must be csv or pdf');

  const report = await REPORTS[type](parsePeriod(req.query));
  await audit(req.user.user_id, `export_${type}_${format}`, 'report');
  res.attachment(`${report.filename}.${format}`);
  if (format === 'csv') {
    res.type('text/csv; charset=utf-8').send(toCsv(report));
  } else {
    res.type('application/pdf');
    toPdf(report, req.user.name).pipe(res);
  }
});

module.exports = router;
