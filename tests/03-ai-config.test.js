// AI features against a scripted mock LLM (Groq/OpenAI-style and Anthropic-style), plus config & timezone checks.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const H = require('./helpers');

// ---- Mock LLM server ----
const seen = [];
let mode = 'ok'; // ok | error | slow | badjson | foreign-ids | member-admin-tool
function mockHandler(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    seen.push({ url: req.url, body: j });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'error') return send(500, { error: { message: 'boom' } });
    if (mode === 'slow') return setTimeout(() => send(200, {}), 12000);
    const isAnthropic = req.url.includes('/messages');
    const ranking = isAnthropic ? Boolean(j.output_config?.format) : Boolean(j.response_format);
    if (ranking) {
      const ids = mode === 'foreign-ids' ? [9999, 2, 2] : [2, 1];
      const text = mode === 'badjson' ? 'not json' : JSON.stringify({ recommendations: ids.map((id) => ({ asset_id: id, reason: `pick ${id}` })) });
      return isAnthropic
        ? send(200, { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } })
        : send(200, { choices: [{ finish_reason: 'stop', message: { content: text } }] });
    }
    // Assistant chat: first round -> tool call(s), second round -> answer text.
    const msgs = isAnthropic ? j.messages : j.messages;
    const hadTool = isAnthropic ? msgs.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')) : msgs.some((m) => m.role === 'tool');
    const today = new Date().toISOString().slice(0, 10);
    const calls = mode === 'member-admin-tool'
      ? [{ id: 'c1', name: 'list_overdue', input: {} }]
      : [{ id: 'c1', name: 'search_assets', input: { keyword: 'macbook' } }, { id: 'c2', name: 'check_availability', input: { asset_id: 2, start_date: today, end_date: today } }];
    if (!hadTool) {
      return isAnthropic
        ? send(200, { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', content: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input })), usage: { input_tokens: 1, output_tokens: 1 } })
        : send(200, { choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input) } })) } }] });
    }
    const answer = '- **MacBook Pro 14** – Floor 2, Store Room (Available)';
    return isAnthropic
      ? send(200, { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text: answer }], usage: { input_tokens: 1, output_tokens: 1 } })
      : send(200, { choices: [{ finish_reason: 'stop', message: { content: answer } }] });
  });
}
const mock = http.createServer(mockHandler);

const api = H.client('http://127.0.0.1:5056');
let server;
async function boot(env) {
  if (server) { server.kill(); await new Promise((r) => setTimeout(r, 300)); }
  server = await H.startServer({ port: 5056, env });
}

before(async () => {
  H.resetDb();
  await new Promise((r) => mock.listen(5099, r));
});
after(async () => { if (server) server.kill(); mock.close(); await H.db().end(); });

const recommendBody = async () => ({ requirement: 'mac laptop for editing', purpose: 'Edit', start_date: await H.dbToday(1), duration_days: 2 });

describe('Groq path (mock)', () => {
  let member, admin;
  before(async () => {
    await boot({ GROQ_API_KEY: 'test', GROQ_BASE_URL: 'http://127.0.0.1:5099/chat/completions', ANTHROPIC_API_KEY: '' });
    member = await api.login('member@cowork.local', 'Member@123');
    admin = await api.login('admin@cowork.local', 'Admin@123');
  });
  test('chat runs the tool loop and returns View + Request links', async () => {
    mode = 'ok'; seen.length = 0;
    const r = await api.post('/api/ai/chat', { question: 'Is the MacBook free today?' }, { token: member });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.answer, /MacBook Pro 14/);
    assert.ok(r.data.links.some((l) => l.href === '/assets/2'));
    assert.ok(r.data.links.some((l) => l.href.startsWith('/request/2?start=')));
    const toolMsgs = seen[1].body.messages.filter((m) => m.role === 'tool');
    assert.equal(toolMsgs.length, 2);
  });
  test('member cannot use admin-only tools even if the model asks', async () => {
    mode = 'member-admin-tool'; seen.length = 0;
    const r = await api.post('/api/ai/chat', { question: 'who is overdue?' }, { token: member });
    assert.equal(r.status, 200);
    const tool = seen[1].body.messages.find((m) => m.role === 'tool');
    assert.match(tool.content, /Unknown tool/);
    assert.ok(!seen[0].body.tools.some((t) => t.function.name === 'list_overdue'));
  });
  test('admin gets the admin tools', async () => {
    mode = 'ok'; seen.length = 0;
    await api.post('/api/ai/chat', { question: 'hi' }, { token: admin });
    assert.ok(seen[0].body.tools.some((t) => t.function.name === 'list_overdue'));
  });
  test('recommend uses AI ranking and drops ids outside the candidate list / duplicates', async () => {
    mode = 'foreign-ids';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.source, 'ai');
    assert.deepEqual(r.data.recommendations.map((x) => x.asset.asset_id), [2]);
  });
  test('recommend: bad JSON from the model falls back to rules', async () => {
    mode = 'badjson';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200); assert.equal(r.data.source, 'rules');
  });
  test('recommend: LLM 500 falls back to rules; chat gives 503', async () => {
    mode = 'error';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200); assert.equal(r.data.source, 'rules');
    assert.equal((await api.post('/api/ai/chat', { question: 'hi' }, { token: member })).status, 503);
  });
  test('recommend: LLM timeout falls back to rules (not 500)', async () => {
    mode = 'slow';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  });
  test('chat: LLM timeout gives 503 (not 500)', async () => {
    mode = 'slow';
    const r = await api.post('/api/ai/chat', { question: 'hi' }, { token: member });
    assert.equal(r.status, 503, `got ${r.status} ${JSON.stringify(r.data)}`);
  });
});

describe('Groq path, LLM unreachable', () => {
  let member;
  before(async () => {
    await boot({ GROQ_API_KEY: 'test', GROQ_BASE_URL: 'http://127.0.0.1:5098/none', ANTHROPIC_API_KEY: '' });
    member = await api.login('member@cowork.local', 'Member@123');
  });
  test('recommend falls back to rules when the LLM host is down', async () => {
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  });
  test('chat gives 503 when the LLM host is down', async () => {
    const r = await api.post('/api/ai/chat', { question: 'hi' }, { token: member });
    assert.equal(r.status, 503, `got ${r.status}`);
  });
});

describe('Anthropic path (mock)', () => {
  let member;
  before(async () => {
    await boot({ ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:5099', GROQ_API_KEY: '' });
    member = await api.login('member@cowork.local', 'Member@123');
  });
  test('chat tool loop works', async () => {
    mode = 'ok'; seen.length = 0;
    const r = await api.post('/api/ai/chat', { question: 'MacBook free?' }, { token: member });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.answer, /MacBook/);
    assert.ok(seen[0].url.includes('/v1/messages'));
  });
  test('recommend ranks with AI', async () => {
    mode = 'ok';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.status, 200); assert.equal(r.data.source, 'ai');
  });
  test('API error -> rules fallback / 503', async () => {
    mode = 'error';
    const r = await api.post('/api/ai/recommend', await recommendBody(), { token: member });
    assert.equal(r.data.source, 'rules');
    assert.equal((await api.post('/api/ai/chat', { question: 'hi' }, { token: member })).status, 503);
  });
});

describe('configuration & time zones', () => {
  test('missing JWT_SECRET: server refuses to start with a clear message', async () => {
    if (server) { server.kill(); server = null; await new Promise((r) => setTimeout(r, 300)); }
    await assert.rejects(H.startServer({ port: 5056, env: { JWT_SECRET: '' } }), /JWT_SECRET is missing/);
  });
  test('Node and DB on different time zones: AI recommend accepts the same "today" the request form does', async () => {
    await boot({ TZ: 'Pacific/Tongatapu', GROQ_API_KEY: '', ANTHROPIC_API_KEY: '' });
    const member = await api.login('member@cowork.local', 'Member@123');
    const form = await api.get('/api/requests/asset/3', { token: member });
    const today = form.data.today; // the date the request form offers as "today"
    const nodeToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Tongatapu' });
    assert.equal(today, nodeToday, 'server DB date follows the Node clock');
    const r = await api.post('/api/ai/recommend', { requirement: 'laptop', purpose: 'x', start_date: today, duration_days: 1 }, { token: member });
    assert.equal(r.status, 200, `request form says today is ${today}, AI recommend says: ${r.data.error}`);
  });
});
