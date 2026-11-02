const db = require('../../config/db');
const { AI_DAILY_LIMIT } = require('../../config/constants');
const { ApiError } = require('../../utils/http');

const FEATURE = { ASSISTANT: 'Assistant', RECOMMENDATION: 'Recommendation' };

async function usedToday(userId) {
  const [[row]] = await db.query(
    'SELECT COUNT(*) AS used FROM ai_chat_logs WHERE user_id = ? AND created_at >= CURDATE()',
    [userId]
  );
  return Number(row.used);
}

async function getUsage(userId) {
  const used = await usedToday(userId);
  return { used, limit: AI_DAILY_LIMIT, remaining: Math.max(0, AI_DAILY_LIMIT - used) };
}

async function assertWithinLimit(userId) {
  if ((await usedToday(userId)) >= AI_DAILY_LIMIT) {
    throw new ApiError(429, `You have used all ${AI_DAILY_LIMIT} AI requests for today. Please try again tomorrow.`);
  }
}

async function logChat(userId, feature, prompt, response) {
  await db.query(
    'INSERT INTO ai_chat_logs (user_id, feature, prompt, response) VALUES (?, ?, ?, ?)',
    [userId, feature, prompt, response]
  );
}

module.exports = { FEATURE, getUsage, assertWithinLimit, logChat };
