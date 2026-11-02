const db = require('../../config/db');

const CHAT_LOG_RETENTION_DAYS = 90;
const RUN_EVERY_MS = 24 * 60 * 60 * 1000;

async function purgeOldChatLogs() {
  const [result] = await db.query(
    'DELETE FROM ai_chat_logs WHERE created_at < NOW() - INTERVAL ? DAY',
    [CHAT_LOG_RETENTION_DAYS]
  );
  if (result.affectedRows) console.log(`[ai] Deleted ${result.affectedRows} chat log(s) older than ${CHAT_LOG_RETENTION_DAYS} days`);
  return result.affectedRows;
}

function start() {
  const run = () => purgeOldChatLogs().catch((err) => console.error('[ai] Chat log cleanup failed:', err.message));
  run();
  setInterval(run, RUN_EVERY_MS).unref();
}

module.exports = { start, purgeOldChatLogs, CHAT_LOG_RETENTION_DAYS };
