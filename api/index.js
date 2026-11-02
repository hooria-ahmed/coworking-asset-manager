const path = require('path');

// Ensure modules can be resolved from server/node_modules
module.paths.push(path.join(__dirname, '..', 'server', 'node_modules'));

try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env'), quiet: true });
} catch {
  // On Vercel, env vars are injected directly by the platform
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.warn('[Vercel] Warning: JWT_SECRET is missing or shorter than 16 characters in environment variables.');
}

const app = require('../server/src/app');

module.exports = app;


