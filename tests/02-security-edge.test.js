// Adversarial, edge-case and concurrency tests. Each test asserts the CORRECT behaviour,
// so a failure here is a finding.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const H = require('./helpers');

const api = H.client();
let server, admin, member, memberId;

before(async () => {
  H.resetDb();
  server = await H.startServer({ env: { TRUST_PROXY: 'loopback' } }); // lets tests act as other addresses
  admin = await api.login('admin@cowork.local', 'Admin@123');
  member = await api.login('member@cowork.local', 'Member@123');
  memberId = (await H.one("SELECT user_id FROM users WHERE email='member@cowork.local'")).user_id;
});
after(async () => { server.kill(); await H.db().end(); });

const assetId = async (tag) => (await H.one('SELECT asset_id FROM assets WHERE asset_tag=?', [tag])).asset_id;
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('input type confusion (should be 400, never 500)', () => {
  test('login with numeric email', async () => {
    assert.equal((await api.post('/api/auth/login', { email: 12345, password: 'x' })).status, 400);
  });
  test('login with array email', async () => {
    assert.equal((await api.post('/api/auth/login', { email: ['a@b.co'], password: 'x' })).status, 400);
  });
  test('register with numeric password', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 'N', email: `n${Date.now()}@t.co`, password: 123456789 })).status, 400);
  });
  test('register with numeric name', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 42, email: `m${Date.now()}@t.co`, password: 'Passw0rd!' })).status, 400);
  });
  test('register with 101-char name', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 'x'.repeat(101), email: `l${Date.now()}@t.co`, password: 'Passw0rd!' })).status, 400);
  });
  test('register with 21-char contact number', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 'C', email: `c${Date.now()}@t.co`, password: 'Passw0rd!', contact_no: '0'.repeat(21) })).status, 400);
  });
  test('register with 151-char email', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 'E', email: `${'e'.repeat(140)}@example.com`, password: 'Passw0rd!' })).status, 400);
  });
  test('JSON body that is an array / null', async () => {
    assert.ok((await api.call('POST', '/api/auth/login', { raw: '[]' })).status < 500);
    assert.ok((await api.call('POST', '/api/categories', { raw: 'null', token: admin })).status < 500);
  });
  test('maintenance cost of boolean true is rejected', async () => {
    const r = await api.post('/api/maintenance', { asset_id: await assetId('LAB-001'), issue_description: 'Loose wires', cost: true }, { token: admin });
    assert.equal(r.status, 400);
  });
});

describe('authentication & sessions', () => {
  test('alg:none token rejected', async () => {
    const t = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ user_id: 1, role: 'Admin', name: 'x' })}.`;
    assert.equal((await api.get('/api/users', { token: t })).status, 401);
  });
  test('token signed with another secret rejected', async () => {
    const h = b64url({ alg: 'HS256', typ: 'JWT' });
    const p = b64url({ user_id: 1, role: 'Admin', name: 'x', iat: Math.floor(Date.now() / 1000) });
    const s = crypto.createHmac('sha256', 'wrong').update(`${h}.${p}`).digest('base64url');
    assert.equal((await api.get('/api/users', { token: `${h}.${p}.${s}` })).status, 401);
  });
  test('a deactivated member\'s existing token stops working', async () => {
    const m = await H.newMember(api, 'deact-token');
    await api.patch(`/api/users/${m.id}/status`, { account_status: 'Deactivated' }, { token: admin });
    const me = await api.get('/api/notifications', { token: m.token });
    assert.ok([401, 403].includes(me.status), `deactivated token still accepted: ${me.status}`);
  });
  test('deactivated member can still burn AI quota / write AI logs with old token', async () => {
    const m = await H.newMember(api, 'deact-ai');
    await api.patch(`/api/users/${m.id}/status`, { account_status: 'Deactivated' }, { token: admin });
    const r = await api.post('/api/ai/recommend', { requirement: 'laptop', purpose: 'x', start_date: await H.dbToday(1), duration_days: 1 }, { token: m.token });
    assert.ok([401, 403].includes(r.status), `got ${r.status}`);
  });
  test('lockout counter survives parallel wrong-password attempts (no brute-force bypass)', async () => {
    const m = await H.newMember(api, 'race-lock');
    await Promise.all(Array.from({ length: 25 }, () => api.post('/api/auth/login', { email: m.email, password: 'wrong' })));
    const r = await api.post('/api/auth/login', { email: m.email, password: 'Passw0rd!' });
    const u = await H.one('SELECT failed_logins, locked_until FROM users WHERE user_id=?', [m.id]);
    assert.equal(r.status, 423, `25 parallel wrong attempts did not lock the account (failed_logins=${u.failed_logins})`);
    assert.ok(Number(u.failed_logins) <= 5, `${u.failed_logins} password guesses were checked; the limit is 5`);
  });
  test('deactivated status is revealed without the right password (account enumeration)', async () => {
    const m = await H.newMember(api, 'enum');
    await api.patch(`/api/users/${m.id}/status`, { account_status: 'Deactivated' }, { token: admin });
    const r = await api.post('/api/auth/login', { email: m.email, password: 'definitely-wrong' });
    assert.equal(r.status, 401, `wrong password on a deactivated account returned ${r.status}: ${r.data.error}`);
  });
});

describe('injection & file serving', () => {
  test('SQL metacharacters in search/filters do not error or leak', async () => {
    for (const s of ["' OR 1=1 -- ", '"; DROP TABLE assets; --', '\\', "%' UNION SELECT password_hash FROM users -- "]) {
      const r = await api.get(`/api/assets?search=${encodeURIComponent(s)}`, { token: member });
      assert.equal(r.status, 200); assert.equal(r.data.total, 0);
      const u = await api.get(`/api/users?search=${encodeURIComponent(s)}`, { token: admin });
      assert.equal(u.status, 200);
    }
    const r2 = await api.get(`/api/assets?sort=${encodeURIComponent('name; DROP TABLE x')}&category_id=${encodeURIComponent('1 OR 1=1')}`, { token: member });
    assert.equal(r2.status, 200);
    assert.equal(r2.data.total, 0);
  });
  test('static image route does not expose .env or source files', async () => {
    for (const p of ['/api/assets/images/..%2F.env', '/api/assets/images/..%2F..%2F.env', '/api/assets/images/%2e%2e/%2e%2e/src/app.js']) {
      const r = await api.get(p);
      assert.notEqual(r.status, 200, p);
    }
  });
  test('CSV export neutralises spreadsheet formulas (CSV injection)', async () => {
    await api.post('/api/assets', { asset_tag: 'CSV-1', name: '=HYPERLINK("http://evil.example","Click")', category_id: 1, location: '+cmd|calc', condition: 'Good' }, { token: admin });
    const r = await api.get('/api/reports/export?type=assets&format=csv', { token: admin });
    const line = r.data.toString().split('\r\n').find((l) => l.startsWith('CSV-1'));
    assert.ok(line, 'row present');
    assert.ok(!/,"?=HYPERLINK/.test(line) && !/,\+cmd/.test(line), `formula exported raw: ${line}`);
  });
  test('one asset can point at another asset\'s uploaded image and delete it', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const a = await api.post('/api/assets', { asset_tag: 'IMG-A', name: 'A', category_id: 1, location: 'L', condition: 'Good', image: `data:image/png;base64,${png.toString('base64')}` }, { token: admin });
    const pathA = (await H.one('SELECT image_path FROM assets WHERE asset_id=?', [a.data.asset_id])).image_path;
    const b = await api.post('/api/assets', { asset_tag: 'IMG-B', name: 'B', category_id: 1, location: 'L', condition: 'Good', image: pathA }, { token: admin });
    await api.del(`/api/assets/${b.data.asset_id}`, { token: admin });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await api.get(pathA)).status, 200, 'deleting asset B removed asset A\'s picture file');
  });
});

describe('data-length overflows after a committed change (500 after success)', () => {
  test('approving an asset with a long name + long location', async () => {
    const r = await api.post('/api/assets', {
      asset_tag: 'LONG-1', name: 'N'.repeat(100), category_id: 1, location: 'L'.repeat(100), condition: 'Good',
    }, { token: admin });
    const req = await api.post('/api/requests', { asset_id: r.data.asset_id, purpose: 'x', start_date: await H.dbToday(1), duration_days: 2 }, { token: member });
    assert.equal(req.status, 201, JSON.stringify(req.data));
    const ap = await api.patch(`/api/approvals/${req.data.request_id}/approve`, {}, { token: admin });
    const st = (await H.one('SELECT status FROM asset_requests WHERE request_id=?', [req.data.request_id])).status;
    assert.equal(ap.status, 200, `approve returned ${ap.status} (${ap.data.error}) but request is now ${st}`);
  });
});

describe('business-rule edges', () => {
  test('a Reserved asset can still be requested for later, non-overlapping dates', async () => {
    const id = await assetId('LAP-001');
    const a = await api.post('/api/requests', { asset_id: id, purpose: 'Week 1', start_date: await H.dbToday(1), duration_days: 2 }, { token: member });
    await api.patch(`/api/approvals/${a.data.request_id}/approve`, {}, { token: admin });
    const m2 = await H.newMember(api, 'later');
    const b = await api.post('/api/requests', { asset_id: id, purpose: 'Week 3', start_date: await H.dbToday(15), duration_days: 2 }, { token: m2.token });
    assert.equal(b.status, 201, `got ${b.status}: ${b.data.error}`);
  });
  test('issuing to a member whose account was deactivated is refused', async () => {
    const m = await H.newMember(api, 'deact-issue');
    const id = await assetId('CAM-001');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Shoot', start_date: await H.dbToday(0), duration_days: 1 }, { token: m.token });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    await api.patch(`/api/users/${m.id}/status`, { account_status: 'Deactivated' }, { token: admin });
    const iss = await api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin });
    assert.equal(iss.status, 409, `issued to a deactivated member (${iss.status})`);
  });
  test('seed asset "Under Maintenance" has a maintenance record (so it is fixable from the Maintenance screen)', async () => {
    const id = await assetId('PRJ-002');
    const n = await H.one("SELECT COUNT(*) n FROM maintenance_logs WHERE asset_id=? AND status<>'Closed'", [id]);
    assert.equal(Number(n.n), 1, 'PRJ-002 is Under Maintenance with no open record');
  });
  test('wide report period (1000-01-01..8999-12-31) answers quickly', async () => {
    const t0 = Date.now();
    const r = await api.get('/api/reports/usage?from=1000-01-01&to=8999-12-31', { token: admin });
    const ms = Date.now() - t0;
    assert.ok(r.status === 400 || ms < 2000, `took ${ms} ms (status ${r.status})`);
  });
  test('report ending 9999-12-31 is refused instead of hanging the server', async () => {
    const ctrl = AbortSignal.timeout(3000);
    const res = await fetch('http://127.0.0.1:5055/api/reports/usage?from=9999-12-01&to=9999-12-31', { headers: { Authorization: `Bearer ${admin}` }, signal: ctrl });
    assert.equal(res.status, 400);
    assert.equal((await api.get('/api/health')).status, 200);
  });
});

describe('concurrency', () => {
  test('parallel approvals of overlapping requests: exactly one wins', async () => {
    const id = await assetId('PRJ-001');
    const start = await H.dbToday(20);
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const m = await H.newMember(api, `par${i}`);
      const r = await api.post('/api/requests', { asset_id: id, purpose: `p${i}`, start_date: start, duration_days: 3 }, { token: m.token });
      ids.push(r.data.request_id);
    }
    const res = await Promise.all(ids.map((rid) => api.patch(`/api/approvals/${rid}/approve`, {}, { token: admin })));
    const ok = res.filter((r) => r.status === 200).length;
    assert.equal(ok, 1, `statuses: ${res.map((r) => r.status)}`);
    assert.ok(res.every((r) => r.status < 500), `statuses: ${res.map((r) => r.status)}`);
  });
  test('parallel issue of the same request: exactly one borrow record', async () => {
    const id = await assetId('CBL-001');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Cable', start_date: await H.dbToday(0), duration_days: 1 }, { token: member });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    const res = await Promise.all(Array.from({ length: 6 }, () => api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin })));
    assert.equal(res.filter((x) => x.status === 201).length, 1, `statuses: ${res.map((x) => x.status)}`);
    assert.ok(res.every((x) => x.status < 500), `statuses: ${res.map((x) => x.status)}`);
  });
  test('parallel returns of the same loan: one success, no 500s', async () => {
    const b = await H.one("SELECT b.borrow_id FROM borrow_records b JOIN assets a ON a.asset_id=b.asset_id WHERE a.asset_tag='CBL-001' AND b.returned_at IS NULL");
    const res = await Promise.all(Array.from({ length: 5 }, () => api.patch(`/api/borrowing/${b.borrow_id}/return`, { return_condition: 'Good' }, { token: admin })));
    assert.equal(res.filter((x) => x.status === 200).length, 1, `statuses: ${res.map((x) => x.status)}`);
  });
  test('double-clicked "Request" creates only one pending request', async () => {
    const id = await assetId('LAB-001');
    const m = await H.newMember(api, 'dbl');
    const start = await H.dbToday(3);
    await Promise.all(Array.from({ length: 5 }, () => api.post('/api/requests', { asset_id: id, purpose: 'Kit', start_date: start, duration_days: 1 }, { token: m.token })));
    const n = await H.one("SELECT COUNT(*) n FROM asset_requests WHERE user_id=? AND status='Pending'", [m.id]);
    assert.equal(Number(n.n), 1, `${n.n} duplicate pending requests created`);
  });
  test('parallel member problem reports create only one open record', async () => {
    const id = await assetId('LAP-003');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Docs', start_date: await H.dbToday(0), duration_days: 2 }, { token: member });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    await api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin });
    await Promise.all(Array.from({ length: 5 }, () => api.post('/api/maintenance/report', { asset_id: id, issue_description: 'Keyboard sticky' }, { token: member })));
    const n = await H.one("SELECT COUNT(*) n FROM maintenance_logs WHERE asset_id=? AND status<>'Closed'", [id]);
    assert.equal(Number(n.n), 1, `${n.n} open records for one asset`);
  });
});

describe('denial of service against accounts', () => {
  test('a stranger cannot lock the admin out from another address', async () => {
    const attacker = { headers: { 'X-Forwarded-For': '203.0.113.9' } };
    for (let i = 0; i < 5; i++) await api.call('POST', '/api/auth/login', { ...attacker, body: { email: 'admin@cowork.local', password: 'guess' } });
    const blockedAttacker = await api.call('POST', '/api/auth/login', { ...attacker, body: { email: 'admin@cowork.local', password: 'Admin@123' } });
    const r = await api.post('/api/auth/login', { email: 'admin@cowork.local', password: 'Admin@123' });
    await H.q("UPDATE users SET failed_logins=0, locked_until=NULL WHERE email='admin@cowork.local'");
    assert.equal(blockedAttacker.status, 423, 'the attacking address is locked out');
    assert.equal(r.status, 200, `admin locked out by an anonymous caller (${r.status})`);
  });
});
