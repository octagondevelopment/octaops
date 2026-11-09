-- Internal Octagon timesheet: who worked when. Separate from any client system.
-- The clock-in time is set by the server so a phone cannot change it.
-- Technicians read only their own rows and write only through the two functions
-- below; admins read and correct everything.

create table timesheets (
  id            uuid primary key default gen_random_uuid(),
  technician_id uuid not null references profiles(id) on delete cascade,
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz,
  -- calendar day of the clock-in, in Vancouver time (a shift past midnight counts on its start day)
  work_date     date generated always as ((clock_in at time zone 'America/Vancouver')::date) stored,
  note          text,
  edited_by     uuid references profiles(id),
  edited_at     timestamptz,
  created_at    timestamptz not null default now(),
  constraint timesheets_out_after_in check (clock_out is null or clock_out > clock_in)
);

-- one open entry per person at a time
create unique index timesheets_one_open_per_tech on timesheets (technician_id) where clock_out is null;
create index timesheets_tech_date_idx on timesheets (technician_id, work_date);
create index timesheets_date_idx on timesheets (work_date);

alter table timesheets enable row level security;

create policy timesheets_read on timesheets for select
  using (technician_id = auth.uid() or is_admin());

-- only admins write directly (corrections and missed entries)
create policy timesheets_admin_write on timesheets for all
  using (is_admin()) with check (is_admin());

grant select, insert, update, delete on timesheets to authenticated;

-- Clock in and out -----------------------------------------------------------
create function clock_in_now() returns timesheets
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  entry timesheets;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into timesheets (technician_id) values (uid) returning * into entry;
  return entry;
exception when unique_violation then
  raise exception 'Already clocked in' using errcode = 'P0001';
end $$;

create function clock_out_now() returns timesheets
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  entry timesheets;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  update timesheets set clock_out = now()
   where technician_id = uid and clock_out is null
   returning * into entry;
  if not found then
    raise exception 'Not clocked in' using errcode = 'P0001';
  end if;
  return entry;
end $$;

revoke all on function clock_in_now() from public, anon;
revoke all on function clock_out_now() from public, anon;
grant execute on function clock_in_now() to authenticated;
grant execute on function clock_out_now() to authenticated;
