// Functional tests for every module on a clean seed database.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

const api = H.client();
let server, admin, member, adminId, memberId;

before(async () => {
  H.resetDb();
  server = await H.startServer();
  admin = await api.login('admin@cowork.local', 'Admin@123');
  member = await api.login('member@cowork.local', 'Member@123');
  adminId = (await H.one("SELECT user_id FROM users WHERE email='admin@cowork.local'")).user_id;
  memberId = (await H.one("SELECT user_id FROM users WHERE email='member@cowork.local'")).user_id;
});
after(async () => { server.kill(); await H.db().end(); });

const assetId = async (tag) => (await H.one('SELECT asset_id FROM assets WHERE asset_tag=?', [tag])).asset_id;
const assetStatus = async (id) => (await H.one('SELECT status FROM assets WHERE asset_id=?', [id])).status;

describe('health & routing', () => {
  test('health ok', async () => {
    const r = await api.get('/api/health');
    assert.equal(r.status, 200); assert.deepEqual(r.data, { ok: true });
  });
  test('unknown api route -> 404 json', async () => {
    const r = await api.get('/api/nope');
    assert.equal(r.status, 404); assert.ok(r.data.error);
  });
  test('malformed JSON -> 400 not 500', async () => {
    const r = await api.call('POST', '/api/auth/login', { raw: '{bad json' });
    assert.equal(r.status, 400);
  });
});

describe('auth', () => {
  test('register validates email and password length', async () => {
    assert.equal((await api.post('/api/auth/register', { name: 'A', email: 'bad', password: 'Passw0rd!' })).status, 400);
    assert.equal((await api.post('/api/auth/register', { name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
    assert.equal((await api.post('/api/auth/register', { email: 'a@b.co', password: 'Passw0rd!' })).status, 400);
  });
  test('register then login, /me returns no password hash', async () => {
    const m = await H.newMember(api, 'reg');
    const me = await api.get('/api/auth/me', { token: m.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.role, 'Member');
    assert.equal(me.data.password_hash, undefined);
  });
  test('duplicate email rejected, case-insensitively', async () => {
    const r = await api.post('/api/auth/register', { name: 'Dup', email: 'MEMBER@cowork.local', password: 'Passw0rd!' });
    assert.equal(r.status, 409);
  });
  test('register cannot self-assign Admin role', async () => {
    const email = `role${Date.now()}@t.local`;
    await api.post('/api/auth/register', { name: 'X', email, password: 'Passw0rd!', role: 'Admin' });
    const u = await H.one('SELECT role FROM users WHERE email=?', [email]);
    assert.equal(u.role, 'Member');
  });
  test('login is case-insensitive on email and gives generic error', async () => {
    assert.equal((await api.post('/api/auth/login', { email: 'Member@Cowork.Local', password: 'Member@123' })).status, 200);
    const bad = await api.post('/api/auth/login', { email: 'member@cowork.local', password: 'wrong' });
    const missing = await api.post('/api/auth/login', { email: 'nobody@cowork.local', password: 'wrong' });
    assert.equal(bad.status, 401); assert.equal(missing.status, 401);
    assert.equal(bad.data.error, missing.data.error);
  });
  test('5 wrong passwords lock the account (423), even with the right password', async () => {
    const m = await H.newMember(api, 'lock');
    for (let i = 0; i < 5; i++) await api.post('/api/auth/login', { email: m.email, password: 'nope' });
    const r = await api.post('/api/auth/login', { email: m.email, password: 'Passw0rd!' });
    assert.equal(r.status, 423);
  });
  test('protected route without / with garbage token -> 401', async () => {
    assert.equal((await api.get('/api/auth/me')).status, 401);
    assert.equal((await api.get('/api/auth/me', { token: 'abc.def.ghi' })).status, 401);
  });
});

describe('categories', () => {
  test('list visible to member with counts', async () => {
    const r = await api.get('/api/categories', { token: member });
    assert.equal(r.status, 200); assert.equal(r.data.length, 6);
    assert.equal(typeof r.data[0].asset_count, 'number');
  });
  test('member cannot create', async () => {
    assert.equal((await api.post('/api/categories', { name: 'X' }, { token: member })).status, 403);
  });
  test('admin create / duplicate / rename / delete', async () => {
    const c = await api.post('/api/categories', { name: '  Drones   Kits ' }, { token: admin });
    assert.equal(c.status, 201);
    const row = await H.one('SELECT name FROM categories WHERE category_id=?', [c.data.category_id]);
    assert.equal(row.name, 'Drones Kits');
    assert.equal((await api.post('/api/categories', { name: 'drones kits' }, { token: admin })).status, 409);
    assert.equal((await api.patch(`/api/categories/${c.data.category_id}`, { name: 'Drones' }, { token: admin })).status, 200);
    assert.equal((await api.patch(`/api/categories/${c.data.category_id}`, {}, { token: admin })).status, 400);
    assert.equal((await api.del(`/api/categories/${c.data.category_id}`, { token: admin })).status, 200);
    assert.equal((await api.del(`/api/categories/${c.data.category_id}`, { token: admin })).status, 404);
  });
  test('cannot delete category that has assets', async () => {
    assert.equal((await api.del('/api/categories/1', { token: admin })).status, 409);
  });
  test('name length limit', async () => {
    assert.equal((await api.post('/api/categories', { name: 'x'.repeat(61) }, { token: admin })).status, 400);
  });
});

describe('assets', () => {
  test('list paginates, sorts and returns status counts', async () => {
    const r = await api.get('/api/assets?sort=tag', { token: admin });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 10);
    assert.equal(r.data.items[0].asset_tag, 'CAM-001');
    assert.equal(r.data.statusCounts['Under Maintenance'], 1);
  });
  test('search covers name, tag, description and category; LIKE wildcards escaped', async () => {
    assert.equal((await api.get('/api/assets?search=laptop', { token: member })).data.total, 3);
    assert.equal((await api.get('/api/assets?search=LAP-00', { token: member })).data.total, 3);
    assert.equal((await api.get('/api/assets?search=%25', { token: member })).data.total, 0);
    assert.equal((await api.get('/api/assets?search=_', { token: member })).data.total, 0);
  });
  test('filters combine; bad filter -> 400', async () => {
    const r = await api.get('/api/assets?category_id=3&status=Available', { token: admin });
    assert.equal(r.data.total, 1);
    assert.equal((await api.get('/api/assets?status=Bogus', { token: admin })).status, 400);
    assert.equal((await api.get('/api/assets?condition=Bogus', { token: admin })).status, 400);
  });
  test('page beyond end returns empty items; negative page clamps to 1', async () => {
    assert.equal((await api.get('/api/assets?page=99', { token: admin })).data.items.length, 0);
    assert.equal((await api.get('/api/assets?page=-5', { token: admin })).data.page, 1);
  });
  test('create validates fields', async () => {
    const base = { asset_tag: 'TST-001', name: 'Test', category_id: 1, location: 'L1', condition: 'Good' };
    assert.equal((await api.post('/api/assets', { ...base, condition: 'Broken' }, { token: admin })).status, 400);
    assert.equal((await api.post('/api/assets', { ...base, category_id: 999 }, { token: admin })).status, 400);
    assert.equal((await api.post('/api/assets', { ...base, asset_tag: 'bad tag!' }, { token: admin })).status, 400);
    assert.equal((await api.post('/api/assets', { ...base, status: 'Borrowed' }, { token: admin })).status, 400);
    assert.equal((await api.post('/api/assets', { ...base, name: 'x'.repeat(101) }, { token: admin })).status, 400);
    assert.equal((await api.post('/api/assets', base, { token: member })).status, 403);
  });
  test('create, duplicate tag (case-insensitive) -> 409', async () => {
    const r = await api.post('/api/assets', { asset_tag: 'tst-001', name: 'Test', category_id: 1, location: 'L1', condition: 'Good' }, { token: admin });
    assert.equal(r.status, 201);
    assert.equal((await H.one('SELECT asset_tag FROM assets WHERE asset_id=?', [r.data.asset_id])).asset_tag, 'TST-001');
    const dup = await api.post('/api/assets', { asset_tag: 'TST-001', name: 'T2', category_id: 1, location: 'L1', condition: 'Good' }, { token: admin });
    assert.equal(dup.status, 409);
  });
  test('create Under Maintenance opens a maintenance record', async () => {
    const r = await api.post('/api/assets', { asset_tag: 'TST-UM', name: 'Broken thing', category_id: 1, location: 'L1', condition: 'Damaged', status: 'Under Maintenance' }, { token: admin });
    assert.equal(r.status, 201);
    const m = await H.one("SELECT COUNT(*) n FROM maintenance_logs WHERE asset_id=? AND status='Open'", [r.data.asset_id]);
    assert.equal(Number(m.n), 1);
  });
  test('image upload: valid PNG accepted & served, fake PNG rejected, >2MB rejected', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const ok = await api.post('/api/assets', { asset_tag: 'IMG-1', name: 'Img', category_id: 1, location: 'L', condition: 'Good', image: `data:image/png;base64,${png.toString('base64')}` }, { token: admin });
    assert.equal(ok.status, 201);
    const a = await H.one('SELECT image_path FROM assets WHERE asset_id=?', [ok.data.asset_id]);
    const img = await api.get(a.image_path);
    assert.equal(img.status, 200);
    const fake = await api.post('/api/assets', { asset_tag: 'IMG-2', name: 'Img', category_id: 1, location: 'L', condition: 'Good', image: `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` }, { token: admin });
    assert.equal(fake.status, 400);
    const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await api.post('/api/assets', { asset_tag: 'IMG-3', name: 'Img', category_id: 1, location: 'L', condition: 'Good', image: `data:image/png;base64,${big.toString('base64')}` }, { token: admin });
    assert.ok([400, 413].includes(tooBig.status), `got ${tooBig.status}`);
  });
  test('details: member sees can_request; admin sees current_loan', async () => {
    const id = await assetId('LAP-003');
    const m = await api.get(`/api/assets/${id}`, { token: member });
    assert.equal(m.data.can_request, true); assert.ok('my_loan' in m.data);
    const a = await api.get(`/api/assets/${id}`, { token: admin });
    assert.equal(a.data.can_request, false); assert.ok('current_loan' in a.data);
    assert.equal((await api.get('/api/assets/abc', { token: admin })).status, 404);
  });
  test('update: partial edit, illegal status transitions blocked', async () => {
    const id = await assetId('LAP-003');
    assert.equal((await api.put(`/api/assets/${id}`, { location: 'Floor 3' }, { token: admin })).status, 200);
    assert.equal((await api.put(`/api/assets/${id}`, { status: 'Borrowed' }, { token: admin })).status, 409);
    assert.equal((await api.put(`/api/assets/${id}`, { status: 'Under Maintenance' }, { token: admin })).status, 409);
    const um = await assetId('PRJ-002');
    assert.equal((await api.put(`/api/assets/${um}`, { status: 'Available' }, { token: admin })).status, 409);
  });
  test('delete: no history -> hard delete; history -> retired; retired hidden from members', async () => {
    const r = await api.post('/api/assets', { asset_tag: 'DEL-1', name: 'Del', category_id: 1, location: 'L', condition: 'Good' }, { token: admin });
    const d = await api.del(`/api/assets/${r.data.asset_id}`, { token: admin });
    assert.equal(d.status, 200); assert.equal(d.data.retired, false);
    const um = await H.one("SELECT asset_id FROM assets WHERE asset_tag='TST-UM'");
    assert.equal((await api.del(`/api/assets/${um.asset_id}`, { token: admin })).status, 409);
  });
  test('locations list', async () => {
    const r = await api.get('/api/assets/locations', { token: member });
    assert.ok(r.data.includes('Floor 1 - Lab A'));
  });
});

describe('request -> approve -> issue -> return lifecycle', () => {
  let reqId, borrowId, id;
  test('member requests an Available asset', async () => {
    id = await assetId('LAP-002');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Editing', start_date: await H.dbToday(0), duration_days: 3 }, { token: member });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.end_date, await H.dbToday(2));
    reqId = r.data.request_id;
    const n = await H.one("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND type='new_request'", [adminId]);
    assert.ok(Number(n.n) >= 1);
  });
  test('request validation', async () => {
    const id2 = await assetId('LAP-003');
    const base = { asset_id: id2, purpose: 'x', start_date: await H.dbToday(1), duration_days: 2 };
    assert.equal((await api.post('/api/requests', { ...base, start_date: await H.dbToday(-1) }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, start_date: '2026-02-30' }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, duration_days: 0 }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, duration_days: 31 }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, duration_days: 2.5 }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, purpose: '   ' }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', { ...base, purpose: 'x'.repeat(256) }, { token: member })).status, 400);
    assert.equal((await api.post('/api/requests', base, { token: admin })).status, 403);
    const um = await assetId('PRJ-002');
    assert.equal((await api.post('/api/requests', { ...base, asset_id: um }, { token: member })).status, 409);
  });
  test('member cannot double-request the same dates', async () => {
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Again', start_date: await H.dbToday(1), duration_days: 1 }, { token: member });
    assert.equal(r.status, 409);
  });
  test('pending list shows request with no conflict', async () => {
    const r = await api.get('/api/approvals/pending', { token: admin });
    const row = r.data.find((x) => x.request_id === reqId);
    assert.ok(row); assert.equal(row.conflict, false);
    assert.equal((await api.get('/api/approvals/pending', { token: member })).status, 403);
  });
  test('reject needs a reason', async () => {
    assert.equal((await api.patch(`/api/approvals/${reqId}/reject`, {}, { token: admin })).status, 400);
  });
  test('approve -> asset Reserved, member notified', async () => {
    const r = await api.patch(`/api/approvals/${reqId}/approve`, {}, { token: admin });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(await assetStatus(id), 'Reserved');
    assert.equal((await api.patch(`/api/approvals/${reqId}/approve`, {}, { token: admin })).status, 409);
    const n = await H.one("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND type='request_approved'", [memberId]);
    assert.equal(Number(n.n), 1);
  });
  test('member cannot cancel an approved request themselves', async () => {
    assert.equal((await api.patch(`/api/requests/${reqId}/cancel`, {}, { token: member })).status, 409);
  });
  test('to-issue lists it; issue -> Borrowed; double issue blocked', async () => {
    const t = await api.get('/api/borrowing/to-issue', { token: admin });
    assert.ok(t.data.some((x) => x.request_id === reqId));
    const r = await api.post('/api/borrowing/issue', { request_id: reqId }, { token: admin });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    borrowId = r.data.borrow_id;
    assert.equal(await assetStatus(id), 'Borrowed');
    assert.equal((await api.post('/api/borrowing/issue', { request_id: reqId }, { token: admin })).status, 409);
  });
  test('active loans and member dashboard reflect the loan', async () => {
    const a = await api.get('/api/borrowing/active', { token: admin });
    assert.ok(a.data.some((x) => x.borrow_id === borrowId));
    const me = await api.get('/api/reports/me', { token: member });
    assert.equal(me.data.borrowed.length, 1);
  });
  test('member reports a problem with the borrowed asset', async () => {
    assert.equal((await api.post('/api/maintenance/report', { asset_id: id, issue_description: 'bad' }, { token: member })).status, 400);
    const r = await api.post('/api/maintenance/report', { asset_id: id, issue_description: 'Screen flickers sometimes' }, { token: member });
    assert.equal(r.status, 201);
    assert.equal((await api.post('/api/maintenance/report', { asset_id: id, issue_description: 'Screen flickers again' }, { token: member })).status, 409);
    assert.equal(await assetStatus(id), 'Borrowed');
  });
  test('return validation', async () => {
    assert.equal((await api.patch(`/api/borrowing/${borrowId}/return`, { return_condition: 'Meh' }, { token: admin })).status, 400);
    assert.equal((await api.patch(`/api/borrowing/${borrowId}/return`, { return_condition: 'Good', return_date: await H.dbToday(1) }, { token: admin })).status, 400);
    assert.equal((await api.patch(`/api/borrowing/${borrowId}/return`, { return_condition: 'Good', return_date: await H.dbToday(-3) }, { token: admin })).status, 400);
  });
  test('Good return with open member report -> Under Maintenance, request Completed', async () => {
    const r = await api.patch(`/api/borrowing/${borrowId}/return`, { return_condition: 'Good' }, { token: admin });
    assert.equal(r.status, 200);
    assert.equal(r.data.asset_status, 'Under Maintenance');
    assert.equal((await H.one('SELECT status FROM asset_requests WHERE request_id=?', [reqId])).status, 'Completed');
    assert.equal((await api.patch(`/api/borrowing/${borrowId}/return`, { return_condition: 'Good' }, { token: admin })).status, 409);
  });
  test('close maintenance as Repaired -> Available, reporter notified', async () => {
    const m = await H.one("SELECT maintenance_id FROM maintenance_logs WHERE asset_id=? AND status<>'Closed'", [id]);
    assert.equal((await api.patch(`/api/maintenance/${m.maintenance_id}`, { status: 'In Progress', cost: '1500.555' }, { token: admin })).status, 200);
    assert.equal((await H.one('SELECT cost FROM maintenance_logs WHERE maintenance_id=?', [m.maintenance_id])).cost, '1500.56');
    const r = await api.patch(`/api/maintenance/${m.maintenance_id}/close`, { outcome: 'Repaired' }, { token: admin });
    assert.equal(r.status, 200);
    assert.equal(r.data.asset_status, 'Available');
    assert.equal((await api.patch(`/api/maintenance/${m.maintenance_id}`, { notes: 'x' }, { token: admin })).status, 409);
    const n = await H.one("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND type='problem_resolved'", [memberId]);
    assert.equal(Number(n.n), 1);
  });
  test('history shows the full trail', async () => {
    const mine = await api.get('/api/history/mine', { token: member });
    assert.ok(mine.data.borrowings.some((b) => b.borrow_id === borrowId));
    const h = await api.get(`/api/history/asset/${id}`, { token: admin });
    assert.equal(h.data.borrowings.length, 1); assert.equal(h.data.maintenance.length, 1);
    assert.equal((await api.get(`/api/history/asset/${id}`, { token: member })).status, 403);
  });
});

describe('approvals: competing requests, cancel, reject', () => {
  test('two members want the same dates: second approval is blocked', async () => {
    const id = await assetId('CAM-001');
    const m2 = await H.newMember(api, 'comp');
    const start = await H.dbToday(5);
    const a = await api.post('/api/requests', { asset_id: id, purpose: 'Shoot A', start_date: start, duration_days: 2 }, { token: member });
    const b = await api.post('/api/requests', { asset_id: id, purpose: 'Shoot B', start_date: start, duration_days: 2 }, { token: m2.token });
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    const pend = (await api.get('/api/approvals/pending', { token: admin })).data;
    assert.equal(pend.find((x) => x.request_id === a.data.request_id).competing, 1);
    assert.equal((await api.patch(`/api/approvals/${a.data.request_id}/approve`, {}, { token: admin })).status, 200);
    const pend2 = (await api.get('/api/approvals/pending', { token: admin })).data;
    assert.equal(pend2.find((x) => x.request_id === b.data.request_id).conflict, true);
    assert.equal((await api.patch(`/api/approvals/${b.data.request_id}/approve`, {}, { token: admin })).status, 409);
    assert.equal((await api.patch(`/api/approvals/${b.data.request_id}/reject`, { reason: 'Taken' }, { token: admin })).status, 200);
    // admin cancels the approved booking -> asset back to Available
    assert.equal((await api.patch(`/api/approvals/${a.data.request_id}/cancel`, { reason: 'Shoot moved' }, { token: admin })).status, 200);
    assert.equal(await assetStatus(id), 'Available');
  });
  test('issue before start date is refused', async () => {
    const id = await assetId('CBL-001');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Later', start_date: await H.dbToday(3), duration_days: 1 }, { token: member });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    assert.equal((await api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin })).status, 409);
    const up = await api.get('/api/borrowing/upcoming', { token: admin });
    assert.ok(up.data.some((x) => x.request_id === r.data.request_id));
  });
  test('member cancels own pending request; cannot cancel someone else\'s', async () => {
    const id = await assetId('LAB-001');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Kit', start_date: await H.dbToday(2), duration_days: 1 }, { token: member });
    const other = await H.newMember(api, 'idor');
    assert.equal((await api.patch(`/api/requests/${r.data.request_id}/cancel`, {}, { token: other.token })).status, 404);
    assert.equal((await api.patch(`/api/requests/${r.data.request_id}/cancel`, {}, { token: member })).status, 200);
    assert.equal((await api.patch(`/api/requests/${r.data.request_id}/cancel`, {}, { token: member })).status, 409);
  });
  test('approval history log filters by status', async () => {
    const r = await api.get('/api/approvals/history?status=Rejected', { token: admin });
    assert.ok(r.data.length >= 1);
    assert.ok(r.data.every((x) => x.status === 'Rejected'));
  });
});

describe('damaged return & retire paths', () => {
  test('Damaged return -> maintenance record; close as Retired -> Retired, cancels waiting bookings', async () => {
    const id = await assetId('DSK-001');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Render', start_date: await H.dbToday(0), duration_days: 1 }, { token: member });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    const iss = await api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin });
    const ret = await api.patch(`/api/borrowing/${iss.data.borrow_id}/return`, { return_condition: 'Damaged', notes: 'Fan noise' }, { token: admin });
    assert.equal(ret.data.asset_status, 'Under Maintenance');
    const m = await H.one("SELECT maintenance_id, issue_description FROM maintenance_logs WHERE asset_id=? AND status='Open'", [id]);
    assert.match(m.issue_description, /Returned damaged by Test Member: Fan noise/);
    const list = await api.get('/api/maintenance?status=active', { token: admin });
    assert.equal(list.data.find((x) => x.maintenance_id === m.maintenance_id).source, 'return');
    const c = await api.patch(`/api/maintenance/${m.maintenance_id}/close`, { outcome: 'Retired' }, { token: admin });
    assert.equal(c.data.asset_status, 'Retired');
    assert.equal((await api.get(`/api/assets/${id}`, { token: member })).status, 404);
  });
  test('admin retires an Available asset via PUT -> pending requests cancelled & notified', async () => {
    const id = await assetId('CBL-002');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Adapter', start_date: await H.dbToday(4), duration_days: 1 }, { token: member });
    const p = await api.put(`/api/assets/${id}`, { status: 'Retired' }, { token: admin });
    assert.equal(p.status, 200); assert.match(p.data.message, /1 waiting/);
    assert.equal((await H.one('SELECT status FROM asset_requests WHERE request_id=?', [r.data.request_id])).status, 'Cancelled');
    assert.equal((await api.put(`/api/assets/${id}`, { status: 'Available' }, { token: admin })).status, 409);
  });
  test('maintenance create refused for borrowed / retired / already-open', async () => {
    assert.equal((await api.post('/api/maintenance', { asset_id: await assetId('CBL-002'), issue_description: 'Broken pins' }, { token: admin })).status, 409);
    const prj = await assetId('PRJ-001');
    const ok = await api.post('/api/maintenance', { asset_id: prj, issue_description: 'Lens dirty', cost: 200 }, { token: admin });
    assert.equal(ok.status, 201);
    assert.equal((await api.post('/api/maintenance', { asset_id: prj, issue_description: 'Lens dirty 2' }, { token: admin })).status, 409);
    assert.equal((await api.post('/api/maintenance', { asset_id: prj, issue_description: 'x', cost: -5 }, { token: admin })).status, 400);
  });
});

describe('users', () => {
  test('list with search, filters, loan counts', async () => {
    const r = await api.get('/api/users?search=member&role=Member', { token: admin });
    assert.equal(r.status, 200);
    assert.ok(r.data.every((u) => u.role === 'Member'));
    assert.equal(r.data[0].password_hash, undefined);
    assert.equal((await api.get('/api/users', { token: member })).status, 403);
  });
  test('deactivate member cancels pending requests and blocks login; admin/self protected', async () => {
    const m = await H.newMember(api, 'deact');
    const r = await api.post('/api/requests', { asset_id: await assetId('LAB-001'), purpose: 'Kit', start_date: await H.dbToday(9), duration_days: 1 }, { token: m.token });
    assert.equal(r.status, 201);
    const d = await api.patch(`/api/users/${m.id}/status`, { account_status: 'Deactivated' }, { token: admin });
    assert.equal(d.data.cancelled_requests, 1);
    assert.equal((await api.post('/api/auth/login', { email: m.email, password: 'Passw0rd!' })).status, 403);
    assert.equal((await api.patch(`/api/users/${adminId}/status`, { account_status: 'Deactivated' }, { token: admin })).status, 409);
    assert.equal((await api.patch(`/api/users/${m.id}/status`, { account_status: 'Banned' }, { token: admin })).status, 400);
    assert.equal((await api.patch(`/api/users/${m.id}/status`, { account_status: 'Active' }, { token: admin })).status, 200);
    assert.equal((await api.post('/api/auth/login', { email: m.email, password: 'Passw0rd!' })).status, 200);
  });
});

describe('notifications', () => {
  test('list, unread count, mark one, mark all, isolation', async () => {
    const list = await api.get('/api/notifications', { token: member });
    assert.ok(list.data.length > 0);
    const c1 = (await api.get('/api/notifications/unread-count', { token: member })).data.count;
    const nid = list.data.find((n) => !n.is_read).notification_id;
    assert.equal((await api.patch(`/api/notifications/${nid}/read`, {}, { token: admin })).status, 404);
    assert.equal((await api.patch(`/api/notifications/${nid}/read`, {}, { token: member })).status, 200);
    assert.equal((await api.get('/api/notifications/unread-count', { token: member })).data.count, c1 - 1);
    assert.equal((await api.patch('/api/notifications/read-all', {}, { token: member })).status, 200);
    assert.equal((await api.get('/api/notifications/unread-count', { token: member })).data.count, 0);
    assert.equal((await api.patch('/api/notifications/abc/read', {}, { token: member })).status, 400);
  });
});

describe('jobs', () => {
  test('overdue check marks late loans once and notifies once', async () => {
    const id = await assetId('LAP-003');
    const r = await api.post('/api/requests', { asset_id: id, purpose: 'Docs', start_date: await H.dbToday(0), duration_days: 1 }, { token: member });
    await api.patch(`/api/approvals/${r.data.request_id}/approve`, {}, { token: admin });
    const iss = await api.post('/api/borrowing/issue', { request_id: r.data.request_id }, { token: admin });
    await H.q('UPDATE borrow_records SET due_date = CURDATE() - INTERVAL 2 DAY WHERE borrow_id=?', [iss.data.borrow_id]);
    assert.equal((await api.post('/api/borrowing/check-overdue', {}, { token: admin })).data.marked, 1);
    assert.equal((await api.post('/api/borrowing/check-overdue', {}, { token: admin })).data.marked, 0);
    const o = await api.get('/api/borrowing/overdue', { token: admin });
    assert.equal(o.data.find((x) => x.borrow_id === iss.data.borrow_id).days_overdue, 2);
    const ret = await api.patch(`/api/borrowing/${iss.data.borrow_id}/return`, { return_condition: 'Good' }, { token: admin });
    assert.equal(ret.status, 200);
    const late = (await api.get('/api/borrowing/returned', { token: admin })).data.find((x) => x.borrow_id === iss.data.borrow_id);
    assert.equal(late.late_days, 2);
  });
});

describe('reports', () => {
  test('summary, usage, maintenance return consistent numbers', async () => {
    const s = await api.get('/api/reports/summary', { token: admin });
    assert.equal(s.status, 200);
    const total = (await H.one('SELECT COUNT(*) n FROM assets')).n;
    assert.equal(s.data.totalAssets, Number(total));
    const u = await api.get('/api/reports/usage', { token: admin });
    assert.equal(u.data.timeline.points.length, 30);
    const issued = await H.one('SELECT COUNT(*) n FROM borrow_records');
    assert.equal(u.data.totalBorrowings, Number(issued.n));
    const m = await api.get('/api/reports/maintenance', { token: admin });
    assert.equal(m.status, 200);
    assert.equal((await api.get('/api/reports/summary', { token: member })).status, 403);
  });
  test('period validation', async () => {
    assert.equal((await api.get('/api/reports/usage?from=2026-13-01', { token: admin })).status, 400);
    assert.equal((await api.get('/api/reports/usage?from=2026-10-10&to=2026-10-01', { token: admin })).status, 400);
    const long = await api.get('/api/reports/usage?from=2025-01-01&to=2026-10-31', { token: admin });
    assert.equal(long.data.timeline.unit, 'month');
  });
  test('exports: CSV and PDF for every type', async () => {
    for (const type of ['usage', 'maintenance', 'assets', 'ai']) {
      const c = await api.get(`/api/reports/export?type=${type}&format=csv`, { token: admin });
      assert.equal(c.status, 200, type);
      assert.match(c.headers.get('content-disposition'), /attachment/);
      const p = await api.get(`/api/reports/export?type=${type}&format=pdf`, { token: admin });
      assert.equal(p.status, 200, type);
      assert.equal(p.data.subarray(0, 5).toString(), '%PDF-');
    }
    assert.equal((await api.get('/api/reports/export?type=x', { token: admin })).status, 400);
    assert.equal((await api.get('/api/reports/export?format=xlsx', { token: admin })).status, 400);
  });
});

describe('AI without a key', () => {
  test('usage shows ai_available false', async () => {
    const r = await api.get('/api/ai/usage', { token: member });
    assert.equal(r.data.ai_available, false); assert.equal(r.data.limit, 50);
  });
  test('chat -> 503 with friendly message', async () => {
    const r = await api.post('/api/ai/chat', { question: 'Any laptops?' }, { token: member });
    assert.equal(r.status, 503);
    assert.equal((await api.post('/api/ai/chat', { question: '' }, { token: member })).status, 400);
    assert.equal((await api.post('/api/ai/chat', { question: 'x'.repeat(501) }, { token: member })).status, 400);
  });
  test('recommend falls back to rules and ranks relevant assets', async () => {
    const r = await api.post('/api/ai/recommend', { requirement: 'laptop for video editing', purpose: 'Client video', start_date: await H.dbToday(1), duration_days: 2 }, { token: member });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.source, 'rules');
    assert.ok(r.data.recommendations.length > 0);
    assert.ok(r.data.recommendations.length <= 5);
    assert.ok(['Laptop', 'Camera'].includes(r.data.recommendations[0].asset.category));
  });
  test('recommend with no match explains why', async () => {
    const r = await api.post('/api/ai/recommend', { requirement: 'helicopter', purpose: 'flying', start_date: await H.dbToday(1), duration_days: 1 }, { token: member });
    assert.equal(r.data.recommendations.length, 0); assert.ok(r.data.message);
  });
  test('recommend validation', async () => {
    const base = { requirement: 'laptop', purpose: 'p', start_date: await H.dbToday(1), duration_days: 2 };
    assert.equal((await api.post('/api/ai/recommend', { ...base, duration_days: 40 }, { token: member })).status, 400);
    assert.equal((await api.post('/api/ai/recommend', { ...base, start_date: '2020-01-01' }, { token: member })).status, 400);
  });
  test('daily limit of 50 enforced (429)', async () => {
    const m = await H.newMember(api, 'limit');
    for (let i = 0; i < 50; i++) await H.q("INSERT INTO ai_chat_logs (user_id, feature, prompt) VALUES (?, 'Assistant', 'x')", [m.id]);
    const r = await api.post('/api/ai/recommend', { requirement: 'laptop', purpose: 'p', start_date: await H.dbToday(1), duration_days: 1 }, { token: m.token });
    assert.equal(r.status, 429);
    assert.equal((await api.get('/api/ai/usage', { token: m.token })).data.remaining, 0);
  });
  test('reports/ai shows the logged recommendations', async () => {
    const r = await api.get('/api/reports/ai', { token: admin });
    assert.ok(r.data.byFeature.Recommendation >= 2);
    assert.equal(r.data.recommendationSource.ai, 0);
  });
});
