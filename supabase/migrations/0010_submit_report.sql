-- A technician sends a finished report. One function does it all at once so the report
-- and its job never disagree: the report is locked and the job moves to "awaiting_approval".
-- Minimum to send: time in, time out and a resolution.

create function submit_report(p_job_id uuid) returns reports
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rep reports;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into rep from reports where job_id = p_job_id and technician_id = uid for update;
  if not found then
    raise exception 'No report to send' using errcode = 'P0001';
  end if;
  if rep.status not in ('draft', 'rejected') then
    raise exception 'Already sent' using errcode = 'P0001';
  end if;
  if rep.time_in is null or rep.time_out is null or coalesce(btrim(rep.resolution), '') = '' then
    raise exception 'Report incomplete' using errcode = 'P0001';
  end if;
  update reports set status = 'submitted', submitted_at = now(), reviewed_by = null, reviewed_at = null
   where id = rep.id returning * into rep;
  update jobs set status = 'awaiting_approval' where id = p_job_id and assigned_to = uid;
  return rep;
end $$;

revoke all on function submit_report(uuid) from public, anon;
grant execute on function submit_report(uuid) to authenticated;
