// Report form: draft shape, conversion to and from the database row, and the step views.
export const STEPS = [
  { id: 'visit', title: 'Visit' },
  { id: 'work', title: 'Work done' },
  { id: 'machine', title: 'Machine' },
  { id: 'notes', title: 'Notes' },
];

export const REPORT_COLUMNS = 'id, job_id, status, visit_date, time_in, time_out, overtime, issue_found, resolution, parts_text, machine, installation_date, shot_count, cleaning_count, pressure_bar, last_cleaning_at, cancelled_shots_24h, notes';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emptyDraft(job) {
  return {
    job_id: job.id,
    status: 'draft',
    visit_date: localDate(new Date()),
    time_in: '',
    time_out: '',
    overtime: false,
    issue_found: '',
    resolution: '',
    parts_text: '',
    machine: job.asset_name || '',
    installation_date: job.asset_install_date || '',
    shot_count: '',
    cleaning_count: '',
    pressure_bar: '',
    last_cleaning_date: '',
    last_cleaning_time: '',
    cancelled_shots_24h: '',
    notes: '',
    updated_at: Date.now(),
    dirty: false,
  };
}

export function rowToDraft(row, job) {
  const base = emptyDraft(job);
  const tin = row.time_in ? new Date(row.time_in) : null;
  const tout = row.time_out ? new Date(row.time_out) : null;
  const lc = row.last_cleaning_at ? new Date(row.last_cleaning_at) : null;
  return {
    ...base,
    status: row.status,
    visit_date: row.visit_date || (tin ? localDate(tin) : base.visit_date),
    time_in: tin ? localTime(tin) : '',
    time_out: tout ? localTime(tout) : '',
    overtime: !!row.overtime,
    issue_found: row.issue_found ?? '',
    resolution: row.resolution ?? '',
    parts_text: row.parts_text ?? '',
    machine: row.machine ?? base.machine,
    installation_date: row.installation_date ?? base.installation_date,
    shot_count: row.shot_count ?? '',
    cleaning_count: row.cleaning_count ?? '',
    pressure_bar: row.pressure_bar ?? '',
    last_cleaning_date: lc ? localDate(lc) : '',
    last_cleaning_time: lc ? localTime(lc) : '',
    cancelled_shots_24h: row.cancelled_shots_24h ?? '',
    notes: row.notes ?? '',
    updated_at: Date.now(),
    dirty: false,
  };
}

const orNull = (v) => (v === '' || v == null ? null : v);
const count = (v) => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
};

function timestamp(date, time, afterIso) {
  if (!date || !time) return null;
  let d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  if (afterIso && d < new Date(afterIso)) d = new Date(d.getTime() + 86400000);
  return d.toISOString();
}

export function draftToRow(d, technicianId) {
  const bar = Number(d.pressure_bar);
  const timeIn = timestamp(d.visit_date, d.time_in);
  return {
    job_id: d.job_id,
    technician_id: technicianId,
    status: 'draft',
    visit_date: orNull(d.visit_date),
    time_in: timeIn,
    time_out: timestamp(d.visit_date, d.time_out, timeIn),
    overtime: !!d.overtime,
    issue_found: orNull(d.issue_found),
    resolution: orNull(d.resolution),
    parts_text: orNull(d.parts_text),
    machine: orNull(d.machine),
    installation_date: orNull(d.installation_date),
    shot_count: count(d.shot_count),
    cleaning_count: count(d.cleaning_count),
    pressure_bar: d.pressure_bar === '' || !Number.isFinite(bar) || bar < 0 || bar > 999.9 ? null : Math.round(bar * 10) / 10,
    last_cleaning_at: timestamp(d.last_cleaning_date, d.last_cleaning_time),
    cancelled_shots_24h: count(d.cancelled_shots_24h),
    notes: orNull(d.notes),
  };
}

export const SAVE_TEXT = {
  local: 'Saved on this phone',
  synced: 'Saved',
  offline: 'Offline · saved on this phone',
  error: "Couldn't sync · saved on this phone",
};

export function progressHtml(index) {
  const bars = STEPS.map((_, i) => `<span class="step-bar${i <= index ? ' on' : ''}"></span>`).join('');
  return `<div class="steps" aria-hidden="true">${bars}</div>
    <p class="step-label">Step ${index + 1} of ${STEPS.length}</p>`;
}

function field(label, name, d, locked, attrs = '') {
  return `<label class="field"><span>${esc(label)}</span><input class="input" name="${name}" data-field="${name}" value="${esc(d[name])}" ${attrs} ${locked ? 'disabled' : ''}></label>`;
}

function area(label, name, d, locked, rows = 5, hint = '') {
  return `<label class="field"><span>${esc(label)}</span><textarea class="input area" name="${name}" data-field="${name}" rows="${rows}" ${locked ? 'disabled' : ''}>${esc(d[name])}</textarea>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
}

export function stepHtml(stepId, d, locked) {
  if (stepId === 'visit') {
    const paste = locked ? '' : `<div class="paste-card">
        <div><b>Already wrote it in WhatsApp?</b><span>Paste the text and we fill the form for you.</span></div>
        <button type="button" class="btn-pill" data-action="open-paste">Paste from WhatsApp</button>
      </div>`;
    return `<h2 class="step-title">Visit</h2>
      ${paste}
      ${field('Date', 'visit_date', d, locked, 'type="date"')}
      <div class="two">
        ${field('Time in', 'time_in', d, locked, 'type="time"')}
        ${field('Time out', 'time_out', d, locked, 'type="time"')}
      </div>
      <div class="field"><span>Overtime</span>
        <div class="seg" role="group" aria-label="Overtime">
          <button type="button" class="seg-btn${d.overtime ? '' : ' on'}" data-action="set-overtime" data-value="no" ${locked ? 'disabled' : ''}>No</button>
          <button type="button" class="seg-btn${d.overtime ? ' on' : ''}" data-action="set-overtime" data-value="yes" ${locked ? 'disabled' : ''}>Yes</button>
        </div></div>`;
  }
  if (stepId === 'work') {
    return `<h2 class="step-title">Work done</h2>
      ${area('Issue found', 'issue_found', d, locked, 4, 'What you found when you arrived.')}
      ${area('Resolution', 'resolution', d, locked, 7, 'What you did to fix it. No length limit.')}
      ${area('Parts used', 'parts_text', d, locked, 3, 'Part numbers and quantities, as you write them today.')}`;
  }
  if (stepId === 'machine') {
    return `<h2 class="step-title">Machine</h2>
      ${field('Machine', 'machine', d, locked, 'type="text" autocomplete="off"')}
      ${field('Installation date', 'installation_date', d, locked, 'type="date"')}
      <div class="two">
        ${field('Shot C', 'shot_count', d, locked, 'type="number" inputmode="numeric" min="0" step="1"')}
        ${field('Cleaning C', 'cleaning_count', d, locked, 'type="number" inputmode="numeric" min="0" step="1"')}
      </div>
      ${field('Bar', 'pressure_bar', d, locked, 'type="number" inputmode="decimal" min="0" step="0.1"')}
      <div class="two">
        ${field('Last cleaning, date', 'last_cleaning_date', d, locked, 'type="date"')}
        ${field('Last cleaning, time', 'last_cleaning_time', d, locked, 'type="time"')}
      </div>
      ${field('Cancelled shots last 24 hours', 'cancelled_shots_24h', d, locked, 'type="number" inputmode="numeric" min="0" step="1"')}`;
  }
  return `<h2 class="step-title">Notes</h2>
    ${area('Notes', 'notes', d, locked, 8, 'Anything the next technician or the office should know.')}`;
}
