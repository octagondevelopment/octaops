-- One report per job: a technician edits the same report until it is approved,
-- and the app saves drafts with an upsert on job_id.
create unique index reports_job_id_key on reports (job_id);
