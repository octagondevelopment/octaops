import { sb } from './supabase.js';

const app = document.getElementById('app');
const state = {
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
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'In progress',
  awaiting_approval: 'Awaiting approval',
  invoiced: 'Invoiced',
};

const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M184 76h144l108 108v144L328 436H184L76 328V184z" fill="none" stroke="var(--primary)" stroke-width="34" stroke-linejoin="round"/><circle cx="256" cy="256" r="56" fill="var(--primary)"/></svg>`;

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

const TAB_ICONS = {
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>',
  parts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>',
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

function jobCard(job) {
  const store = job.store_name || (job.store_number ? `Store ${job.store_number}` : 'No store');
  const asset = [job.serial_number ? `S/N ${job.serial_number}` : '', job.error_code ? `Error ${job.error_code}` : ''].filter(Boolean).join(' · ');
  return `<article class="card">
    <div class="job-head"><h3 class="job-store">${esc(store)}</h3><span class="chip chip-${esc(job.status)}">${esc(STATUS_LABEL[job.status] || job.status)}</span></div>
    <p class="job-issue">${esc(job.issue || job.request_class || 'No issue described')}</p>
    <p class="job-meta"><b>#${esc(job.work_task_number)}</b>${job.priority ? ` · ${esc(job.priority)}` : ''}${asset ? `<br>${esc(asset)}` : ''}</p>
    ${fuseHtml(job.expires_at)}
  </article>`;
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
  if (state.tab === 'parts') {
    const n = state.partsCount;
    return `<div class="stack"><div class="card stat"><div><div class="num">${n === null ? '…' : esc(n)}</div><div class="lbl">parts in the catalog</div></div></div>
      <div class="empty"><h2>Parts lookup is next</h2><p>Search and mark parts as used from inside a job.</p></div></div>`;
  }
  return '<div class="empty"><h2>Reports are next</h2><p>Your drafts and submitted reports will live here.</p></div>';
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function homeView() {
  const p = state.profile;
  const name = p?.full_name || 'there';
  const first = name.split(' ')[0];
  const tabs = [['jobs', 'Jobs'], ['parts', 'Parts'], ['reports', 'Reports']];
  const heading = { jobs: 'My jobs', parts: 'Parts', reports: 'Reports' }[state.tab];
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
    <nav class="tabbar" aria-label="Main">
      ${tabs.map(([id, label]) => `<button class="tab" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>${TAB_ICONS[id]}<span>${label}</span></button>`).join('')}
    </nav>
    ${state.sheet ? sheetView() : ''}
  </main>`;
}

function sheetView() {
  const p = state.profile;
  return `<div class="scrim" data-action="close-sheet"><div class="sheet" role="dialog" aria-label="Account" data-stop>
    <h2>${esc(p?.full_name || 'Account')}</h2>
    <p class="role">${esc(p?.role || 'No role')} · ${esc(state.session?.user?.email || '')}</p>
    <button class="btn btn-danger" data-action="sign-out">Sign out</button>
    <button class="btn btn-quiet" data-action="close-sheet">Close</button>
  </div></div>`;
}

function render() {
  app.innerHTML = state.session ? homeView() : loginView();
}

async function loadHome() {
  const uid = state.session.user.id;
  const [profile, jobs, parts] = await Promise.all([
    sb.from('profiles').select('full_name, role').eq('id', uid).maybeSingle(),
    sb.from('jobs').select('id, work_task_number, request_number, store_number, store_name, priority, issue, request_class, serial_number, error_code, status, expires_at').order('expires_at', { ascending: true }),
    sb.from('parts').select('sku', { count: 'exact', head: true }),
  ]);
  state.profile = profile.data;
  state.profileMissing = !profile.data;
  state.jobsError = jobs.error ? "Couldn't load your jobs. Check your connection and reopen the app." : '';
  state.jobs = jobs.data || [];
  state.partsCount = parts.count;
  render();
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

app.addEventListener('submit', (e) => {
  if (e.target.id === 'login') {
    e.preventDefault();
    signIn(e.target);
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  document.getElementById('job-list').innerHTML = jobList();
});

app.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    return render();
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'close-sheet' && e.target.closest('[data-stop]') && el.classList.contains('scrim')) return;
  switch (el.dataset.action) {
    case 'toggle-pass': {
      const input = app.querySelector('input[name="password"]');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.textContent = show ? 'Hide' : 'Show';
      el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      break;
    }
    case 'open-sheet': state.sheet = true; render(); break;
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
    return render();
  }
  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    render();
    setTimeout(loadHome, 0);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
