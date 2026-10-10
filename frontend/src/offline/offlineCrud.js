/**
 * Offline-first writes for simple records (branches, staff, suppliers ...).
 *
 *   mutate({...})   Try the server first.
 *                     - success            -> return it (caller mirrors it locally)
 *                     - server refused     -> return the error (never pretend it saved)
 *                     - no network         -> apply the change to the local table, queue it,
 *                                             and return success so the screen shows it
 *   replayCrudQueue()  Sends queued changes once the network is back, swaps temporary local
 *                     records for the server's, and reports anything the server refused.
 *
 * Queue entries use their own status ('PENDING_CRUD') so the main sync engine, which only
 * understands typed mutations, never tries to push them.
 */

import { apiRequest } from "../api/apiClient";
import { db } from "../db/pharmaflowDb";

export const CRUD_PENDING = "PENDING_CRUD";
export const CRUD_FAILED = "FAILED_CRUD";

const isLocalId = (id) => /^(branch-local|usr-local|sup-local|local)-/.test(String(id || ""));

export function newLocalId(prefix) {
  return `${prefix}-local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * @param {object} o
 * @param {string} o.table       Dexie table name
 * @param {string} o.action      'INSERT' | 'UPDATE' | 'DELETE'
 * @param {string} o.method      HTTP method
 * @param {string} o.url         endpoint, e.g. '/api/branches'
 * @param {object} [o.payload]   request body
 * @param {string} o.entityId    local id (for INSERT, the temporary id)
 * @param {object} [o.localRecord]  record to store locally when offline (INSERT)
 * @param {object} [o.localChanges] fields to merge locally when offline (UPDATE)
 */
export async function mutate(o) {
  const res = await apiRequest(o.url, {
    method: o.method,
    body: o.payload === undefined ? undefined : JSON.stringify(o.payload),
  });
  if (res?.success) return res;
  if (res && !res.isOffline) return res; // server refused: surface the reason

  // ---- offline: keep the change on this device ----
  const t = db[o.table];
  try {
    if (o.action === "INSERT" && o.localRecord) await t.put(o.localRecord);
    if (o.action === "UPDATE") await t.update(o.entityId, o.localChanges || o.payload || {});
    if (o.action === "DELETE") await t.delete(o.entityId);
    await db.sync_outbox.add({
      table: o.table,
      action: o.action,
      method: o.method,
      url: o.url,
      entityId: o.entityId,
      payload: o.payload ?? null,
      status: CRUD_PENDING,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    return { success: false, error: `Could not save on this device: ${e?.message}` };
  }
  return {
    success: true,
    isOffline: true,
    data: o.localRecord || { id: o.entityId, ...(o.localChanges || o.payload || {}) },
    message: "Saved offline. It will upload when you're back online.",
  };
}

/** Local rows that were created offline and not uploaded yet (shown alongside server rows). */
export async function pendingLocalRows(table) {
  try {
    const queued = (await db.sync_outbox.toArray()).filter(
      (e) => e.table === table && e.action === "INSERT" && e.status === CRUD_PENDING,
    );
    const rows = [];
    for (const e of queued) {
      const r = await db[table].get(e.entityId);
      if (r) rows.push({ ...r, isOfflinePending: true });
    }
    return rows;
  } catch (e) {
    return [];
  }
}

let replaying = false;

export async function replayCrudQueue() {
  if (replaying) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  replaying = true;
  let done = 0;
  try {
    const all = await db.sync_outbox.toArray();
    const queue = all
      .filter((e) => e.status === CRUD_PENDING && e.url)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    // Local id -> server id, so a queued UPDATE/DELETE of a record created offline hits the real row.
    const idMap = new Map();

    for (const e of queue) {
      let url = e.url;
      for (const [localId, serverId] of idMap) url = url.replace(localId, serverId);
      if (isLocalId(e.entityId) && e.action !== "INSERT" && !idMap.has(e.entityId)) {
        // Refers to a record that never reached the server: nothing to send.
        await db.sync_outbox.delete(e.sequence);
        continue;
      }

      const res = await apiRequest(url, {
        method: e.method,
        body: e.payload === null || e.payload === undefined ? undefined : JSON.stringify(e.payload),
      });

      if (res?.success) {
        if (e.action === "INSERT") {
          const created = res.data?.data || res.data || {};
          if (created.id) idMap.set(e.entityId, created.id);
          await db[e.table].delete(e.entityId).catch(() => {}); // drop the temporary copy
        }
        await db.sync_outbox.delete(e.sequence);
        done++;
      } else if (res?.isOffline) {
        break; // network dropped again: try later, keep order
      } else {
        await db.sync_outbox.update(e.sequence, {
          status: CRUD_FAILED,
          errorMessage: res?.error || `HTTP ${res?.status}`,
        });
      }
    }
  } catch (err) {
    console.warn("[OfflineCrud] replay stopped:", err?.message);
  } finally {
    replaying = false;
  }
  if (done && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pharmaflow:crud-synced", { detail: { done } }));
  }
  return done;
}

/** Changes the server refused, for showing the user. */
export async function failedCrudChanges() {
  try {
    return (await db.sync_outbox.toArray()).filter((e) => e.status === CRUD_FAILED);
  } catch (e) {
    return [];
  }
}
