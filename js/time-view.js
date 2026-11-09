// Views for the time clock and the weekly timesheet. Pure: they return HTML strings.
import { esc } from './util.js';
import { vancouverDate, weekStart, weekDays, totalsByDay, sumMs, entryMs, formatDuration, formatClock, formatDay, formatWeek } from './timesheet.js';

const ICON_PREV = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_NEXT = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const newClockState = () => ({ loaded: false, loading: false, error: '', open: null, entries: [], busy: false });
export const newTeamState = () => ({ loaded: false, loading: false, error: '', week: weekStart(vancouverDate()), entries: [], people: [], expanded: null });

const times = (e) => `${formatClock(e.clock_in)} – ${e.clock_out ? formatClock(e.clock_out) : 'now'}`;

// Technician: big clock card plus the hours of this week.
export function clockTab(c, now = new Date()) {
  if (!c.loaded) return c.error ? `<p class="error" role="alert">${esc(c.error)}</p>` : '<div class="empty"><p>Loading…</p></div>';
  const days = weekDays(weekStart(vancouverDate(now)));
  const totals = totalsByDay(c.entries, days, now);
  const today = vancouverDate(now);
  const open = c.open;
  const big = open ? entryMs(open, now) : totals[today] ?? 0;
  const rows = days.filter((d) => d <= today).map((d) => {
    const list = c.entries.filter((e) => e.work_date === d);
    return `<div class="kv key"><span class="k">${esc(formatDay(d))}</span><span class="v">${totals[d] ? formatDuration(totals[d]) : '–'}</span></div>
      ${list.length ? `<p class="plain">${list.map((e) => esc(times(e))).join(' · ')}</p>` : ''}`;
  }).join('');
  return `<section class="card clock${open ? ' on' : ''}">
      <p class="eyebrow">${open ? '<span class="pulse green" aria-hidden="true"></span>Clocked in' : 'Off the clock'}</p>
      <div class="clock-time" id="clock-elapsed">${formatDuration(big)}</div>
      <p class="clock-sub">${open ? `This session, since ${esc(formatClock(open.clock_in))}` : 'Today so far'}</p>
      <button class="btn${open ? ' btn-danger' : ''}" data-action="${open ? 'ask-clock-out' : 'clock-in'}" ${c.busy ? 'disabled' : ''}>${c.busy ? 'Saving…' : open ? 'Clock out' : 'Clock in'}</button>
    </section>
    ${c.error ? `<p class="error" role="alert">${esc(c.error)}</p>` : ''}
    <p class="eyebrow section-title">This week · ${formatDuration(sumMs(totals))}</p>
    <section class="card section">${rows || '<p class="plain">No hours yet.</p>'}</section>`;
}

// Admin: one card per person with the seven days of the selected week.
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
    const totals = totalsByDay(mine, days, now);
    const live = mine.some((e) => !e.clock_out);
    const cells = days.map((d, i) => `<div class="day${totals[d] ? ' has' : ''}${d === today ? ' today' : ''}"><span class="d">${LETTERS[i]}</span><span class="h">${totals[d] ? formatDuration(totals[d]) : '–'}</span></div>`).join('');
    const open = t.expanded === p.id;
    const list = open ? `<div class="entries">${[...mine].reverse().map((e) => `<div class="entry">
          <div><b>${esc(formatDay(e.work_date))}</b><div class="t">${esc(times(e))}${e.clock_out ? '' : ' · open'}${e.note ? ` · ${esc(e.note)}` : ''}</div></div>
          <div class="entry-side"><span class="v">${formatDuration(entryMs(e, now))}</span><button type="button" class="chip-btn" data-action="edit-entry" data-id="${esc(e.id)}">Edit</button></div>
        </div>`).join('') || '<p class="plain">No entries this week.</p>'}
        <button type="button" class="chip-btn add" data-action="add-entry" data-tech="${esc(p.id)}">Add entry</button></div>` : '';
    return `<article class="card person">
        <div class="job-head"><h3 class="job-store">${live ? '<span class="pulse green" aria-hidden="true"></span>' : ''}${esc(p.full_name)}</h3>
          <div class="week-total"><b>${formatDuration(sumMs(totals))}</b><span class="eyebrow">hours</span></div></div>
        <div class="days">${cells}</div>
        <button type="button" class="link-btn" data-action="toggle-person" data-id="${esc(p.id)}">${open ? 'Hide entries' : 'Entries'}</button>
        ${list}
      </article>`;
  }).join('');
  return `${nav}${t.error ? `<p class="error" role="alert">${esc(t.error)}</p>` : ''}<div class="stack">${cards}</div>`;
}

export function clockOutSheet(c, now = new Date()) {
  const open = c.open;
  const worked = open ? formatDuration(entryMs(open, now)) : '0:00';
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Clock out" data-stop>
    <h2>Clock out now?</h2>
    <p class="role">You have worked ${esc(worked)} this session${open ? `, since ${esc(formatClock(open.clock_in))}` : ''}.</p>
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
    <label class="field"><span>Note</span><input class="input" type="text" data-edit="note" value="${esc(edit.note)}" maxlength="200" autocomplete="off"></label>
    <button class="btn" data-action="save-entry" ${edit.busy ? 'disabled' : ''}>${edit.busy ? 'Saving…' : 'Save entry'}</button>
    <button class="btn btn-quiet" data-action="close-sheet">Cancel</button>
  </div></div>`;
}
