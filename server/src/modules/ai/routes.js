const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { isAIConfigured } = require('../../services/llm');
const { chat } = require('./assistant');
const { recommend } = require('./recommend');
const { getUsage } = require('./usage');

const router = express.Router();
router.use(requireAuth);

router.post('/chat', async (req, res) => {
  res.json(await chat(req.body, req.user));
});

router.post('/recommend', async (req, res) => {
  res.json(await recommend(req.body, req.user));
});

router.get('/usage', async (req, res) => {
  res.json({ ...(await getUsage(req.user.user_id)), ai_available: isAIConfigured() });
});

module.exports = router;
