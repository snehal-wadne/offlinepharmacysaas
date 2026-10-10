/**
 * Read-through cache for GET responses (reports, roles, staff, taxes ...).
 *
 * Entries are namespaced by organisation id so one tenant's data is never served to
 * another user of the same device, and the whole cache is wiped on sign-out.
 * Uses IndexedDB on web; falls back to memory where IndexedDB is unavailable.
 */

const DB_NAME = "pharmaflow_api_cache";
const STORE = "responses";
const memory = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function currentOrg() {
  try {
    return window.localStorage?.getItem("organisationId") || "anon";
  } catch (e) {
    return "anon";
  }
}

const keyFor = (endpoint) => `${currentOrg()}|${endpoint}`;

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function cacheResponse(endpoint, data) {
  const key = keyFor(endpoint);
  const value = { data, savedAt: Date.now() };
  memory.set(key, value);
  try {
    await withStore("readwrite", (s) => s.put(value, key));
  } catch (e) {}
}

export async function readCachedResponse(endpoint) {
  const key = keyFor(endpoint);
  try {
    const hit = await withStore("readonly", (s) => s.get(key));
    if (hit) return hit;
  } catch (e) {}
  return memory.get(key) || null;
}

export async function clearApiCache() {
  memory.clear();
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch (e) {}
}
