# API contract

Every endpoint the app has, who builds it, and what it takes and returns. **Frontends are built against this file, so do not change a path, field name or response shape without telling the person whose screen uses it** (and updating this file in the same commit).

Rules for every endpoint:

- All paths start with `/api`. Bodies and responses are JSON.
- Every route except register and login needs the header `Authorization: Bearer <token>`. The server puts `{ user_id, role, name }` in `req.user`.
- Errors always look like `{ "error": "Message the user can read" }` with a proper status: 400 bad input, 401 not logged in, 403 wrong role, 404 not found, 409 conflict (duplicate, overlap, wrong state), 429 AI limit reached, 501 not built yet.
- Dates are `YYYY-MM-DD` strings. Statuses use the exact words in `server/src/config/constants.js`.
- "member" = role Member only, "admin" = role Admin only, "any" = any logged-in user.

## Auth (integrator, already built)

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | public | `{ name, email, contact_no?, password }` | `{ user_id, message }` | FR-AU-01 to 03 |
| POST | `/api/auth/login` | public | `{ email, password }` | `{ token, user: { user_id, name, email, role } }` | FR-AU-04, 05, NFR-SC-10 |
| GET | `/api/auth/me` | any | | `{ user_id, name, email, role }` | FR-AU-04 |

## Manage Users (Hamza)

File: `server/src/modules/users/routes.js`. SRS: FR-AU-06, FR-AU-08. **Built.**

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/users` | admin | query: search? (name or email), role?, status? | `[{ user_id, name, email, contact_no, role, account_status, created_at, active_loans, overdue_loans, pending_requests, total_borrowings }]` (never a password hash) | FR-AU-08, NFR-SC-02 |
| PATCH | `/api/users/:id/status` | admin | `{ account_status: "Active" or "Deactivated" }` | `{ message, cancelled_requests }` | FR-AU-08 |

- Only **member** accounts can be changed (409 for an admin account), and never your own (409).
- Deactivating cancels the member's Pending requests (reason "Account deactivated"); approved bookings and loans stay for the admin to handle. A deactivated user gets 403 at login. Reactivating clears any login lock-out and notifies the member.
- Audit actions: `activate`, `deactivate`.

## Asset Categories (Azlaan)

File: `server/src/modules/categories/routes.js`. SRS: FR-AM-07. **Built.**

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/categories` | any |  | `[{ category_id, name, description, asset_count, active_count }]` (`asset_count` includes Retired assets, `active_count` does not), sorted by name | FR-AM-07 |
| POST | `/api/categories` | admin | `{ name (max 60), description? (max 255) }` | `201 { category_id }` (409 "A category with this name already exists") | FR-AM-07 |
| PATCH | `/api/categories/:id` | admin | `{ name?, description? }` | `{ message }` (409 on a duplicate name) | FR-AM-07 |
| DELETE | `/api/categories/:id` | admin |  | `{ message }` (409 "Category has assets: ..." while any asset, Retired included, uses it) | FR-AM-07 |

Audit actions: `create`, `update`, `delete` on entity `category`.

## Asset Management + Search and Details (Azlaan)

Files: `server/src/modules/assets/` (`routes.js`, `service.js`). SRS: FR-AM-01 to FR-AM-06, FR-AS-01 to FR-AS-05. **Built.**

Asset object (list and details): `{ asset_id, asset_tag, name, category_id, category, location, condition, status, description, image_path, created_at, updated_at, due_back, next_booking }`. `due_back` = due date of the current loan (or null), `next_booking` = start of the next approved booking not yet collected (or null).

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/assets` | any | query: search? (max 100; matches name, tag, description and category name), category_id?, location?, status?, condition?, page?, sort? (`name` default, `newest`, `tag`) | `{ items: [asset], total, page, pageSize: 20, pages, statusCounts: { Available: n, ... } }` (filters combine with AND; `statusCounts` counts the matches per status ignoring the status filter; Retired never shown to members) | FR-AS-01, 02, 03, 05 |
| GET | `/api/assets/locations` | any |  | `["Floor 1 - Lab A", ...]` (members: only locations with non-retired assets) | FR-AS-02 |
| GET | `/api/assets/:id` | any |  | `{ ...asset, category_description, reserved_dates: [{ start_date, end_date, kind: "Reserved" or "Borrowed" }], can_request, stats: { times_borrowed, maintenance_records } }` plus for admins `open_maintenance` (or null) and `current_loan: { borrow_id, due_date, status, issued_on, user_name, user_email }` (or null); for members `my_loan: { borrow_id, due_date, status }` (or null) and `my_open_report`. A Retired asset is 404 for members. | FR-AS-04, FR-RQ-01 |
| GET | `/api/assets/images/<file>` | public | | the uploaded picture (an `<img>` cannot send a token; names are random) | FR-AM-01 |
| POST | `/api/assets` | admin | `{ asset_tag (max 30, letters/digits/- _ . /, saved in capitals), name, category_id, location, condition, status? ("Available" default, "Under Maintenance" or "Retired"), description?, image? }` | `201 { asset_id }` (409 "Asset tag already exists"; Under Maintenance also opens a maintenance record) | FR-AM-01, 02, 03, 04 |
| PUT | `/api/assets/:id` | admin | any of the POST fields; only the ones sent change. `status` can stay the same or go Available -> Retired | `{ message, status }` (409 for any other status change: Reserved/Borrowed come from bookings, Under Maintenance from the Maintenance screen, Retired is final; retiring cancels the asset's Pending requests and uncollected bookings and notifies the members) | FR-AM-05, 06 |
| DELETE | `/api/assets/:id` | admin |  | `{ message, retired }` (409 if Reserved, Borrowed or Under Maintenance. An asset with any request or maintenance history is **retired instead of deleted** (`retired: true`) so its history is kept) | FR-AM-06 |

- **Image:** `image` is a data URL `"data:image/png;base64,..."` (JPG or PNG, checked by the file's first bytes, max 2 MB), an `https://` link, `null` to remove it, or left out to keep it. Uploads are saved in `server/uploads/` (git-ignored) and `image_path` is `/api/assets/images/<file>`.
- Audit actions on entity `asset`: `create`, `update`, `retire`, `delete`.

## Asset Request (Hamza)

Files: `server/src/modules/requests/` (`routes.js`, `rules.js`). SRS: FR-RQ-01 to FR-RQ-06. **Built.**

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/requests/asset/:assetId` | any | | `{ asset: { asset_id, asset_tag, name, category, location, condition, status, description, image_path }, can_request, booked: [{ start_date, end_date, kind: "Reserved" or "Borrowed" }], today, min_days, max_days }`  (for the request form; Retired assets are 404 for members) | FR-RQ-01, FR-AS-04 |
| POST | `/api/requests` | member | `{ asset_id, purpose (max 255), start_date: "YYYY-MM-DD" (today or later), duration_days: 1-30 }` | `201 { request_id, status: "Pending", start_date, end_date }` (`end_date = start + days - 1`; admins are notified) | FR-RQ-02, 03, 04 |
| GET | `/api/requests/mine` | any | | `[{ request_id, asset_id, asset_name, asset_tag, category, location, purpose, start_date, end_date, duration_days, status, rejection_reason, created_at, decided_at, borrow_status, issued_at, due_date, returned_at }]` (own requests only, newest first) | FR-RQ-06, NFR-SC-04 |
| PATCH | `/api/requests/:id/cancel` | member | | `{ message }` (only your own, only while Pending; someone else's request is 404) | FR-RQ-05 |

POST errors: 400 bad input (past start date, 0 or 31 days, empty purpose), 403 deactivated account, 404 unknown asset, 409 when the asset is not Available (FR-RQ-01), the dates overlap an approved booking or loan, or you already asked for that asset on those dates.

## Request Approval (Hamza)

File: `server/src/modules/approvals/routes.js`. SRS: FR-AP-01 to FR-AP-06. **Built.** Approve, reject and cancel run in one transaction with the asset row locked (`SELECT ... FOR UPDATE`), so two admins can never approve overlapping requests at once (QA-01, NFR-SF-02).

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/approvals/pending` | admin | | `[{ request_id, user_id, user_name, user_email, asset_id, asset_name, asset_tag, asset_status, location, purpose, start_date, end_date, duration_days, status, created_at, conflict, conflict_reason, competing }]` (oldest first; `conflict` = approving would fail; `competing` = other pending requests for the same asset and dates) | FR-AP-01 |
| GET | `/api/approvals/approved` | admin | | approved bookings not collected yet: same fields plus `decided_at, decided_by_name` | FR-AP-06 |
| GET | `/api/approvals/history` | admin | query: status?, search? (member or asset) | every non-pending request, newest first (max 200), with `rejection_reason, decided_at, decided_by_name` | FR-RQ-06 |
| PATCH | `/api/approvals/:id/approve` | admin | | `{ message }` (409 if not Pending, the dates overlap, the asset is Under Maintenance or Retired, or the dates have passed; asset -> Reserved; member notified) | FR-AP-02, 03, 05 |
| PATCH | `/api/approvals/:id/reject` | admin | `{ reason }` (required, max 255) | `{ message }` (member notified with the reason) | FR-AP-04, 05 |
| PATCH | `/api/approvals/:id/cancel` | admin | `{ reason? }` | `{ message }` (approved but not collected; asset -> Available, or stays Reserved if another booking waits; member notified) | FR-AP-06 |

Audit actions: `approve`, `reject`, `cancel`. Misbah's Admin Dashboard quick approve/reject uses these endpoints.

## Borrowing and Returns (Hamza)

Files: `server/src/modules/borrowing/` (`routes.js`, `jobs.js`). SRS: FR-BR-01 to FR-BR-06. **Built.** Issue and return are single transactions.

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/borrowing/to-issue` | admin | | approved, not collected, start date has come: `[{ request_id, user_name, user_email, contact_no, asset_id, asset_name, asset_tag, location, asset_status, purpose, start_date, end_date, duration_days, missed }]` (`missed` = booking period already over; cancel it instead) | FR-BR-01 |
| GET | `/api/borrowing/upcoming` | admin | | approved bookings that start later: same fields plus `days_until` | FR-BR-01 |
| POST | `/api/borrowing/issue` | admin | `{ request_id }` | `201 { borrow_id, due_date, message }` (due_date = request end_date; asset -> Borrowed; member notified. 409 before the start date, after the end date, if already issued, or if the asset is still on loan / under maintenance) | FR-BR-01 |
| GET | `/api/borrowing/active` | admin | | everything not returned (Active and Overdue): `[{ borrow_id, request_id, user_name, user_email, contact_no, asset_id, asset_name, asset_tag, asset_condition, issued_at, due_date, status, days_left }]` | FR-BR-04 |
| GET | `/api/borrowing/overdue` | admin | | `[{ borrow_id, user_name, user_email, contact_no, asset_name, asset_tag, issued_at, due_date, status, days_overdue }]` | FR-BR-04, 05 |
| GET | `/api/borrowing/returned` | admin | query: limit? (default 50, max 200) | `[{ borrow_id, user_name, asset_name, asset_tag, issued_at, due_date, returned_at, return_condition, late_days }]` | FR-BR-02, FR-UH-01 |
| PATCH | `/api/borrowing/:id/return` | admin | `{ return_condition: "New" or "Good" or "Fair" or "Damaged", return_date?: "YYYY-MM-DD" (not before the issue date, not in the future), notes? }` | `{ message, asset_status }` (asset condition updated; asset -> Available, Reserved if another booking waits, or Under Maintenance if Damaged (opens an Open `maintenance_logs` row) or if a member reported a problem during the loan (its open record is kept); request -> Completed) | FR-BR-02, 03, 06, NFR-SF-03 |
| POST | `/api/borrowing/check-overdue` | admin | | `{ marked }` (runs the overdue job now) | FR-BR-04 |

- **Overdue job:** `borrowing/jobs.js` `checkOverdue()` runs at server start and every hour (`OVERDUE_CHECK_INTERVAL_MS`). It marks Active loans past their due date as Overdue and notifies each borrower once (type `overdue`).
- Audit actions: `issue`, `return`.
- Notification types sent by Hamza's modules (for Hooria's screens): `new_request` (admins), `request_approved`, `request_rejected`, `request_cancelled`, `asset_issued`, `asset_returned`, `overdue`, `account_reactivated`.

## Maintenance Management (Azlaan)

File: `server/src/modules/maintenance/routes.js`. SRS: FR-MT-01 to FR-MT-05, NFR-SF-02, NFR-SF-03. **Built.** A record goes Open -> In Progress -> Closed (outcome Repaired or Retired); only one open record per asset. Records come from an admin, a member's problem report, or a Damaged return (Hamza's `PATCH /api/borrowing/:id/return`).

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/maintenance` | admin | query: status? (`Open`, `In Progress`, `Closed` or `active` = not closed), asset_id?, search? | `[{ maintenance_id, asset_id, asset_name, asset_tag, asset_status, asset_condition, location, category, issue_description, notes, cost, status, outcome, reported_by, reported_by_name, reported_by_role, reported_at, resolved_at, source: "admin" or "report" or "return", days_open, borrower_name, borrower_due }]` (open first, max 300) | FR-MT-01 |
| GET | `/api/maintenance/mine` | any | | the user's own problem reports: `[{ maintenance_id, asset_id, asset_name, asset_tag, issue_description, status, outcome, reported_at, resolved_at }]` | FR-MT-05 |
| POST | `/api/maintenance` | admin | `{ asset_id, issue_description (5-500), notes?, cost? }` | `201 { maintenance_id, message }` (asset -> Under Maintenance. 409 if the asset is Borrowed, Retired, or already has an open record; a Reserved asset is allowed and the message warns about the waiting booking) | FR-MT-01, 02 |
| PATCH | `/api/maintenance/:id` | admin | `{ notes? (max 2000), cost? (0 or more, PKR, rounded to 2 decimals), issue_description?, status?: "In Progress" }` | `{ message }` (409 once Closed) | FR-MT-03, OR-IN-03 |
| PATCH | `/api/maintenance/:id/close` | admin | `{ outcome: "Repaired" or "Retired", notes?, cost?, condition? }` | `{ message, asset_status }` (one transaction: record Closed with `resolved_at`; Repaired -> asset Available, or Reserved if a booking waits, condition Damaged becomes Good unless `condition` is sent; Retired -> asset Retired and its waiting requests cancelled. If a member still has the asset, Repaired leaves it Borrowed and Retired is 409) | FR-MT-04, NFR-SF-02 |
| POST | `/api/maintenance/report` | member | `{ asset_id, issue_description (5-500) }` | `201 { maintenance_id, message }` (only for an asset the member is borrowing now, else 403; 409 if it was already reported; notifies the admins with type `problem_report`) | FR-MT-05, FR-NT-02 |

- **Link with Borrowing (Hamza):** a reported asset stays Borrowed until it is returned. On return it goes **Under Maintenance whatever the return condition**, because its record is still open (NFR-SF-03); a Damaged return adds its note to that record instead of opening a second one.
- Notification types sent: `problem_report` (admins), `problem_resolved` (the member who reported it, when the record is closed), `request_cancelled` (members whose requests were cancelled because the asset was retired).
- Audit actions on entity `maintenance`: `create`, `update`, `close`, `retire`.

## Usage History (Hooria)

File: `server/src/modules/history/routes.js`. SRS: FR-UH-01 to FR-UH-03.

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/history/mine` | any |  | `{ requests: [...], borrowings: [...] }` | FR-UH-02 |
| GET | `/api/history/asset/:id` | admin |  | `{ asset, borrowings: [...], maintenance: [...] }` | FR-UH-01 |

## AI Asset Assistant + AI Asset Recommendation (server side) (Misbah)

Files: `server/src/modules/ai/` (`routes.js`, `assistant.js`, `tools.js`, `recommend.js`, `usage.js`). SRS: FR-AI-01 to FR-AI-09, FR-RC-01 to FR-RC-07. **Built.**

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| POST | `/api/ai/chat` | any | `{ question (1-500 chars), history?: [{ role: "user" or "assistant", content }] }` | `{ answer, links: [{ label, href }] }` | FR-AI-01 to 08 |
| POST | `/api/ai/recommend` | any | `{ requirement (1-500 chars), purpose (max 255), start_date (today or later), duration_days (1-30) }` | `{ source: "ai" or "rules", start_date, end_date, duration_days, recommendations: [{ rank, reason, asset: { asset_id, asset_tag, name, category, location, condition, description, image_path } }], message?, nearest_date? }` | FR-RC-01 to 07 |
| GET | `/api/ai/usage` | any |  | `{ used, limit, remaining, ai_available }`  (requests today, for the 50/day limit; `ai_available` is false when no API key is set) | FR-AI-09 |

Notes for the screens (Hooria):

- **Errors:** `400` bad input, `429` daily limit reached, `503` on `/chat` when the AI is off or failing, with `{ error: "The AI assistant is unavailable right now. Please use search instead." }` (FR-AI-07). Show the `error` text as it is.
- **Chat history:** send the earlier turns as `history` (oldest first, plain text only). The server keeps the last 10.
- **Chat links:** `links` lists assets the answer mentions: `{ label: "View Dell XPS 15", href: "/assets/1" }`, and for members, when the assistant checked dates, `{ label: "Request Dell XPS 15", href: "/request/1?start=2026-11-02&days=3" }`. Render them as buttons under the answer. It is an empty list when there is nothing to link.
- **Recommendation:** `source: "rules"` means the rule-based ranking was used (no API key or the AI failed); show a small note such as "Ranked by keyword match". The Request button links to `/request/<asset_id>?start=<start_date>&days=<duration_days>`. When `recommendations` is empty, show `message`, and when `nearest_date` is set offer "Search from <nearest_date>".
- Both features count towards the same 50 requests a day. A rule-based recommendation counts too; a failed chat does not.

## Dashboard and Reports (Misbah)

Files: `server/src/modules/reports/` (`routes.js`, `queries.js`, `export.js`). SRS: FR-RP-01 to FR-RP-05, FR-AI-08, screen 2 (Member Dashboard). **Built.** `from` / `to` are optional `YYYY-MM-DD` dates; the default is the last 30 days. Usage counts borrowings by their issue date.

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/reports/me` | any |  | `{ borrowed: [{ borrow_id, asset_id, asset_name, asset_tag, category, location, issued_on, due_date, days_left }], overdue, dueSoon, openRequests: [{ request_id, asset_id, asset_name, purpose, start_date, end_date, status, created_at }], pending, approvedUpcoming, notifications: [{ notification_id, type, message, is_read, created_at }] (latest 5), unread, totalBorrowings, rejectedRecently, ai: { used, limit, remaining } }`  (the logged-in user's own data only; `days_left` is negative when overdue; `openRequests` = Pending, or Approved and not collected yet) | Screen 2 |
| GET | `/api/reports/summary` | admin |  | `{ statusCounts: { Available: n, Reserved: n, Borrowed: n, "Under Maintenance": n, Retired: n }, totalAssets, pendingRequests: [{ request_id, user_name, asset_name, purpose, start_date, end_date, created_at }], overdue: [{ borrow_id, user_name, user_email, asset_name, asset_tag, due_date, days_overdue }], openMaintenance, activeBorrowings, dueToday, activeMembers }` | FR-RP-01, 02 |
| GET | `/api/reports/usage` | admin | query: from, to | `{ from, to, totalBorrowings, mostUsed: [{ asset_id, asset_tag, name, category, times, days }], byCategory: [{ category, times }], requests: { Pending: n, Approved: n, ... }, timeline: { unit: "day" or "month", points: [{ period, times }] } }` | FR-RP-03 |
| GET | `/api/reports/maintenance` | admin | query: from, to | `{ from, to, open, inProgress, closed, total, repaired, retired, totalCost, byAsset: [{ asset_id, name, records, cost }] }`  (`open` = Open + In Progress) | FR-RP-04 |
| GET | `/api/reports/ai` | admin | query: from, to, feature? (Assistant | Recommendation), search?, page? (15 per page) | `{ from, to, total, byFeature: { Assistant: n, Recommendation: n }, recommendationSource: { ai: n, rules: n }, activeUsers, timeline: { unit, points: [{ period, times }] }, items: [{ chat_id, user_name, role, feature, prompt, answer, source, created_at }], page, pageSize, matching }`  (`answer` is plain text; for a recommendation it lists the ranked asset names; `matching` = rows after the filter) | FR-AI-08 |
| GET | `/api/reports/export` | admin | query: type (usage | maintenance | assets | ai), format (csv | pdf), from?, to? | file download, e.g. `usage-report_2026-10-01_to_2026-10-21.pdf`, `ai-activity-report_2026-09-25_to_2026-10-24.pdf` | FR-RP-05 |

- **Quick approve on the dashboard:** the Admin Dashboard's pending table calls Hamza's `PATCH /api/approvals/:id/approve` and `PATCH /api/approvals/:id/reject` (`{ reason }`). Working since Hamza's modules were built.
- **Chat log clean-up:** `server/src/modules/ai/jobs.js` deletes `ai_chat_logs` rows older than 90 days, once at start-up and then every 24 hours (OR-DB-06).

## Notifications (Hooria)

File: `server/src/modules/notifications/routes.js`. SRS: FR-NT-01 to FR-NT-03.

| Method | Path | Who | Body / query | Response | SRS |
|---|---|---|---|---|---|
| GET | `/api/notifications` | any |  | `[{ notification_id, type, message, is_read, created_at }]  (newest first)` | FR-NT-01 |
| GET | `/api/notifications/unread-count` | any |  | `{ count }` | FR-NT-01 |
| PATCH | `/api/notifications/:id/read` | any |  | `{ message }` | FR-NT-03 |
| PATCH | `/api/notifications/read-all` | any |  | `{ message }` | FR-NT-03 |

## Shared server services

These live in `server/src/services/`. Anyone may call them; only the named owner changes them, and only without changing the function names or what they return.

| File | Function | What it does | Owner |
|---|---|---|---|
| `notify.js` | `notify(userId, type, message)`, `notifyAdmins(type, message)` | Adds an in-app notification | Hooria |
| `availability.js` | `isAssetFree(assetId, start, end, excludeRequestId?, conn?)`, `getAvailableAssets(start, end, { category_id?, keyword? })`, `getBookedPeriods(assetId, conn?)` | Overlap check used by approvals and AI recommendation (`conn` runs it inside an open transaction); booked periods for the request form | Hamza |
| `audit.js` | `audit(userId, action, entity, entityId)` | Logs an admin action | integrator |
| `llm.js` | `isAIConfigured()`, `createMessage({ system, messages, tools?, outputFormat?, maxTokens?, effort?, retry? })`, `textOf(response)` | Calls the Claude API (10 s timeout, refusal fallback on supported models). `retry: false` skips the SDK's automatic retries, so a caller with its own fallback (AI Recommendation) answers within 10 s | Misbah |
