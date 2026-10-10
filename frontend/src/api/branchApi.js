/**
 * Branch API Client (Offline-First)
 *
 * Reads: server when reachable (and cached in db.branches), otherwise the local copy,
 *        always including branches created offline that haven't uploaded yet.
 * Writes: server first; with no network the change is stored locally and queued
 *         (see offline/offlineCrud.js) so it shows immediately and uploads later.
 */

import { apiGet } from "./apiClient";
import { db } from "../db/pharmaflowDb";
import { mutate, newLocalId, pendingLocalRows } from "../offline/offlineCrud";

const orgId = () => {
  try {
    return window.localStorage?.getItem("organisationId") || "ORG-DEFAULT";
  } catch (e) {
    return "ORG-DEFAULT";
  }
};

function unwrap(body) {
  return Array.isArray(body) ? body : body?.data || body?.items || [];
}

export async function fetchBranches(params = {}) {
  const hasParams = params.limit !== undefined || params.offset !== undefined;
  const query = hasParams ? `?${new URLSearchParams(params).toString()}` : "";

  const res = await apiGet(`/api/branches${query}`);

  if (res && res.success) {
    const items = unwrap(res.data);
    const pending = await pendingLocalRows("branches");

    // Keep the local copy equal to the server: add/update what it has, drop what it removed.
    try {
      const serverIds = new Set(items.map((b) => String(b.id)));
      const pendingIds = new Set(pending.map((b) => b.id));
      const stale = (await db.branches.toArray())
        .filter((b) => !serverIds.has(b.id) && !pendingIds.has(b.id))
        .map((b) => b.id);
      if (stale.length) await db.branches.bulkDelete(stale);
      if (items.length) {
        await db.branches.bulkPut(
          items.map((b) => ({
            ...b,
            id: String(b.id),
            organisationId: b.organisation_id || b.organisationId || orgId(),
            isMain: Boolean(b.is_main || b.isMain),
          })),
        );
      }
    } catch (e) {
      console.warn("[BranchApi] Local cache notice:", e?.message);
    }

    const merged = [...pending, ...items];
    const data = Array.isArray(res.data)
      ? merged
      : { ...res.data, count: merged.length, data: merged };
    return { ...res, data };
  }

  // The server answered but refused (401/403/500): report it, don't show a fake empty list.
  if (res && !res.isOffline) return res;

  // Offline: what is stored on this device
  let local = [];
  try {
    local = await db.branches.toArray();
  } catch (e) {
    console.warn("[BranchApi] Local read notice:", e?.message);
  }
  const pendingIds = new Set((await pendingLocalRows("branches")).map((b) => b.id));
  local = local.map((b) => ({
    ...b,
    facility_type: b.facility_type || b.facilityType || "RETAIL_DISPENSARY",
    isOfflinePending: pendingIds.has(b.id),
  }));

  return { success: true, isOffline: true, data: { success: true, count: local.length, data: local } };
}

export async function fetchBranchById(id) {
  const res = await apiGet(`/api/branches/${id}`);
  if (res && res.success) return res;
  if (res && !res.isOffline) return res;

  const local = await db.branches.get(String(id)).catch(() => null);
  if (local) return { success: true, isOffline: true, data: local };
  return { success: false, error: "Branch not found on this device" };
}

export async function createBranch(payload) {
  const localId = newLocalId("branch");
  const localRecord = {
    ...payload,
    id: localId,
    organisationId: payload.organisationId || orgId(),
    name: payload.name || "New Branch",
    status: payload.status || "ACTIVE",
    address: payload.address || "",
    phone: payload.phone || "",
    isMain: false,
    facility_type: payload.facilityType || payload.facility_type || "RETAIL_DISPENSARY",
  };
  return mutate({
    table: "branches",
    action: "INSERT",
    method: "POST",
    url: "/api/branches",
    payload,
    entityId: localId,
    localRecord,
  });
}

export async function updateBranch(id, payload) {
  const res = await mutate({
    table: "branches",
    action: "UPDATE",
    method: "PUT",
    url: `/api/branches/${id}`,
    payload,
    entityId: String(id),
    localChanges: payload,
  });
  if (res.success && !res.isOffline) {
    db.branches.update(String(id), { ...payload }).catch(() => {});
  }
  return res;
}

export async function updateBranchStatus(id, status) {
  const res = await mutate({
    table: "branches",
    action: "UPDATE",
    method: "PUT",
    url: `/api/branches/${id}/status`,
    payload: { status },
    entityId: String(id),
    localChanges: { status },
  });
  if (res.success && !res.isOffline) {
    db.branches.update(String(id), { status }).catch(() => {});
  }
  return res;
}

export async function deleteBranch(id) {
  const res = await mutate({
    table: "branches",
    action: "DELETE",
    method: "DELETE",
    url: `/api/branches/${id}`,
    entityId: String(id),
  });
  if (res.success && !res.isOffline) {
    db.branches.delete(String(id)).catch(() => {});
  }
  return res;
}
