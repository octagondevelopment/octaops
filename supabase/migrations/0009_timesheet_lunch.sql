-- Lunch break inside a shift. Lunch is unpaid: paid hours = clock out - clock in - lunch.
-- One lunch per entry. Technicians start and end it with functions, like the clock itself.

alter table timesheets
  add column lunch_start timestamptz,
  add column lunch_end   timestamptz;

alter table timesheets
  add constraint timesheets_lunch_order check (lunch_end is null or (lunch_start is not null and lunch_end > lunch_start)),
  add constraint timesheets_lunch_inside check (
    (lunch_start is null or lunch_start >= clock_in)
    and (clock_out is null or lunch_start is null or lunch_start < clock_out)
    and (clock_out is null or lunch_end is null or lunch_end <= clock_out)),
  -- a closed shift cannot leave its lunch open
  add constraint timesheets_lunch_closed check (clock_out is null or lunch_start is null or lunch_end is not null);

create function lunch_start_now() returns timesheets
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  entry timesheets;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into entry from timesheets where technician_id = uid and clock_out is null for update;
  if not found then
    raise exception 'Not clocked in' using errcode = 'P0001';
  end if;
  if entry.lunch_start is not null then
    raise exception 'Lunch already taken' using errcode = 'P0001';
  end if;
  update timesheets set lunch_start = now() where id = entry.id returning * into entry;
  return entry;
end $$;

create function lunch_end_now() returns timesheets
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  entry timesheets;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into entry from timesheets where technician_id = uid and clock_out is null for update;
  if not found then
    raise exception 'Not clocked in' using errcode = 'P0001';
  end if;
  if entry.lunch_start is null or entry.lunch_end is not null then
    raise exception 'Not on lunch' using errcode = 'P0001';
  end if;
  update timesheets set lunch_end = now() where id = entry.id returning * into entry;
  return entry;
end $$;

-- Clocking out is refused while lunch is open, so no lunch is left running by mistake.
create or replace function clock_out_now() returns timesheets
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  entry timesheets;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into entry from timesheets where technician_id = uid and clock_out is null for update;
  if not found then
    raise exception 'Not clocked in' using errcode = 'P0001';
  end if;
  if entry.lunch_start is not null and entry.lunch_end is null then
    raise exception 'End your lunch first' using errcode = 'P0001';
  end if;
  update timesheets set clock_out = now() where id = entry.id returning * into entry;
  return entry;
end $$;

revoke all on function lunch_start_now() from public, anon;
revoke all on function lunch_end_now() from public, anon;
grant execute on function lunch_start_now() to authenticated;
grant execute on function lunch_end_now() to authenticated;
