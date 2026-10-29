-- OctaOps initial schema (DRAFT for PO review). RLS is enabled on every table.

create type user_role as enum ('admin', 'technician');
create type job_status as enum ('pending', 'in_progress', 'awaiting_approval', 'invoiced');
create type report_status as enum ('draft', 'submitted', 'approved', 'rejected');

-- Users ---------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'technician',
  created_at  timestamptz not null default now()
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Parts (shared with the catalog app) ---------------------------------------
create table parts (
  sku              text primary key,
  sku_8digit       text,
  name_en          text not null,
  name_es          text,
  module           text,
  subassembly      text,
  price_cad        numeric(10,2),
  qty_per_machine  integer,
  on_hand          integer,
  notes            text
);

-- Jobs ----------------------------------------------------------------------
create table jobs (
  id                 uuid primary key default gen_random_uuid(),
  work_task_number   text not null unique,
  store_number       text,
  address            text,
  priority           text,
  issue              text,
  request_summary    text,
  status             job_status not null default 'pending',
  assigned_to        uuid references profiles(id),
  dispatched_at      date not null default current_date,  -- starts the 90-day clock
  expires_at         date generated always as (dispatched_at + 90) stored,
  created_by         uuid references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index jobs_assigned_to_idx on jobs(assigned_to);
create index jobs_status_idx on jobs(status);

-- Reports -------------------------------------------------------------------
create table reports (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id) on delete cascade,
  technician_id    uuid not null references profiles(id),
  time_in          timestamptz,
  time_out         timestamptz,
  work_performed   text,
  notes            text,
  status           report_status not null default 'draft',
  submitted_at     timestamptz,
  reviewed_by      uuid references profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);
create index reports_job_idx on reports(job_id);

create table report_photos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references reports(id) on delete cascade,
  storage_path  text not null,   -- path in a private Storage bucket
  created_at    timestamptz not null default now()
);

-- Parts used in a job (OctaOps-only data, not on the parts table) ------------
create table job_parts (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id) on delete cascade,  -- "used_in_job"
  sku             text not null references parts(sku),
  qty             integer not null default 1 check (qty > 0),
  last_used_date  date not null default current_date,
  unique (job_id, sku)
);

-- Row Level Security --------------------------------------------------------
alter table profiles      enable row level security;
alter table parts         enable row level security;
alter table jobs          enable row level security;
alter table reports       enable row level security;
alter table report_photos enable row level security;
alter table job_parts     enable row level security;

-- profiles: read self (admins read all); only admins write
create policy profiles_read  on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_admin on profiles for all    using (is_admin()) with check (is_admin());

-- parts: any signed-in user reads; only admins write
create policy parts_read  on parts for select to authenticated using (true);
create policy parts_admin on parts for all    using (is_admin()) with check (is_admin());

-- jobs: technicians see only their own; admins everything
create policy jobs_read  on jobs for select using (assigned_to = auth.uid() or is_admin());
create policy jobs_admin on jobs for all    using (is_admin()) with check (is_admin());
-- technicians may only move their own job between pending / in_progress / awaiting_approval
create policy jobs_tech_status on jobs for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid() and status in ('pending', 'in_progress', 'awaiting_approval'));
revoke update on jobs from authenticated;
grant  update (status) on jobs to authenticated;
-- (admins edit other columns through a security-definer RPC, added with the job board)

-- reports: technician reads/writes own drafts; admins read all and review
create policy reports_read on reports for select using (technician_id = auth.uid() or is_admin());
create policy reports_tech_write on reports for insert
  with check (technician_id = auth.uid()
    and exists (select 1 from jobs j where j.id = job_id and j.assigned_to = auth.uid()));
create policy reports_tech_update on reports for update
  using (technician_id = auth.uid() and status in ('draft', 'rejected'))
  with check (technician_id = auth.uid() and status in ('draft', 'submitted'));
create policy reports_admin on reports for update using (is_admin()) with check (is_admin());

-- photos and job parts follow the parent report / job
create policy photos_read on report_photos for select
  using (exists (select 1 from reports r where r.id = report_id
                 and (r.technician_id = auth.uid() or is_admin())));
create policy photos_write on report_photos for insert
  with check (exists (select 1 from reports r where r.id = report_id and r.technician_id = auth.uid()));

create policy job_parts_read on job_parts for select
  using (exists (select 1 from jobs j where j.id = job_id and (j.assigned_to = auth.uid() or is_admin())));
create policy job_parts_write on job_parts for all
  using (exists (select 1 from jobs j where j.id = job_id and (j.assigned_to = auth.uid() or is_admin())))
  with check (exists (select 1 from jobs j where j.id = job_id and (j.assigned_to = auth.uid() or is_admin())));

-- Billing alert: admin-only view of jobs within 15 days of the 90-day expiry
create view billing_alerts with (security_invoker = true) as
  select id, work_task_number, store_number, status, expires_at, (expires_at - current_date) as days_left
  from jobs
  where is_admin() and status <> 'invoiced' and expires_at - current_date <= 15;
