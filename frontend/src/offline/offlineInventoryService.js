/**
 * Offline Inventory Service
 *
 * Provides offline-first CRUD for inventory items using IndexedDB (Dexie).
 * Called by the inventoryApi when the backend is unreachable.
 *
 * Design:
 * - All reads come from `db.inventory` (Dexie) which is populated on sync pull
 * - All writes are queued to `db.sync_outbox` for later push when online
 * - Items in `db.products` serve as the product catalog for name/barcode lookup
 */

import { db } from "../db/pharmaflowDb";
import { generateOfflineBarcodeSvg, generateOfflineQRCodeSvg } from "../utils/qrGenerator";

const getOrgBranch = () => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return {
        organisationId: window.localStorage.getItem("organisationId") || "ORG-DEFAULT",
        branchId: window.localStorage.getItem("activeBranchId") || "BRANCH-MAIN",
      };
    }
  } catch (_) {}
  return { organisationId: "ORG-DEFAULT", branchId: "BRANCH-MAIN" };
};

/**
 * Map a Dexie InventoryBatchRecord → UI-compatible stock item shape
 * (mirrors what the backend /api/inventory returns)
 */
function mapInventoryRecord(rec, products = []) {
  const product = products.find((p) => p.productId === rec.productId) || {};
  const barcode = rec.barcode || product.barcode || rec.sku || product.sku || rec.id;

  return {
    id: rec.id,
    productId: rec.productId,
    brandName: rec.medicineName || product.name || "Unknown Medicine",
    medicineName: rec.medicineName || product.name || "Unknown Medicine",
    genericName: rec.genericName || product.genericName || "",
    strength: rec.strength || product.strength || "",
    packSize: rec.packSize || product.unit || "Units",
    manufacturer: rec.manufacturer || product.manufacturer || "",
    supplierName: rec.supplierName || "",
    barcode,
    sku: rec.sku || product.sku || barcode,
    batchNo: rec.batchNumber || "B-LOCAL",
    batchNumber: rec.batchNumber || "B-LOCAL",
    quantity: rec.availableQuantity ?? 0,
    expiryDate: rec.expiryDate || "",
    amount: rec.mrp ? `₹${rec.mrp}` : "",
    mrp: rec.mrp ? `₹${rec.mrp}` : "",
    shelfLocation: rec.shelfLocation || "",
    branchId: rec.branchId,
    organisationId: rec.organisationId,
    isActive: rec.isActive !== false,
    rxRequired: Boolean(rec.isRxRequired),
    isRxRequired: Boolean(rec.isRxRequired),
    _offlineRecord: true, // flag so UI can show offline badge
  };
}

/**
 * Get all inventory for the current organisation/branch from IndexedDB
 */
export async function getOfflineInventory(params = {}) {
  const { organisationId, branchId } = getOrgBranch();

  let query = db.inventory.where("organisationId").equals(
    params.organisationId || organisationId
  );

  const records = await query.toArray();
  const products = await db.products.toArray();

  let items = records.map((r) => mapInventoryRecord(r, products));

  // Filter by branch if requested
  if (params.branchId && params.branchId !== "All Branches") {
    items = items.filter((i) => i.branchId === params.branchId);
  }

  // Filter by search term
  if (params.search) {
    const term = params.search.toLowerCase();
    items = items.filter(
      (i) =>
        (i.brandName || "").toLowerCase().includes(term) ||
        (i.genericName || "").toLowerCase().includes(term) ||
        (i.barcode || "").toLowerCase().includes(term) ||
        (i.sku || "").toLowerCase().includes(term)
    );
  }

  return {
    success: true,
    isOffline: true,
    data: items,
    meta: { total: items.length, fromCache: true },
  };
}

/**
 * Save a new inventory entry to IndexedDB outbox for later sync
 */
export async function saveOfflineInventoryEntry(itemData) {
  const { organisationId, branchId } = getOrgBranch();
  const id = `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    id,
    productId: itemData.productId || id,
    organisationId: itemData.organisationId || organisationId,
    branchId: itemData.branchId || branchId,
    medicineName: itemData.medicineName || itemData.brandName || "",
    genericName: itemData.genericName || "",
    strength: itemData.strength || "",
    packSize: itemData.packSize || "",
    manufacturer: itemData.manufacturer || "",
    barcode: itemData.barcode || itemData.sku || id,
    sku: itemData.sku || itemData.barcode || id,
    batchNumber: itemData.batchNo || itemData.batchNumber || "B-001",
    availableQuantity: Number(itemData.quantity) || 0,
    mrp: parseFloat((itemData.amount || itemData.mrp || "0").toString().replace(/[^0-9.]/g, "")) || 0,
    expiryDate: itemData.expiryDate || "",
    shelfLocation: itemData.shelfLocation || "",
    isActive: itemData.isActive !== false,
    isRxRequired: Boolean(itemData.isRxRequired),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to local IndexedDB
  await db.inventory.put(record);

  // Queue for sync to backend when online
  await db.sync_outbox.add({
    mutationId: `MUT-${id}`,
    mutationType: "UPDATE_INVENTORY",
    organisationId: record.organisationId,
    branchId: record.branchId,
    payload: { action: "CREATE", data: itemData },
    status: "PENDING",
    retryCount: 0,
    nextRetryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    isOffline: true,
    data: mapInventoryRecord(record),
    message: "Saved offline. Will sync when connected.",
  };
}

/**
 * Update an inventory entry offline
 */
export async function updateOfflineInventoryEntry(id, itemData) {
  const existing = await db.inventory.get(id);
  if (!existing) {
    // If not in local DB, create a minimal shell
    return saveOfflineInventoryEntry({ ...itemData, id });
  }

  const updated = {
    ...existing,
    ...{
      medicineName: itemData.medicineName || itemData.brandName || existing.medicineName,
      genericName: itemData.genericName || existing.genericName,
      strength: itemData.strength || existing.strength,
      packSize: itemData.packSize || existing.packSize,
      batchNumber: itemData.batchNo || itemData.batchNumber || existing.batchNumber,
      availableQuantity: Number(itemData.quantity) !== undefined && !isNaN(Number(itemData.quantity))
        ? Number(itemData.quantity)
        : existing.availableQuantity,
      mrp: itemData.amount
        ? parseFloat(itemData.amount.toString().replace(/[^0-9.]/g, "")) || existing.mrp
        : existing.mrp,
      shelfLocation: itemData.shelfLocation || existing.shelfLocation,
      isActive: itemData.isActive !== undefined ? itemData.isActive : existing.isActive,
      isRxRequired: itemData.isRxRequired !== undefined ? itemData.isRxRequired : existing.isRxRequired,
      updatedAt: new Date().toISOString(),
    },
  };

  await db.inventory.put(updated);

  // Queue for sync
  await db.sync_outbox.add({
    mutationId: `MUT-UPD-${id}-${Date.now()}`,
    mutationType: "UPDATE_INVENTORY",
    organisationId: existing.organisationId,
    branchId: existing.branchId,
    payload: { action: "UPDATE", id, data: itemData },
    status: "PENDING",
    retryCount: 0,
    nextRetryAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const products = await db.products.toArray();
  return {
    success: true,
    isOffline: true,
    data: mapInventoryRecord(updated, products),
    message: "Updated offline. Will sync when connected.",
  };
}

/**
 * Delete (soft-delete / deactivate) an inventory entry offline
 */
export async function deleteOfflineInventoryEntry(id) {
  const existing = await db.inventory.get(id);
  if (existing) {
    await db.inventory.put({ ...existing, isActive: false, updatedAt: new Date().toISOString() });

    await db.sync_outbox.add({
      mutationId: `MUT-DEL-${id}-${Date.now()}`,
      mutationType: "ADJUST_STOCK",
      organisationId: existing.organisationId,
      branchId: existing.branchId,
      payload: { action: "DELETE", id },
      status: "PENDING",
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
  return { success: true, isOffline: true };
}

/**
 * Generate barcode data offline (no backend needed)
 */
export async function getOfflineBarcode(idOrSku) {
  // Try to find in local inventory
  const rec = await db.inventory.get(idOrSku) ||
    await db.inventory.where("sku").equals(idOrSku).first() ||
    await db.inventory.where("barcode").equals(idOrSku).first();

  const barcode = rec?.barcode || rec?.sku || idOrSku;
  const svgBarcode = generateOfflineBarcodeSvg(barcode, {
    barHeight: 52,
    moduleWidth: 2,
    quietZoneModules: 14,
  });
  const qrBarcode = generateOfflineQRCodeSvg(barcode, 96);

  return {
    success: true,
    isOffline: true,
    data: {
      barcode,
      sku: rec?.sku || barcode,
      medicineName: rec?.medicineName || "Medicine",
      brandName: rec?.medicineName || "Medicine",
      batchNo: rec?.batchNumber || "B-001",
      expiryDate: rec?.expiryDate || "",
      mrp: rec?.mrp ? `₹${rec.mrp}` : "",
      shelfLocation: rec?.shelfLocation || "",
      svgBarcode,
      qrBarcode,
    },
  };
}

/**
 * Seed/refresh the local inventory IndexedDB from a batch of server records.
 * Called by the sync pull worker when backend becomes reachable.
 */
export async function seedInventoryFromServer(serverItems = [], organisationId, branchId) {
  if (!serverItems.length) return;

  const now = new Date().toISOString();
  const records = serverItems.map((item) => ({
    id: item.id,
    productId: item.productId || item.id,
    organisationId: item.organisationId || organisationId || "ORG-DEFAULT",
    branchId: item.branchId || branchId || "BRANCH-MAIN",
    medicineName: item.medicineName || item.brandName || item.name || "",
    genericName: item.genericName || "",
    strength: item.strength || "",
    packSize: item.packSize || "",
    manufacturer: item.manufacturer || "",
    barcode: item.barcode || item.sku || item.id,
    sku: item.sku || item.barcode || item.id,
    batchNumber: item.batchNo || item.batchNumber || "B-001",
    availableQuantity: Number(item.quantity) || 0,
    mrp: parseFloat((item.amount || item.mrp || "0").toString().replace(/[^0-9.]/g, "")) || 0,
    expiryDate: item.expiryDate || "",
    shelfLocation: item.shelfLocation || "",
    isActive: item.isActive !== false,
    isRxRequired: Boolean(item.isRxRequired || item.rxRequired),
    createdAt: item.createdAt || now,
    updatedAt: now,
    _syncedAt: now,
  }));

  await db.inventory.bulkPut(records);
  console.log(`[OfflineInventory] Seeded ${records.length} items into IndexedDB`);
}
