// Offline storage: the outbox of answers not sent yet and the snapshots of the practice set, in IndexedDB
// (database dutch-offline). Where IndexedDB does not exist (Node tests, blocked storage) an in-memory store takes over.

const DATABASE_NAME = 'dutch-offline';
const DATABASE_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const SNAPSHOT_STORE = 'snapshot';

// Statuses whose answer will never be accepted: the entry is dropped instead of blocking the ones behind it.
const DROPPED_STATUSES = [400, 404, 409, 422];

// A store that keeps everything in memory. Same methods as the IndexedDB store.
export function createMemoryStore() {
  let entries = [];
  let nextSeq = 1;
  const snapshots = new Map();
  return {
    kind: 'memory',
    async enqueue(entry) {
      const stored = { ...entry, seq: nextSeq };
      nextSeq += 1;
      entries.push(stored);
      return stored.seq;
    },
    async listAll() { return entries.map(entry => ({ ...entry })); },
    async remove(seq) { entries = entries.filter(entry => entry.seq !== seq); },
    async count() { return entries.length; },
    async clear() { entries = []; },
    async saveSnapshot(key, value) { snapshots.set(key, value); },
    async loadSnapshot(key) { return snapshots.has(key) ? snapshots.get(key) : null; },
    async deleteSnapshot(key) { snapshots.delete(key); },
    async clearSnapshots() { snapshots.clear(); },
  };
}

// Turns an IndexedDB request into a promise.
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one operation in a transaction and resolves when the transaction is complete.
function runTransaction(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    const request = operation(transaction.objectStore(storeName));
    if (request) request.onsuccess = () => { result = request.result; };
  });
}

// A store on top of an opened IndexedDB database.
function createIndexedDbStore(database) {
  return {
    kind: 'indexeddb',
    enqueue: entry => runTransaction(database, OUTBOX_STORE, 'readwrite', store => store.add({ ...entry })),
    async listAll() {
      const entries = await runTransaction(database, OUTBOX_STORE, 'readonly', store => store.getAll());
      return entries.sort((a, b) => a.seq - b.seq);
    },
    remove: seq => runTransaction(database, OUTBOX_STORE, 'readwrite', store => store.delete(seq)),
    count: () => runTransaction(database, OUTBOX_STORE, 'readonly', store => store.count()),
    clear: () => runTransaction(database, OUTBOX_STORE, 'readwrite', store => store.clear()),
    saveSnapshot: (key, value) => runTransaction(database, SNAPSHOT_STORE, 'readwrite', store => store.put({ key, value })),
    async loadSnapshot(key) {
      const record = await runTransaction(database, SNAPSHOT_STORE, 'readonly', store => store.get(key));
      return record ? record.value : null;
    },
    deleteSnapshot: key => runTransaction(database, SNAPSHOT_STORE, 'readwrite', store => store.delete(key)),
    clearSnapshots: () => runTransaction(database, SNAPSHOT_STORE, 'readwrite', store => store.clear()),
  };
}

// Opens the database (creating its two stores the first time).
function openDatabase() {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    database.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
  };
  return promisifyRequest(request);
}

let storePromise = null;

// The shared store: IndexedDB when it exists and opens, otherwise memory. Resolved once.
export function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      if (typeof indexedDB === 'undefined') return createMemoryStore();
      try {
        return createIndexedDbStore(await openDatabase());
      } catch {
        return createMemoryStore();
      }
    })();
  }
  return storePromise;
}

// The shared store as an object whose methods wait for getStore(), so callers need no await to get it.
const STORE_METHODS = ['enqueue', 'listAll', 'remove', 'count', 'clear', 'saveSnapshot', 'loadSnapshot', 'deleteSnapshot',
  'clearSnapshots'];
export const offlineStore = Object.fromEntries(STORE_METHODS.map(method => [
  method,
  async (...args) => (await getStore())[method](...args),
]));

// Flushes run one at a time: a second call while one runs gets the running one's result.
let runningFlush = null;

// Posts the outbox entries one at a time in seq order. post(url, body) resolves on 2xx and throws an Error with status
// otherwise. A 2xx or an answer that will never be accepted (400, 404, 409, 422) removes the entry (the latter counts as
// dropped); 401 stops with needsLogin; any other error (network down, 5xx) stops until the next try.
// onProgress({ sent, dropped, remaining }) is called after each removed entry.
// Returns { sent, dropped, remaining, needsLogin }.
export function flushOutbox({ store, post, onProgress } = {}) {
  if (runningFlush) return runningFlush;
  runningFlush = (async () => {
    const activeStore = store || await getStore();
    const entries = await activeStore.listAll();
    let sent = 0;
    let dropped = 0;
    let remaining = entries.length;
    let needsLogin = false;
    for (const entry of entries) {
      try {
        await post(entry.url, entry.body);
        sent += 1;
      } catch (error) {
        if (error && error.status === 401) {
          needsLogin = true;
          break;
        }
        if (error && DROPPED_STATUSES.includes(error.status)) dropped += 1;
        else break;
      }
      await activeStore.remove(entry.seq);
      remaining -= 1;
      if (onProgress) onProgress({ sent, dropped, remaining });
    }
    return { sent, dropped, remaining, needsLogin };
  })().finally(() => { runningFlush = null; });
  return runningFlush;
}
