import { sb } from './supabase.js';
import { getDraft, putDraft, dirtyDrafts, allDrafts } from './db.js';
import { STEPS, REPORT_COLUMNS, SAVE_TEXT, emptyDraft, rowToDraft, draftToRow, progressHtml, stepHtml } from './report.js';
import { parseReport, checkJob, matchedRows } from './paste.js';
import { esc } from './util.js';
import { vancouverDate, weekStart, addDays, toLocalInput, fromLocalInput } from './timesheet.js';
import { newClockState, newTeamState, clockTab, clockBody, timesheetsTab, clockOutSheet, timeEditSheet } from './time-view.js';
import { newReviewState, adminReportsTab, reviewScreen } from './review-view.js';

const app = document.getElementById('app');
const state = {
  clock: newClockState(),
  team: newTeamState(),
  review: newReviewState(),
  timeEdit: null,
  submit: { busy: false, error: '' },
  flash: '',
  step: 0,
  draft: null,
  saveStatus: 'local',
  hasDraft: {},
  reportStatus: {},
  paste: { open: false, text: '', result: null, error: '' },
  pasteNote: '',
  parts: null,
  partsError: '',
  partQuery: '',
  openPart: null,
  session: null,
  profile: null,
  profileMissing: false,
  tab: 'jobs',
  jobs: null,
  partsCount: null,
  sheet: false,
  loginError: '',
  email: '',
  query: '',
  jobsError: '',
  busy: false,
  pwError: '',
  pwBusy: false,
  pwDone: false,
};

const MIN_PASSWORD = 10;

const isAdmin = () => state.profile?.role === 'admin';

const STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'In progress',
  awaiting_approval: 'Awaiting approval',
  invoiced: 'Invoiced',
};

const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M184 76h144l108 108v144L328 436H184L76 328V184z" fill="none" stroke="var(--primary)" stroke-width="34" stroke-linejoin="round"/><circle cx="256" cy="256" r="56" fill="var(--primary)"/></svg>`;

const ICON_BACK = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_NEXT = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

const TAB_ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  timesheets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3"/></svg>',
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>',
  parts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>',
};

function daysLeft(expiresAt) {
  const [y, m, d] = String(expiresAt).split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
}

function fuseHtml(expiresAt) {
  const left = daysLeft(expiresAt);
  const elapsed = Math.min(100, Math.max(0, ((90 - left) / 90) * 100));
  const level = left <= 15 ? 'risk' : left <= 30 ? 'warn' : '';
  const label = left < 0 ? 'Expired' : `${left}d left`;
  return `<div class="fuse ${level}"><div class="fuse-track"><div class="fuse-fill" style="width:${elapsed.toFixed(0)}%"></div></div><span class="fuse-label">${label}</span></div>`;
}

// Priority 1 (for example "1 - High") or any text that says urgent or critical.
function isUrgent(job) {
  return job.status !== 'invoiced' && /^\s*p?1\b|urgent|critical|emergency/i.test(job.priority || '');
}

const statusChip = (job) => `<span class="chip chip-${esc(job.status)}">${esc(STATUS_LABEL[job.status] || job.status)}</span>`;
const chipsHtml = (job) => `<div class="chips">${isUrgent(job) ? '<span class="chip chip-urgent"><span class="pulse" aria-hidden="true"></span>Urgent</span>' : ''}${statusChip(job)}</div>`;

function jobCard(job) {
  const store = job.store_name || (job.store_number ? `Store ${job.store_number}` : 'No store');
  const asset = [job.serial_number ? `S/N ${job.serial_number}` : '', job.error_code ? `Error ${job.error_code}` : ''].filter(Boolean).join(' · ');
  return `<a class="card card-link" href="#/job/${esc(job.id)}">
    <div class="job-head"><h3 class="job-store">${esc(store)}</h3>${chipsHtml(job)}</div>
    <p class="job-issue">${esc(job.issue || job.request_class || 'No issue described')}</p>
    <p class="job-meta"><b>#${esc(job.work_task_number)}</b>${job.priority ? ` · ${esc(job.priority)}` : ''}${asset ? `<br>${esc(asset)}` : ''}</p>
    ${isAdmin() ? fuseHtml(job.expires_at) : ''}
  </a>`;
}

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

function kv(label, value, href, key) {
  if (value === null || value === undefined || value === '') return '';
  const text = esc(value);
  const body = href ? `<a href="${esc(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>` : text;
  return `<div class="kv${key ? ' key' : ''}"><span class="k">${esc(label)}</span><span class="v">${body}</span></div>`;
}

const tel = (n) => (n ? `tel:${String(n).replace(/[^\d+]/g, '')}` : '');
const maps = (a) => (a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : '');

function section(title, rows) {
  const body = rows.filter(Boolean).join('');
  return body ? `<section class="card section"><h3>${esc(title)}</h3>${body}</section>` : '';
}

function jobDetailView(job) {
  if (state.jobs === null) return `<main class="screen"><div class="screen-body"><a class="back" href="#/">${ICON_BACK}<span>Jobs</span></a><div class="empty"><p>Loading job…</p></div></div></main>`;
  if (!job) return `<main class="screen"><div class="screen-body"><a class="back" href="#/">${ICON_BACK}<span>Jobs</span></a><div class="empty"><h2>Job not found</h2><p>It may have been reassigned.</p></div></div></main>`;
  const store = job.store_name || (job.store_number ? `Store ${job.store_number}` : 'No store');
  const closed = job.status === 'awaiting_approval' || job.status === 'invoiced';
  const label = closed ? 'View report' : state.hasDraft[job.id] ? 'Continue report' : 'Start report';
  const sent = isAdmin() ? state.review.rows.find((x) => x.job_id === job.id) : null;
  const bar = isAdmin()
    ? (sent ? `<div class="sticky-bar"><a class="btn" href="#/review/${esc(sent.id)}">View report</a></div>` : '')
    : `<div class="sticky-bar"><a class="btn" href="#/job/${esc(job.id)}/report">${label}</a></div>`;
  const flash = state.flash?.job === job.id ? `<p class="success" role="status">${esc(state.flash.text)}</p>` : '';
  const photos = (job.photo_urls || []).map((u, i) => kv(`Photo ${i + 1}`, 'Open photo', u)).join('');
  return `<main class="screen">
    <div class="screen-body">
      <a class="back" href="#/">${ICON_BACK}<span>Jobs</span></a>
      ${flash}
      <header class="detail-head">
        <div class="job-head"><h1 class="detail-title">${esc(store)}</h1>${chipsHtml(job)}</div>
        <p class="job-meta"><b>#${esc(job.work_task_number)}</b>${job.priority ? ` · ${esc(job.priority)}` : ''}</p>
        ${isAdmin() ? fuseHtml(job.expires_at) : ''}
      </header>
      <div class="stack">
        ${section('Request', [kv('Category', job.request_class), kv('Summary', job.request_summary), kv('Request number', job.request_number, '', true), kv('Dispatched', fmtDate(job.dispatched_at)), kv('Requested', job.request_at ? new Date(job.request_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : ''), kv('Expected arrival', job.expected_arrival), kv('Expected completion', job.expected_completion), photos])}
        ${section('Where', [kv('Address', job.address, maps(job.address)), kv('Store phone', job.store_phone, tel(job.store_phone)), kv('Store notes', job.dispatch_notes)])}
        ${section('Contacts', [kv('Requested by', job.requester_name), kv('Phone', job.requester_phone, tel(job.requester_phone)), kv('Title', job.requester_title), kv('Facilities', job.facilities_contact_name), kv('Facilities phone', job.facilities_contact_phone, tel(job.facilities_contact_phone)), kv('Facilities email', job.facilities_contact_email, job.facilities_contact_email ? `mailto:${job.facilities_contact_email}` : '')])}
        ${section('Equipment', [kv('Asset', job.asset_name), kv('Tag', job.asset_tag, '', true), kv('Serial number', job.serial_number, '', true), kv('Error code', job.error_code, '', true), kv('Installed', fmtDate(job.asset_install_date)), kv('Partner serial', job.partner_serial)])}
      </div>
    </div>
    ${bar}
  </main>`;
}

const LOCKED = ['submitted', 'approved'];

function reportView(job) {
  if (state.jobs === null) return `<main class="screen"><div class="screen-body"><div class="empty"><p>Loading…</p></div></div></main>`;
  if (!job) return `<main class="screen"><div class="screen-body"><a class="back" href="#/">${ICON_BACK}<span>Jobs</span></a><div class="empty"><h2>Job not found</h2></div></div></main>`;
  const d = state.draft;
  const back = `<a class="back" href="#/job/${esc(job.id)}">${ICON_BACK}<span>Job</span></a>`;
  if (!d || d.job_id !== job.id) return `<main class="screen"><div class="screen-body">${back}<div class="empty"><p>Opening report…</p></div></div></main>`;
  const locked = LOCKED.includes(d.status);
  const last = state.step === STEPS.length - 1;
  const ref = `<div class="card ref">
    ${kv('WT', job.work_task_number, '', true)}${kv('Store #', job.store_number, '', true)}${kv('Address', job.address)}${kv('Issue', job.issue || job.request_class)}${kv('Dispatched', fmtDate(job.dispatched_at))}
  </div>`;
  const banner = locked ? '<p class="success" role="status">This report was already sent, so it can only be read.</p>' : '';
  const note = state.pasteNote ? `<p class="success" role="status">${esc(state.pasteNote)}</p>` : '';
  return `<main class="screen">
    <div class="screen-body">
      <header class="rep-top">${back}<span class="save" id="save-status" role="status">${esc(SAVE_TEXT[state.saveStatus])}</span></header>
      ${ref}
      ${banner}
      ${note}
      ${state.submit.error && state.sheet !== 'submit' ? `<p class="warn" role="alert">${esc(state.submit.error)}</p>` : ''}
      ${progressHtml(state.step)}
      <div class="step-body">${stepHtml(STEPS[state.step].id, d, locked)}</div>
      ${last && !locked ? '<button class="btn btn-quiet save-later" data-action="finish">Save draft and close</button>' : ''}
    </div>
    <div class="sticky-bar actions">
      <button class="btn btn-quiet" data-action="step-back">${state.step === 0 ? 'Close' : 'Back'}</button>
      <button class="btn" data-action="${last ? (locked ? 'finish' : 'ask-submit') : 'step-next'}">${last ? (locked ? 'Close' : 'Review and send') : 'Next'}</button>
    </div>
    ${state.paste.open ? pasteSheet(job) : ''}
    ${state.sheet === 'submit' ? submitSheet() : ''}
  </main>`;
}

function submitSheet() {
  const s = state.submit;
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Send report" data-stop>
    <h2>Send this report?</h2>
    <p class="role">The office will review it. You can't edit it after you send it.</p>
    ${s.error ? `<p class="error" role="alert">${esc(s.error)}</p>` : ''}
    <button class="btn" data-action="confirm-submit" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Sending…' : 'Send report'}</button>
    <button class="btn btn-quiet" data-action="close-sheet">Keep editing</button>
  </div></div>`;
}

// What a report needs before it can be sent, and the step where it is filled in.
function missingForSubmit(d) {
  const missing = [];
  if (!d.time_in) missing.push(['Time in', 0]);
  if (!d.time_out) missing.push(['Time out', 0]);
  if (!String(d.resolution || '').trim()) missing.push(['Resolution Summary', 1]);
  return missing;
}

async function submitReport() {
  const d = state.draft;
  const s = state.submit;
  if (!d || s.busy) return;
  s.busy = true;
  s.error = '';
  render();
  await syncNow();
  if (d.dirty || state.saveStatus === 'error' || state.saveStatus === 'offline') {
    s.busy = false;
    s.error = "Couldn't save your report to the server first. Check your connection and try again.";
    return render();
  }
  const { error } = await sb.rpc('submit_report', { p_job_id: d.job_id });
  s.busy = false;
  if (error) {
    s.error = /Report incomplete/.test(error.message) ? 'Add time in, time out and a resolution summary first.'
      : /Already sent/.test(error.message) ? 'This report was already sent.'
      : navigator.onLine ? "Couldn't send the report. Try again." : "You're offline. Connect to send the report.";
    return render();
  }
  d.status = 'submitted';
  d.dirty = false;
  await putDraft(d);
  state.reportStatus[d.job_id] = 'submitted';
  const job = state.jobs.find((j) => j.id === d.job_id);
  if (job) job.status = 'awaiting_approval';
  state.sheet = false;
  state.flash = { text: 'Report sent. The office will review it.', job: d.job_id };
  location.hash = `#/job/${d.job_id}`;
}

// A field counts as filled only if the technician changed it: values the app
// prefills (today's date, machine and install date from the job) do not.
const hasValue = (d, k, base) => (k === 'overtime' ? d[k] === true : d[k] !== '' && d[k] != null && d[k] !== base?.[k]);

function pasteSheet(job) {
  const p = state.paste;
  const wrap = (inner) => `<div class="scrim" data-action="close-paste"><div class="sheet tall" role="dialog" aria-label="Paste from WhatsApp" data-stop>${inner}</div></div>`;
  if (!p.result) {
    return wrap(`<h2>Paste from WhatsApp</h2>
      <p class="role">Paste the report exactly as you send it to the group.</p>
      ${p.error ? `<p class="error" role="alert">${esc(p.error)}</p>` : ''}
      <textarea class="input area tall-area" id="paste-text" rows="10" placeholder="WT:&#10;Store #&#10;Time In :&#10;…" autocomplete="off">${esc(p.text)}</textarea>
      <button class="btn" data-action="detect-paste">Detect fields</button>
      <button class="btn btn-quiet" data-action="close-paste">Cancel</button>`);
  }
  const r = p.result;
  const rows = matchedRows(r.fields);
  const mismatch = checkJob(r.info, job);
  const warns = [...mismatch, ...r.warnings].map((w) => `<p class="warn" role="alert">${esc(w)}</p>`).join('');
  const found = rows.length
    ? `<div class="card section"><h3>We found ${rows.length} ${rows.length === 1 ? 'field' : 'fields'}</h3>${rows.map((x) => kv(x.label, x.value)).join('')}</div>`
    : '<p class="error" role="alert">We could not find any report fields in that text.</p>';
  const problems = r.problems.length
    ? `<div class="card section"><h3>Could not read</h3>${r.problems.map((x) => kv(x.label, x.raw)).join('')}</div>` : '';
  const extra = r.unmatched.length
    ? `<div class="card section"><h3>Lines we did not use</h3>${r.unmatched.slice(0, 8).map((l) => `<p class="plain">${esc(l)}</p>`).join('')}</div>` : '';
  const d = state.draft;
  const base = emptyDraft(job);
  const clash = Object.keys(r.fields).some((k) => hasValue(d, k, base));
  const go = mismatch.length ? 'Apply anyway' : 'Apply to report';
  const buttons = !rows.length ? ''
    : clash
      ? `<button class="btn" data-action="apply-paste" data-mode="empty">${mismatch.length ? 'Fill empty fields anyway' : 'Fill empty fields only'}</button>
         <button class="btn btn-quiet" data-action="apply-paste" data-mode="all">Replace with pasted text</button>`
      : `<button class="btn" data-action="apply-paste" data-mode="all">${go}</button>`;
  return wrap(`<h2>Check what we found</h2>
    <p class="role">Nothing is saved until you apply it. You can edit every field afterwards.</p>
    ${warns}${found}${problems}${extra}
    ${buttons}
    <button class="btn btn-quiet" data-action="edit-paste">Edit the text</button>`);
}

function applyPaste(mode) {
  const d = state.draft;
  const r = state.paste.result;
  if (!d || !r) return;
  const job = state.jobs?.find((j) => j.id === d.job_id);
  const base = job ? emptyDraft(job) : null;
  let n = 0;
  for (const [k, v] of Object.entries(r.fields)) {
    if (mode === 'empty' && hasValue(d, k, base)) continue;
    d[k] = v;
    n += 1;
  }
  state.paste = { open: false, text: '', result: null, error: '' };
  state.pasteNote = n ? `Filled ${n} ${n === 1 ? 'field' : 'fields'} from your text. Check each step before you finish.` : '';
  state.step = 0;
  if (n) markDirty();
  render();
  window.scrollTo(0, 0);
}

function route() {
  const rev = location.hash.match(/^#\/review\/([\w-]+)$/);
  if (rev) return { view: 'review', id: rev[1] };
  const m = location.hash.match(/^#\/job\/([0-9a-fA-F-]+)(\/report)?$/);
  return m ? { view: m[2] ? 'report' : 'job', id: m[1] } : { view: 'list' };
}

function updateSaveLabel() {
  const el = document.getElementById('save-status');
  if (el) el.textContent = SAVE_TEXT[state.saveStatus];
}

async function pushDraft(d) {
  const { error } = await sb.from('reports').upsert(draftToRow(d, state.session.user.id), { onConflict: 'job_id' });
  return !error;
}

let syncTimer;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

async function syncNow() {
  clearTimeout(syncTimer);
  const d = state.draft;
  if (!d || !d.dirty || !state.session || LOCKED.includes(d.status)) return;
  if (!navigator.onLine) {
    state.saveStatus = 'offline';
    return updateSaveLabel();
  }
  const stamp = d.updated_at;
  const ok = await pushDraft(d);
  if (ok && d.updated_at === stamp) {
    d.dirty = false;
    await putDraft(d);
  }
  state.saveStatus = ok ? (d.dirty ? 'local' : 'synced') : 'error';
  updateSaveLabel();
}

async function flushAll() {
  if (!state.session) return;
  for (const d of await dirtyDrafts()) {
    if (state.draft && state.draft.job_id === d.job_id) continue;
    if (await pushDraft(d)) {
      d.dirty = false;
      await putDraft(d);
    }
  }
  syncNow();
}

async function openReport(id) {
  const job = state.jobs?.find((j) => j.id === id);
  if (!job) return;
  state.step = 0;
  state.draft = null;
  state.pasteNote = '';
  state.paste = { open: false, text: '', result: null, error: '' };
  render();
  let draft = await getDraft(id);
  let row = null;
  if (navigator.onLine) {
    const res = await sb.from('reports').select(REPORT_COLUMNS).eq('job_id', id).maybeSingle();
    row = res.data;
  }
  if (!draft && row) draft = rowToDraft(row, job);
  if (!draft) draft = emptyDraft(job);
  if (row) draft.status = row.status;
  if (route().view !== 'report' || route().id !== id) return;
  state.draft = draft;
  state.saveStatus = draft.dirty ? (navigator.onLine ? 'local' : 'offline') : row ? 'synced' : 'local';
  render();
  if (draft.dirty) scheduleSync();
}

async function checkDraft(id) {
  const had = !!state.hasDraft[id];
  const found = !!(await getDraft(id));
  state.hasDraft[id] = found;
  if (found !== had && route().view === 'job') render();
}

function enterRoute() {
  const r = route();
  if (r.view === 'report') openReport(r.id);
  else if (r.view === 'job') checkDraft(r.id);
}

function matchesQuery(job) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [job.work_task_number, job.request_number, job.store_number, job.store_name, job.issue, job.request_class, job.serial_number, job.priority].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function jobList() {
  const shown = state.jobs.filter(matchesQuery);
  if (!shown.length) return '<div class="empty"><h2>No matches</h2><p>Try a ticket number, store or issue.</p></div>';
  return shown.map(jobCard).join('');
}

function metricsHtml() {
  const open = state.jobs.filter((j) => j.status !== 'invoiced');
  const risk = open.filter((j) => daysLeft(j.expires_at) <= 15).length;
  const approval = state.jobs.filter((j) => j.status === 'awaiting_approval').length;
  const tile = (n, label, cls = '') => `<div class="metric ${cls}"><div class="num">${n}</div><div class="lbl">${label}</div></div>`;
  if (!isAdmin()) {
    // Technicians see no billing data (expiry, approvals).
    const urgent = open.filter(isUrgent).length;
    return `<div class="metrics two">${tile(open.length, 'Open')}${tile(urgent, 'Urgent', urgent ? 'risk' : '')}</div>`;
  }
  return `<div class="metrics">${tile(open.length, 'Open')}${tile(risk, 'At risk', risk ? 'risk' : '')}${tile(approval, 'To approve')}</div>`;
}

function loginView() {
  return `<main class="screen">
    <div class="screen-body">
      <div class="brand">${LOGO}<span>OctaOps</span></div>
      <h1 class="title">Sign in</h1>
      <p class="lede">Use the email your admin set up for you.</p>
      <form id="login" novalidate>
        ${state.loginError ? `<p class="error" role="alert">${esc(state.loginError)}</p>` : ''}
        <label class="field"><span>Email</span>
          <input class="input" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" value="${esc(state.email)}" required></label>
        <label class="field"><span>Password</span>
          <div class="input-wrap">
            <input class="input has-action" name="password" type="password" autocomplete="current-password" required>
            <button class="input-action" type="button" data-action="toggle-pass" aria-label="Show password">Show</button>
          </div></label>
      </form>
    </div>
    <div class="sticky-bar"><button class="btn" type="submit" form="login" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Signing in…' : 'Sign in'}</button></div>
  </main>`;
}

function tabBody() {
  if (state.tab === 'jobs') {
    if (state.jobs === null) return '<div class="empty"><p>Loading jobs…</p></div>';
    if (state.jobsError) return `<p class="error" role="alert">${esc(state.jobsError)}</p>`;
    if (!state.jobs.length) return '<div class="empty"><h2>No jobs yet</h2><p>Assigned jobs show up here.</p></div>';
    return `${metricsHtml()}
      <label class="search">${SEARCH_ICON}<input id="q" type="search" placeholder="Search tickets, stores, issues" value="${esc(state.query)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="stack" id="job-list">${jobList()}</div>`;
  }
  if (state.tab === 'clock') return clockTab(state.clock);
  if (state.tab === 'timesheets') return timesheetsTab(state.team);
  if (state.tab === 'parts') return partsTab();
  if (isAdmin()) return adminReportsTab(state.review, Object.fromEntries((state.jobs || []).map((j) => [j.id, j])));
  return reportsTab();
}

const CATALOG_IMG = 'https://octagondevelopment.github.io/octagon-catalogo/img/';

function matchesPart(p) {
  const q = state.partQuery.trim().toLowerCase();
  if (!q) return true;
  return [p.sku, p.sku_8digit, p.name_en, p.name_es, p.module, p.subassembly].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function partRow(p) {
  const open = state.openPart === p.sku;
  const copy = (value) => `<button type="button" class="chip-btn" data-action="copy" data-copy="${esc(value)}">Copy ${esc(value)}</button>`;
  const details = open
    ? `<div class="part-detail">${kv('Module', p.module)}${kv('Subassembly', p.subassembly)}${kv('8-digit SKU', p.sku_8digit)}
        <div class="copy-row">${copy(p.sku)}${p.sku_8digit ? copy(p.sku_8digit) : ''}</div></div>` : '';
  return `<article class="card part${open ? ' open' : ''}">
    <button type="button" class="part-head" data-action="toggle-part" data-sku="${esc(p.sku)}" aria-expanded="${open}">
      <span class="part-pic"><img class="part-img" src="${CATALOG_IMG}${encodeURIComponent(p.sku)}.jpg" alt="" loading="lazy"></span>
      <span class="part-main"><b>${esc(p.name_en)}</b>${p.name_es ? `<span class="es">${esc(p.name_es)}</span>` : ''}<span class="part-meta"><span class="sku">${esc(p.sku)}</span>${p.page ? ` · Manual p. ${esc(p.page)}` : ''}</span></span>
    </button>${details}</article>`;
}

function partList() {
  const shown = state.parts.filter(matchesPart);
  if (!shown.length) return '<div class="empty"><h2>No matches</h2><p>Try a part number, or a name in English or Spanish.</p></div>';
  return shown.map(partRow).join('');
}

function partsTab() {
  if (state.parts === null) return '<div class="empty"><p>Loading parts…</p></div>';
  if (state.partsError) return `<p class="error" role="alert">${esc(state.partsError)}</p>`;
  if (!state.parts.length) return '<div class="empty"><h2>No hand-checked parts yet</h2><p>Parts appear here once someone checks them against the paper manual.</p></div>';
  return `<div class="card stat mb"><div><div class="num">${state.parts.length}</div><div class="lbl">parts checked by hand against the manual</div></div></div>
    <label class="search">${SEARCH_ICON}<input id="pq" type="search" placeholder="Search part number or name" value="${esc(state.partQuery)}" autocomplete="off" enterkeyhint="search"></label>
    <p class="fine">Pictures come from the catalog and are illustrations. Compare the part with the manual before you order.</p>
    <div class="stack" id="part-list">${partList()}</div>`;
}

function reportState(job) {
  const s = state.reportStatus[job.id];
  if (s === 'submitted' || s === 'approved') return { label: 'Sent', chip: 'invoiced', action: 'View report' };
  if (s || state.hasDraft[job.id]) return { label: 'Draft', chip: 'pending', action: 'Continue report' };
  return { label: 'Not started', chip: 'pending', action: 'Start report' };
}

function reportsTab() {
  if (state.jobs === null) return '<div class="empty"><p>Loading…</p></div>';
  if (!state.jobs.length) return '<div class="empty"><h2>No jobs yet</h2><p>Reports start from an assigned job.</p></div>';
  const rows = state.jobs.map((job) => {
    const st = reportState(job);
    const store = job.store_name || (job.store_number ? `Store ${job.store_number}` : 'No store');
    return `<a class="card card-link report-row" href="#/job/${esc(job.id)}/report">
      <div class="job-head"><h3 class="job-store">${esc(store)}</h3><span class="chip chip-${st.chip}">${st.label}</span></div>
      <p class="job-meta"><b>#${esc(job.work_task_number)}</b> · ${esc(job.issue || job.request_class || 'No issue described')}</p>
      <span class="row-action">${st.action}${ICON_NEXT}</span>
    </a>`;
  }).join('');
  return `<p class="lede tight">Pick a job to write its report.</p><div class="stack">${rows}</div>`;
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function homeView() {
  const p = state.profile;
  const name = p?.full_name || 'there';
  const first = name.split(' ')[0];
  const tabs = tabsFor();
  if (!tabs.some(([id]) => id === state.tab)) state.tab = 'jobs';
  const heading = { jobs: isAdmin() ? 'Jobs' : 'My jobs', clock: 'Time clock', timesheets: 'Timesheets', parts: 'Parts', reports: 'Reports' }[state.tab];
  const profileNote = state.profileMissing
    ? '<p class="error" role="alert">Your account has no profile yet. Ask an admin to set it up.</p>' : '';
  return `<main class="screen">
    <div class="screen-body">
      <header class="top">
        <div><p class="hello">Hi, ${esc(first)}</p><h1>${heading}</h1></div>
        <button class="avatar" data-action="open-sheet" aria-label="Account">${esc(initials(p?.full_name))}</button>
      </header>
      ${profileNote}
      ${tabBody()}
    </div>
    <nav class="tabbar" aria-label="Main" style="grid-template-columns:repeat(${tabs.length},1fr)">
      ${tabs.map(([id, label]) => `<button class="tab" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>${TAB_ICONS[id]}<span>${label}</span></button>`).join('')}
    </nav>
    ${state.sheet ? sheetView() : ''}
  </main>`;
}

function sheetView() {
  if (state.sheet === 'password') return passwordSheet();
  if (state.sheet === 'clockout') return clockOutSheet(state.clock);
  if (state.sheet === 'timeedit' && state.timeEdit) return timeEditSheet(state.timeEdit);
  const p = state.profile;
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Account" data-stop>
    <h2>${esc(p?.full_name || 'Account')}</h2>
    <p class="role">${esc(p?.role || 'No role')} · ${esc(state.session?.user?.email || '')}</p>
    <button class="btn btn-quiet" data-action="change-password">Change password</button>
    <button class="btn btn-danger" data-action="sign-out">Sign out</button>
    <button class="btn btn-quiet" data-action="close-sheet">Close</button>
  </div></div>`;
}

function passwordSheet() {
  const form = state.pwDone ? '' : `<form id="pw" novalidate>
      <label class="field"><span>New password</span>
        <input class="input" name="password" type="password" autocomplete="new-password" required></label>
      <label class="field"><span>Repeat new password</span>
        <input class="input" name="confirm" type="password" autocomplete="new-password" required></label>
      <button class="btn" type="submit" ${state.pwBusy ? 'disabled' : ''}>${state.pwBusy ? 'Saving…' : 'Save password'}</button>
    </form>`;
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Change password" data-stop>
    <h2>Change password</h2>
    <p class="role">Use at least ${MIN_PASSWORD} characters.</p>
    ${state.pwError ? `<p class="error" role="alert">${esc(state.pwError)}</p>` : ''}
    ${state.pwDone ? '<p class="success" role="status">Password updated. Use it the next time you sign in.</p>' : ''}
    ${form}
    <button class="btn btn-quiet" data-action="close-sheet">${state.pwDone ? 'Done' : 'Cancel'}</button>
  </div></div>`;
}

function render() {
  if (!state.session) {
    app.innerHTML = loginView();
    return;
  }
  const r = route();
  if (r.view === 'review') {
    if (!state.profile) { app.innerHTML = '<main class="screen"><div class="screen-body"><div class="empty"><p>Loading…</p></div></div></main>'; return; }
    if (!isAdmin()) { location.hash = '#/'; return; }
    const report = state.review.rows.find((x) => x.id === r.id);
    const job = report ? state.jobs?.find((j) => j.id === report.job_id) : null;
    const person = report ? state.review.people.find((p) => p.id === report.technician_id) : null;
    app.innerHTML = reviewScreen(report, job, person, state.review);
    return;
  }
  const job = r.view === 'list' ? null : state.jobs?.find((j) => j.id === r.id);
  if (r.view === 'job') app.innerHTML = jobDetailView(job);
  else if (r.view === 'report') app.innerHTML = isAdmin() ? jobDetailView(job) : reportView(job);
  else app.innerHTML = homeView();
}

async function loadHome() {
  const uid = state.session.user.id;
  const [profile, jobs, parts, reports, drafts] = await Promise.all([
    sb.from('profiles').select('full_name, role').eq('id', uid).maybeSingle(),
    sb.from('jobs').select('*').order('expires_at', { ascending: true }),
    sb.from('parts').select('sku, sku_8digit, name_en, name_es, module, subassembly, page').eq('hand_checked', true).order('sku', { ascending: true }),
    sb.from('reports').select('job_id, status'),
    allDrafts(),
  ]);
  state.reportStatus = Object.fromEntries((reports.data || []).map((r) => [r.job_id, r.status]));
  for (const d of drafts) state.hasDraft[d.job_id] = true;
  state.profile = profile.data;
  state.profileMissing = !profile.data;
  state.jobsError = jobs.error ? "Couldn't load your jobs. Check your connection and reopen the app." : '';
  state.jobs = jobs.data || [];
  state.partsError = parts.error ? "Couldn't load the parts catalog. Check your connection and reopen the app." : '';
  state.parts = parts.data || [];
  render();
  if (isAdmin()) loadAdminReports();
  enterRoute();
}

async function signIn(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  state.email = email;
  if (!email || !password) {
    state.loginError = 'Enter your email and password.';
    return render();
  }
  state.busy = true;
  state.loginError = '';
  render();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  state.busy = false;
  if (error) {
    state.loginError = 'Email or password is wrong. Try again.';
    render();
  }
}

// ---- Time clock and timesheets ------------------------------------------------
// Two different apps in one: the technician clocks and writes reports; the office reads everything.
function tabsFor() {
  return isAdmin()
    ? [['jobs', 'Jobs'], ['timesheets', 'Timesheets'], ['reports', 'Reports'], ['parts', 'Parts']]
    : [['jobs', 'Jobs'], ['clock', 'Clock'], ['parts', 'Parts'], ['reports', 'Reports']];
}

async function loadAdminReports() {
  if (!state.session || !isAdmin()) return;
  const rv = state.review;
  const [reports, people] = await Promise.all([
    sb.from('reports').select(`${REPORT_COLUMNS}, technician_id, submitted_at`).order('created_at', { ascending: false }),
    sb.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
  ]);
  if (reports.error || people.error) {
    rv.error = "Couldn't load the reports. Check your connection and try again.";
  } else {
    rv.error = '';
    rv.rows = reports.data || [];
    rv.people = people.data || [];
    rv.loaded = true;
  }
  render();
}

async function loadMine() {
  if (!state.session) return;
  const c = state.clock;
  const uid = state.session.user.id;
  const start = weekStart(vancouverDate());
  const [week, open] = await Promise.all([
    sb.from('timesheets').select('*').eq('technician_id', uid).gte('work_date', start).lte('work_date', addDays(start, 6)).order('clock_in', { ascending: true }),
    sb.from('timesheets').select('*').eq('technician_id', uid).is('clock_out', null).maybeSingle(),
  ]);
  if (week.error || open.error) {
    c.error = "Couldn't load your hours. Check your connection and try again.";
  } else {
    c.error = '';
    c.entries = week.data || [];
    c.open = open.data || null;
    c.loaded = true;
  }
  if (state.tab === 'clock') render();
}

async function loadTeam() {
  if (!state.session || !isAdmin()) return;
  const t = state.team;
  t.loaded = false;
  t.error = '';
  if (state.tab === 'timesheets') render();
  const [entries, people] = await Promise.all([
    sb.from('timesheets').select('*').gte('work_date', t.week).lte('work_date', addDays(t.week, 6)).order('clock_in', { ascending: true }),
    sb.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
  ]);
  if (entries.error || people.error) {
    t.error = "Couldn't load the timesheets. Check your connection and try again.";
  } else {
    t.entries = entries.data || [];
    t.people = people.data || [];
    t.loaded = true;
  }
  if (state.tab === 'timesheets') render();
}

const clockProblem = (error) => (/Already clocked in/.test(error.message) ? "You're already clocked in."
  : /Not clocked in/.test(error.message) ? "You're not clocked in."
  : /End your lunch first/.test(error.message) ? 'End your lunch before you clock out.'
  : /Lunch already taken/.test(error.message) ? 'You already took your lunch on this shift.'
  : /Not on lunch/.test(error.message) ? "You're not on lunch."
  : navigator.onLine ? "Couldn't save that. Try again." : "You're offline. The clock needs a connection so the time is exact.");

// One call to the server, then reload the hours. Used by clock in, lunch start and lunch end.
async function clockCall(rpcName) {
  const c = state.clock;
  if (c.busy) return;
  c.busy = true;
  c.error = '';
  render();
  const { error } = await sb.rpc(rpcName);
  c.busy = false;
  if (error) c.error = clockProblem(error);
  await loadMine();
  if (error) render();
}

async function clockOut() {
  const c = state.clock;
  if (c.busy) return;
  c.busy = true;
  render();
  const { error } = await sb.rpc('clock_out_now');
  c.busy = false;
  state.sheet = false;
  c.error = error ? clockProblem(error) : '';
  await loadMine();
  if (error) render();
}

function startEdit(entry, technicianId) {
  const person = state.team.people.find((p) => p.id === technicianId);
  state.timeEdit = entry
    ? { id: entry.id, technician_id: entry.technician_id, name: person?.full_name || 'Entry', clock_in: toLocalInput(entry.clock_in), clock_out: toLocalInput(entry.clock_out), lunch_start: toLocalInput(entry.lunch_start), lunch_end: toLocalInput(entry.lunch_end), note: entry.note || '', error: '', busy: false }
    : { id: null, technician_id: technicianId, name: person?.full_name || 'Person', clock_in: `${vancouverDate()}T08:00`, clock_out: '', lunch_start: '', lunch_end: '', note: '', error: '', busy: false };
  state.sheet = 'timeedit';
  render();
}

async function saveEntry() {
  const ed = state.timeEdit;
  if (!ed || ed.busy) return;
  const clockInIso = fromLocalInput(ed.clock_in);
  const clockOutIso = ed.clock_out ? fromLocalInput(ed.clock_out) : null;
  if (!clockInIso) { ed.error = 'Enter a valid clock-in time.'; return render(); }
  if (ed.clock_out && !clockOutIso) { ed.error = 'Enter a valid clock-out time.'; return render(); }
  if (clockOutIso && new Date(clockOutIso) <= new Date(clockInIso)) { ed.error = 'Clock out must be after clock in.'; return render(); }
  const lunchStartIso = ed.lunch_start ? fromLocalInput(ed.lunch_start) : null;
  const lunchEndIso = ed.lunch_end ? fromLocalInput(ed.lunch_end) : null;
  if ((ed.lunch_start && !lunchStartIso) || (ed.lunch_end && !lunchEndIso)) { ed.error = 'Enter valid lunch times.'; return render(); }
  if (lunchEndIso && !lunchStartIso) { ed.error = 'Add the lunch start time.'; return render(); }
  if (lunchStartIso && lunchEndIso && new Date(lunchEndIso) <= new Date(lunchStartIso)) { ed.error = 'Lunch must end after it starts.'; return render(); }
  if (lunchStartIso && new Date(lunchStartIso) < new Date(clockInIso)) { ed.error = 'Lunch cannot start before the shift.'; return render(); }
  if (clockOutIso && lunchStartIso && !lunchEndIso) { ed.error = 'Add the lunch end time, or clear the lunch.'; return render(); }
  if (clockOutIso && lunchEndIso && new Date(lunchEndIso) > new Date(clockOutIso)) { ed.error = 'Lunch must end before the shift does.'; return render(); }
  ed.busy = true;
  ed.error = '';
  render();
  const row = { clock_in: clockInIso, clock_out: clockOutIso, lunch_start: lunchStartIso, lunch_end: lunchEndIso, note: ed.note.trim() || null, edited_by: state.session.user.id, edited_at: new Date().toISOString() };
  const { error } = ed.id
    ? await sb.from('timesheets').update(row).eq('id', ed.id)
    : await sb.from('timesheets').insert({ ...row, technician_id: ed.technician_id });
  ed.busy = false;
  if (error) {
    ed.error = error.code === '23505' ? 'This person already has an open entry. Close it first.'
      : error.code === '23514' ? 'Those times do not fit together. Check the shift and the lunch.'
      : "Couldn't save the entry. Try again.";
    return render();
  }
  state.sheet = false;
  state.timeEdit = null;
  await loadTeam();
}

async function changePassword(form) {
  const password = form.password.value;
  const confirm = form.confirm.value;
  if (password.length < MIN_PASSWORD) {
    state.pwError = `Use at least ${MIN_PASSWORD} characters.`;
    return render();
  }
  if (password !== confirm) {
    state.pwError = "The two passwords don't match.";
    return render();
  }
  state.pwBusy = true;
  state.pwError = '';
  render();
  const { error } = await sb.auth.updateUser({ password });
  state.pwBusy = false;
  if (!error) {
    state.pwDone = true;
  } else if (/same/i.test(error.message)) {
    state.pwError = "Choose a password you haven't used before.";
  } else if (/reauth|recent|weak|short|least/i.test(error.message)) {
    state.pwError = 'That password was not accepted. Try a longer one, or sign out and sign in again first.';
  } else {
    state.pwError = "Couldn't update your password. Try again.";
  }
  render();
}

app.addEventListener('submit', (e) => {
  if (e.target.id === 'login') {
    e.preventDefault();
    signIn(e.target);
  } else if (e.target.id === 'pw') {
    e.preventDefault();
    changePassword(e.target);
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    state.query = e.target.value;
    document.getElementById('job-list').innerHTML = jobList();
    return;
  }
  const editField = e.target.dataset?.edit;
  if (editField && state.timeEdit) {
    state.timeEdit[editField] = e.target.value;
    return;
  }
  if (e.target.id === 'pq') {
    state.partQuery = e.target.value;
    document.getElementById('part-list').innerHTML = partList();
    return;
  }
  if (e.target.id === 'paste-text') {
    state.paste.text = e.target.value;
    return;
  }
  const field = e.target.dataset?.field;
  if (field && state.draft && !LOCKED.includes(state.draft.status)) {
    state.draft[field] = e.target.value;
    markDirty();
  }
});

function markDirty() {
  const d = state.draft;
  d.dirty = true;
  d.updated_at = Date.now();
  putDraft(d);
  state.hasDraft[d.job_id] = true;
  state.saveStatus = navigator.onLine ? 'local' : 'offline';
  updateSaveLabel();
  scheduleSync();
}

function goStep(delta) {
  state.pasteNote = '';
  state.step = Math.min(STEPS.length - 1, Math.max(0, state.step + delta));
  render();
  window.scrollTo(0, 0);
}

app.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    render();
    if (state.tab === 'clock') loadMine();
    if (state.tab === 'timesheets') loadTeam();
    if (state.tab === 'reports' && isAdmin()) loadAdminReports();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.classList.contains('scrim') && e.target.closest('[data-stop]')) return;
  switch (el.dataset.action) {
    case 'toggle-part':
      state.openPart = state.openPart === el.dataset.sku ? null : el.dataset.sku;
      document.getElementById('part-list').innerHTML = partList();
      break;
    case 'copy':
      navigator.clipboard?.writeText(el.dataset.copy).then(() => {
        const label = el.textContent;
        el.textContent = 'Copied';
        setTimeout(() => { el.textContent = label; }, 1200);
      }).catch(() => {});
      break;
    case 'open-paste': state.paste = { open: true, text: '', result: null, error: '' }; render(); break;
    case 'close-paste': state.paste = { open: false, text: '', result: null, error: '' }; render(); break;
    case 'edit-paste': state.paste.result = null; render(); break;
    case 'detect-paste':
      if (!state.paste.text.trim()) {
        state.paste.error = 'Paste the report text first.';
      } else {
        state.paste.error = '';
        state.paste.result = parseReport(state.paste.text, { today: new Date(), order: 'mdy' });
      }
      render();
      break;
    case 'apply-paste': applyPaste(el.dataset.mode); break;
    case 'toggle-pass': {
      const input = app.querySelector('input[name="password"]');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.textContent = show ? 'Hide' : 'Show';
      el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      break;
    }
    case 'set-overtime':
      if (state.draft && !LOCKED.includes(state.draft.status)) {
        state.draft.overtime = el.dataset.value === 'yes';
        markDirty();
        render();
      }
      break;
    case 'step-next': goStep(1); break;
    case 'step-back':
      if (state.step === 0) location.hash = `#/job/${route().id}`;
      else goStep(-1);
      break;
    case 'finish':
      await syncNow();
      location.hash = `#/job/${route().id}`;
      break;
    case 'clock-in': clockCall('clock_in_now'); break;
    case 'lunch-start': clockCall('lunch_start_now'); break;
    case 'lunch-end': clockCall('lunch_end_now'); break;
    case 'report-filter': state.review.filter = el.dataset.value; render(); break;
    case 'ask-submit': {
      const missing = missingForSubmit(state.draft);
      if (missing.length) {
        state.submit.error = `Before you send, add: ${missing.map((x) => x[0]).join(', ')}.`;
        state.step = Math.min(...missing.map((x) => x[1]));
        state.sheet = false;
      } else {
        state.submit.error = '';
        state.sheet = 'submit';
      }
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'confirm-submit': submitReport(); break;
    case 'ask-clock-out': state.sheet = 'clockout'; render(); break;
    case 'confirm-clock-out': clockOut(); break;
    case 'week-prev':
    case 'week-next':
      state.team.week = addDays(state.team.week, el.dataset.action === 'week-prev' ? -7 : 7);
      state.team.expanded = null;
      loadTeam();
      break;
    case 'week-today':
      state.team.week = weekStart(vancouverDate());
      state.team.expanded = null;
      loadTeam();
      break;
    case 'toggle-person':
      state.team.expanded = state.team.expanded === el.dataset.id ? null : el.dataset.id;
      render();
      break;
    case 'edit-entry': {
      const entry = state.team.entries.find((x) => x.id === el.dataset.id);
      if (entry) startEdit(entry, entry.technician_id);
      break;
    }
    case 'add-entry': startEdit(null, el.dataset.tech); break;
    case 'save-entry': saveEntry(); break;
    case 'open-sheet': state.sheet = 'account'; render(); break;
    case 'change-password':
      state.sheet = 'password';
      state.pwError = '';
      state.pwDone = false;
      render();
      break;
    case 'close-sheet': state.sheet = false; render(); break;
    case 'sign-out':
      state.sheet = false;
      await sb.auth.signOut();
      break;
  }
});

sb.auth.onAuthStateChange((event, session) => {
  state.session = session;
  if (!session) {
    state.profile = null;
    state.jobs = null;
    state.partsCount = null;
    state.tab = 'jobs';
    state.query = '';
    state.draft = null;
    state.clock = newClockState();
    state.team = newTeamState();
    state.review = newReviewState();
    state.flash = null;
    state.submit = { busy: false, error: '' };
    state.timeEdit = null;
    state.sheet = false;
    return render();
  }
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    render();
    setTimeout(loadHome, 0);
  }
});

app.addEventListener('error', (e) => {
  if (e.target.classList?.contains('part-img')) e.target.closest('.part-pic')?.classList.add('no-pic');
}, true);

window.addEventListener('hashchange', () => {
  const r = route();
  if (state.flash && !(r.view === 'job' && r.id === state.flash.job)) state.flash = null;
  syncNow();
  render();
  window.scrollTo(0, 0);
  enterRoute();
});
window.addEventListener('online', flushAll);
// Keep the clock numbers live without redrawing the whole screen.
setInterval(() => {
  const root = document.getElementById('clock-root');
  if (root && state.tab === 'clock' && !state.sheet) root.innerHTML = clockBody(state.clock);
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') syncNow();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
