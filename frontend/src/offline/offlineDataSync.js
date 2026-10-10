/**
 * Keeps the on-device database filled so every screen works with no network.
 *
 * Downloads the complete inventory (every page, not just the first) and the POS catalog
 * into IndexedDB. Runs once the user is signed in, whenever the browser comes back online,
 * and every few minutes while online. Safe to call repeatedly.
 */

import { fetchInventory } from "../api/inventoryApi";
import { fetchCashierProducts } from "../api/cashierApi";
import { fetchBranches } from "../api/branchApi";
import { fetchUsers } from "../api/userApi";
import { fetchSuppliers } from "../api/purchaseApi";
import { fetchCustomers } from "../api/customerApi";
import { replayCrudQueue } from "./offlineCrud";

const PAGE = 500;
const MAX_PAGES = 40;
const REFRESH_MS = 5 * 60 * 1000;

let running = false;
let timer = null;

function signedIn() {
  try {
    const t = window.localStorage?.getItem("authToken");
    return Boolean(t) && !String(t).startsWith("offline-");
  } catch (e) {
    return false;
  }
}

export async function downloadOfflineData() {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!signedIn()) return;
  running = true;
  try {
    // 1. Upload whatever was added/changed while offline (branches, staff, suppliers ...)
    await replayCrudQueue();

    // 2. Refresh the on-device copy of the smaller lists (each fetch caches itself).
    await Promise.allSettled([fetchBranches(), fetchUsers(), fetchSuppliers(), fetchCustomers()]);

    // 3. Inventory: each fetchInventory page seeds Dexie as a side effect.
    const seen = new Set();
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchInventory({ limit: PAGE, offset: page * PAGE });
      if (res?.isOffline) break;
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      let added = 0;
      for (const r of rows) {
        const k = r.id || `${r.productId}-${r.batchNo}-${r.branchId}`;
        if (!seen.has(k)) {
          seen.add(k);
          added++;
        }
      }
      if (rows.length < PAGE || added === 0) break;
    }
    await fetchCashierProducts();
  } catch (e) {
    console.warn("[OfflineData] download skipped:", e?.message);
  } finally {
    running = false;
  }
}

export function startOfflineDataSync() {
  if (typeof window === "undefined" || timer) return;
  window.addEventListener("online", () => downloadOfflineData());
  timer = setInterval(downloadOfflineData, REFRESH_MS);
  downloadOfflineData();
}
