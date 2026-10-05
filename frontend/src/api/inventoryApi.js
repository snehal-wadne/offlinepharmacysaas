/**
 * Inventory API Client Service (Offline-First)
 *
 * Communicates with backend REST API for inventory management and stock adjustments.
 * Seamlessly falls back to local Dexie IndexedDB when the network is unavailable or backend is offline.
 * Automatically seeds local cache upon online fetch and queues offline mutations into outbox.
 */

import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./apiClient";
import {
  getOfflineInventory,
  saveOfflineInventoryEntry,
  updateOfflineInventoryEntry,
  deleteOfflineInventoryEntry,
  getOfflineBarcode,
  seedInventoryFromServer,
} from "../offline/offlineInventoryService";
import { localPersistenceService } from "../db";

/**
 * GET /api/inventory
 */
export async function fetchInventory(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.branchId && params.branchId !== "All Branches" && params.branchId !== "all")
    query.append("branchId", params.branchId);
  if (params.limit) query.append("limit", params.limit);
  if (params.offset) query.append("offset", params.offset);

  const queryString = query.toString() ? `?${query.toString()}` : "";

  try {
    const res = await apiGet(`/inventory${queryString}`);
    if (res && res.success) {
      const items = res.data?.data || res.data?.items || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(items) && items.length > 0) {
        // Seed into local IndexedDB asynchronously
        seedInventoryFromServer(items, params.organisationId, params.branchId).catch(
          (err) => console.warn("[InventoryApi] Seed local inventory notice:", err?.message)
        );
      }
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online fetchInventory failed, loading from local Dexie:", err?.message);
  }

  // Resilient Offline Fallback
  return getOfflineInventory(params);
}

/**
 * GET /api/inventory/summary
 */
export async function fetchInventorySummary(params = {}) {
  const query = new URLSearchParams();
  if (params?.branchId && params.branchId !== "All Branches" && params.branchId !== "all")
    query.append("branchId", params.branchId);
  const queryString = query.toString() ? `?${query.toString()}` : "";

  try {
    const res = await apiGet(`/inventory/summary${queryString}`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[InventoryApi] Online summary failed, aggregating from local Dexie:", err?.message);
  }

  // Calculate summary from offline inventory
  try {
    const offlineData = await getOfflineInventory(params);
    const items = offlineData?.data || [];
    const totalItems = items.length;
    const lowStock = items.filter((i) => (Number(i.quantity) || 0) < 50).length;
    const outOfStock = items.filter((i) => (Number(i.quantity) || 0) <= 0).length;
    return {
      success: true,
      isOffline: true,
      data: {
        totalItems,
        lowStock,
        outOfStock,
        totalValuation: items.reduce(
          (sum, i) =>
            sum +
            (parseFloat((i.amount || i.mrp || "0").toString().replace(/[^0-9.]/g, "")) || 0) *
              (Number(i.quantity) || 0),
          0
        ),
      },
    };
  } catch (_) {
    return { success: true, isOffline: true, data: { totalItems: 0, lowStock: 0, outOfStock: 0 } };
  }
}

/**
 * GET /api/inventory/movements
 */
export async function fetchStockMovements(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.append("limit", params.limit);
  if (params.branchId && params.branchId !== "All Branches" && params.branchId !== "all")
    query.append("branchId", params.branchId);
  const queryString = query.toString() ? `?${query.toString()}` : "";

  try {
    const res = await apiGet(`/inventory/movements${queryString}`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[InventoryApi] Online movements fetch notice:", err?.message);
  }

  return { success: true, isOffline: true, data: [] };
}

/**
 * POST /api/inventory/movements
 */
export async function recordStockMovementApi(movementData) {
  try {
    const res = await apiPost("/inventory/movements", movementData);
    if (res && res.success) {
      // Opportunistically mirror movement locally
      localPersistenceService
        .adjustLocalStock({
          productId: movementData.productId,
          batchNumber: movementData.batchNumber || movementData.batchNo || "DEFAULT",
          deltaQuantity: Number(movementData.deltaQuantity || movementData.quantity || 0),
          reason: movementData.reason,
          adjustmentType: movementData.movementType || movementData.type || "ADJUSTMENT",
        })
        .catch((e) => console.warn("[InventoryApi] Local stock sync notice:", e?.message));
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online recordStockMovement failed, adjusting locally in Dexie:", err?.message);
  }

  // Offline local stock adjustment
  try {
    const adjRes = await localPersistenceService.adjustLocalStock({
      productId: movementData.productId,
      productName: movementData.productName || movementData.medicineName,
      batchNumber: movementData.batchNumber || movementData.batchNo || "DEFAULT",
      deltaQuantity: Number(movementData.deltaQuantity || movementData.quantity || 0),
      reason: movementData.reason,
      adjustmentType: movementData.movementType || movementData.type || "ADJUSTMENT",
      notes: movementData.notes,
    });
    return {
      success: true,
      isOffline: true,
      data: adjRes,
      message: "Stock adjusted offline. Will sync with cloud when online.",
    };
  } catch (offlineErr) {
    return { success: false, error: offlineErr?.message || "Failed to adjust stock offline" };
  }
}

/**
 * POST /api/inventory
 * Creates a new inventory entry (online or queued offline)
 */
export async function saveInventoryEntry(itemData) {
  try {
    const res = await apiPost("/inventory", itemData);
    if (res && res.success) {
      // Mirror to local Dexie
      saveOfflineInventoryEntry(res.data?.data || res.data || itemData).catch((e) =>
        console.warn("[InventoryApi] Local cache mirror notice:", e?.message)
      );
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online saveInventoryEntry failed, storing offline:", err?.message);
  }

  // Offline entry creation
  return saveOfflineInventoryEntry(itemData);
}

/**
 * PUT /api/inventory/:id
 * Updates an inventory entry (online or queued offline)
 */
export async function updateInventoryEntry(id, itemData) {
  try {
    const res = await apiPut(`/inventory/${id}`, itemData);
    if (res && res.success) {
      updateOfflineInventoryEntry(id, itemData).catch((e) =>
        console.warn("[InventoryApi] Local update mirror notice:", e?.message)
      );
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online updateInventoryEntry failed, storing offline:", err?.message);
  }

  // Offline entry update
  return updateOfflineInventoryEntry(id, itemData);
}

/**
 * DELETE /api/inventory/:id
 */
export async function deleteInventoryEntry(id) {
  try {
    const res = await apiDelete(`/inventory/${id}`);
    if (res && res.success) {
      deleteOfflineInventoryEntry(id).catch((e) =>
        console.warn("[InventoryApi] Local delete notice:", e?.message)
      );
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online deleteInventoryEntry failed, recording offline:", err?.message);
  }

  // Offline entry delete
  return deleteOfflineInventoryEntry(id);
}

/**
 * GET /api/inventory/:id/barcode
 */
export async function fetchItemBarcode(id) {
  try {
    const res = await apiGet(`/inventory/${id}/barcode`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[InventoryApi] Online barcode fetch failed, generating offline:", err?.message);
  }

  // Generate barcode offline
  return getOfflineBarcode(id);
}

/**
 * GET /api/stock-transfers
 */
export async function fetchStockTransfers(params = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All Statuses")
    query.append("status", params.status);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  try {
    const res = await apiGet(`/api/stock-transfers${queryString}`);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[InventoryApi] Online stock transfers notice:", err?.message);
  }
  return { success: true, isOffline: true, data: [] };
}

/**
 * POST /api/stock-transfers
 */
export async function createStockTransferApi(data) {
  try {
    const res = await apiPost("/api/stock-transfers", data);
    if (res && res.success) return res;
  } catch (err) {
    console.warn("[InventoryApi] Online stock transfer notice:", err?.message);
  }
  return { success: false, error: "Stock transfers require active cloud connection" };
}

/**
 * PATCH /api/inventory/:id/status
 */
export async function updateItemStatusApi(id, isActive) {
  try {
    const res = await apiPatch(`/inventory/${id}/status`, { isActive });
    if (res && res.success) {
      updateOfflineInventoryEntry(id, { isActive }).catch(() => {});
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online status patch failed, updating offline:", err?.message);
  }
  return updateOfflineInventoryEntry(id, { isActive });
}

/**
 * PATCH /api/inventory/:id/rx
 */
export async function updateItemRxApi(id, isRxRequired) {
  try {
    const res = await apiPatch(`/inventory/${id}/rx`, { isRxRequired });
    if (res && res.success) {
      updateOfflineInventoryEntry(id, { isRxRequired }).catch(() => {});
      return res;
    }
  } catch (err) {
    console.warn("[InventoryApi] Online rx patch failed, updating offline:", err?.message);
  }
  return updateOfflineInventoryEntry(id, { isRxRequired });
}
