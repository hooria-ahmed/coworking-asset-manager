# Hooria Ahmed: AI screens + Notifications + Usage History

> **Start here:** [Hooria_Task_Guide.pdf](Hooria_Task_Guide.pdf) is a short 4-page guide: your files, how to run the app, the order to work in (Notifications, then Usage History, then the AI Recommendation and Assistant screens) and how you know you're done.
>
> **Full code, step by step:** [Hooria_Build_Guide.pdf](Hooria_Build_Guide.pdf) has the complete, tested code for all 9 of your files (server and screens), what each part does, and how to test each step.
>
> **Screens:** build them from the UI template: copy `client/src/modules/_template/PageTemplate.jsx` and follow [docs/UI_TEMPLATE.md](../UI_TEMPLATE.md) (live at `/ui-template`).

You own: `client/src/modules/ai/`, `server/src/modules/notifications/` (+ `jobs.js`), `client/src/modules/notifications/`, `server/src/services/notify.js`, `server/src/modules/history/`, `client/src/modules/history/`.
Partner: **Misbah** builds the AI server side. Until her endpoints work, use a fake response with the exact shape in `docs/API.md`, then switch to `api.post(...)`.

## 1. AI Recommendation screen (FR-RC) - `client/src/modules/ai/RecommendPage.jsx`

- [ ] Form: requirement (textarea, max 500), purpose, start date (min today), duration 1-30 days (FR-RC-01).
- [ ] Call `api.post('/ai/recommend', {...})`; show a loading state (AI can take up to 10 s).
- [ ] Show up to 5 results in rank order: image, name, category, location, condition, and the reason (FR-RC-04). Show a small "ranked by rules" note when `source === 'rules'`.
- [ ] Each result has a **Request** button linking to `/request/<asset_id>?start=<start_date>&days=<duration_days>` (FR-RC-05). Admins do not see the button.
- [ ] Empty result: show `message` and, if present, "Nearest available date: ..." (FR-RC-06).

## 2. AI Assistant chat screen (FR-AI) - `client/src/modules/ai/AssistantPage.jsx`

- [ ] Chat bubbles (user right, assistant left), input with a 500-character counter (FR-AI-01).
- [ ] Send `{ question, history }` where history is the previous turns as `[{ role, content }]` (text only); show "thinking..." while waiting.
- [ ] Show server errors (503 unavailable, 429 limit) as a friendly message in the chat, not a crash (FR-AI-07).
- [ ] Show "x of 50 AI requests used today" from `GET /api/ai/usage`.
- [ ] A few example question chips: "Is any projector free tomorrow?", "Which laptops are on floor 2?", "What are my requests?".

## 3. Notifications (FR-NT)

- [ ] `services/notify.js` already inserts rows; keep its two function names, since Hamza and Azlaan call them.
- [ ] Endpoints in `server/src/modules/notifications/routes.js`: list (newest first, only `req.user`'s), unread count, mark one read, mark all read.
- [ ] `jobs.js`: one day before the due date, notify the borrower once (FR-NT-01).
- [ ] `NotificationBell.jsx`: unread count badge, refresh every 60 s.
- [ ] `NotificationsPage.jsx`: list with read/unread styling and "Mark all as read".

## 4. Usage History (FR-UH)

- [ ] `GET /api/history/mine`: the member's requests (with asset name and status) and borrowings (issued, due, returned, condition) (FR-UH-02).
- [ ] `GET /api/history/asset/:id` (admin): every borrowing with borrower name and every maintenance record of that asset (FR-UH-01).
- [ ] Read-only: no edit or delete anywhere (FR-UH-03).
- [ ] `MyHistoryPage.jsx` and `AssetHistoryPage.jsx` (opened from Azlaan's asset details at `/admin/history/<id>`).

## Test cases to pass

- Request button on a recommendation opens Hamza's form with the dates filled in.
- Stopping the server mid-chat shows an error message in the chat, not a blank page.
- Approving a request makes the bell count go up for that member within a minute.
- A member cannot open `/admin/history/1` (they are sent back to the home page).
