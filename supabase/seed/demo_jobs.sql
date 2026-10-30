-- DEMO DATA ONLY. Every value is made up (555-01xx numbers are reserved for fiction).
-- Removes earlier DEMO- jobs and re-creates them with the full dispatch fields,
-- assigned to the first admin. Run after migration 0004.
-- Cleanup: delete from jobs where work_task_number like 'DEMO-%';

delete from jobs where work_task_number like 'DEMO-%';

insert into jobs (
  work_task_number, request_number, store_number, store_name, address, store_phone,
  priority, request_class, issue, request_summary, status, dispatched_at, request_at,
  dispatch_notes, facilities_contact_name, facilities_contact_phone, requester_name, requester_phone,
  expected_arrival, expected_completion, asset_name, asset_tag, serial_number, error_code,
  asset_install_date, assigned_to, created_by
)
select v.*, a.id, a.id
from (
  values
  ('DEMO-0001','R-0001','0001','Demo Store One','1 Sample St','604-555-0101','1 - High','Espresso / Grinder','Grinder does not grind','Sample job. Grinder motor runs but no beans reach the burrs.','in_progress'::job_status, current_date - 3, now() - interval '3 days','Back entrance, ask for the manager.','Sample Contact','604-555-0111','Sample Barista','604-555-0121','4 hours','8 hours','Espresso machine','TAG-0001','SN-DEMO-0001','E-21', date '2023-04-12'),
  ('DEMO-0002','R-0002','0002','Demo Store Two','2 Sample St','604-555-0102','2 - Medium','Espresso / Leak','Leak at group head','Sample job. Water dripping from group head gasket.','pending', current_date - 6, now() - interval '6 days',null,'Sample Contact','604-555-0112','Sample Barista','604-555-0122','24 hours','48 hours','Espresso machine','TAG-0002','SN-DEMO-0002',null, date '2022-09-30'),
  ('DEMO-0003','R-0003','0003','Demo Store Three','3 Sample St','604-555-0103','3 - Low','Espresso / Steam','Steam wand weak pressure','Sample job. Steam pressure drops after 10 seconds.','pending', current_date - 48, now() - interval '48 days',null,'Sample Contact','604-555-0113','Sample Barista','604-555-0123','72 hours','5 days','Espresso machine','TAG-0003','SN-DEMO-0003','E-07', date '2021-06-18'),
  ('DEMO-0004','R-0004','0004','Demo Store Four','4 Sample St','604-555-0104','2 - Medium','Espresso / Pump','Water pump noisy','Sample job. Loud vibration when filling the boiler.','awaiting_approval', current_date - 70, now() - interval '70 days',null,'Sample Contact','604-555-0114','Sample Barista','604-555-0124','24 hours','48 hours','Espresso machine','TAG-0004','SN-DEMO-0004',null, date '2023-01-09'),
  ('DEMO-0005','R-0005','0005','Demo Store Five','5 Sample St','604-555-0105','1 - High','Espresso / Power','Machine will not power on','Sample job. No display, no response to power button.','in_progress', current_date - 81, now() - interval '81 days','Loading dock closes at 18:00.','Sample Contact','604-555-0115','Sample Barista','604-555-0125','4 hours','8 hours','Espresso machine','TAG-0005','SN-DEMO-0005','E-01', date '2020-11-02'),
  ('DEMO-0006','R-0006','0006','Demo Store Six','6 Sample St','604-555-0106','3 - Low','Espresso / Sensor','Drip tray sensor error','Sample job. Drip tray full alert shows when tray is empty.','awaiting_approval', current_date - 94, now() - interval '94 days',null,'Sample Contact','604-555-0116','Sample Barista','604-555-0126','72 hours','5 days','Espresso machine','TAG-0006','SN-DEMO-0006','E-33', date '2022-03-21'),
  ('DEMO-0007','R-0007','0007','Demo Store Seven','7 Sample St','604-555-0107','3 - Low','Espresso / Hopper','Hopper latch broken','Sample job. Bean hopper will not lock in place.','invoiced', current_date - 30, now() - interval '30 days',null,'Sample Contact','604-555-0117','Sample Barista','604-555-0127','72 hours','5 days','Espresso machine','TAG-0007','SN-DEMO-0007',null, date '2023-07-05')
) as v(work_task_number, request_number, store_number, store_name, address, store_phone,
       priority, request_class, issue, request_summary, status, dispatched_at, request_at,
       dispatch_notes, facilities_contact_name, facilities_contact_phone, requester_name, requester_phone,
       expected_arrival, expected_completion, asset_name, asset_tag, serial_number, error_code,
       asset_install_date)
cross join lateral (select id from profiles where role = 'admin' order by created_at limit 1) a;
