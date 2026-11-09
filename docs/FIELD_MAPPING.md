# Field mapping

Where each field the team already uses lives in OctaOps. No real data here, only field names.

## Dispatch email (from the intermediary) -> `jobs`

| Email field | Column |
| --- | --- |
| Work Task ID (also in the subject) | `work_task_number` |
| Request Number | `request_number` |
| Store Number / Store Name | `store_number` / `store_name` |
| Store Address / Store Phone Number | `address` / `store_phone` |
| Store Dispatch Notes | `dispatch_notes` |
| Facilities Contact, phone, email | `facilities_contact_name` / `_phone` / `_email` |
| Priority (for example "1 - High") | `priority` |
| Expected Arrival / Completion Time After Acceptance | `expected_arrival` / `expected_completion` |
| Work Task Contact Name, phone, title | `requester_name` / `_phone` / `_title` |
| Request Date/Time (store time) | `request_at` |
| Request Class | `request_class` |
| Request Summary | `request_summary` |
| Service Request Photo(s) (links) | `photo_urls` |
| Asset Name, Asset Tag ID, Serial Number, Error Code, Install Date, Partner Provided Serial Number | `asset_name`, `asset_tag`, `serial_number`, `error_code`, `asset_install_date`, `partner_serial` |
| Date the dispatch arrived | `dispatched_at` (starts the 90-day clock, to confirm) |

`issue` is the short title shown on cards, taken from the request class and summary.

## Technician report template -> `reports` and `job_parts`

| Template field | Where it lives |
| --- | --- |
| WT, Store #, Address, first Issue, Dispatched | Read from the job, not retyped |
| Date | `reports.visit_date` |
| Time In / Time Out | `reports.time_in` / `time_out` |
| Overtime | `reports.overtime` |
| second Issue | `reports.issue_found` |
| Resolution (shown as "Resolution Summary") | `reports.resolution` |
| Recommendations (new, free text for the next visit) | `reports.recommendations` |
| Parts | `reports.parts_text` (free text, as written today). Parts picked from the catalog will go to `job_parts` |
| Machine | `reports.machine` |
| Installation date | `reports.installation_date` |
| Shot C | `reports.shot_count` (to confirm) |
| Cleaning C | `reports.cleaning_count` (to confirm) |
| Bar | `reports.pressure_bar` (to confirm) |
| Last Cleaning (date and time) | `reports.last_cleaning_at` |
| Cancelled shots last 24 hours | `reports.cancelled_shots_24h` |
| NOTES | `reports.notes` |
| Photos | `report_photos` |

The approval email to accounting should render the report in this same order.

## Timesheet

Internal Octagon hours, separate from any client system. Table `timesheets`: `technician_id`, `clock_in`,
`clock_out`, `work_date` (the clock-in day in Vancouver time; a shift past midnight counts on its start day),
`note`, `edited_by`, `edited_at`.

- Technicians clock in and out with the functions `clock_in_now()` and `clock_out_now()`. The server sets the time,
  so a phone cannot change it. They read only their own rows and cannot write directly.
- Admins read everyone and add or correct entries (a forgotten clock-out is fixed this way).
- One open entry per person at a time; several entries per day are allowed.
- Weeks run Monday to Sunday.

**Lunch.** `lunch_start` and `lunch_end` on the entry, one lunch per shift, set with `lunch_start_now()` and
`lunch_end_now()`. Lunch is unpaid: paid hours = clock out - clock in - lunch. Clocking out is refused while lunch
is open. A shift of more than 5 hours with no lunch is flagged for the admin.

**Overtime is calculated, not clocked** (rules from British Columbia, to be confirmed with accounting; see
`js/timesheet.js`): 1.5x after 8 h in a day and after 40 h in a week (only the first 8 h of each day count toward the
week), 2x after 12 h in a day. Not handled: statutory holidays, averaging agreements, exempt roles.

## Sending a report

`submit_report(job_id)` locks the technician's report and moves the job to `awaiting_approval` in one step. A report
needs time in, time out and a resolution to be sent. Admins read every report in the Reports tab (grouped by
technician, read-only).

## Parts catalog

OctaOps shows only the parts checked by hand against the paper manual. The catalog app keeps that list in
`data/manual_validations.txt`; `scripts/build-parts-seed.ps1 -HandChecked <that file>` turns it into
`supabase/seed/parts_hand_checked.sql`, which sets `parts.hand_checked`. The other parts stay in the table
but are not listed in the app until someone checks them.

## Pasting a WhatsApp report

`js/paste.js` reads the team's template (WT, Store #, Time In, Resolution, Parts, Machine, Shot C, Bar, Notes and
so on). Both Issue lines and both Date lines are told apart by their position. Tests with invented reports are in
`tests/paste.test.mjs` (`node --test tests/paste.test.mjs`).
