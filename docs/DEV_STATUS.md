# OctaOps: development status

Written by the development agent for the Product Owner (PO) agent. It is updated **in the same commit as every
published change**, so it always matches the code. Read this first, then the sources at the bottom.

- **Last updated:** 2026-11-16
- **Published version:** `octaops-shell-v12` (see `sw.js`)
- **App:** https://octagondevelopment.github.io/octaops/
- **This file, raw (for agents):** https://raw.githubusercontent.com/octagondevelopment/octaops/main/docs/DEV_STATUS.md
- **Repository:** https://github.com/octagondevelopment/octaops

This repository is public: it holds no personal data, no end-client names and no real operational data.

## 1. What OctaOps is

A mobile-first web app (PWA, plain JavaScript on Supabase) for a small espresso machine repair company. It replaces a
WhatsApp approval loop and manual invoice checking. Two roles: **technician** (own jobs, clock, reports) and **office**
(everything, read and correct). The outcome it serves: no job expires unbilled after the client's 90-day limit, and a
report reaches the office without depending on WhatsApp or on one person being available.

## 2. Built and live

| Area | What it does | Who |
| --- | --- | --- |
| Sign in | Email and password; change password from the account menu | all |
| Jobs | List with status, priority, search, urgent marker; job detail with dispatch data, contacts and equipment | technician sees own, office sees all |
| Deadlines | Days left on each job (90-day clock from the dispatch date) and counters Open, At risk, To approve | office only |
| Time clock | Clock in, start and end lunch, clock out; hours today and this week; overtime calculated automatically | technician |
| Timesheets | Weekly cards per person: paid hours per day, regular, overtime and double time, "no lunch" flag, add or correct entries | office |
| Report form | Four short steps in the order of the team's WhatsApp form; drafts saved on the phone and synced; paste the WhatsApp text and the fields fill in; send the report (locks it, job moves to "awaiting approval") | technician |
| Report review | All reports grouped by technician, filters, full read-only report | office |
| Parts | 36 parts checked by hand against the manual, search, pictures | all |

Security: Row Level Security on every table; technicians read and write only their own records. Tested (section 6).

## 3. Not built yet (in suggested order)

1. Approve or reject a report, with an automatic email to accounting.
2. Deadline alert for accounting (banner for jobs near the 90-day limit). Today only the per-job bar and a counter exist.
3. Create and assign jobs from the app (today jobs are created with SQL).
4. Pick parts from the catalog inside the report (today "Parts used" is free text).
5. Photos in the report.
6. Read assigned jobs without signal (drafting a report offline already works).
7. Preventive maintenance (PM) tracking: shop work, hours worked against a flat rate.
8. Report quality alerts using good and bad example reports.

Out of scope for now (see `IDEAS.md`): automatic parsing of dispatch emails, replying ACCEPT or REJECT to the
intermediary, QuickBooks and Vixxo integrations, push notifications.

## 4. Manual steps the owner must run in Supabase

The database changes are SQL files in `supabase/migrations`, run in order in the Supabase SQL Editor. Nothing applies
them automatically.

| File | Purpose | Status |
| --- | --- | --- |
| `0001` to `0007`, `seed/parts.sql`, `seed/parts_hand_checked.sql` | Base schema, security, dispatch fields, parts | reported applied |
| `0008_timesheets` | Time clock and timesheets | reported applied |
| `0009_timesheet_lunch` | Lunch inside a shift | reported applied |
| `0010_submit_report` | Send a report | reported applied |
| `0011_report_recommendations` | Recommendations field | not confirmed |
| `seed/demo_jobs.sql`, `seed/demo_report.sql` | Sample jobs and one sample sent report (invented data) | demo jobs applied; demo report not confirmed |

A technician test account was being set up; it was not yet confirmed working.

## 5. Data: what exists and what can be measured

- **There is no real operational data in the system.** The jobs named `DEMO-...` and the sample report are invented.
  They are not evidence of anything.
- Stored per job: dispatch date, expiry date (dispatch + 90 days), status, priority, store, equipment, serial number.
- Stored per report: visit date, time in and out, resolution, recommendations, parts (text), machine readings, `submitted_at`.
- Stored per time entry: clock in and out, lunch start and end, day in Vancouver time.
- **Measurable once there is real use:** jobs by status in a period, age of open jobs, delay between the end of a visit
  and the report being sent, hours worked and overtime.
- **Not measurable yet:** time from visit to invoice. The system does not record when a report is approved or when a
  job is invoiced. Those two timestamps would have to be added together with the approval flow.

Example queries once real data exists:

```sql
-- jobs by status for a period (by dispatch date)
select status, count(*) from jobs where dispatched_at between '2026-01-01' and '2026-03-31' group by status;

-- age of open jobs and days left before the 90-day limit
select work_task_number, status, current_date - dispatched_at as days_open, expires_at - current_date as days_left
from jobs where status <> 'invoiced' order by days_open desc;

-- average delay between the end of the visit and the report being sent
select avg(submitted_at - time_out) from reports where submitted_at is not null;
```

## 6. How it was verified, and what was not

- 24 unit tests (`npm test`): the WhatsApp text reader and the hours and overtime math.
- 54 security checks (`npm run test:rls`): every migration is applied to a throwaway Postgres and the checks run as two
  technicians, an admin and a signed-out visitor.
- Screens checked at 400 px width, light and dark, against a simulated database with invented data.
- **Not tested:** with real Supabase accounts, on real phones, or with the real team. The time shown on a real phone
  (Vancouver time) still needs a check. The overtime thresholds come from public guidance for British Columbia and must be
  confirmed by accounting before they are used for pay.

## 7. Decisions taken and open questions

Defaults used while waiting for answers:
- Week runs Monday to Sunday; several clock entries per day allowed; a forgotten clock-out is corrected by the office.
- Lunch is unpaid. Overtime is automatic: 1.5x after 8 h a day and after 40 h a week (only the first 8 h of each day count
  toward the week), 2x after 12 h a day. Not covered: statutory holidays, averaging agreements, exempt roles.
- The clock and sending a report need a connection, so the time is exact.
- A report needs time in, time out and a resolution to be sent. "Resolution" is shown as "Resolution Summary".
- Technicians do not see deadlines or billing data.
- A job is "urgent" if its priority starts with 1 or says urgent, critical or emergency.
- Hosting is GitHub Pages instead of Vercel or Netlify.

Open questions:
- PM: one flat rate or one per type of work? Hours entered by hand or with a timer?
- What do "Shot C", "Cleaning C" and "Bar" measure? They are stored as numbers, unconfirmed.
- From which date does the 90-day clock start: dispatch date (used) or the store's request time (also stored)?
- Real example reports from the technicians are needed to tune the WhatsApp text reader. It was built from the blank
  template only.

## 8. Known limitations

- No real users or real data yet.
- Install icon is an SVG; some phones need PNG icons.
- The free Supabase plan pauses after about a week without use and has no automatic backups.
- GitHub Pages builds sometimes fail for no reason; re-running the build fixes it.
- The parts list shows only the 36 parts checked by hand, out of 403 in the table.

## 9. Changelog (newest first)

Each entry: what changed, what to verify, SQL to run.

- **2026-11-16.** Added this file and the rule to keep it updated. Nothing to verify. No SQL.
- **2026-11-10** (`9edbaf2`). Long text fields now use the app font. Verify: report form on a phone. No SQL.
- **2026-11-09** (`14a089c`). Recommendations field; "Resolution" shown as "Resolution Summary"; fixed the office report
  screen sending the user to the home screen on reload. Verify: open a sent report as office. SQL: `0011`, optionally `seed/demo_report.sql`.
- **2026-11-09** (`9235558`). Lunch and automatic overtime; separate technician and office views; office reads every
  report; technicians send reports. Verify: clock in, lunch, clock out, send a report, read it as office. SQL: `0009`, `0010`.
- **2026-11-09** (`86cb825`). Time clock and weekly timesheet. Verify: clock in as a technician, read the week as office. SQL: `0008`.
- **2026-11-01** (`869c8f6`, `0e4c0fa`). Visual refinement (thin icons, translucent status pills, urgent pulse, soft cards);
  design system and project rules added to the repository.
- **2026-10-30.** Dispatch email fields (`3c12967`, SQL `0004`); light minimal restyle (`2ce90ad`); change password
  (`41ee9ac`); job detail and step-by-step report form with local drafts (`615413b`, SQL `0005`); Reports tab
  (`574836c`); WhatsApp paste option and hand-checked parts (`13d9749`, SQL `0006`, `0007`).
- **2026-10-29.** Repository, brief and ideas log (`f239840`); base schema with security (`45f41b9`, SQL `0001`);
  catalog import (`4dac022`, SQL `0002`); permissions (`7787925`, SQL `0003`); app shell, login and technician home (`2b790b6`).

## 10. Sources in the repository

- `README.md`: overview, how to run the tests.
- `OCTAOPS.md`: the original product brief.
- `docs/FIELD_MAPPING.md`: where each field of the dispatch email and the report template lives in the database.
- `IDEAS.md`: ideas left out of scope.
- `design.md` and `CLAUDE.md`: design rules and project rules.
- `supabase/migrations/` and `supabase/seed/`: the database, in order.
- `tests/`: the unit and security tests.
