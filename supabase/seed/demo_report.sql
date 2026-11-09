-- DEMO DATA ONLY. Everything here is made up.
-- Creates a SENT report with every field filled in, on job DEMO-0001, so the admin review
-- screen can be checked with a complete report. Run after migrations up to 0011 and demo_jobs.sql.
-- The author is the first technician; if there is none, the first profile.
-- Cleanup: delete from reports where job_id = (select id from jobs where work_task_number = 'DEMO-0001');

with who as (
  select id from profiles order by (role = 'technician') desc, created_at limit 1
), job as (
  select id from jobs where work_task_number = 'DEMO-0001'
)
insert into reports (
  job_id, technician_id, status, visit_date, time_in, time_out, overtime,
  issue_found, resolution, recommendations, parts_text,
  machine, installation_date, shot_count, cleaning_count, pressure_bar, last_cleaning_at, cancelled_shots_24h,
  notes, submitted_at
)
select
  job.id, who.id, 'submitted', current_date - 1,
  ((current_date - 1)::timestamp + time '08:15') at time zone 'America/Vancouver',
  ((current_date - 1)::timestamp + time '11:40') at time zone 'America/Vancouver',
  false,
  'Grinder motor ran but no beans reached the burrs. Hopper slide was jammed with a fragment.',
  E'Removed the jammed fragment and cleaned the hopper slide.\nReplaced the worn burr set and recalibrated the grind.\nPulled five test shots; all within spec.',
  E'Replace the water filter at the next visit.\nCheck the drip tray sensor again in two weeks.',
  '1x 115.894 burr set with screws, 2x 128.386',
  'Mastrena II', date '2023-04-12', 12345, 210, 9.0,
  ((current_date - 2)::timestamp + time '18:00') at time zone 'America/Vancouver', 3,
  'Customer was informed. Machine left clean and running.',
  now()
from who, job
on conflict (job_id) do update set
  status = 'submitted', visit_date = excluded.visit_date, time_in = excluded.time_in, time_out = excluded.time_out,
  issue_found = excluded.issue_found, resolution = excluded.resolution, recommendations = excluded.recommendations,
  parts_text = excluded.parts_text, machine = excluded.machine, installation_date = excluded.installation_date,
  shot_count = excluded.shot_count, cleaning_count = excluded.cleaning_count, pressure_bar = excluded.pressure_bar,
  last_cleaning_at = excluded.last_cleaning_at, cancelled_shots_24h = excluded.cancelled_shots_24h,
  notes = excluded.notes, submitted_at = excluded.submitted_at;

update jobs set status = 'awaiting_approval' where work_task_number = 'DEMO-0001';
