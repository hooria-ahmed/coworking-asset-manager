# Test Report: Co-Working Space Asset Manager

**Date:** 1 Nov 2026 · **Scope:** the server API (all 12 modules), security, concurrency, AI features (tested against a mock LLM), and the client/server API contract.

## Summary

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| 01 Functional (every module, full lifecycle) | 62 | 62 | 0 |
| 02 Security, edge cases, concurrency | 31 | 31 | 0 |
| 03 AI (mock Groq + Anthropic), config, time zones | 15 | 15 | 0 |
| Client to server API contract (static) | ~70 calls | all match | 0 |

The core business logic is solid. Request → approve → issue → return → maintenance works end to end, the status transitions are enforced, and access control (admin/member, users only seeing their own data) holds everywhere I probed. The concurrency checks on approvals, issues and returns also pass: 6 parallel approvals of overlapping requests produce exactly 1 approval. SQL injection attempts, forged JWTs (`alg:none`, wrong secret) and path traversal on `/api/assets/images` are all blocked.

The first run's failures clustered into input validation, session handling after deactivation, a few race conditions and the Groq fallback path. **All 16 findings below are now fixed** and the suites pass 108/108. Each finding ends with a **Fixed:** line that describes what changed. Suites 02 and 03 now assert the fixed behaviour; the first run failed 27 of their tests.

## Findings (most severe first)

### High

1. **Reports can hang the whole server (infinite loop).** `GET /api/reports/usage?to=9999-12-31` (also `/maintenance`, `/ai` and `/export`) never returns and pins the CPU at 100%, which freezes the API for every user until restart. In `countTimeline` (reports/queries.js), `shiftDays('9999-12-31', 1)` returns `"+010000-01"`, which still compares as `<= "9999-12-31"`, so the loop never ends. A shorter range (1000 to 8999) still blocks the event loop for about 4.5 s.
   *Fix:* in `parsePeriod`, reject years > 9999 and cap the period at about 5 years.
   **Fixed:** `parsePeriod` accepts years 2000 to 2099 and periods up to 5 years (400 otherwise), and `countTimeline` now loops a counted number of days. A test checks that `to=9999-12-31` returns 400 and `/api/health` still responds.
2. **Groq timeouts and outages return 500 instead of falling back.** When `GROQ_API_KEY` is set, an LLM timeout (`AbortSignal.timeout`) or an unreachable host throws a non-`APIError`. `/ai/recommend` then returns 500 instead of the rule-based ranking, and `/ai/chat` returns 500 instead of 503. The Anthropic path handles the same failures correctly.
   *Fix:* in `callGroq`, wrap `fetch` in try/catch and rethrow as `GroqAPIError`.
   **Fixed:** `callGroq` turns network errors and timeouts into `GroqAPIError` 503/408, and unreadable JSON into 502. Recommend falls back to rules and chat returns 503.
3. **A deactivated member's existing JWT keeps working for up to 24 h.** `requireAuth` never checks `account_status`, so the old token can still read notifications, use AI quota, and so on. Only creating a new request re-checks the account.
   *Fix:* look up `account_status` in `requireAuth`, or keep a token version / revocation list.
   **Fixed:** `requireAuth` re-reads the user on every request. A deactivated or deleted account gets 401, and the role and name come from the database, not the token.
4. **Approval returns 500 after it has already been committed.** If an asset has a long name and a long location, the "approved" notification exceeds `VARCHAR(255)`. The insert fails *after* the transaction commits, so the admin sees "Something went wrong" while the request really is Approved. Other notification calls already use `.slice(0, 255)`; this one doesn't.
   *Fix:* slice the message in `notify()` itself.
   **Fixed:** `notify()` and `notifyAdmins()` cut messages to 255 characters, so no caller can overflow the column. The separate `.slice` calls were removed.

### Medium

5. **Type confusion and over-long input cause 500s.** Login with a non-string email (`email.toLowerCase`), register with a numeric password or name, and register with name > 100, contact > 20 or email > 150 characters all return 500.
   *Fix:* type-check the inputs and length-check them against the column sizes.
   **Fixed:** register and login type-check every field and enforce the column lengths (name 100, email 150, contact 20, password 72, the bcrypt limit). They return 400 instead of 500.
6. **Duplicate rows from double-clicks.** Five parallel identical `POST /api/requests` created 3 pending requests, and five parallel `POST /maintenance/report` created 3 open records. Both use check-then-insert with no transaction or lock.
   *Fix:* use `inTransaction` with `SELECT … FOR UPDATE` on the asset row.
   **Fixed:** new requests and maintenance reports run in `inTransaction` and lock the asset row with `FOR UPDATE` before the check and the insert. Five parallel posts now create exactly one row.
7. **CSV formula injection.** Exported cells starting with `=`, `+`, `-` or `@` are written as-is, so an asset named `=HYPERLINK(...)` runs as a formula when opened in Excel.
   *Fix:* prefix such cells with `'` in `csvCell`.
   **Fixed:** `csvCell` prefixes `'` to text cells that start with `= + - @`, a tab or a CR. Numbers are left as they are.
8. **Anyone can lock the admin out.** Five wrong passwords lock any account for 15 minutes, including the only admin.
   *Fix:* throttle failed logins by IP (e.g. `express-rate-limit`) and keep the per-account lock as a backstop.
   **Fixed:** failed logins are now counted per (address + email): five wrong guesses from one address lock only that address for 15 min (423). The account as a whole locks only after 25 failures, a backstop against attacks from many addresses. The counter is updated atomically, so 25 parallel guesses can't get past the limit. Behind a reverse proxy, set `TRUST_PROXY` so the real client address is used.
9. **A Reserved asset can't be requested for other dates.** One approved booking three weeks out makes the asset Reserved right away, and nobody can request it for tomorrow (409). This follows FR-RQ-01 to the letter but blocks valid bookings; checking `isAssetFree` alone would be enough.
   **Fixed:** members can request Available, Reserved and Borrowed assets. The date-overlap check (`isAssetFree`) decides, and only Under Maintenance and Retired are refused. This knowingly departs from the literal wording of FR-RQ-01; a comment in `requests/routes.js` notes it.
10. **Time-zone mismatch between Node and MySQL.** Requests use the DB's `CURDATE()`, while AI recommend and report defaults use Node's local date. In a Node-ahead-of-DB setup (here, Karachi time vs a UTC DB, between 00:00 and 05:00), the request form accepts "today" and AI recommend rejects it as "in the past".
    *Fix:* use the DB date (`rules.today()`) everywhere.
   **Fixed:** each DB connection now runs `SET time_zone` with Node's UTC offset, so `CURDATE()` and Node's date always agree. A test runs the server at UTC+13 against a UTC database.

### Low

11. **Deleting an asset can delete another asset's picture.** `image` accepts any `/api/assets/images/…` path, so asset B can point at asset A's file, and deleting B deletes A's picture.
   **Fixed:** an existing `/api/assets/images/…` value on save means "keep the current picture". An asset can no longer point at another asset's file.
12. **Issuing to a deactivated member is allowed.** Their approved bookings stay and can still be issued.
   **Fixed:** deactivating a member cancels their pending requests and their approved bookings not yet collected (reason "Account deactivated"), and frees Reserved assets. Nothing is left to issue.
13. **Deactivation is revealed before the password is checked.** A login with a wrong password on a deactivated account returns 403 "deactivated", which confirms the account exists.
   **Fixed:** the password is checked first. A wrong password always gives the generic 401, and only the correct password reveals "deactivated".
14. **Missing `JWT_SECRET` isn't caught at startup.** The server boots fine and every login then returns 500.
   **Fixed:** the server refuses to start if `JWT_SECRET` is missing or shorter than 16 characters.
15. **The base seed is inconsistent.** `PRJ-002` is Under Maintenance but has no maintenance record, so it can't be fixed from the Maintenance screen. `demo-data.js` adds the missing record.
   **Fixed:** `db/setup.js` inserts an Open maintenance record for `PRJ-002`. `demo-data.js` replaces it with its own, so there is one record either way.
16. `cost: true` is accepted as 1.00. The user search doesn't escape `%`/`_` (the asset search does). History returns 400 for a bad id where other modules return 404.
   **Fixed:** `cost` must be a number or a numeric string. The user search escapes `% _ \`. History returns 404 for a bad id.

## Deployment notes after the fixes
- `JWT_SECRET` must be at least 16 characters, or the server won't start. Teammates with a short secret in `.env` need to change it.
- Behind nginx or another proxy, set `TRUST_PROXY` (e.g. `loopback` or `1`) so login lockouts see the real client address.

## What passed (highlights)
- Auth: validation, case-insensitive email, generic login error, per-address 5-strike lockout plus a 25-strike account lock (both hold under parallel attempts), hashes never returned, users can't self-assign Admin.
- Assets: CRUD, tag uniqueness, magic-byte image check (fake PNG/SVG rejected, > 2 MB rejected), LIKE-wildcard escaping, pagination, retire instead of delete when history exists, Retired hidden from members.
- Requests / approvals / borrowing: date and duration rules, competing-request warnings, conflict blocking, issuing not allowed before the start date, back-dated returns, overdue job (marks and notifies once), Damaged return opens maintenance, Reserved → Available settling.
- Maintenance: open → in progress → close (Repaired/Retired), reporter notified, waiting bookings cancelled on retire.
- Notifications and history: isolated per user, read-only history.
- Reports: totals match the DB; CSV and PDF exports are valid for all 4 report types.
- AI: 503 without a key, rule fallback, daily limit of 50 (429), tool loop, member blocked from admin-only tools, foreign or duplicate asset ids from the model dropped, bad JSON falls back to rules.
- Client: every API call in the built bundle maps to a real route, app code never uses `dangerouslySetInnerHTML`, a 401 logs the user out.

## Limits of this run
- MariaDB 10.11 stood in for MySQL 8.
- The UI was checked statically from the built bundle, not clicked through in a browser.
- The real LLM APIs were replaced by a mock server.
- `llm.js` now takes an optional `GROQ_BASE_URL` override, which the tests use to point Groq calls at the mock. Production leaves it unset.

## Re-running
Set up MySQL and `server/.env` as in the README (note that `JWT_SECRET` must now be at least 16 characters), then from `tests/` run: `node --test --test-concurrency=1`. The suites reset the database with `db/setup.js` each time, so **don't run them against real data.**
