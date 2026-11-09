// Pure helpers for the timesheet: dates in Vancouver time, weeks, hour totals.
export const TZ = 'America/Vancouver';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' of an instant as seen in Vancouver.
export const vancouverDate = (d = new Date()) => dayFmt.format(d);

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Monday of the week that holds dateStr.
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(dateStr, -((dow + 6) % 7));
}

export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export function entryMs(entry, now = new Date()) {
  const end = entry.clock_out ? new Date(entry.clock_out) : now;
  return Math.max(0, end - new Date(entry.clock_in));
}

// Milliseconds worked per calendar day. Open entries count up to now.
export function totalsByDay(entries, days, now = new Date()) {
  const totals = Object.fromEntries(days.map((d) => [d, 0]));
  for (const e of entries) if (e.work_date in totals) totals[e.work_date] += entryMs(e, now);
  return totals;
}

export const sumMs = (totals) => Object.values(totals).reduce((a, b) => a + b, 0);

// ---- Paid hours and overtime (British Columbia rules, to be confirmed with accounting) ----
// Lunch is unpaid. Overtime: 1.5x after 8 h in a day and after 40 h in a week (only the first
// 8 h of each day count toward the week), 2x after 12 h in a day.
export const HOUR = 3600000;
export const DAILY_REGULAR = 8 * HOUR;
export const DAILY_DOUBLE = 12 * HOUR;
export const WEEKLY_REGULAR = 40 * HOUR;
export const LUNCH_REQUIRED_AFTER = 5 * HOUR;

export function lunchMs(entry, now = new Date()) {
  if (!entry.lunch_start) return 0;
  const end = entry.lunch_end ? new Date(entry.lunch_end) : entry.clock_out ? new Date(entry.clock_out) : now;
  return Math.max(0, end - new Date(entry.lunch_start));
}

export const paidMs = (entry, now = new Date()) => Math.max(0, entryMs(entry, now) - lunchMs(entry, now));

export const onLunch = (entry) => !!entry && !!entry.lunch_start && !entry.lunch_end && !entry.clock_out;

// A shift of more than 5 hours with no lunch logged.
export const missedLunch = (entry, now = new Date()) => !entry.lunch_start && entryMs(entry, now) > LUNCH_REQUIRED_AFTER;

export function paidByDay(entries, days, now = new Date()) {
  const totals = Object.fromEntries(days.map((d) => [d, 0]));
  for (const e of entries) if (e.work_date in totals) totals[e.work_date] += paidMs(e, now);
  return totals;
}

// byDay: { 'YYYY-MM-DD': paid ms } for one week -> total, regular, overtime (1.5x) and double (2x), all in ms.
export function splitHours(byDay) {
  let total = 0;
  let regularSum = 0;
  let overtime = 0;
  let double = 0;
  for (const ms of Object.values(byDay)) {
    total += ms;
    regularSum += Math.min(ms, DAILY_REGULAR);
    overtime += Math.min(Math.max(ms - DAILY_REGULAR, 0), DAILY_DOUBLE - DAILY_REGULAR);
    double += Math.max(ms - DAILY_DOUBLE, 0);
  }
  const weekly = Math.max(0, regularSum - WEEKLY_REGULAR);
  return { total, regular: regularSum - weekly, overtime: overtime + weekly, double };
}

// 27900000 -> "7:45"
export function formatDuration(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

export const formatClock = (iso) => clockFmt.format(new Date(iso));

export function formatDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatWeek(start) {
  const end = addDays(start, 6);
  const f = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  return `${f(start)} – ${f(end)}`;
}

// Offset (local minus UTC) of Vancouver at a given instant, in ms.
function offsetMs(utcMs) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(utcMs)).filter((x) => x.type !== 'literal').map((x) => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

// ISO instant -> 'YYYY-MM-DDTHH:MM' in Vancouver, for <input type="datetime-local">.
export function toLocalInput(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const local = new Date(t + offsetMs(t));
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

// 'YYYY-MM-DDTHH:MM' read as Vancouver time -> ISO instant (null if invalid).
export function fromLocalInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetMs(guess);
  utc = guess - offsetMs(utc);
  const check = new Date(utc);
  return Number.isNaN(check.getTime()) ? null : check.toISOString();
}
