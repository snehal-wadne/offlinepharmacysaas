/**
 * Purchase & Goods Receiving API Client Service (Offline-First)
 *
 * Communicates with the Express backend REST endpoints.
 * Includes resilient offline fallback and durable Dexie outbox queueing
 * for stock additions (Goods Receipts) and supplier reorder notifications.
 */

import { mutate, newLocalId, pendingLocalRows } from "../offline/offlineCrud";
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
    if (res && res.success) {
      const items = res.data?.data || res.data?.items || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(items) && items.length > 0) {
        db.purchases.bulkPut(items.map((p) => ({
          id: String(p.dbId || p.id || `po-${Date.now()}`),
          purchaseNumber: p.poNumber || p.purchaseNumber || p.id,
          organisationId: p.organisationId || "ORG-DEFAULT",
          branchId: p.branchId || "BRANCH-MAIN",
          supplierId: p.supplierId || null,
          supplierName: p.supplier || p.supplierName || "Supplier",
          status: p.rawStatus || p.status || "PENDING",
          totalAmount: p.numericAmount || parseFloat(String(p.amount || 0).replace(/[^0-9.]/g, "")) || 0,
          itemsCount: p.itemsCount || 1,
          orderDate: p.orderDate || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: p.notes || "",
        }))).catch((e) => console.warn("[PurchaseApi] Cache purchases warning:", e?.message));

        if (typeof window !== "undefined") {
          window.localStorage?.setItem("cached_purchases", JSON.stringify(items));
        }
      }
      return res;
    }
  } catch (err) {
    console.warn("[PurchaseApi] Online fetchPurchases failed, falling back to local storage:", err?.message);
  }

  // Resilient Offline Fallback
  try {
    let localPurchases = await db.purchases.toArray();
    const wantedBranch =
      typeof params.branchId === "object" && params.branchId !== null ? params.branchId.id : params.branchId;
    if (wantedBranch && !["All Branches", "all", "No Active Branch"].includes(wantedBranch)) {
      localPurchases = localPurchases.filter(
        (p) => p.branchId === wantedBranch || !p.branchId || p.branchId === "BRANCH-MAIN",
      );
    }
    const branchNames = new Map((await db.branches.toArray().catch(() => [])).map((b) => [b.id, b.name]));
    if (localPurchases && localPurchases.length > 0) {
      return {
        success: true,
        isOffline: true,
        data: localPurchases.map((p) => ({
          id: p.purchaseNumber || p.id,
          dbId: p.id,
          poNumber: p.purchaseNumber || p.id,
          supplier: p.supplierName || "Supplier",
          orderDate: p.orderDate || "Recent",
          expectedDate: "Standard",
          amount: `₹${Number(p.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          numericAmount: Number(p.totalAmount || 0),
          itemsCount: Number(p.itemsCount || 1),
          branch: branchNames.get(p.branchId) || "Main Branch",
          status: p.status || "Pending",
          rawStatus: p.status || "PENDING",
          notes: p.notes || "",
        })),
      };
    }

    if (typeof window !== "undefined") {
      const cached = window.localStorage?.getItem("cached_purchases");
      if (cached) {
        return {
          success: true,
          isOffline: true,
          data: JSON.parse(cached),
        };
      }
    }
  } catch (offlineErr) {
    console.warn("[PurchaseApi] Offline fallback error:", offlineErr?.message);
  }

  return { success: true, isOffline: true, data: [] };
}

const localOrgId = () => {
  try {
    return window.localStorage?.getItem("organisationId") || "ORG-DEFAULT";
  } catch (e) {
    return "ORG-DEFAULT";
  }
};
const localBranchId = () => {
  try {
    return window.localStorage?.getItem("activeBranchId") || "BRANCH-MAIN";
  } catch (e) {
    return "BRANCH-MAIN";
  }
};
// Real order total from the lines; never an invented figure.
const poTotal = (po) => {
  const explicit = Number(po.totalAmount ?? po.subtotal);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (po.items || []).reduce(
    (sum, it) =>
      sum +
      (Number(it.orderedQuantity ?? it.quantity) || 0) * (Number(it.unitCost ?? it.price) || 0) +
      (Number(it.taxAmount) || 0) -
      (Number(it.discountAmount) || 0),
    0,
  );
};

/**
 * POST /api/purchases
 */
export async function createPurchaseOrder(poData) {
  const res = await apiPost("/purchases", poData);
  if (res && res.success) {
    // The backend already notifies the supplier when it creates the order: don't send a second one.
    const created = res.data?.data || res.data || poData;
    db.purchases
      .put({
        id: String(created.id || `po-${Date.now()}`),
        purchaseNumber:
          created.purchaseNumber || created.purchase_number || poData.purchaseNumber || `PO-${Date.now().toString().slice(-4)}`,
        organisationId: poData.organisationId || localOrgId(),
        branchId: poData.branchId || localBranchId(),
        supplierId: poData.supplierId || null,
        supplierName: poData.supplierName || poData.supplier || "Supplier",
        status: poData.status || "PENDING",
        totalAmount: poTotal(poData),
        itemsCount: poData.items?.length || 1,
        orderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: poData.notes || "",
      })
      .catch((e) => console.warn("[PurchaseApi] Cache single PO warning:", e?.message));
    return res;
  }
  // Server answered and refused: show why, don't pretend it was saved.
  if (res && !res.isOffline) return res;

  // Durable Offline Fallback
  const offlineId = `po-offline-${Date.now()}`;
  const finalPoNum = poData.purchaseNumber || `PO-${Date.now().toString().slice(-4)}`;
  const orgId = poData.organisationId || (typeof window !== "undefined" && window.localStorage?.getItem("organisationId")) || "ORG-DEFAULT";
  const branchId = poData.branchId || (typeof window !== "undefined" && window.localStorage?.getItem("activeBranchId")) || "BRANCH-MAIN";

  const offlineRecord = {
    id: offlineId,
    purchaseNumber: finalPoNum,
    organisationId: orgId,
    branchId: branchId,
    supplierId: poData.supplierId || null,
    supplierName: poData.supplierName || poData.supplier || "Supplier",
    status: poData.status || "PENDING",
    totalAmount: poTotal(poData),
    itemsCount: poData.items?.length || 1,
    orderDate: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: poData.notes || "",
  };

  try {
    await db.purchases.put(offlineRecord);
    await db.sync_outbox.add({
      mutationId: `MUT-PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mutationType: "CREATE_PURCHASE",
      organisationId: orgId,
      branchId: branchId,
      payload: {
        ...poData,
        id: offlineId,
        purchaseNumber: finalPoNum,
        organisationId: orgId,
        branchId: branchId,
      },
      status: "PENDING",
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    notifySupplierApi({
      supplierId: poData.supplierId,
      supplierName: poData.supplierName || poData.supplier || "Supplier",
      medicineName: poData.items?.[0]?.productName || "Purchase Order",
      currentStock: 0,
      reorderQuantity: 10,
      channel: "PORTAL",
      priority: "HIGH",
      message: `Offline Purchase Order ${finalPoNum} recorded.`,
    }).catch(() => {});
  } catch (dexieErr) {
    console.warn("[PurchaseApi] Offline local save warning:", dexieErr?.message);
  }

  return {
    success: true,
    isOffline: true,
    data: offlineRecord,
    message: "Purchase Order saved offline and queued for cloud sync.",
  };
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
 * GET /api/suppliers  (cached in db.suppliers; offline uses that copy plus pending offline ones)
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await apiGet(`/api/suppliers${queryString}`);

  if (res && res.success) {
    const items = Array.isArray(res.data) ? res.data : res.data?.data || [];
    const pending = await pendingLocalRows("suppliers");
    if (!params.search) {
      try {
        const serverIds = new Set(items.map((x) => String(x.id)));
        const pendingIds = new Set(pending.map((x) => x.id));
        const stale = (await db.suppliers.toArray())
          .filter((x) => !serverIds.has(x.id) && !pendingIds.has(x.id))
          .map((x) => x.id);
        if (stale.length) await db.suppliers.bulkDelete(stale);
        if (items.length) {
          await db.suppliers.bulkPut(
            items.map((x) => ({
              ...x,
              id: String(x.id),
              organisationId: x.organisation_id || x.organisationId || supplierOrgId(),
            })),
          );
        }
      } catch (e) {
        console.warn("[PurchaseApi] Supplier cache notice:", e?.message);
      }
    }
    const merged = [...pending, ...items];
    const data = Array.isArray(res.data) ? merged : { ...res.data, count: merged.length, data: merged };
    return { ...res, data };
  }

  if (res && !res.isOffline) return res;

  let local = [];
  try {
    local = await db.suppliers.toArray();
  } catch (e) {}
  if (params.search) {
    const q = String(params.search).toLowerCase();
    local = local.filter(
      (x) =>
        String(x.name || "").toLowerCase().includes(q) ||
        String(x.phone || "").toLowerCase().includes(q) ||
        String(x.email || "").toLowerCase().includes(q),
    );
  }
  const pendingIds = new Set((await pendingLocalRows("suppliers")).map((x) => x.id));
  local = local.map((x) => ({ ...x, isOfflinePending: pendingIds.has(x.id) }));
  return { success: true, isOffline: true, data: { success: true, count: local.length, data: local } };
}

const supplierOrgId = () => {
  try {
    return window.localStorage?.getItem("organisationId") || "ORG-DEFAULT";
  } catch (e) {
    return "ORG-DEFAULT";
  }
};

/**
 * POST /api/suppliers
 */
export async function createSupplier(supplierData) {
  const localId = newLocalId("sup");
  return mutate({
    table: "suppliers",
    action: "INSERT",
    method: "POST",
    url: "/api/suppliers",
    payload: supplierData,
    entityId: localId,
    localRecord: {
      status: "ACTIVE",
      ...supplierData,
      id: localId,
      organisationId: supplierData.organisationId || supplierOrgId(),
      name: supplierData.name || supplierData.companyName || "New Supplier",
    },
  });
}

/**
 * PATCH /api/suppliers/:id/status
 */
export async function updateSupplierStatus(id, status) {
  const res = await mutate({
    table: "suppliers",
    action: "UPDATE",
    method: "PATCH",
    url: `/api/suppliers/${id}/status`,
    payload: { status },
    entityId: String(id),
    localChanges: { status },
  });
  if (res.success && !res.isOffline) db.suppliers.update(String(id), { status }).catch(() => {});
  return res;
}

/**
 * PUT /api/suppliers/:id
 */
export async function updateSupplier(id, supplierData) {
  const res = await mutate({
    table: "suppliers",
    action: "UPDATE",
    method: "PUT",
    url: `/api/suppliers/${id}`,
    payload: supplierData,
    entityId: String(id),
    localChanges: supplierData,
  });
  if (res.success && !res.isOffline) db.suppliers.update(String(id), supplierData).catch(() => {});
  return res;
}

/**
 * DELETE /api/suppliers/:id
 */
export async function deleteSupplier(id) {
  const res = await mutate({
    table: "suppliers",
    action: "DELETE",
    method: "DELETE",
    url: `/api/suppliers/${id}`,
    entityId: String(id),
  });
  if (res.success && !res.isOffline) db.suppliers.delete(String(id)).catch(() => {});
  return res;
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
