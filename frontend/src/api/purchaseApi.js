/**
 * Purchase & Goods Receiving API Client Service (Offline-First)
 *
 * Communicates with the Express backend REST endpoints.
 * Includes resilient offline fallback and durable Dexie outbox queueing
 * for stock additions (Goods Receipts) and supplier reorder notifications.
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./apiClient";
import { localPersistenceService } from "../db";
import { db } from "../db/pharmaflowDb";

/**
 * GET /api/purchases
 */
export async function fetchPurchases(params = {}) {
  const query = new URLSearchParams();
  const rawBranch =
    typeof params.branchId === "object" && params.branchId !== null
      ? params.branchId.id
      : params.branchId;
  if (
    rawBranch &&
    rawBranch !== "All Branches" &&
    rawBranch !== "all" &&
    rawBranch !== "No Active Branch"
  ) {
    query.append("branchId", rawBranch);
  }
  if (params.status && params.status !== "All Statuses") {
    query.append("status", params.status.toUpperCase().replace(" ", "_"));
  }
  if (params.search) {
    query.append("search", params.search);
  }

  const queryString = query.toString() ? `?${query.toString()}` : "";
  try {
    const res = await apiGet(`/purchases${queryString}`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[PurchaseApi] Online fetchPurchases failed:", err?.message);
  }
  return { success: true, isOffline: true, data: [] };
}

/**
 * POST /api/purchases
 */
export async function createPurchaseOrder(poData) {
  return apiPost("/purchases", poData);
}

/**
 * PATCH /api/purchases/:id/status
 */
export async function updatePurchaseStatus(id, status) {
  return apiPut(`/purchases/${id}/status`, { status }, { method: "PATCH" });
}

/**
 * POST /api/purchases/:id/receive
 */
export async function receivePurchaseStock(id, receiveData = {}) {
  try {
    const res = await apiPost(`/purchases/${id}/receive`, receiveData);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[PurchaseApi] Online receivePurchaseStock failed, committing locally:", err?.message);
  }

  // Local fallback
  return createGoodsReceipt({
    ...receiveData,
    purchaseId: id,
  });
}

/**
 * GET /api/goods-receipts
 */
export async function fetchGoodsReceipts(params = {}) {
  const query = new URLSearchParams();
  const rawBranch =
    typeof params.branchId === "object" && params.branchId !== null
      ? params.branchId.id
      : params.branchId;
  if (
    rawBranch &&
    rawBranch !== "All Branches" &&
    rawBranch !== "all" &&
    rawBranch !== "No Active Branch"
  ) {
    query.append("branchId", rawBranch);
  }
  if (params.purchaseId) query.append("purchaseId", params.purchaseId);

  const queryString = query.toString() ? `?${query.toString()}` : "";

  try {
    const res = await apiGet(`/api/goods-receipts${queryString}`);
    if (res && res.success) {
      return res;
    }
  } catch (err) {
    console.warn("[PurchaseApi] Online goods receipts fetch failed, querying local persistence:", err?.message);
  }

  // Offline goods receipts fallback
  try {
    let orgId = "ORG-DEFAULT";
    if (typeof window !== "undefined" && window.localStorage) {
      orgId = window.localStorage.getItem("organisationId") || "ORG-DEFAULT";
    }
    const localReceipts = await localPersistenceService.getLocalPurchaseReceipts(
      orgId,
      rawBranch || undefined
    );
    return {
      success: true,
      isOffline: true,
      data: localReceipts,
    };
  } catch (offlineErr) {
    console.warn("[PurchaseApi] Offline receipts query notice:", offlineErr?.message);
  }

  return { success: true, isOffline: true, data: [] };
}

/**
 * POST /api/goods-receipts
 * Receive stock and add into inventory (online or offline IndexedDB)
 */
export async function createGoodsReceipt(receiptData) {
  try {
    const res = await apiPost("/api/goods-receipts", receiptData);
    if (res && res.success) {
      // Mirror stock into local Dexie
      if (receiptData.items && Array.isArray(receiptData.items)) {
        localPersistenceService
          .receiveLocalPurchase(receiptData)
          .catch((e) => console.warn("[PurchaseApi] Local stock mirror notice:", e?.message));
      }
      return res;
    }
  } catch (err) {
    console.warn("[PurchaseApi] Online createGoodsReceipt failed, committing locally to Dexie:", err?.message);
  }

  // Offline receipt creation & stock addition
  try {
    let orgId = "ORG-DEFAULT";
    let branchId = "BRANCH-MAIN";
    let userId = "USER-DEFAULT";
    if (typeof window !== "undefined" && window.localStorage) {
      orgId = window.localStorage.getItem("organisationId") || "ORG-DEFAULT";
      branchId = window.localStorage.getItem("activeBranchId") || "BRANCH-MAIN";
      userId = window.localStorage.getItem("userId") || "USER-DEFAULT";
    }

    const localRes = await localPersistenceService.receiveLocalPurchase(
      receiptData,
      {
        organisationId: receiptData.organisationId || orgId,
        branchId: receiptData.branchId || branchId,
        userId,
      }
    );

    return {
      success: true,
      isOffline: true,
      data: localRes,
      message: "Goods received offline and added to local stock. Will sync to cloud when connected.",
    };
  } catch (offlineErr) {
    console.error("[PurchaseApi] Offline goods receipt error:", offlineErr);
    return { success: false, error: offlineErr?.message || "Failed to receive goods offline" };
  }
}

/**
 * PATCH /api/goods-receipts/:id/status
 */
export async function updateGoodsReceiptStatus(id, status) {
  return apiPut(
    `/api/goods-receipts/${id}/status`,
    { status },
    { method: "PATCH" },
  );
}

/**
 * GET /api/suppliers
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);

  const queryString = query.toString() ? `?${query.toString()}` : "";
  try {
    const res = await apiGet(`/api/suppliers${queryString}`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[PurchaseApi] Online fetchSuppliers failed:", err?.message);
  }
  return { success: true, isOffline: true, data: [] };
}

/**
 * POST /api/suppliers
 */
export async function createSupplier(supplierData) {
  return apiPost("/api/suppliers", supplierData);
}

/**
 * PATCH /api/suppliers/:id/status
 */
export async function updateSupplierStatus(id, status) {
  return apiPut(`/api/suppliers/${id}/status`, { status }, { method: "PATCH" });
}

/**
 * PUT /api/suppliers/:id
 */
export async function updateSupplier(id, supplierData) {
  return apiPut(`/api/suppliers/${id}`, supplierData);
}

/**
 * DELETE /api/suppliers/:id
 */
export async function deleteSupplier(id) {
  return apiDelete(`/api/suppliers/${id}`);
}

/**
 * POST /api/suppliers/notify
 * Send low/slow stock reorder notification to supplier (or queue durably offline)
 */
export async function notifySupplierApi(notificationData) {
  try {
    const res = await apiPost("/api/suppliers/notify", notificationData);
    if (res && (res.success || res.data?.success)) {
      return res;
    }
  } catch (err) {
    console.warn(
      "[PurchaseApi] Online notifySupplierApi failed, queueing offline outbox mutation:",
      err?.message
    );
  }

  // Durable offline queue in Dexie sync_outbox
  try {
    let orgId = "ORG-DEFAULT";
    let branchId = "BRANCH-MAIN";
    let userId = "USER-DEFAULT";
    if (typeof window !== "undefined" && window.localStorage) {
      orgId = window.localStorage.getItem("organisationId") || "ORG-DEFAULT";
      branchId = window.localStorage.getItem("activeBranchId") || "BRANCH-MAIN";
      userId = window.localStorage.getItem("userId") || "USER-DEFAULT";
    }

    const mutationId = `MUT-NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const refNum = `OFFLINE-NOTIF-${Date.now().toString().slice(-6)}`;

    await db.sync_outbox.add({
      mutationId,
      mutationType: "NOTIFY_SUPPLIER",
      organisationId: notificationData.organisationId || orgId,
      branchId: notificationData.branchId || branchId,
      userId,
      payload: {
        ...notificationData,
        referenceNumber: refNum,
        queuedAt: new Date().toISOString(),
      },
      status: "PENDING",
      attemptCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      isOffline: true,
      data: {
        success: true,
        referenceNumber: refNum,
        isOffline: true,
        message: "Notification queued offline. Will be dispatched to recipient once online.",
      },
      referenceNumber: refNum,
      message: "Notification queued offline. Will be dispatched to recipient once online.",
    };
  } catch (offlineErr) {
    console.error("[PurchaseApi] Failed to queue supplier notification:", offlineErr);
    throw offlineErr;
  }
}
