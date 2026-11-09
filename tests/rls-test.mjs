// Security test: applies every migration to a throwaway Postgres (PGlite) and checks, as signed-in
// technicians, another technician and an admin, who can read and write what.
// Run: npm install && npm run test:rls
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const root = (process.argv[2] || '.') + '/supabase/';
const db = new PGlite();
let failed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'ok  ' : 'FAIL', name, extra); if (!cond) failed++; };

// Supabase-like stubs. auth.uid() reads the user the test is "signed in" as.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
const files = [
  'migrations/0001_init.sql', 'migrations/0002_parts_page.sql', 'migrations/0003_grants.sql',
  'migrations/0004_dispatch_and_report_fields.sql', 'migrations/0005_one_report_per_job.sql',
  'migrations/0006_report_parts_text.sql', 'migrations/0007_parts_hand_checked.sql', 'migrations/0008_timesheets.sql',
];
for (const f of files) await db.exec(readFileSync(root + f, 'utf8'));
console.log('ok   all migrations apply');

const q = async (sql, params) => (await db.query(sql, params)).rows;
const [A, B, ADM] = (await q(`insert into auth.users (email) values ('a@x.invalid'),('b@x.invalid'),('admin@x.invalid') returning id`)).map((r) => r.id);
await db.exec(`insert into profiles (id, full_name, role) values ('${A}','Tech A','technician'),('${B}','Tech B','technician'),('${ADM}','Admin','admin')`);
await db.exec(`grant select on parts to authenticated`);

// Run a statement as a signed-in user (RLS applies) and report the outcome.
async function as(uid, sql, params) {
  await db.exec(uid ? `set role authenticated; select set_config('app.uid','${uid}', false);` : `set role anon; select set_config('app.uid','', false);`);
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec(`reset role`); }
}

// ---- Timesheets --------------------------------------------------------------
let r = await as(A, 'select * from clock_in_now()');
ok('tech A can clock in', !r.error && r.rows[0].technician_id === A && r.rows[0].clock_out === null, r.error);
r = await as(A, 'select * from clock_in_now()');
ok('second clock in is refused', /Already clocked in/.test(r.error || ''), r.error);
r = await as(B, 'select count(*)::int n from timesheets');
ok('tech B sees none of A\'s entries', r.rows?.[0].n === 0, JSON.stringify(r));
r = await as(A, 'select count(*)::int n from timesheets');
ok('tech A sees own entry', r.rows?.[0].n === 1);
r = await as(A, `insert into timesheets (technician_id, clock_in) values ('${A}', now() - interval '9 hours')`);
ok('tech A cannot insert a backdated entry directly', !!r.error, r.error);
r = await as(A, `update timesheets set clock_in = now() - interval '5 hours' where technician_id = '${A}' returning id`);
ok('tech A cannot edit clock_in directly', !r.error ? r.rows.length === 0 : true, r.error || 'no rows updated');
r = await as(A, `delete from timesheets where technician_id = '${A}' returning id`);
ok('tech A cannot delete entries', !r.error ? r.rows.length === 0 : true, r.error || 'no rows deleted');
r = await as(B, `update timesheets set clock_out = now() where technician_id = '${A}' returning id`);
ok('tech B cannot close A\'s entry', !r.error ? r.rows.length === 0 : true);
r = await as(B, 'select * from clock_out_now()');
ok('tech B (not clocked in) cannot clock out', /Not clocked in/.test(r.error || ''), r.error);
await db.exec(`update timesheets set clock_in = now() - interval '3 hours' where technician_id = '${A}'`);
r = await as(A, 'select * from clock_out_now()');
ok('tech A can clock out', !r.error && r.rows[0].clock_out !== null, r.error);
r = await as(A, 'select * from clock_out_now()');
ok('second clock out is refused', /Not clocked in/.test(r.error || ''), r.error);
r = await as(ADM, 'select count(*)::int n from timesheets');
ok('admin sees all entries', r.rows?.[0].n === 1);
r = await as(ADM, `insert into timesheets (technician_id, clock_in, clock_out, note, edited_by, edited_at) values ('${B}','2026-11-09 16:00+00','2026-11-10 00:30+00','missed entry','${ADM}', now()) returning work_date::text d`);
ok('admin can add a missed entry for B', !r.error, r.error);
ok('work_date uses Vancouver time', r.rows?.[0].d === '2026-11-09', r.rows?.[0].d);
r = await as(ADM, `update timesheets set clock_out = clock_in + interval '1 hour' where technician_id = '${B}' returning id`);
ok('admin can correct an entry', !r.error && r.rows.length === 1, r.error);
r = await as(ADM, `insert into timesheets (technician_id, clock_in, clock_out) values ('${B}', now(), now() - interval '1 hour')`);
ok('clock out before clock in is rejected', /timesheets_out_after_in/.test(r.error || ''), r.error);
r = await as(null, 'select * from timesheets');
ok('signed-out visitor is refused', !!r.error, r.error);
r = await as(null, 'select * from clock_in_now()');
ok('signed-out visitor cannot clock in', !!r.error, r.error);
// work_date late-evening check: 23:30 Vancouver on Nov 9 is 07:30 UTC on Nov 10
await db.exec(`insert into timesheets (technician_id, clock_in, clock_out) values ('${B}','2026-11-10 07:30+00','2026-11-10 09:00+00')`);
ok('late evening stays on its Vancouver day', (await q(`select work_date::text d from timesheets where clock_in='2026-11-10 07:30+00'`))[0].d === '2026-11-09');

// ---- Existing rules, now tested as real technicians ---------------------------
await db.exec(`
  insert into jobs (work_task_number, store_number, status, assigned_to, created_by) values
    ('J-A','1','pending','${A}','${ADM}'), ('J-B','2','pending','${B}','${ADM}');
`);
const jobA = (await q(`select id from jobs where work_task_number='J-A'`))[0].id;
const jobB = (await q(`select id from jobs where work_task_number='J-B'`))[0].id;
r = await as(A, 'select work_task_number from jobs order by 1');
ok('tech A sees only their own job', r.rows?.length === 1 && r.rows[0].work_task_number === 'J-A', JSON.stringify(r.rows));
r = await as(ADM, 'select count(*)::int n from jobs');
ok('admin sees every job', r.rows?.[0].n === 2);
r = await as(A, `update jobs set status = 'in_progress' where id = '${jobA}' returning status`);
ok('tech A can move own job to in_progress', !r.error && r.rows[0].status === 'in_progress', r.error);
r = await as(A, `update jobs set status = 'invoiced' where id = '${jobA}' returning status`);
ok('tech A cannot mark own job invoiced', !!r.error || r.rows.length === 0, r.error || 'no rows');
r = await as(A, `update jobs set priority = 'x' where id = '${jobA}' returning id`);
ok('tech A cannot change other job columns', !!r.error, r.error);
r = await as(A, `update jobs set status = 'in_progress' where id = '${jobB}' returning id`);
ok('tech A cannot touch B\'s job', !r.error ? r.rows.length === 0 : true);
r = await as(A, `insert into reports (job_id, technician_id) values ('${jobA}','${A}') returning id`);
ok('tech A can start a report on own job', !r.error, r.error);
r = await as(A, `insert into reports (job_id, technician_id) values ('${jobB}','${A}') returning id`);
ok('tech A cannot start a report on B\'s job', !!r.error, r.error);
r = await as(B, 'select count(*)::int n from reports');
ok('tech B cannot read A\'s report', r.rows?.[0].n === 0);
r = await as(ADM, 'select count(*)::int n from reports');
ok('admin reads reports', r.rows?.[0].n === 1);
r = await as(A, `update reports set status = 'approved' where technician_id = '${A}' returning id`);
ok('tech A cannot approve own report', !!r.error || r.rows.length === 0, r.error || 'no rows');
r = await as(null, 'select * from jobs');
ok('signed-out visitor cannot read jobs', !!r.error, r.error);
r = await as(A, 'select count(*)::int n from profiles');
ok('tech A reads only own profile', r.rows?.[0].n === 1, JSON.stringify(r.rows));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
