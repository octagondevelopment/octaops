// Views for the time clock and the weekly timesheet. Pure: they return HTML strings.
import { esc } from './util.js';
import {
  vancouverDate, weekStart, weekDays, entryMs, formatDuration, formatClock, formatDay, formatWeek,
  lunchMs, paidMs, onLunch, missedLunch, paidByDay, splitHours, sumMs,
} from './timesheet.js';

const ICON_PREV = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_NEXT = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const newClockState = () => ({ loaded: false, loading: false, error: '', open: null, entries: [], busy: false });
export const newTeamState = () => ({ loaded: false, loading: false, error: '', week: weekStart(vancouverDate()), entries: [], people: [], expanded: null });

const tile = (value, label, cls = '') => `<div class="metric ${cls}"><div class="num">${value}</div><div class="lbl">${label}</div></div>`;

function times(e) {
  const out = e.clock_out ? formatClock(e.clock_out) : 'now';
  const lunch = e.lunch_start ? ` · lunch ${formatClock(e.lunch_start)}${e.lunch_end ? ` – ${formatClock(e.lunch_end)}` : ' – now'}` : '';
  return `${formatClock(e.clock_in)} – ${out}${lunch}`;
}

// Numbers the clock screen shows, so the live refresh and the view agree.
export function clockNumbers(c, now = new Date()) {
  const today = vancouverDate(now);
  const days = weekDays(weekStart(today));
  const paid = paidByDay(c.entries, days, now);
  const todayMs = paid[today] ?? 0;
  const todaySplit = splitHours({ [today]: todayMs });
  const week = splitHours(paid);
  const lunchToday = c.entries.filter((e) => e.work_date === today).reduce((a, e) => a + lunchMs(e, now), 0);
  return { today, todayMs, todaySplit, week, lunchToday };
}

// Technician: one big button that changes with the state, plus today's and this week's hours.
export function clockBody(c, now = new Date()) {
  const n = clockNumbers(c, now);
  const open = c.open;
  const lunching = onLunch(open);
  const lunchTaken = !!open?.lunch_start && !lunching;
  const label = lunching ? 'On lunch' : open ? '<span class="pulse green" aria-hidden="true"></span>Clocked in' : 'Off the clock';
  const big = lunching ? lunchMs(open, now) : n.todayMs;
  const sub = lunching ? `Lunch since ${esc(formatClock(open.lunch_start))}, not paid`
    : open ? `Since ${esc(formatClock(open.clock_in))}${lunchTaken ? ` · lunch ${formatDuration(lunchMs(open, now))} done` : ''}`
    : 'Hours worked today';
  const busy = c.busy ? 'disabled' : '';
  const buttons = lunching
    ? `<button class="btn" data-action="lunch-end" ${busy}>${c.busy ? 'Saving…' : 'End lunch'}</button>`
    : open
      ? `<div class="two-btn">${lunchTaken ? '' : `<button class="btn btn-quiet" data-action="lunch-start" ${busy}>Start lunch</button>`}
          <button class="btn btn-danger" data-action="ask-clock-out" ${busy}>${c.busy ? 'Saving…' : 'Clock out'}</button></div>`
      : `<button class="btn" data-action="clock-in" ${busy}>${c.busy ? 'Saving…' : 'Clock in'}</button>`;
  const ot = (s) => s.overtime + s.double;
  return `<section class="card clock${open ? ' on' : ''}${lunching ? ' lunch' : ''}">
      <p class="eyebrow">${label}</p>
      <div class="clock-time" id="clock-elapsed">${formatDuration(big)}</div>
      <p class="clock-sub">${sub}</p>
      ${buttons}
    </section>
    ${c.error ? `<p class="error" role="alert">${esc(c.error)}</p>` : ''}
    <p class="eyebrow section-title">Today</p>
    <div class="metrics">${tile(formatDuration(n.todayMs), 'Worked')}${tile(formatDuration(n.lunchToday), 'Lunch')}${tile(formatDuration(ot(n.todaySplit)), 'Overtime', ot(n.todaySplit) ? 'risk' : '')}</div>
    <p class="eyebrow section-title">This week</p>
    <div class="metrics">${tile(formatDuration(n.week.total), 'Total')}${tile(formatDuration(n.week.regular), 'Regular')}${tile(formatDuration(ot(n.week)), 'Overtime', ot(n.week) ? 'risk' : '')}</div>`;
}

export function clockTab(c, now = new Date()) {
  if (!c.loaded) return c.error ? `<p class="error" role="alert">${esc(c.error)}</p>` : '<div class="empty"><p>Loading…</p></div>';
  return `<div id="clock-root" class="clock-root">${clockBody(c, now)}</div>`;
}

// Admin: one card per person with the seven days of the selected week and the overtime split.
export function timesheetsTab(t, now = new Date()) {
  const current = weekStart(vancouverDate(now));
  const nav = `<div class="weeknav">
      <button type="button" class="icon-btn" data-action="week-prev" aria-label="Previous week">${ICON_PREV}</button>
      <div class="wk"><b>${esc(formatWeek(t.week))}</b>${t.week === current ? '<small class="eyebrow">This week</small>' : '<button type="button" class="link-btn" data-action="week-today">Back to this week</button>'}</div>
      ${t.week < current ? `<button type="button" class="icon-btn" data-action="week-next" aria-label="Next week">${ICON_NEXT}</button>` : '<span class="icon-spacer"></span>'}
    </div>`;
  if (!t.loaded) return nav + (t.error ? `<p class="error" role="alert">${esc(t.error)}</p>` : '<div class="empty"><p>Loading…</p></div>');
  const days = weekDays(t.week);
  const today = vancouverDate(now);
  const withEntries = new Set(t.entries.map((e) => e.technician_id));
  const people = t.people.filter((p) => p.role === 'technician' || withEntries.has(p.id));
  if (!people.length) return nav + '<div class="empty"><h2>No people yet</h2><p>Technicians appear here once they have an account.</p></div>';
  const cards = people.map((p) => {
    const mine = t.entries.filter((e) => e.technician_id === p.id);
    const paid = paidByDay(mine, days, now);
    const split = splitHours(paid);
    const live = mine.some((e) => !e.clock_out);
    const noLunch = mine.filter((e) => e.clock_out && missedLunch(e, now)).length;
    const cells = days.map((d, i) => `<div class="day${paid[d] ? ' has' : ''}${d === today ? ' today' : ''}"><span class="d">${LETTERS[i]}</span><span class="h">${paid[d] ? formatDuration(paid[d]) : '–'}</span></div>`).join('');
    const open = t.expanded === p.id;
    const list = open ? `<div class="entries">${[...mine].reverse().map((e) => `<div class="entry">
          <div><b>${esc(formatDay(e.work_date))}</b><div class="t">${esc(times(e))}${e.clock_out ? '' : ' · open'}${e.note ? ` · ${esc(e.note)}` : ''}</div>${e.clock_out && missedLunch(e, now) ? '<span class="flag-chip">No lunch</span>' : ''}</div>
          <div class="entry-side"><span class="v">${formatDuration(paidMs(e, now))}</span><button type="button" class="chip-btn" data-action="edit-entry" data-id="${esc(e.id)}">Edit</button></div>
        </div>`).join('') || '<p class="plain">No entries this week.</p>'}
        <button type="button" class="chip-btn add" data-action="add-entry" data-tech="${esc(p.id)}">Add entry</button></div>` : '';
    const splitText = `Regular ${formatDuration(split.regular)} · Overtime ${formatDuration(split.overtime)}${split.double ? ` · Double ${formatDuration(split.double)}` : ''}`;
    return `<article class="card person">
        <div class="job-head"><h3 class="job-store">${live ? '<span class="pulse green" aria-hidden="true"></span>' : ''}${esc(p.full_name)}</h3>
          <div class="week-total"><b>${formatDuration(sumMs(paid))}</b><span class="eyebrow">paid hours</span></div></div>
        <div class="days">${cells}</div>
        <p class="split-line">${esc(splitText)}</p>
        ${noLunch ? `<p class="flag">No lunch logged on ${noLunch} ${noLunch === 1 ? 'shift' : 'shifts'}</p>` : ''}
        <button type="button" class="link-btn" data-action="toggle-person" data-id="${esc(p.id)}">${open ? 'Hide entries' : 'Entries'}</button>
        ${list}
      </article>`;
  }).join('');
  return `${nav}${t.error ? `<p class="error" role="alert">${esc(t.error)}</p>` : ''}<div class="stack">${cards}</div>`;
}

export function clockOutSheet(c, now = new Date()) {
  const open = c.open;
  const worked = open ? formatDuration(paidMs(open, now)) : '0:00';
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Clock out" data-stop>
    <h2>Clock out now?</h2>
    <p class="role">You have worked ${esc(worked)} on this shift${open ? `, since ${esc(formatClock(open.clock_in))}` : ''}.</p>
    ${open && !open.lunch_start && entryMs(open, now) > 5 * 3600000 ? '<p class="warn" role="alert">You have worked more than 5 hours without a lunch.</p>' : ''}
    <button class="btn btn-danger" data-action="confirm-clock-out" ${c.busy ? 'disabled' : ''}>${c.busy ? 'Saving…' : 'Clock out'}</button>
    <button class="btn btn-quiet" data-action="close-sheet">Keep working</button>
  </div></div>`;
}

export function timeEditSheet(edit) {
  return `<div class="scrim" data-action="close-sheet"><div class="sheet tall" role="dialog" aria-label="${edit.id ? 'Edit entry' : 'Add entry'}" data-stop>
    <h2>${edit.id ? 'Edit entry' : 'Add entry'}</h2>
    <p class="role">${esc(edit.name)} · times are Vancouver time</p>
    ${edit.error ? `<p class="error" role="alert">${esc(edit.error)}</p>` : ''}
    <label class="field"><span>Clock in</span><input class="input" type="datetime-local" data-edit="clock_in" value="${esc(edit.clock_in)}"></label>
    <label class="field"><span>Clock out</span><input class="input" type="datetime-local" data-edit="clock_out" value="${esc(edit.clock_out)}"><small class="hint">Leave empty if the person is still working.</small></label>
    <div class="two">
      <label class="field"><span>Lunch start</span><input class="input" type="datetime-local" data-edit="lunch_start" value="${esc(edit.lunch_start)}"></label>
      <label class="field"><span>Lunch end</span><input class="input" type="datetime-local" data-edit="lunch_end" value="${esc(edit.lunch_end)}"></label>
    </div>
    <small class="hint lunch-hint">Lunch is unpaid. Leave both empty if there was no lunch.</small>
    <label class="field"><span>Note</span><input class="input" type="text" data-edit="note" value="${esc(edit.note)}" maxlength="200" autocomplete="off"></label>
    <button class="btn" data-action="save-entry" ${edit.busy ? 'disabled' : ''}>${edit.busy ? 'Saving…' : 'Save entry'}</button>
    <button class="btn btn-quiet" data-action="close-sheet">Cancel</button>
  </div></div>`;
}
