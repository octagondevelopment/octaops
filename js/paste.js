// Reads a report pasted from WhatsApp, in the layout the team uses today, and turns
// it into report-form fields. Pure functions: nothing here touches the page.

const LABELS = [
  ['wt', /^(wt|work task( id| number| no| #)?|wo)$/],
  ['store', /^store( #| no| number| num)?$/],
  ['address', /^address$/],
  ['issue', /^issue$/],
  ['dispatched', /^dispatch(ed)?$/],
  ['date', /^date$/],
  ['time_in', /^time ?in$/],
  ['time_out', /^time ?out$/],
  ['overtime', /^(overtime|ot)$/],
  ['resolution', /^resolution$/],
  ['parts', /^parts?( used)?$/],
  ['machine', /^machine$/],
  ['shot_count', /^shots? ?c(ount)?$/],
  ['cleaning_count', /^cleanings? ?c(ount)?$/],
  ['installation_date', /^install(ation)? date$/],
  ['pressure_bar', /^bar$/],
  ['last_cleaning', /^last cleaning$/],
  ['time', /^time$/],
  ['cancelled', /^cancel+ed shots( last 24 ?(hours?|hrs?|h))?$/],
  ['notes', /^notes?$/],
];

const MULTILINE = new Set(['address', 'dispatch_issue', 'issue_found', 'resolution', 'parts', 'notes']);

export const DISPLAY = {
  visit_date: 'Date',
  time_in: 'Time in',
  time_out: 'Time out',
  overtime: 'Overtime',
  issue_found: 'Issue found',
  resolution: 'Resolution',
  parts_text: 'Parts',
  machine: 'Machine',
  installation_date: 'Installation date',
  shot_count: 'Shot C',
  cleaning_count: 'Cleaning C',
  pressure_bar: 'Bar',
  last_cleaning_date: 'Last cleaning, date',
  last_cleaning_time: 'Last cleaning, time',
  cancelled_shots_24h: 'Cancelled shots last 24 hours',
  notes: 'Notes',
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
const labelKey = (text) => LABELS.find(([, re]) => re.test(norm(text)))?.[0] ?? null;
const pad = (n) => String(n).padStart(2, '0');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(text, { order = 'mdy', today = new Date() } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const value = isoDate(+m[1], +m[2], +m[3]);
    return value ? { value, ambiguous: false } : null;
  }
  m = s.match(/(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let y = m[3] ? +m[3] : today.getFullYear();
    if (y < 100) y += 2000;
    let month;
    let day;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else if (order === 'dmy') { day = a; month = b; }
    else { month = a; day = b; }
    const value = isoDate(y, month, day);
    return value ? { value, ambiguous: a <= 12 && b <= 12 && a !== b } : null;
  }
  const names = MONTHS.join('|');
  m = s.toLowerCase().match(new RegExp(`\\b(${names})[a-z]*\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`));
  if (m) {
    const value = isoDate(m[3] ? +m[3] : today.getFullYear(), MONTHS.indexOf(m[1]) + 1, +m[2]);
    return value ? { value, ambiguous: false } : null;
  }
  m = s.toLowerCase().match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${names})[a-z]*\\.?(?:,?\\s*(\\d{4}))?`));
  if (m) {
    const value = isoDate(m[3] ? +m[3] : today.getFullYear(), MONTHS.indexOf(m[2]) + 1, +m[1]);
    return value ? { value, ambiguous: false } : null;
  }
  return null;
}

export function parseTime(text) {
  const s = String(text ?? '').trim().toLowerCase();
  let h;
  let min;
  let ap;
  let m = s.match(/(\d{1,2})\s*[:.h]\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/);
  if (m) { h = +m[1]; min = +m[2]; ap = m[3]; }
  else if ((m = s.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/))) { h = +m[1]; min = 0; ap = m[2]; }
  else if ((m = s.match(/\b(\d{2})(\d{2})\b/))) { h = +m[1]; min = +m[2]; }
  else return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap[0] === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function parseNumber(text) {
  const m = String(text ?? '').replace(/(\d)[, ](?=\d{3}\b)/g, '$1').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const parseCount = (text) => {
  const n = parseNumber(text);
  return n === null || n < 0 ? null : String(Math.round(n));
};

function parseOvertime(text) {
  const s = norm(String(text ?? ''));
  if (!s) return false;
  if (/^(yes|y|si|true|1|ot)\b/.test(s)) return true;
  if (/^(no|n|false|0|none)\b/.test(s)) return false;
  return null;
}

function splitLine(line) {
  for (const sep of [/[:：]/, /[—–]/, /\s-{1,2}\s|\s*=\s*/]) {
    const m = sep.exec(line);
    if (!m) continue;
    const key = labelKey(line.slice(0, m.index));
    if (key) return { key, value: line.slice(m.index + m[0].length) };
  }
  const bare = line.match(/^\s*(store\s*#?|address)\s+(.+)$/i);
  if (bare) return { key: labelKey(bare[1].replace('#', ' #')) ?? labelKey(bare[1]), value: bare[2] };
  const alone = labelKey(line);
  return alone ? { key: alone, value: '' } : null;
}

const WA_PREFIX = /^\s*\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+[\d:. ]+(?:a\.?m\.?|p\.?m\.?)?\]?\s*-?\s*[^:\n]{1,40}:\s*/i;

export function parseReport(text, options = {}) {
  const raw = {};
  const unmatched = [];
  const seen = new Set();
  let current = null;
  const lines = String(text ?? '').replace(/\r/g, '').replace(/[‎‏]/g, '').split('\n');
  if (lines.length) lines[0] = lines[0].replace(WA_PREFIX, '');

  const put = (key, value) => {
    if (raw[key] === undefined) raw[key] = value;
    else if (!MULTILINE.has(key)) unmatched.push(`${key}: ${value}`.trim());
  };

  for (const line of lines) {
    if (/^[\s—–\-_=*]{4,}$/.test(line)) { current = null; continue; }
    const hit = line.trim() ? splitLine(line) : null;
    if (hit && !(current && current !== 'address' && /^(store|address)$/.test(hit.key) && !/[:：—–]/.test(line))) {
      let key = hit.key;
      const value = hit.value.trim();
      if (key === 'issue') {
        key = seen.has('time_in') || seen.has('time_out') || seen.has('overtime') ? 'issue_found' : 'dispatch_issue';
      } else if (key === 'date') {
        key = seen.has('last_cleaning') ? 'last_cleaning_date' : 'date';
      } else if (key === 'time') {
        key = seen.has('last_cleaning') ? 'last_cleaning_time' : null;
        if (!key) { unmatched.push(line.trim()); current = null; continue; }
      }
      seen.add(key);
      put(key, value);
      current = MULTILINE.has(key) ? key : null;
    } else if (!line.trim()) {
      if (current && raw[current]) raw[current] += '\n';
    } else if (current) {
      raw[current] = `${raw[current]}${raw[current] && !raw[current].endsWith('\n') ? '\n' : ''}${line.trim()}`;
    } else {
      unmatched.push(line.trim());
    }
  }
  for (const k of Object.keys(raw)) raw[k] = String(raw[k]).trim();

  const fields = {};
  const problems = [];
  const warnings = [];
  const bad = (field, rawValue) => problems.push({ field, label: DISPLAY[field], raw: rawValue });

  const date = (rawKey, field) => {
    if (!raw[rawKey]) return;
    const d = parseDate(raw[rawKey], options);
    if (!d) return bad(field, raw[rawKey]);
    fields[field] = d.value;
    if (d.ambiguous) warnings.push(`${DISPLAY[field]} "${raw[rawKey]}" could be month/day or day/month. Check it.`);
  };
  const time = (rawKey, field) => {
    if (!raw[rawKey]) return;
    const t = parseTime(raw[rawKey]);
    if (t) fields[field] = t; else bad(field, raw[rawKey]);
  };
  const count = (rawKey, field) => {
    if (!raw[rawKey]) return;
    const n = parseCount(raw[rawKey]);
    if (n === null) bad(field, raw[rawKey]); else fields[field] = n;
  };

  date('date', 'visit_date');
  time('time_in', 'time_in');
  time('time_out', 'time_out');
  if (raw.overtime !== undefined) {
    const ot = parseOvertime(raw.overtime);
    if (ot === null) bad('overtime', raw.overtime); else fields.overtime = ot;
  }
  if (raw.issue_found) fields.issue_found = raw.issue_found;
  if (raw.resolution) fields.resolution = raw.resolution;
  if (raw.parts) fields.parts_text = raw.parts;
  if (raw.machine) fields.machine = raw.machine;
  date('installation_date', 'installation_date');
  count('shot_count', 'shot_count');
  count('cleaning_count', 'cleaning_count');
  if (raw.pressure_bar) {
    const n = parseNumber(raw.pressure_bar);
    if (n === null || n < 0 || n > 999.9) bad('pressure_bar', raw.pressure_bar);
    else fields.pressure_bar = String(Math.round(n * 10) / 10);
  }
  if (raw.last_cleaning) {
    const d = parseDate(raw.last_cleaning, options);
    const t = parseTime(raw.last_cleaning.replace(/\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?/, ' '));
    if (d) fields.last_cleaning_date = d.value;
    if (t) fields.last_cleaning_time = t;
  }
  date('last_cleaning_date', 'last_cleaning_date');
  time('last_cleaning_time', 'last_cleaning_time');
  count('cancelled', 'cancelled_shots_24h');
  if (raw.notes) fields.notes = raw.notes;

  return {
    fields,
    problems,
    warnings,
    unmatched,
    info: { wt: raw.wt ?? '', store: raw.store ?? '', address: raw.address ?? '', issue: raw.dispatch_issue ?? '', dispatched: raw.dispatched ?? '' },
  };
}

// Compares the identity lines of the pasted text with the open job.
export function checkJob(info, job) {
  const digits = (s) => String(s ?? '').replace(/\D/g, '');
  const out = [];
  const wt = digits(info.wt);
  if (wt && digits(job.work_task_number) && wt !== digits(job.work_task_number)) {
    out.push(`This text is for WT ${info.wt}, but this job is WT ${job.work_task_number}.`);
  }
  const store = digits(info.store);
  if (store && digits(job.store_number) && store !== digits(job.store_number)) {
    out.push(`This text is for store ${info.store}, but this job is store ${job.store_number}.`);
  }
  return out;
}

export function matchedRows(fields) {
  return Object.keys(DISPLAY).filter((k) => fields[k] !== undefined && fields[k] !== '').map((k) => ({
    field: k,
    label: DISPLAY[k],
    value: k === 'overtime' ? (fields[k] ? 'Yes' : 'No') : String(fields[k]),
  }));
}
