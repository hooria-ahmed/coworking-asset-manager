# M. Hamza Siddiqui: Requests, Approval, Borrowing and Returns, Manage Users

> **Status: built (24 Oct 2026).** Every item below is done, in the Neon Noir style, and tested on MariaDB and in headless Chromium (desktop, light mode and a 390 px phone). Screenshots: `code/previews/hamza/`. Full endpoint list: [docs/API.md](../API.md).

You own: `server/src/modules/requests/` (+ `rules.js`), `approvals/`, `borrowing/` (+ `jobs.js`), `users/`, `server/src/services/availability.js`, and the matching `client/src/modules/` folders (+ `requests/parts.jsx`).
The main flow of the system follows the SRS state diagrams (Figures 3.3 and 3.4) exactly; every status change in these modules goes through `requests/rules.js` or a transaction in the route files.

## 1. Asset Request (FR-RQ)

- [x] `POST /api/requests`: member only; asset must be Available (FR-RQ-01); purpose required (max 255), `start_date` today or later (FR-RQ-03), `duration_days` 1-30; `end_date = start + days - 1`; saved as Pending (FR-RQ-02, 04). Also refused: dates that overlap an approved booking or loan, a second request of yours for the same asset and dates, a deactivated account.
- [x] `notifyAdmins('new_request', '<name> requested <asset> for <dates>')` (FR-RQ-04, FR-NT-02).
- [x] `GET /api/requests/mine` with asset and loan details; `PATCH /:id/cancel` only for your own Pending request (FR-RQ-05, 06; someone else's request is 404, NFR-SC-04).
- [x] `GET /api/requests/asset/:assetId`: the asset, whether it can be requested and its booked periods, so the form works before Azlaan's `GET /api/assets/:id` exists.
- [x] `RequestFormPage.jsx` at `/request/:assetId`: asset card with "already taken" dates, purpose with a character counter, start date, duration with 1/3/7/14-day pills, live "return by" date, a red warning when the dates clash, field errors in red under each field, Cancel + Submit. Reads `?start=` and `?days=` (Hooria's AI Recommendation links here) and shows a "filled in from your AI recommendation" pill. Goes to My Requests after sending.
- [x] `MyRequestsPage.jsx`: KPI cards, status tabs with counts, table with `StatusBadge`, what happens next (collect from / due back / overdue / rejection reason), Cancel button with a confirmation dialog on Pending rows.

## 2. Request Approval (FR-AP)

- [x] `GET /api/approvals/pending` with user and asset names (FR-AP-01), plus a clash check per row (`conflict`, `conflict_reason`, `competing`).
- [x] Approve: one transaction with the asset row locked (`SELECT ... FOR UPDATE`); 409 if `isAssetFree(...)` is false (FR-AP-02) or the asset is Under Maintenance/Retired; request Approved with `decided_by`, `decided_at`; asset Reserved (FR-AP-03); member notified (FR-AP-05). Tested with two approvals sent at the same moment: one wins, the other gets 409 (QA-01).
- [x] Reject: reason required, request Rejected, member notified with the reason (FR-AP-04, 05).
- [x] Cancel an Approved request not yet issued: request Cancelled, asset back to Available (or stays Reserved if another booking waits) (FR-AP-06).
- [x] `audit(...)` on approve, reject, cancel (NFR-SC-11).
- [x] Extra lists for the screen: `GET /approvals/approved` (bookings not collected) and `GET /approvals/history` (all decisions, searchable).
- [x] `ApprovalsPage.jsx` ("Manage requests"): KPI cards (waiting, clashes, approved not collected, members waiting), tabs Pending / Approved bookings / History. Approve is disabled on clashing rows; reject asks for a reason; cancel booking asks for confirmation.
- [x] `services/availability.js`: `isAssetFree` and `getAvailableAssets` keep their names and return values (Misbah's recommendation uses them). `isAssetFree` takes an optional `conn` so it can run inside the approval transaction; new `getBookedPeriods(assetId)` for the form.
- [x] Misbah's Admin Dashboard quick approve/reject now works (it calls these endpoints).

## 3. Borrowing and Returns (FR-BR)

- [x] `GET /to-issue`: Approved requests with no borrow record whose start date has come (`missed` flags bookings whose period is over). `GET /upcoming`: those that start later.
- [x] `POST /issue { request_id }`: one transaction; creates `borrow_records` (due_date = request end_date, status Active), asset Borrowed (FR-BR-01), member notified. Refused before the start date, after the end date, if already issued, or if the asset is still on loan.
- [x] `PATCH /:id/return { return_condition, return_date?, notes? }`: one transaction; sets `returned_at` (return date not before the issue date, not in the future), condition, status Returned; asset condition updated and status Available (or Reserved if another booking waits), or Under Maintenance if Damaged, with an Open `maintenance_logs` row so Azlaan's page shows it (FR-BR-02, 03, NFR-SF-03); request Completed (FR-BR-06).
- [x] `GET /active`, `GET /overdue` (with days overdue) and `GET /returned` (FR-BR-04, 05).
- [x] `jobs.js` `checkOverdue()`: runs at start-up and every hour; marks Active rows past due as Overdue and notifies each borrower once (FR-BR-04, 05). `POST /check-overdue` runs it on demand.
- [x] `IssueReturnPage.jsx`: KPI cards and five tabs: To issue, On loan (due badges), Overdue (email/call buttons), Coming up, Returned (on time / late, condition). Issue asks for confirmation; Return opens a dialog with condition cards, return date and, for Damaged, a "what is wrong" note and a maintenance warning. "Check overdue" button in the header.

## 4. Manage Users (FR-AU-08)

- [x] `GET /api/users` (no password hashes; with loan and pending counts) and `PATCH /:id/status` to Activate/Deactivate. An admin cannot change their own account or another admin's.
- [x] Deactivating cancels the member's Pending requests; reactivating clears a login lock-out and notifies the member. Audited.
- [x] `UsersPage.jsx`: KPI cards, search + role + status filters, table with loans/overdue/pending badges, Deactivate/Activate with a confirmation dialog that warns about pending requests and items still on loan.

## Test cases (all pass)

- Requesting with a start date in the past or for 31 days is refused (400).
- Two members request the same laptop for overlapping dates: the first approval works, the second gets 409 (also when both approvals are sent at the same moment).
- Returning as Damaged puts the asset in Under Maintenance, the request in Completed, and opens a maintenance record.
- A borrowing whose due date has passed shows as Overdue after `checkOverdue()` runs, and the borrower gets a notification.
- A deactivated member cannot log in (403).
- A member cannot cancel another member's request (404); an admin cannot request (403) or deactivate themselves (409).

## Notes for the integrator

- No shared files were changed except `docs/API.md` and this file. `services/availability.js` is Hamza's own file (new optional `conn` argument, new `getBookedPeriods`; old calls work unchanged).
- Hamza's screens reuse Misbah's date helpers (`reports/format.js`) so dates look the same everywhere.
- A deactivated member's existing login token keeps working until it expires (24 h), because `middleware/auth.js` (integrator) does not look at the database. Hamza's request endpoint blocks deactivated members anyway; checking `account_status` in `requireAuth` would close the gap everywhere.
- Azlaan's catalogue and asset details should link their Request button to `/request/<asset_id>` (only for Available assets, FR-RQ-01).
