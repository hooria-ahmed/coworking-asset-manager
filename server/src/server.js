// Load server/.env wherever the server is started from (npm start in the main folder runs it
// from asset-manager-app/, where a plain require('dotenv').config() would not find the file).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// Fail fast on a missing secret: without it every login would answer 500 (and an empty or
// short secret would make the tokens easy to forge).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or shorter than 16 characters. Set it in server/.env and start again.');
  process.exit(1);
}

const app = require('./app');

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`Asset Manager API running on http://localhost:${port}`);
  require('./modules/borrowing/jobs').start();
  require('./modules/notifications/jobs').start();
  require('./modules/ai/jobs').start(); // deletes AI chat logs older than 90 days (OR-DB-06)
});