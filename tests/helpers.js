// Test helpers: reset the DB, start/stop the API server, make HTTP calls, query the DB directly.
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const mysql = require('/home/claude/app/server/node_modules/mysql2/promise');

const SERVER_DIR = '/home/claude/app/server';
const DB = { host: '127.0.0.1', user: 'app', password: 'apppass', database: 'asset_manager', dateStrings: true };

function resetDb({ demo = false } = {}) {
  execFileSync('node', ['db/setup.js'], { cwd: SERVER_DIR, stdio: 'pipe' });
  if (demo) execFileSync('node', ['db/demo-data.js'], { cwd: SERVER_DIR, stdio: 'pipe' });
}

let pool;
function db() {
  if (!pool) pool = mysql.createPool({ ...DB, connectionLimit: 4 });
  return pool;
}
async function q(sql, params = []) { const [rows] = await db().query(sql, params); return rows; }
async function one(sql, params = []) { return (await q(sql, params))[0]; }

function startServer({ port = 5055, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(port), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.logs = '';
    const onData = (d) => {
      proc.logs += d.toString();
      if (proc.logs.includes('running on')) resolve(proc);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => { proc.logs += d.toString(); });
    proc.on('exit', (code) => reject(new Error(`server exited ${code}\n${proc.logs}`)));
    setTimeout(() => reject(new Error(`server start timeout\n${proc.logs}`)), 15000);
  });
}

function client(base = 'http://127.0.0.1:5055') {
  async function call(method, url, { token, body, raw, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload;
    if (raw !== undefined) { payload = raw; h['Content-Type'] = h['Content-Type'] || 'application/json'; }
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('json')) data = await res.json();
    else data = Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  const api = {
    get: (u, o) => call('GET', u, o),
    post: (u, body, o = {}) => call('POST', u, { ...o, body }),
    put: (u, body, o = {}) => call('PUT', u, { ...o, body }),
    patch: (u, body, o = {}) => call('PATCH', u, { ...o, body }),
    del: (u, o) => call('DELETE', u, o),
    call,
    async login(email, password) {
      const r = await call('POST', '/api/auth/login', { body: { email, password } });
      if (r.status !== 200) throw new Error(`login ${email} failed ${r.status} ${JSON.stringify(r.data)}`);
      return r.data.token;
    },
  };
  return api;
}

// Today / offsets in the DB's own calendar (the server uses CURDATE()).
async function dbToday(offset = 0) {
  const r = await one('SELECT DATE_FORMAT(CURDATE() + INTERVAL ? DAY, "%Y-%m-%d") AS d', [offset]);
  return r.d;
}

async function newMember(api, n) {
  const email = `t${n}_${Date.now()}@test.local`;
  const r = await api.post('/api/auth/register', { name: `Tester ${n}`, email, password: 'Passw0rd!' });
  if (r.status !== 201) throw new Error(`register failed ${JSON.stringify(r.data)}`);
  return { id: r.data.user_id, email, token: await api.login(email, 'Passw0rd!') };
}

module.exports = { resetDb, startServer, client, q, one, dbToday, newMember, db, SERVER_DIR };
