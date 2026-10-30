-- The team's template has a free-text "Parts" line. Keep it as written; structured
-- parts picked from the catalog live in job_parts.
alter table reports add column parts_text text;
