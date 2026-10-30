// Run with: node --test tests
// Every report below is invented. Never put real reports in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, parseDate, parseTime, checkJob } from '../js/paste.js';

const TODAY = new Date(2026, 9, 28);
const opts = { today: TODAY };

const FILLED = `WT: 34500001
Store # 1234

Address 1 Sample St

Issue: Inconsistent shots

Dispatched : 10/27/26

Date: 10/28/26

Time In : 8:30 am

Time Out : 11:15am

Overtime : No

Issue: Grinder burrs worn
Resolution: Replaced burrs
and recalibrated the grind.
Parts : 2x 128.386, 130.702

————————————————————

Machine : Mastrena II
Shot C : 12,345
Cleaning C : 210
Installation date : 04/12/2023
Bar— 9.0
Last Cleaning :
Date: 10/27/26
Time: 6:00 pm
Cancelled shots last 24 hours: 3

NOTES: All good.
Customer was informed.`;

test('reads every field of the team template', () => {
  const r = parseReport(FILLED, opts);
  assert.deepEqual(r.fields, {
    visit_date: '2026-10-28',
    time_in: '08:30',
    time_out: '11:15',
    overtime: false,
    issue_found: 'Grinder burrs worn',
    resolution: 'Replaced burrs\nand recalibrated the grind.',
    parts_text: '2x 128.386, 130.702',
    machine: 'Mastrena II',
    installation_date: '2023-04-12',
    shot_count: '12345',
    cleaning_count: '210',
    pressure_bar: '9',
    last_cleaning_date: '2026-10-27',
    last_cleaning_time: '18:00',
    cancelled_shots_24h: '3',
    notes: 'All good.\nCustomer was informed.',
  });
  assert.equal(r.info.wt, '34500001');
  assert.equal(r.info.store, '1234');
  assert.equal(r.info.address, '1 Sample St');
  assert.equal(r.info.issue, 'Inconsistent shots');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.unmatched, []);
});

test('tells the two Issue lines and the two Date lines apart', () => {
  const r = parseReport(FILLED, opts);
  assert.equal(r.info.issue, 'Inconsistent shots');
  assert.equal(r.fields.issue_found, 'Grinder burrs worn');
  assert.equal(r.fields.visit_date, '2026-10-28');
  assert.equal(r.fields.last_cleaning_date, '2026-10-27');
});

test('copes with different separators, casing and spacing', () => {
  const r = parseReport('wt - 99\nTIME-IN: 14h30\ntime out = 4pm\novertime: Yes\nbar : 9,5\nshot c: 800', opts);
  assert.equal(r.fields.time_in, '14:30');
  assert.equal(r.fields.time_out, '16:00');
  assert.equal(r.fields.overtime, true);
  assert.equal(r.fields.pressure_bar, '9.5');
  assert.equal(r.fields.shot_count, '800');
});

test('last cleaning can carry date and time on one line', () => {
  const r = parseReport('Last Cleaning: 10/27/26 6:00pm', opts);
  assert.equal(r.fields.last_cleaning_date, '2026-10-27');
  assert.equal(r.fields.last_cleaning_time, '18:00');
});

test('ignores a WhatsApp message prefix on the first line', () => {
  const r = parseReport('[10/28/26, 9:02 PM] Sample Tech: WT: 123\nTime In : 20:00', opts);
  assert.equal(r.info.wt, '123');
  assert.equal(r.fields.time_in, '20:00');
});

test('reports values it cannot read instead of guessing', () => {
  const r = parseReport('Time In : sometime\nShot C : lots\nDate: someday', opts);
  assert.deepEqual(r.fields, {});
  assert.deepEqual(r.problems.map((p) => p.field).sort(), ['shot_count', 'time_in', 'visit_date']);
});

test('keeps lines it does not recognise', () => {
  const r = parseReport('hello team\nTime In : 8:00', opts);
  assert.deepEqual(r.unmatched, ['hello team']);
  assert.equal(r.fields.time_in, '08:00');
});

test('nothing detected from unrelated text', () => {
  const r = parseReport('see you tomorrow', opts);
  assert.deepEqual(r.fields, {});
  assert.deepEqual(r.unmatched, ['see you tomorrow']);
});

test('date parsing', () => {
  assert.deepEqual(parseDate('2026-10-28'), { value: '2026-10-28', ambiguous: false });
  assert.deepEqual(parseDate('28/10/26'), { value: '2026-10-28', ambiguous: false });
  assert.deepEqual(parseDate('10/28/2026'), { value: '2026-10-28', ambiguous: false });
  assert.deepEqual(parseDate('03/04/26', { order: 'mdy' }), { value: '2026-03-04', ambiguous: true });
  assert.deepEqual(parseDate('03/04/26', { order: 'dmy' }), { value: '2026-04-03', ambiguous: true });
  assert.deepEqual(parseDate('Oct 28', opts), { value: '2026-10-28', ambiguous: false });
  assert.deepEqual(parseDate('28th October 2026'), { value: '2026-10-28', ambiguous: false });
  assert.equal(parseDate('31/02/26'), null);
  assert.equal(parseDate('soon'), null);
});

test('time parsing', () => {
  assert.equal(parseTime('8:30'), '08:30');
  assert.equal(parseTime('8.30 PM'), '20:30');
  assert.equal(parseTime('12am'), '00:00');
  assert.equal(parseTime('12:15 pm'), '12:15');
  assert.equal(parseTime('1430'), '14:30');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('later'), null);
});

test('warns when the text belongs to another job', () => {
  const r = parseReport(FILLED, opts);
  assert.deepEqual(checkJob(r.info, { work_task_number: '34500001', store_number: '1234' }), []);
  const w = checkJob(r.info, { work_task_number: '34599999', store_number: '1234' });
  assert.equal(w.length, 1);
  assert.match(w[0], /WT 34500001/);
  assert.equal(checkJob(r.info, { work_task_number: '34500001', store_number: '9999' }).length, 1);
});
