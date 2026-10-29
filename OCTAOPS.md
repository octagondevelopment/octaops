# OctaOps — Developer Brief

Field Service Management app for Octagon Services · Vancouver, BC
PO: Francisco Aleuy · October 2026

## What we're building

OctaOps is a mobile-first internal Field Service Management (FSM) web app for a small team of technicians who repair commercial espresso machines for a major coffee-chain client across Vancouver. It replaces a WhatsApp-based approval loop and a manual invoice-checking process that causes missed billing.

Two user types:

- **Admin** (owner + accounting): dispatches jobs, reviews reports, tracks billing
- **Technician**: receives assigned jobs, fills reports, looks up parts

The parts catalog already exists as a separate static site (`octagondevelopment/octagon-catalogo`). OctaOps migrates that catalog to Supabase so both apps share a single source of truth.

## The problem

- **Missed invoices:** accounting checks a third-party Invoice app manually. Work orders expire after 90 days with no billing, which means lost revenue. There is no automated alert.
- **WhatsApp bottleneck:** technician finishes job → sends report via WhatsApp → owner approves → technician uploads to the Invoice app → accounting extracts and invoices. If the owner is unavailable, the whole cycle stalls.
- **No dispatch visibility:** job assignments from the external intermediary (Infinity) arrive in the owner's personal email. Technicians see nothing until the owner forwards manually.
- **No parts lookup in the field:** technicians use printed manuals or phone the owner.

## External ecosystem

OctaOps complements these systems, it does not replace them:

- **Vixxo:** mandatory app used by the coffee-chain client. Technicians log in/out at each store, fill reports and get a job signature. Octagon cannot modify it.
- **Infinity (ICG):** external intermediary that sends job emails. Emails contain: Work Task Number, Store Number, Address, Priority, Issue, Request Summary.
- **Invoice app:** third-party system where technicians upload completed jobs. Accounting extracts from here.
- **QuickBooks:** accounting system. Not integrated in this phase.
- **WhatsApp group "Invoice":** current informal channel, replaced by OctaOps.

## Stage 2 scope

### Flow 1 — Job dispatch
1. Owner receives the Infinity email and creates the job in OctaOps (Work Task #, Store, Address, Priority, Issue).
2. The assigned technician sees it on their phone.
3. Status: Pending → In Progress → Awaiting Approval → Invoiced.

### Flow 2 — Technician report
1. Technician opens the job and fills the report: time in, time out, work performed, parts used (from catalog lookup), photos, notes.
2. Submitting sets status to Awaiting Approval.
3. Owner reviews in the app and approves; an automatic email goes to accounting with the report attached.
4. Status becomes Invoiced when accounting confirms.

### Flow 3 — Billing alert
Any job in Awaiting Approval or earlier that is within 15 days of the 90-day expiry triggers a dashboard alert. Accounting sees a red banner: "X jobs at risk of expiring".

### Flow 4 — Parts lookup
Technician searches the catalog from within OctaOps (Supabase as shared backend) and can mark parts as "used in this job" directly from the lookup.

## User views

**Admin (owner + accounting)**
- Job board (kanban or list) by status
- Billing alert dashboard
- Report review: read-only report with approve/reject
- Parts catalog management
- User management (basic: name, role, email login)

**Technician**
- My jobs today (assigned to me)
- Job detail with report form
- Parts lookup, mark parts used
- No billing data, no other technicians' jobs

## Technical stack

| Layer | Choice |
| --- | --- |
| Frontend | PWA (HTML/CSS/JS, or React if complexity justifies it) |
| Backend / DB | Supabase (free tier) |
| Auth | Supabase Auth (email + password) |
| Parts data | Supabase, migrated from the catalog CSV |
| Email | Supabase Edge Functions + Resend (free tier) |
| Hosting | Vercel or Netlify free tier |

Supabase caveats:
- The free plan pauses after 1 week of inactivity (keep it active or upgrade).
- No automatic backups on the free tier: export CSV weekly.
- The anon key is public in the app, so RLS is mandatory on every table.
- Technicians may lose signal: implement a local queue (IndexedDB) that syncs when back online.

## Design direction

The team uses WhatsApp and paper. OctaOps must feel like a real product, not a form.

- Dark-first UI (back-of-house environments), with a light theme that looks intentional
- Accent: electric teal or amber
- Typography: Inter, DM Sans or Geist (no serifs)
- Color-coded status chips
- The job card is the hero component, native iOS/Android feel
- Bottom navigation bar, thumb-friendly
- Minimum 400px width, no horizontal scroll, touch targets at least 44px
- Large inputs and a sticky submit button for one-thumb forms
- Safe-area insets on all sides

Screens, in priority order: Login, My Jobs, Job Detail + Report Form, Parts Lookup, Job Board, Report Review, Billing Alert Dashboard.

## Relationship with the catalog app

- `data/parts.csv` in the catalog repo is the migration source.
- After migration the catalog app can point to Supabase through its `TRANSLATE_REMOTE_URL` hook (currently empty).
- Coordinate with the catalog dev before changing the `parts` schema.
- Parts columns: `sku, sku_8digit, name_en, name_es, module, subassembly, price_cad, qty_per_machine, on_hand, notes`.
- OctaOps adds `used_in_job` and `last_used_date` on the job-part relationship, not on `parts`.

## Security constraints

- The repo is public. Never commit service keys, user names, client names, store addresses or any PII.
- Secrets live in `.env`, which is git-ignored.
- RLS on every table. Technicians read only their own jobs; admins see everything.
- No `alert()`, `confirm()` or `prompt()`: confirmations are in-page UI.

## Definition of done (Stage 2)

- A technician logs in on their phone, sees assigned jobs, fills a report with parts used, and submits.
- The owner sees all jobs by status and approves a report; approval emails accounting.
- Accounting sees a billing alert for jobs approaching the 90-day expiry.
- Parts lookup works from within a job (shared Supabase DB with the catalog).
- Offline: assigned jobs can be read and reports drafted, syncing when online.
- Works at 400px on iPhone and Android, light and dark mode.
- No console errors, no data leaks in the public repo.

## Out of scope

Logged in [IDEAS.md](IDEAS.md): WiFi check-in/out, automatic Infinity email parsing, QuickBooks, Vixxo, multi-truck stock, push notifications.

## Build order

1. Supabase project, tables with RLS
2. Migrate `parts.csv`
3. Login + Supabase Auth
4. Technician home and job detail with report form
5. Admin job board and report review
6. Approval → email to accounting
7. Billing alert (90-day countdown)
8. Offline queue (IndexedDB)
9. Deploy and verify on a real phone at 400px
