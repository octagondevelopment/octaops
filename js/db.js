// Local draft store. Every change is written here first so nothing is lost if the
// app closes, the phone sleeps or the signal drops.
const DB_NAME = 'octaops';
const STORE = 'drafts';

let dbPromise;
const memory = new Map();

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'job_id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, run) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function getDraft(jobId) {
  try {
    return (await tx('readonly', (s) => s.get(jobId))) ?? null;
  } catch {
    return memory.get(jobId) ?? null;
  }
}

export async function putDraft(draft) {
  memory.set(draft.job_id, draft);
  try {
    await tx('readwrite', (s) => s.put(draft));
    return true;
  } catch {
    return false;
  }
}

export async function dirtyDrafts() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return all.filter((d) => d.dirty);
  } catch {
    return [...memory.values()].filter((d) => d.dirty);
  }
}
