-- Explicit API privileges. Needed because "Automatically expose new tables" is
-- disabled on the project: anon gets nothing, signed-in users get only what the
-- RLS policies in 0001 can then narrow down.

grant usage on schema public to authenticated;

grant select                         on profiles      to authenticated;
grant insert, update, delete         on profiles      to authenticated;  -- admin-only via RLS

grant select                         on parts         to authenticated;
grant insert, update, delete         on parts         to authenticated;  -- admin-only via RLS

grant select, insert, delete         on jobs          to authenticated;  -- insert/delete admin-only via RLS
-- jobs: update is limited to (status) in 0001

grant select, insert, update         on reports       to authenticated;
grant select, insert                 on report_photos to authenticated;
grant select, insert, update, delete on job_parts     to authenticated;

grant select                         on billing_alerts to authenticated;
