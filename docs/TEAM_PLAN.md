# Team plan: who builds what, and how it comes together

Each person builds **complete modules**: the Express routes in `server/src/modules/<module>/` and the React screens in `client/src/modules/<module>/`. The skeleton already has login, the database, the menu, and an empty placeholder for every endpoint and screen, so nobody waits for anybody and nobody edits anyone else's files.

## Assignments

| Member | Modules | SRS requirements | Server folders | Client folders |
|---|---|---|---|---|
| **Misbah Ul Hasan** (CS-24130) | **AI Asset Recommendation** (server side, with Hooria) | FR-RC-01 to 07 | `ai/` | |
| | **AI Asset Assistant** (server side, with Hooria) | FR-AI-01 to 09 | `ai/` + `services/llm.js` | |
| | Dashboard and Reports | FR-RP-01 to 05 | `reports/` | `reports/` |
| **Hooria Ahmed** (CS-24106) | **AI Asset Recommendation** (screen, with Misbah) | FR-RC-01, 04, 05, 06 | | `ai/RecommendPage` |
| | **AI Asset Assistant** (chat screen, with Misbah) | FR-AI-01, 07 | | `ai/AssistantPage` |
| | Notifications | FR-NT-01 to 03 | `notifications/` + `services/notify.js` | `notifications/` |
| | Usage History | FR-UH-01 to 03 | `history/` | `history/` |
| **Syed Azlaan Aqib** (CS-24144) | Asset Management + Categories | FR-AM-01 to 07 | `assets/`, `categories/` | `assets/` |
| | Asset Search and Details | FR-AS-01 to 05 | `assets/` | `assets/` |
| | Maintenance Management | FR-MT-01 to 05 | `maintenance/` | `maintenance/` |
| **M. Hamza Siddiqui** (CS-24139) | Asset Request | FR-RQ-01 to 06 | `requests/` | `requests/` |
| | Request Approval | FR-AP-01 to 06 | `approvals/` + `services/availability.js` | `approvals/` |
| | Borrowing and Returns | FR-BR-01 to 06 | `borrowing/` (+ overdue job) | `borrowing/` |
| | Manage Users | FR-AU-08 | `users/` | `users/` |
| **Integrator** (Shahan, unless the team decides otherwise) | Skeleton, login/register, database, merging, testing the whole flow, going live | FR-AU-01 to 07 | `auth/`, `app.js`, `db/` | `App.jsx`, `routes.jsx`, `pages/`, `components/` |

The AI work is split by side: **Misbah builds the server logic** (Claude API calls, availability filtering, ranking, fallback, daily limit, chat log) and **Hooria builds the screens** (chat panel, recommendation form and ranked results). They agree on the shapes in `docs/API.md` (`POST /api/ai/chat`, `POST /api/ai/recommend`), so Hooria can build against fake data while Misbah finishes the server.

## The six rules that make combining painless

1. **Only edit your own folders.** Shared files (`app.js`, `routes.jsx`, `schema.sql`, `constants.js`, `components/` including `components/ui/`, `styles.css`) belong to the integrator. Need a change? Ask in the group; the integrator makes it once for everyone.
2. **Keep the API contract.** `docs/API.md` lists every path, body and response. Other people's screens call your endpoints exactly as written there. If you must change one, tell the person who uses it and update API.md in the same commit.
3. **Use the shared helpers, not copies.** Database: `require('../../config/db')` with `?` placeholders. Login checks: `requireAuth`, `requireRole('Admin')`. Statuses and limits: `config/constants.js`. Notifications: `services/notify.js`. Overlap check: `services/availability.js`. Front-end calls: `api` from `client/src/api/client.js`.
4. **Errors are `{ "error": "message" }`** with a sensible status code (throw `new ApiError(409, '...')`). Screens show them with `<ErrorBox error={err} />`.
5. **Build screens from the UI template.** Start from `client/src/modules/_template/PageTemplate.jsx` and the shared components (`import { Page, Button, Card, ... } from '../../components/ui'`), never your own colours or CSS files. See [UI_TEMPLATE.md](UI_TEMPLATE.md).
6. **Do not change the database tables** yourself. If you need a column, ask the integrator to add it to `schema.sql` so everyone gets it.

## Where modules meet (agree on these early)

| From | To | How |
|---|---|---|
| Azlaan's Catalogue / Asset Details (Request button) | Hamza's request form | link to `/request/<asset_id>` |
| Hooria's Recommendation results (Request button) | Hamza's request form | link to `/request/<asset_id>?start=YYYY-MM-DD&days=N`; Hamza pre-fills from the URL |
| Hamza's approve/reject, issue, overdue job | Hooria's notifications | call `notify(userId, type, message)` |
| Azlaan's member problem report | Hooria's notifications | call `notifyAdmins('problem_report', ...)` |
| Hamza's approval check | Misbah's recommendation | both use `services/availability.js` (`isAssetFree`, `getAvailableAssets`) |
| Misbah's dashboard | Hamza's borrow records | reads `borrow_records` with `status = 'Overdue'` |
| Azlaan's Asset Details (admin) | Hooria's asset history | link to `/admin/history/<asset_id>` |

## Working with GitHub (recommended)

1. The integrator creates one GitHub repository, uploads this folder to `main`, and adds the four members as collaborators.
2. Each member clones it and works on their own branch: `git checkout -b misbah`, `hooria`, `azlaan`, `hamza`.
3. Commit often. When a module works, push your branch and open a Pull Request into `main`.
4. The integrator merges one Pull Request at a time, runs the app, and checks nothing else broke. Because everyone edits different folders, merges should have no conflicts.
5. Everyone runs `git pull origin main` regularly to get the others' finished modules.

No GitHub? Each member zips **only their own folders** and sends them to the integrator, who copies them over the same folders in the master copy. It works because no two people touch the same file.

## Suggested order

| Phase | What happens | Done when |
|---|---|---|
| 1. Setup | Everyone runs the skeleton locally (README) and logs in as admin and member | Everyone sees the menu with placeholder cards |
| 2. Server | Each member builds their endpoints and tests them in Postman | No `501` left in your routes |
| 3. Screens | Each member replaces their placeholder pages | Your screens work against your own endpoints |
| 4. Combine | Integrator merges in this order: Azlaan, Hamza, Hooria, Misbah, then runs the full flow below | The full flow works on one machine |
| 5. Go live | Integrator deploys (see below); the team tests on the live link | Teacher can open the link |

**Full flow test after combining:** member registers, searches "laptop", requests one for 3 days → admin approves (member gets a notification) → admin issues → admin records return as Damaged → asset shows Under Maintenance → admin closes maintenance as Repaired → dashboard counts update → member asks the AI Assistant "which projectors are free?" and gets real assets → AI Recommendation for "video editing for 3 days" lists only available assets, and its Request button opens the pre-filled form.

## Going live

The server also serves the built React app, so the live system is **one web service plus one MySQL database**:

1. Create a hosted MySQL database (for example Aiven for MySQL free plan, or Railway MySQL) and run `server/db/schema.sql` and `seed.sql` on it, then create the admin with `npm run db:setup` pointed at it (or insert the admin by hand).
2. Create a Node web service from the GitHub repo (for example Render or Railway). Build command: `npm run build`. Start command: `npm start`.
3. Set the environment variables from `server/.env.example` on the service (DB_*, JWT_SECRET, ANTHROPIC_API_KEY, AI_MODEL). Never put real keys in the repository.
4. Open the service URL, log in as admin, change the admin password.

## AI API

`services/llm.js` uses the Claude API through the official `@anthropic-ai/sdk` package. The key goes in `ANTHROPIC_API_KEY` in `server/.env` (create one at console.anthropic.com; usage is paid per request). The model is set by `AI_MODEL` (default `claude-opus-5-5`); the team can switch to a cheaper model such as `claude-haiku-5-5` by changing that one line. With no key set, the Assistant must show a friendly "AI unavailable" message (FR-AI-07) and Recommendation must use the rule-based ranking (FR-RC-07), so the app still works in a demo without a key.
