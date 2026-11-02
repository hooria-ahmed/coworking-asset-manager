// Builds the Express app and mounts every module. Owner: integrator.
// Every module is already mounted here, so members never need to edit this file.
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/error');

const app = express();
// Behind a reverse proxy (Nginx, Render, Railway...) set TRUST_PROXY=1 so req.ip is the visitor's
// address; the login lock-out is kept per address (modules/auth/routes.js).
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '3mb' })); // room for a 2 MB base64 asset image

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./modules/auth/routes'));             // integrator
app.use('/api/users', require('./modules/users/routes'));           // Hamza
app.use('/api/categories', require('./modules/categories/routes')); // Azlaan
app.use('/api/assets', require('./modules/assets/routes'));         // Azlaan
app.use('/api/requests', require('./modules/requests/routes'));     // Hamza
app.use('/api/approvals', require('./modules/approvals/routes'));   // Hamza
app.use('/api/borrowing', require('./modules/borrowing/routes'));   // Hamza
app.use('/api/maintenance', require('./modules/maintenance/routes')); // Azlaan
app.use('/api/history', require('./modules/history/routes'));       // Hooria
app.use('/api/ai', require('./modules/ai/routes'));                 // Misbah
app.use('/api/reports', require('./modules/reports/routes'));       // Misbah
app.use('/api/notifications', require('./modules/notifications/routes')); // Hooria

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

// After `npm run build` the server also serves the built React app, so the live site is one deploy.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { redirect: false })); // /assets is both a page and dist/assets/
  app.get('/{*path}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
