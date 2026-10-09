/**
 * Branch API Client (Offline-First)
 *
 * Communicates with backend /api/branches endpoints.
 * Integrates Dexie local storage (db.branches), sync outbox queueing, and localStorage fallback.
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./apiClient";
import { db } from "../db/pharmaflowDb";

const CANONICAL_BRANCHES = [
  {
    id: "branch-main-01",
    name: "Main Pharmacy Store",
    facility_type: "RETAIL_DISPENSARY",
    status: "ACTIVE",
    isMain: true,
    address: "Shop 12, Ground Floor, Linking Road, Bandra West, Mumbai",
    phone: "+91 98200 12345",
  },
  {
    id: "branch-east-02",
    name: "Andheri East Dispensary",
    facility_type: "RETAIL_DISPENSARY",
    status: "ACTIVE",
    isMain: false,
    address: "Station Road, Near Metro Gate 2, Andheri East, Mumbai",
    phone: "+91 98200 54321",
  },
];

export async function fetchBranches(params = {}) {
  const hasParams = params.limit !== undefined || params.offset !== undefined;
  const query = hasParams ? `?${new URLSearchParams(params).toString()}` : "";

  try {
    const res = await apiGet(`/api/branches${query}`);
    if (res && res.success) {
      const items = res.data?.data || res.data || [];
      if (Array.isArray(items) && items.length > 0) {
        db.branches
          .bulkPut(
            items.map((b) => ({
              id: String(b.id || `br-${Date.now()}`),
              organisationId: b.organisation_id || b.organisationId || "ORG-DEFAULT",
              name: b.name || "Pharmacy Branch",
              status: b.status || "ACTIVE",
              address: b.address || "",
              phone: b.phone || "",
              isMain: Boolean(b.is_main || b.isMain),
            }))
          )
          .catch((e) => console.warn("[BranchApi] Dexie cache notice:", e?.message));

        if (typeof window !== "undefined") {
          window.localStorage?.setItem("cached_branches", JSON.stringify(items));
        }
      }
      return res;
    }
  } catch (err) {
    console.warn("[BranchApi] Online fetchBranches failed, reading local database:", err?.message);
  }

  // Resilient Offline Fallback
  try {
    const localBranches = await db.branches.toArray();
    if (localBranches && localBranches.length > 0) {
      return {
        success: true,
        isOffline: true,
        data: localBranches.map((b) => ({
          ...b,
          facility_type: b.facilityType || "RETAIL_DISPENSARY",
        })),
      };
    }

    if (typeof window !== "undefined") {
      const cached = window.localStorage?.getItem("cached_branches");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, isOffline: true, data: parsed };
        }
      }
    }
  } catch (offlineErr) {
    console.warn("[BranchApi] Offline fallback error:", offlineErr?.message);
  }

  // Seed canonical branches into Dexie so they persist offline
  db.branches
    .bulkPut(
      CANONICAL_BRANCHES.map((b) => ({
        id: b.id,
        organisationId: "ORG-DEFAULT",
        name: b.name,
        status: b.status,
        address: b.address,
        phone: b.phone,
        isMain: b.isMain,
      }))
    )
    .catch(() => {});

  return {
    success: true,
    isOffline: true,
    data: CANONICAL_BRANCHES,
  };
}

export async function fetchBranchById(id) {
  try {
    const res = await apiGet(`/api/branches/${id}`);
    if (res && res.success) return res;
  } catch (err) {}

  const local = await db.branches.get(String(id)).catch(() => null);
  if (local) {
    return { success: true, isOffline: true, data: local };
  }
  return { success: false, error: "Branch not found offline" };
}

export async function createBranch(payload) {
  const localId = `branch-local-${Date.now()}`;
  const localBranch = {
    id: localId,
    organisationId: payload.organisationId || "ORG-DEFAULT",
    name: payload.name || "New Branch",
    status: payload.status || "ACTIVE",
    address: payload.address || "",
    phone: payload.phone || "",
    isMain: false,
    facility_type: payload.facilityType || "RETAIL_DISPENSARY",
  };

  try {
    await db.branches.put(localBranch);
    await db.sync_outbox.add({
      table: "branches",
      action: "INSERT",
      entityId: localId,
      payload,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[BranchApi] Offline save notice:", e?.message);
  }

  try {
    const res = await apiPost("/api/branches", payload);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[BranchApi] Online createBranch failed, queued offline:", err?.message);
  }

  return {
    success: true,
    isOffline: true,
    data: localBranch,
    message: "Branch saved offline and queued for cloud sync.",
  };
}

export async function updateBranch(id, payload) {
  try {
    await db.branches.update(String(id), { ...payload }).catch(() => {});
    await db.sync_outbox.add({
      table: "branches",
      action: "UPDATE",
      entityId: String(id),
      payload,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
  } catch (e) {}

  try {
    const res = await apiPut(`/api/branches/${id}`, payload);
    if (res && res.success) return res;
  } catch (err) {}

  return { success: true, isOffline: true, data: { id, ...payload } };
}

export async function updateBranchStatus(id, status) {
  try {
    await db.branches.update(String(id), { status }).catch(() => {});
  } catch (e) {}

  try {
    return await apiPut(`/api/branches/${id}/status`, { status });
  } catch (err) {
    return { success: true, isOffline: true, data: { id, status } };
  }
}

export async function deleteBranch(id) {
  try {
    await db.branches.delete(String(id)).catch(() => {});
  } catch (e) {}

  try {
    return await apiDelete(`/api/branches/${id}`);
  } catch (err) {
    return { success: true, isOffline: true, message: "Deleted locally." };
  }
}
