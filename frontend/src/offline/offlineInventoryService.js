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

  let records = [];
  const targetOrg = params.organisationId || organisationId;

  // 1. Try querying by organization ID
  try {
    if (targetOrg) {
      records = await db.inventory.where("organisationId").equals(targetOrg).toArray();
    }
  } catch (_) {}

  // 2. If empty, fall back to all records in db.inventory
  if (!records || records.length === 0) {
    try {
      records = await db.inventory.toArray();
    } catch (_) {}
  }

  let products = [];
  try {
    products = await db.products.toArray();
  } catch (_) {}

  // 3. If inventory table is empty, project from products catalog in Dexie
  if ((!records || records.length === 0) && products && products.length > 0) {
    records = products.map((p) => ({
      id: p.productId || p.id,
      productId: p.productId || p.id,
      organisationId: p.organisationId || targetOrg || "ORG-DEFAULT",
      branchId: p.branchId || branchId || "BRANCH-MAIN",
      medicineName: p.name || "Medicine",
      genericName: p.genericName || "",
      strength: p.strength || "500mg",
      packSize: p.unit || "10 Tablets",
      manufacturer: p.manufacturer || "General",
      barcode: p.barcode || p.sku || p.productId,
      sku: p.sku || p.barcode || p.productId,
      batchNumber: "B-DEFAULT",
      availableQuantity: p.availableQuantity ?? 100,
      mrp: p.mrp || p.sellingPrice || 15.0,
      expiryDate: p.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      shelfLocation: "A1-S1",
      isActive: p.active !== false,
      isRxRequired: Boolean(p.isPrescriptionRequired),
    }));
  }

  // 4. If still empty, check localStorage cached_inventory
  if ((!records || records.length === 0) && typeof window !== "undefined") {
    try {
      const cached = window.localStorage?.getItem("cached_inventory");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          records = parsed.map((item) => ({
            id: item.id || item.productId,
            productId: item.productId || item.id,
            organisationId: item.organisationId || targetOrg,
            branchId: item.branchId || branchId,
            medicineName: item.medicineName || item.brandName || item.name || "Medicine",
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
          }));
        }
      }
    } catch (_) {}
  }

  let items = records
    .filter((r) => r.isActive !== false)
    .map((r) => mapInventoryRecord(r, products));

  // Filter by branch if requested
  if (params.branchId && params.branchId !== "All Branches" && params.branchId !== "all") {
    // Records saved before a real branch was known carry a placeholder id: keep them visible.
    const isPlaceholder = (b) => !b || b === "BRANCH-MAIN" || b === "main";
    items = items.filter((i) => i.branchId === params.branchId || isPlaceholder(i.branchId));
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
export async function saveOfflineInventoryEntry(itemData, opts = {}) {
  const { organisationId, branchId } = getOrgBranch();
  // opts.id: reuse the server's id when mirroring an online save (so a later pull updates this
  // record instead of duplicating it). opts.queue === false: don't add a sync-outbox entry.
  const id = opts.id || `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  if (opts.queue === false) {
    return { success: true, data: mapInventoryRecord(record) };
  }

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
export async function updateOfflineInventoryEntry(id, itemData, opts = {}) {
  const existing = await db.inventory.get(id);
  if (!existing) {
    // If not in local DB, create a minimal shell
    return saveOfflineInventoryEntry({ ...itemData, id }, { ...opts, id });
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

  if (opts.queue === false) {
    return { success: true, data: mapInventoryRecord(updated) };
  }

  const orgId = existing.organisationId || (typeof window !== "undefined" && window.localStorage?.getItem("organisationId")) || "ORG-DEFAULT";
  const branchId = existing.branchId || (typeof window !== "undefined" && window.localStorage?.getItem("activeBranchId")) || "BRANCH-MAIN";

  // Queue for sync
  await db.sync_outbox.add({
    mutationId: `MUT-UPD-${id}-${Date.now()}`,
    mutationType: "UPDATE_INVENTORY",
    organisationId: orgId,
    branchId: branchId,
    payload: {
      action: "UPDATE",
      id,
      productId: updated.productId || id,
      batchNumber: updated.batchNumber,
      quantity: updated.availableQuantity,
      data: {
        ...itemData,
        id,
        productId: updated.productId || id,
        batchNo: updated.batchNumber,
        batchNumber: updated.batchNumber,
        quantity: updated.availableQuantity,
        branchId,
        organisationId: orgId,
      },
    },
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
export async function deleteOfflineInventoryEntry(id, opts = {}) {
  const existing = await db.inventory.get(id);
  if (existing && opts.queue === false) {
    // Server already deleted it: just drop the local copy.
    await db.inventory.delete(id);
    return { success: true };
  }
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

  // Stock added offline carries a temporary LOCAL- id. Once the server has the same SKU+batch,
  // drop the temporary copy so the item isn't listed twice.
  try {
    const keyOf = (r) =>
      `${String(r.sku || r.barcode || "").toLowerCase()}|${String(r.batchNumber || "").toLowerCase()}`;
    const serverKeys = new Set(records.map(keyOf));
    const temporary = await db.inventory.filter((r) => String(r.id).startsWith("LOCAL-")).toArray();
    const duplicates = temporary.filter((r) => serverKeys.has(keyOf(r))).map((r) => r.id);
    if (duplicates.length) await db.inventory.bulkDelete(duplicates);
  } catch (e) {
    console.warn("[OfflineInventory] duplicate cleanup skipped:", e?.message);
  }

  // Also seed into Dexie products table for catalog lookups
  try {
    const productRecords = serverItems.map((item) => ({
      productId: item.productId || item.id,
      organisationId: item.organisationId || organisationId || "ORG-DEFAULT",
      name: item.brandName || item.medicineName || item.name || "Medicine",
      genericName: item.genericName || "",
      barcode: item.barcode || item.sku || item.id,
      sku: item.sku || item.barcode || item.id,
      category: item.category || "General",
      gstRate: 12,
      mrp: parseFloat((item.amount || item.mrp || "0").toString().replace(/[^0-9.]/g, "")) || 0,
      sellingPrice: parseFloat((item.amount || item.mrp || "0").toString().replace(/[^0-9.]/g, "")) || 0,
      unit: item.packSize || "Units",
      active: item.isActive !== false,
      updatedAt: now,
    }));
    await db.products.bulkPut(productRecords);
  } catch (_) {}

  // Save to localStorage for instant synchronous fallback
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem("cached_inventory", JSON.stringify(serverItems));
    } catch (_) {}
  }

  console.log(`[OfflineInventory] Seeded ${records.length} items into IndexedDB and local cache`);
}

/**
 * Compute offline dashboard overview & KPIs from local IndexedDB data
 */
export async function getOfflineDashboard(branchId = null) {
  try {
    const invRes = await getOfflineInventory({ branchId });
    const items = invRes?.data || [];
    const products = await db.products.toArray().catch(() => []);

    // Actual stock items count aligned with stock adjustment / inventory items table
    const totalProducts = items.length > 0 ? items.length : products.length;

    const now = new Date();
    const lowStockProductIds = new Set(
      items
        .filter((i) => Number(i.quantity) > 0 && Number(i.quantity) < 50)
        .map((i) => i.productId || i.medicineName)
    );
    const nearExpiryProductIds = new Set(
      items
        .filter((i) => {
          if (!i.expiryDate) return false;
          const d = new Date(i.expiryDate);
          const diff = (d - now) / (1000 * 60 * 60 * 24);
          return diff > 0 && diff <= 90;
        })
        .map((i) => i.productId || i.medicineName)
    );
    const expiredProductIds = new Set(
      items
        .filter((i) => i.expiryDate && new Date(i.expiryDate) < now)
        .map((i) => i.productId || i.medicineName)
    );

    const catMap = {};
    items.forEach((item) => {
      const cat = item.category || "General";
      if (!catMap[cat]) {
        catMap[cat] = { category: cat, totalItems: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
      }
      catMap[cat].totalItems += 1;
      const q = Number(item.quantity) || 0;
      if (q >= 50) catMap[cat].inStock += 1;
      else if (q > 0) catMap[cat].lowStock += 1;
      else catMap[cat].outOfStock += 1;
    });

    const stockSummary = Object.values(catMap);

    return {
      success: true,
      isOffline: true,
      data: {
        overview: {
          totalProducts,
          lowStockAlerts: lowStockProductIds.size,
          nearExpiry: nearExpiryProductIds.size,
          expiredStock: expiredProductIds.size,
        },
        stockSummary,
        pendingPurchaseOrders: [],
        recentStockMovements: [],
      },
    };
  } catch (err) {
    console.warn("[OfflineInventory] Failed to compute offline dashboard:", err);
    return {
      success: false,
      isOffline: true,
      error: err.message,
    };
  }
}

