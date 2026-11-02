# Misbah Ul Hasan: AI server side + Dashboard and Reports

You own: `server/src/modules/ai/`, `server/src/services/llm.js`, `server/src/modules/reports/`, `client/src/modules/reports/`.
Partner: **Hooria** builds the AI screens against your endpoints. Agree the shapes in `docs/API.md` with Hooria on day one.

## 1. AI Asset Recommendation (FR-RC) - `POST /api/ai/recommend`

- [x] Validate `requirement` (1-500 chars), `purpose`, `start_date` (today or later), `duration_days` (1-30). `end_date = start_date + duration_days - 1`.
- [x] Check the daily limit first (see section 3); return `429` when reached.
- [x] Get candidates with `getAvailableAssets(start, end)` from `services/availability.js` (FR-RC-02). Never let the AI see or suggest anything else.
- [x] If AI is configured: send the need and the candidate list (id, name, category, location, condition, description) to Claude and ask for the best up to 5 with a one-line reason each, as JSON (FR-RC-03, 04). Throw away any id that was not in the candidate list.
- [x] If `isAIConfigured()` is false or the call fails or times out: rule-based ranking (FR-RC-07). Score = keyword matches of the requirement words in name/description/category, plus a bonus for condition New/Good. Return `source: "rules"`.
- [x] No candidates: return an empty list, a `message`, and `nearest_date` (try the next 14 start dates with `getAvailableAssets` until one has a match) (FR-RC-06).
- [x] Save the prompt and response in `ai_chat_logs` with `feature = 'Recommendation'` (FR-AI-08).

## 2. AI Asset Assistant (FR-AI) - `POST /api/ai/chat`

The model never reads the database itself. You give it **tools**; it asks to call them; your code runs the SQL and sends the results back (FR-AI-02, 03).

- [x] Tools to offer (read-only, FR-AI-06): `search_assets({ keyword?, category?, location?, status? })`, `check_availability({ asset_id, start_date, end_date })`, `get_my_requests()` (only `req.user.user_id`'s rows, FR-AI-05), `list_categories()`.
- [x] System prompt: "You answer questions about the co-working space's assets using only the tools. If the tools return nothing, say the asset does not exist or is not available. Never invent assets. You cannot change any record; to borrow, tell the user to use the Request button." Add today's date.
- [x] Loop: call `createMessage`, run every `tool_use` block, send all results back in one user message, repeat until `stop_reason` is `end_turn` (max 5 rounds).
- [x] No key or an API error: `503` with `{ error: "The AI assistant is unavailable right now. Please use search instead." }` (FR-AI-07).
- [x] Log the question and answer in `ai_chat_logs` with `feature = 'Assistant'`.

Loop sketch with the official SDK (`createMessage` is in `services/llm.js`):

```js
const { createMessage, Anthropic } = require('../../services/llm');

const tools = [{
  name: 'search_assets',
  description: 'Search assets by keyword, category, location or status. Returns matching assets.',
  input_schema: {
    type: 'object',
    properties: { keyword: { type: 'string' }, category: { type: 'string' }, location: { type: 'string' }, status: { type: 'string' } },
    additionalProperties: false,
  },
}, /* check_availability, get_my_requests, list_categories ... */];

const messages = [...history, { role: 'user', content: question }];
for (let round = 0; round < 5; round++) {
  const response = await createMessage({ system, messages, tools });
  messages.push({ role: 'assistant', content: response.content });
  if (response.stop_reason !== 'tool_use') {
    const answer = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return res.json({ answer });
  }
  const results = [];
  for (const block of response.content.filter((b) => b.type === 'tool_use')) {
    const output = await runTool(block.name, block.input, req.user); // your SQL, read-only
    results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
  }
  messages.push({ role: 'user', content: results }); // all results in ONE message
}
```

Catch `Anthropic.APIError` (and its subclasses such as `Anthropic.RateLimitError`) for API failures, never by matching error text.

## 3. Shared AI rules

- [x] `GET /api/ai/usage`: count today's `ai_chat_logs` rows for the user; limit `AI_DAILY_LIMIT` (50) across both features (FR-AI-09).
- [x] `MAX_QUESTION_LENGTH` (500) on the chat question (FR-AI-01).
- [x] The API key only lives in `server/.env`. Never send it to the browser or commit it.

## 4. Dashboard and Reports (FR-RP)

- [x] `GET /api/reports/summary`: asset counts per status, pending requests, overdue borrowings, open maintenance count (FR-RP-01, 02).
- [x] `GET /api/reports/usage?from&to`: most-borrowed assets and borrowings per category (FR-RP-03).
- [x] `GET /api/reports/maintenance?from&to`: open/closed counts and total cost (FR-RP-04).
- [x] `GET /api/reports/export?type&format=csv`: send CSV with `res.attachment('report.csv').send(csv)` (FR-RP-05; PDF optional).
- [x] `AdminDashboardPage.jsx`: status count cards, overdue table, pending requests table with a link to `/admin/approvals`.
- [x] `ReportsPage.jsx`: date range, charts (install `chart.js` + `react-chartjs-2` in `client/`, tell the integrator), export button.

## Test cases to pass

- Recommendation for "video editing for 3 days" lists only Available assets (try it after making the MacBook Reserved).
- Assistant asked about "the Sony drone" says it does not exist.
- A member asking "show all requests" only gets their own.
- 51st AI call in a day returns 429.
- With `ANTHROPIC_API_KEY` empty, Recommendation still works (`source: "rules"`) and Assistant shows the friendly message.

## Status: built (21 Oct 2026)

Everything above is done and tested against MariaDB, with and without an API key (the AI paths were tested against a stand-in for the Claude API, so try one real call once a key is in `server/.env`).

| File | What it does |
|---|---|
| `server/src/services/llm.js` | `createMessage()` (tools, JSON-schema output, 10 s timeout, low effort, refusal fallback on supported models), `textOf()`, `isAIConfigured()` |
| `server/src/modules/ai/routes.js` | the three `/api/ai` endpoints |
| `server/src/modules/ai/assistant.js` | chat loop: up to 5 tool rounds, history, links to assets and the pre-filled request form, friendly `503` |
| `server/src/modules/ai/tools.js` | read-only tools: `search_assets`, `check_availability`, `get_my_requests`, `list_categories`; admins also get `list_requests` and `list_overdue` |
| `server/src/modules/ai/recommend.js` | validation, candidates from `getAvailableAssets`, Claude ranking with ids checked against the candidates, rule-based ranking, nearest free date |
| `server/src/modules/ai/usage.js` | 50-a-day limit and the `ai_chat_logs` table |
| `server/src/modules/reports/queries.js` | dashboard, usage and maintenance figures |
| `server/src/modules/reports/export.js` | CSV (opens in Excel) and PDF (styled, page numbers) for usage, maintenance and the asset register |
| `client/src/modules/reports/AdminDashboardPage.jsx` | status tiles, "needs attention" tiles, overdue and pending tables |
| `client/src/modules/reports/ReportsPage.jsx` | period presets and custom dates, three bar charts, maintenance summary, PDF/CSV download |

New packages (already in `package.json`): `pdfkit` in `server/`, `chart.js` and `react-chartjs-2` in `client/`. Run `npm install` in both folders after pulling.

**Choosing the model:** `AI_MODEL` in `server/.env`. `claude-opus-5-5` gives the best answers; `claude-haiku-5-5` is much cheaper and faster, which suits a demo.

**Quick test without the UI** (after logging in and copying the token):

```bash
curl -X POST localhost:5000/api/ai/recommend -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"requirement":"laptop for video editing","purpose":"Client project","start_date":"2026-11-02","duration_days":3}'
curl -X POST localhost:5000/api/ai/chat -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"question":"Is there a Sony drone?"}'
curl "localhost:5000/api/reports/export?type=usage&format=pdf" -H "Authorization: Bearer <admin token>" -o usage.pdf
```

The dashboard and reports fill in once requests, borrowings and maintenance records exist (Hamza's and Azlaan's modules create them).

**UI redesign (21 Oct 2026):** the Dashboard and Reports were restyled with the shared shadcn/ui theme (see `docs/UI_TEMPLATE.md`). `reports.css` is gone; `parts.jsx` now wraps the shared `StatCard`/`Card`; `charts.js` reads the theme colours (`useChartTheme()`), adds a doughnut for assets by status, and follows dark mode. Data, API calls and behaviour are unchanged.

**Futuristic redesign (24 Oct 2026):** the theme is now "Neon Noir" (dark-first, violet + lime, pill top navigation). The Dashboard follows the new layout: a welcome headline, a hero with the total and a status bar strip, a borrowing trend line and a weekday heatmap (both from `GET /api/reports/usage` for the last five weeks; the dashboard still loads if that call fails), a needs-attention list, then the two tables. `charts.js` gained `lineData`/`lineOptions` and pill-shaped bars.

## Added on 24 Oct 2026 (gaps found when checking against the SRS)

A check of everything above against the SRS found seven things still missing. They are now built in the Neon Noir style and tested on MariaDB and on a phone-sized screen.

| What | Where | SRS |
|---|---|---|
| Member Dashboard at `/dashboard`: what I have borrowed and when it is due, my open requests, latest notifications, AI requests left today | `client/src/modules/reports/MemberDashboardPage.jsx`, `GET /api/reports/me` | Screen 2, 2.2 |
| Approve or reject a pending request straight from the Admin Dashboard (a dialog, reject needs a reason) | `client/src/modules/reports/QuickDecision.jsx` (calls Hamza's approvals endpoints) | Usability: approve in 3 clicks or fewer |
| Most-used assets and a maintenance summary on the Admin Dashboard | `AdminDashboardPage.jsx` | FR-RP-03, 04 |
| AI activity on the Reports page: totals, requests per day, AI vs rules ranking, a searchable question log | `client/src/modules/reports/AiActivity.jsx`, `GET /api/reports/ai` | FR-AI-08 |
| AI activity report as PDF or CSV | `export.js` (`type=ai`) | FR-RP-05 |
| PDF reports restyled to match Neon Noir (dark title band, violet and lime) | `export.js` | FR-RP-05 |
| AI chat logs older than 90 days are deleted daily | `server/src/modules/ai/jobs.js`, started from `server.js` | OR-DB-06 |
| AI Recommendation falls back to the rules within 10 s (no automatic retries) | `llm.js` `retry: false`, used by `recommend.js` | NFR-PF-04 |

Shared files touched (one or two lines each, for the integrator): `server/src/server.js` (starts the clean-up job), `client/src/routes.jsx` (the `/dashboard` route for members), `client/src/App.jsx` and `client/src/pages/LoginPage.jsx` (members land on `/dashboard`).

The quick approve/reject buttons work now that Hamza's approval endpoints are built (24 Oct 2026).
