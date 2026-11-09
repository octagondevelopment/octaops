// Admin views of the technicians' reports. Read-only: the office reads, it does not write.
import { esc } from './util.js';
import { formatClock } from './timesheet.js';

const ICON_BACK = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

export const newReviewState = () => ({ loaded: false, error: '', rows: [], people: [], filter: 'all' });

export const REPORT_STATUS = {
  draft: { label: 'Draft', chip: 'pending' },
  submitted: { label: 'To review', chip: 'awaiting_approval' },
  approved: { label: 'Approved', chip: 'invoiced' },
  rejected: { label: 'Rejected', chip: 'urgent' },
};

const statusChip = (s) => {
  const x = REPORT_STATUS[s] || REPORT_STATUS.draft;
  return `<span class="chip chip-${x.chip}">${x.label}</span>`;
};

const dateText = (d) => {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' }) : '');
const hoursOnSite = (r) => {
  if (!r.time_in || !r.time_out) return '';
  const min = Math.round((new Date(r.time_out) - new Date(r.time_in)) / 60000);
  return min > 0 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}` : '';
};
const storeName = (job) => job?.store_name || (job?.store_number ? `Store ${job.store_number}` : 'Unknown job');

const FILTERS = [['all', 'All'], ['submitted', 'To review'], ['draft', 'Drafts']];

export function adminReportsTab(rv, jobsById) {
  if (!rv.loaded) return rv.error ? `<p class="error" role="alert">${esc(rv.error)}</p>` : '<div class="empty"><p>Loading reports…</p></div>';
  const shown = rv.rows.filter((r) => rv.filter === 'all' || r.status === rv.filter);
  const seg = `<div class="seg three" role="group" aria-label="Filter reports">${FILTERS.map(([id, label]) => `<button type="button" class="seg-btn${rv.filter === id ? ' on' : ''}" data-action="report-filter" data-value="${id}">${label}</button>`).join('')}</div>`;
  const byTech = new Map();
  for (const r of shown) {
    if (!byTech.has(r.technician_id)) byTech.set(r.technician_id, []);
    byTech.get(r.technician_id).push(r);
  }
  const groups = [...byTech.entries()].map(([id, list]) => {
    const person = rv.people.find((p) => p.id === id);
    list.sort((a, b) => String(b.submitted_at || b.visit_date || '').localeCompare(String(a.submitted_at || a.visit_date || '')));
    const cards = list.map((r) => {
      const job = jobsById[r.job_id];
      const hrs = hoursOnSite(r);
      return `<a class="card card-link report-row" href="#/review/${esc(r.id)}">
        <div class="job-head"><h3 class="job-store">${esc(storeName(job))}</h3>${statusChip(r.status)}</div>
        <p class="job-meta"><b>#${esc(job?.work_task_number || '')}</b>${r.visit_date ? ` · ${esc(dateText(r.visit_date))}` : ''}${hrs ? ` · ${esc(hrs)} on site` : ''}</p>
        ${r.resolution ? `<p class="preview">${esc(String(r.resolution).slice(0, 110))}${String(r.resolution).length > 110 ? '…' : ''}</p>` : ''}
      </a>`;
    }).join('');
    return `<section class="group"><p class="eyebrow section-title">${esc(person?.full_name || 'Unknown technician')} · ${list.length}</p><div class="stack">${cards}</div></section>`;
  }).join('');
  return `${seg}${groups || '<div class="empty"><h2>No reports here</h2><p>Reports appear as technicians write them.</p></div>'}`;
}

const kvRow = (label, value, key) => (value === null || value === undefined || value === ''
  ? '' : `<div class="kv${key ? ' key' : ''}"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`);
const block = (label, text) => (text ? `<div class="block"><span class="k">${esc(label)}</span><p>${esc(text)}</p></div>` : '');
const section = (title, body) => (body.trim() ? `<section class="card section"><h3>${esc(title)}</h3>${body}</section>` : '');

// Full report in the order of the team's WhatsApp template.
export function reviewScreen(report, job, person, rv) {
  const back = `<a class="back" href="#/">${ICON_BACK}<span>Reports</span></a>`;
  if (!rv.loaded) return `<main class="screen"><div class="screen-body">${back}<div class="empty"><p>Loading report…</p></div></div></main>`;
  if (!report) return `<main class="screen"><div class="screen-body">${back}<div class="empty"><h2>Report not found</h2><p>It may have been removed.</p></div></div></main>`;
  const lastClean = report.last_cleaning_at ? stamp(report.last_cleaning_at) : '';
  return `<main class="screen">
    <div class="screen-body">
      ${back}
      <header class="detail-head">
        <div class="job-head"><h1 class="detail-title">${esc(storeName(job))}</h1>${statusChip(report.status)}</div>
        <p class="job-meta"><b>#${esc(job?.work_task_number || '')}</b> · by ${esc(person?.full_name || 'Unknown technician')}${report.submitted_at ? ` · sent ${esc(stamp(report.submitted_at))}` : ''}</p>
      </header>
      <div class="stack">
        ${section('Job', kvRow('WT', job?.work_task_number, true) + kvRow('Store #', job?.store_number, true) + kvRow('Address', job?.address) + kvRow('Issue', job?.issue || job?.request_class) + kvRow('Dispatched', dateText(job?.dispatched_at)))}
        ${section('Visit', kvRow('Date', dateText(report.visit_date)) + kvRow('Time in', report.time_in ? formatClock(report.time_in) : '', true) + kvRow('Time out', report.time_out ? formatClock(report.time_out) : '', true) + kvRow('On site', hoursOnSite(report), true) + kvRow('Overtime', report.overtime ? 'Yes' : 'No'))}
        ${section('Work done', block('Issue found', report.issue_found) + block('Resolution Summary', report.resolution) + block('Recommendations', report.recommendations) + block('Parts', report.parts_text))}
        ${section('Machine', kvRow('Machine', report.machine) + kvRow('Installation date', dateText(report.installation_date)) + kvRow('Shot C', report.shot_count, true) + kvRow('Cleaning C', report.cleaning_count, true) + kvRow('Bar', report.pressure_bar, true) + kvRow('Last cleaning', lastClean) + kvRow('Cancelled shots last 24 hours', report.cancelled_shots_24h, true))}
        ${section('Notes', block('Notes', report.notes))}
      </div>
    </div>
  </main>`;
}
