# Syed Azlaan Aqib: Assets, Categories, Search and Details, Maintenance

> **Status: built and tested** (front end + back end, Neon Noir theme). Screenshots: `code/previews/azlaan/`.
> The API is in [docs/API.md](../API.md); this page explains what was built and how to demo it.

You own: `server/src/modules/assets/`, `server/src/modules/categories/`, `server/src/modules/maintenance/`, `client/src/modules/assets/`, `client/src/modules/maintenance/`.

## What is where

| File | What it does |
|---|---|
| `server/src/modules/categories/routes.js` | List (with asset counts), add, rename, delete unused (FR-AM-07) |
| `server/src/modules/assets/routes.js` | Search with filters and paging, locations, details, add, edit, retire, delete (FR-AM, FR-AS) |
| `server/src/modules/assets/service.js` | Image upload checks (JPG/PNG by file bytes, 2 MB), retiring an asset (cancels its waiting requests) |
| `server/src/modules/maintenance/routes.js` | Records list, open, update, close, member problem report, my reports (FR-MT) |
| `client/src/modules/assets/parts.jsx` | Shared pieces: `AssetThumb` (photo or category tile), `AssetFormDialog`, `NewMaintenanceDialog` with asset search |
| `client/src/modules/assets/CataloguePage.jsx` | `/assets`: search as you type, filters, status chips with counts, cards, 20 per page; filters stay in the URL |
| `client/src/modules/assets/AssetDetailsPage.jsx` | `/assets/:id`: details, 4-week availability strip, reserved dates; Request / Report a problem (member); Edit, maintenance, retire, delete, history (admin) |
| `client/src/modules/assets/ManageAssetsPage.jsx` | `/admin/assets`: KPIs, inventory bar strip, table with actions |
| `client/src/modules/assets/CategoriesPage.jsx` | `/admin/categories`: add form, rename in place, delete only when unused |
| `client/src/modules/maintenance/MaintenancePage.jsx` | `/admin/maintenance`: KPIs and cost (Rs), Open/Closed tabs, Start, Notes and cost, Close as Repaired or Retired |
| `client/src/modules/maintenance/ReportProblemPage.jsx` | `/report-problem`: member picks a borrowed asset, describes the problem, sees their earlier reports |

## SRS coverage

- **FR-AM-01** add with tag, name, category, location, condition, status, description, picture (JPG/PNG up to 2 MB, checked on both sides).
- **FR-AM-02** duplicate tag gives "Asset tag already exists" (the database's UNIQUE key, tags saved in capitals so `lap-001` = `LAP-001`).
- **FR-AM-03 / 04** condition and status only from the fixed lists. Status changes follow Figure 3.3: admins can only add an asset or retire an Available one; Reserved/Borrowed come from bookings, Under Maintenance from a maintenance record, Retired is final.
- **FR-AM-05** edit any field; history is never edited. **FR-AM-06** Reserved/Borrowed cannot be deleted or retired; an asset with history is retired instead of deleted (records kept, OR-DB-06).
- **FR-AM-07** categories: add, rename, delete unused (409 while assets use it).
- **FR-AS-01 to 05** search name/tag/description (and category, so "laptop" finds every laptop), filters combine, results with picture, category, location, status, 20 per page, details with upcoming reserved dates, Retired hidden from members (list, details and locations).
- **FR-MT-01 to 05** create (asset -> Under Maintenance), notes and cost in PKR, close with resolved date (Repaired -> Available or Reserved, Retired -> Retired), member problem report with admin notification.
- **NFR-SF-02** create and close run in one transaction with the asset row locked. **NFR-SF-03** an asset with an open record is never lent; a reported asset goes to maintenance when it comes back. **NFR-SF-04** retire and delete ask first. **NFR-SC-05** every query uses `?` placeholders. **NFR-SC-11** admin actions are audited.

## Where it meets the others

- **Hamza:** the Request button opens `/request/<id>`. A **Damaged return** opens an Open maintenance record that shows on the Maintenance screen as "Damaged return". If a member reported a problem during the loan, the return puts the asset Under Maintenance even when it comes back "Good" (small change in `borrowing/routes.js`, marked with a comment). Retiring an asset cancels its Pending requests and uncollected approved bookings.
- **Hooria:** `notifyAdmins('problem_report', ...)`, `notify(member, 'problem_resolved', ...)`, `request_cancelled` when an asset is retired. Asset Details links to `/admin/history/<id>` (still her placeholder).
- **Misbah:** the dashboard's Maintenance card and the maintenance report read `maintenance_logs`; the Member Dashboard links to `/assets/<id>`; the Report a Problem page reads his `GET /api/reports/me` for the member's loans.

## Test cases (all pass, `66 passed, 0 failed` on MariaDB)

- Adding a second asset with tag LAP-001 shows "Asset tag already exists".
- Search "laptop" + location "Floor 2 - Store Room" returns only the MacBook and the ThinkPad.
- A member never sees a Retired asset (list, details, status filter); an admin does.
- Deleting a Borrowed or Reserved asset is refused; deleting one with history retires it.
- Closing maintenance as Repaired makes the asset Available again; as Retired cancels its waiting requests.
- A member can report a problem only on an asset they borrow now, once; the admins get a notification.
- Damaged return -> Under Maintenance -> close as Repaired -> Available, condition back to Good.

## Demo data

`node server/db/demo-data.js` (after `npm run db:setup`) adds 4 members (password `Member@123`), 15 more assets, two months of past loans, current and overdue loans, bookings, pending requests and repair records, all dated from today. Use it for presentations; it is optional.
