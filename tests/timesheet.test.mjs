// Run with: node --test tests/timesheet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { vancouverDate, addDays, weekStart, weekDays, totalsByDay, sumMs, formatDuration, formatWeek, toLocalInput, fromLocalInput, entryMs } from '../js/timesheet.js';

test('vancouver date follows local time, not UTC', () => {
  assert.equal(vancouverDate(new Date('2026-11-10T07:30:00Z')), '2026-11-09'); // 23:30 PST on Nov 9
  assert.equal(vancouverDate(new Date('2026-11-10T08:30:00Z')), '2026-11-10');
  assert.equal(vancouverDate(new Date('2026-07-10T06:59:00Z')), '2026-07-09'); // PDT, UTC-7
});

test('weeks run Monday to Sunday', () => {
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Monday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // across the year
  assert.deepEqual(weekDays('2026-11-09'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(formatWeek('2026-11-09'), 'Nov 9 – Nov 15');
});

test('durations', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(27900000), '7:45');
  assert.equal(formatDuration(59999), '0:00');
  assert.equal(formatDuration(36 * 3600000 + 5 * 60000), '36:05');
  assert.equal(formatDuration(-5), '0:00');
});

test('daily totals add up, and an open entry counts up to now', () => {
  const days = weekDays('2026-11-09');
  const now = new Date('2026-11-11T20:00:00Z');
  const entries = [
    { work_date: '2026-11-09', clock_in: '2026-11-09T16:00:00Z', clock_out: '2026-11-09T20:00:00Z' }, // 4:00
    { work_date: '2026-11-09', clock_in: '2026-11-09T21:00:00Z', clock_out: '2026-11-10T00:30:00Z' }, // 3:30
    { work_date: '2026-11-11', clock_in: '2026-11-11T17:00:00Z', clock_out: null },                    // open, 3:00 so far
    { work_date: '2026-12-01', clock_in: '2026-12-01T17:00:00Z', clock_out: '2026-12-01T18:00:00Z' },  // other week, ignored
  ];
  const totals = totalsByDay(entries, days, now);
  assert.equal(formatDuration(totals['2026-11-09']), '7:30');
  assert.equal(formatDuration(totals['2026-11-10']), '0:00');
  assert.equal(formatDuration(totals['2026-11-11']), '3:00');
  assert.equal(formatDuration(sumMs(totals)), '10:30');
  assert.equal(entryMs({ clock_in: '2026-11-11T17:00:00Z', clock_out: null }, new Date('2026-11-11T16:00:00Z')), 0);
});

test('datetime-local conversion round-trips in Vancouver time', () => {
  assert.equal(fromLocalInput('2026-11-09T08:30'), '2026-11-09T16:30:00.000Z'); // PST, UTC-8
  assert.equal(fromLocalInput('2026-07-09T08:30'), '2026-07-09T15:30:00.000Z'); // PDT, UTC-7
  assert.equal(toLocalInput('2026-11-09T16:30:00.000Z'), '2026-11-09T08:30');
  assert.equal(toLocalInput('2026-07-09T15:30:00.000Z'), '2026-07-09T08:30');
  for (const v of ['2026-11-09T23:59', '2026-03-08T12:00', '2026-11-01T00:30']) assert.equal(toLocalInput(fromLocalInput(v)), v);
  assert.equal(fromLocalInput(''), null);
  assert.equal(fromLocalInput('not a date'), null);
  assert.equal(toLocalInput(null), '');
});
