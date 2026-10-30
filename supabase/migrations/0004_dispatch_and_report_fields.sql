-- Fields from the real dispatch email (jobs) and from the technician report
-- template the team fills in today (reports). See docs/FIELD_MAPPING.md.

-- Dispatch email -> jobs ------------------------------------------------------
alter table jobs
  add column request_number            text,
  add column request_class             text,
  add column request_at                timestamptz,  -- request date/time, store time
  add column store_name                text,
  add column store_phone               text,
  add column dispatch_notes            text,
  add column facilities_contact_name   text,
  add column facilities_contact_phone  text,
  add column facilities_contact_email  text,
  add column requester_name            text,
  add column requester_phone           text,
  add column requester_title           text,
  add column expected_arrival          text,         -- "after acceptance", kept as written
  add column expected_completion       text,
  add column photo_urls                text[] not null default '{}',
  add column asset_name                text,
  add column asset_tag                 text,
  add column serial_number             text,
  add column error_code                text,
  add column asset_install_date        date,
  add column partner_serial            text;

-- Technician report template -> reports ---------------------------------------
alter table reports rename column work_performed to resolution;

alter table reports
  add column visit_date          date,
  add column overtime            boolean not null default false,
  add column issue_found         text,          -- the template's second "Issue" line
  add column machine             text,
  add column installation_date   date,
  add column shot_count          integer check (shot_count >= 0),       -- "Shot C" (to confirm)
  add column cleaning_count      integer check (cleaning_count >= 0),   -- "Cleaning C" (to confirm)
  add column pressure_bar        numeric(4,1),                          -- "Bar" (to confirm)
  add column last_cleaning_at    timestamptz,   -- "Last cleaning" date + time
  add column cancelled_shots_24h integer check (cancelled_shots_24h >= 0);
