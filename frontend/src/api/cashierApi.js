/**
 * Cashier API Client Service
 *
 * Communicates with the backend Cashier REST API (/api/cashier).
 * Fully data-driven; empty or error states produce empty/error responses without fake fallbacks.
 */

import { apiGet, apiPost, apiDelete } from "./apiClient";
import { localPersistenceService } from "../db";

// ==========================================
// 1. REGISTER SESSIONS
// ==========================================

export async function fetchCurrentRegisterSession(branchId) {
  const query = new URLSearchParams();
  const bid =
    typeof branchId === "object" && branchId !== null ? branchId.id : branchId;
  if (
    bid &&
    bid !== "All Branches" &&
    bid !== "all" &&
    bid !== "No Active Branch"
  ) {
    query.append("branchId", bid);
  }
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/cashier/register/current${qs}`);
  if (!res.success) {
    return null;
  }

  return res.data?.data || res.data || null;
}

export async function openRegisterShift(data) {
  const res = await apiPost("/cashier/register/open", data);
  if (!res.success) {
    throw new Error(res.error || "Failed to open register shift");
  }
  return res.data?.data || res.data;
}

export async function closeRegisterShift(data) {
  const res = await apiPost("/cashier/register/close", data);
  if (!res.success) {
    throw new Error(res.error || "Failed to close register shift");
  }
  return res.data?.data || res.data;
}

export async function fetchRegisterHistory(branchId) {
  const query = new URLSearchParams();
  const bid =
    typeof branchId === "object" && branchId !== null ? branchId.id : branchId;
  if (
    bid &&
    bid !== "All Branches" &&
    bid !== "all" &&
    bid !== "No Active Branch"
  ) {
    query.append("branchId", bid);
  }
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/cashier/register/history${qs}`);
  if (!res.success) {
    return [];
  }

  return res.data?.data || res.data || [];
}

export async function recordCashMovement(data) {
  const res = await apiPost("/cashier/register/movement", data);
  if (!res.success) {
    throw new Error(res.error || "Failed to record cash movement");
  }
  return res.data?.data || res.data;
}

export async function fetchCashMovements(sessionId, branchId) {
  const query = new URLSearchParams();
  if (sessionId) query.append("sessionId", sessionId);
  const bid =
    typeof branchId === "object" && branchId !== null ? branchId.id : branchId;
  if (
    bid &&
    bid !== "All Branches" &&
    bid !== "all" &&
    bid !== "No Active Branch"
  ) {
    query.append("branchId", bid);
  }
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/cashier/register/movements${queryString}`);
  if (!res.success) {
    return [];
  }

  return res.data?.data || res.data || [];
}

// ==========================================
// 2. PRODUCTS & BARCODE LOOKUP
// ==========================================

export async function fetchCashierProducts(
  search = "",
  barcode = "",
  branchId = "",
) {
  const query = new URLSearchParams();
  if (search) query.append("search", search);
  if (barcode) query.append("barcode", barcode);
  const bid =
    typeof branchId === "object" && branchId !== null ? branchId.id : branchId;
  if (
    bid &&
    bid !== "All Branches" &&
    bid !== "all" &&
    bid !== "No Active Branch"
  ) {
    query.append("branchId", bid);
  }
  const queryString = query.toString() ? `?${query.toString()}` : "";

  let orgId = "ORG-DEFAULT";
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      orgId = window.localStorage.getItem("organisationId") || "ORG-DEFAULT";
    }
  } catch (_) {}

  try {
    const res = await apiGet(`/cashier/products${queryString}`);
    if (res && res.success) {
      const list = res.data?.data || res.data?.products || res.data || [];
      if (Array.isArray(list) && list.length > 0) {
        // Cache products into IndexedDB for offline resilience asynchronously
        localPersistenceService
          .seedInitialCatalog(orgId, bid || "BRANCH-MAIN", list)
          .catch((e) => console.warn("[CashierApi] Seed catalog notice:", e?.message));
        return list;
      }
    }
  } catch (err) {
    console.warn("[CashierApi] Online fetch failed, loading offline catalog:", err?.message);
  }

  // Fallback to IndexedDB local catalog
  try {
    const cached = await localPersistenceService.getCatalogForPos(
      orgId,
      bid || "BRANCH-MAIN",
    );
    if (Array.isArray(cached) && cached.length > 0) {
      let filtered = cached;
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            (p.name && String(p.name).toLowerCase().includes(s)) ||
            (p.brand && String(p.brand).toLowerCase().includes(s)) ||
            (p.brandName && String(p.brandName).toLowerCase().includes(s)) ||
            (p.generic && String(p.generic).toLowerCase().includes(s)) ||
            (p.genericName && String(p.genericName).toLowerCase().includes(s)) ||
            (p.barcode && String(p.barcode).toLowerCase().includes(s)) ||
            (p.sku && String(p.sku).toLowerCase().includes(s)),
        );
      }
      if (barcode) {
        const b = barcode.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            (p.barcode && String(p.barcode).toLowerCase() === b) ||
            (p.sku && String(p.sku).toLowerCase() === b),
        );
      }
      return filtered;
    }
  } catch (offlineErr) {
    console.warn("[CashierApi] Offline catalog lookup notice:", offlineErr?.message);
  }

  return [];
}

// ==========================================
// 3. POS SALES
// ==========================================

export async function createPosSale(saleData) {
  const res = await apiPost("/cashier/sales", saleData);
  if (!res.success) {
    throw new Error(res.error || "Failed to complete POS sale");
  }
  return res.data?.data || res.data;
}

export async function fetchRecentInvoices(limit = 20, branchFilter = "") {
  const wantedBranch =
    typeof branchFilter === "object" && branchFilter !== null ? branchFilter.id : branchFilter;
  const branchQuery =
    wantedBranch && !["All Branches", "all", "No Active Branch"].includes(wantedBranch)
      ? `&branchId=${encodeURIComponent(wantedBranch)}`
      : "";
  let orgId = "ORG-DEFAULT";
  let branchId = "BRANCH-MAIN";
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      orgId = window.localStorage.getItem("organisationId") || "ORG-DEFAULT";
      branchId = window.localStorage.getItem("activeBranchId") || "BRANCH-MAIN";
    }
  } catch (_) {}

  try {
    const res = await apiGet(`/cashier/sales/recent?limit=${limit}${branchQuery}`);
    if (res && res.success) {
      const list = res.data?.data || res.data || [];
      if (Array.isArray(list)) {
        // Sales made on this device that haven't uploaded yet must be listed too.
        let pending = [];
        try {
          const local = await localPersistenceService.getRecentInvoices(wantedBranch || branchId, limit, orgId);
          const have = new Set(list.map((i) => i.invoiceNo || i.invoiceNumber));
          pending = local.filter((i) => i.syncStatus === "PENDING" && !have.has(i.invoiceNo));
        } catch (_) {}
        if (list.length > 0 || pending.length > 0) {
          return [...pending, ...list].slice(0, Math.max(limit, pending.length));
        }
      }
    }
  } catch (err) {
    console.warn("[CashierApi] Online invoices fetch failed, checking offline cache:", err?.message);
  }

  try {
    const localInvs = await localPersistenceService.getRecentInvoices(
      wantedBranch || branchId,
      limit,
      orgId,
    );
    if (Array.isArray(localInvs) && localInvs.length > 0) {
      return localInvs;
    }
  } catch (offlineErr) {
    console.warn("[CashierApi] Offline invoices lookup notice:", offlineErr?.message);
  }

  return [];
}

// ==========================================
// 4. HELD BILLS
// ==========================================

export async function fetchHeldBills() {
  const res = await apiGet("/cashier/held-bills");
  if (res && res.success) {
    const list = res.data?.data || res.data || [];
    return Array.isArray(list) ? list : [];
  }
  // Offline or refused: drafts parked on this device are kept by the POS context itself.
  return [];
}

export async function holdCurrentBill(billData) {
  return saveHeldBill(billData);
}

export async function resumeHeldBill(holdId) {
  try {
    const res = await apiDelete(`/cashier/held-bills/${holdId}`);
    if (res && res.success) {
      return res.data?.data || res.data;
    }
  } catch (err) {
    console.warn("[CashierApi] Online resume bill notice:", err?.message);
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem("pharma_held_bills");
      if (raw) {
        const list = JSON.parse(raw).filter(
          (b) => b.holdId !== holdId && b.billNo !== holdId,
        );
        window.localStorage.setItem("pharma_held_bills", JSON.stringify(list));
      }
    }
  } catch (_) {}
  return { success: true };
}

// Tries to store the draft on the server once. Never throws: when the server can't take it
// (offline, refused) the caller keeps the draft on this device instead.
export async function saveHeldBill(billData) {
  try {
    const res = await apiPost("/cashier/held-bills", billData);
    if (res && res.success) {
      const body = res.data?.data || res.data || {};
      return { ...body, synced: true };
    }
    return { synced: false, error: res?.error };
  } catch (err) {
    console.warn("[CashierApi] Held bill not saved to server:", err?.message);
    return { synced: false, error: err?.message };
  }
}

/** Remove a draft from the server once it is paid or discarded (best effort). */
export async function removeHeldBillRemote(holdId) {
  try {
    await apiDelete(`/cashier/held-bills/${encodeURIComponent(holdId)}`);
  } catch (e) {}
}

// ==========================================
// 5. SALES RETURNS
// ==========================================

export async function searchReturnInvoice(invoiceNo) {
  const res = await apiGet(
    `/cashier/returns/search?invoiceNo=${encodeURIComponent(invoiceNo)}`,
  );
  if (!res.success) {
    return null;
  }
  return res.data?.data || res.data || null;
}

export async function processSaleReturn(returnData) {
  const res = await apiPost("/cashier/returns", returnData);
  if (!res.success) {
    throw new Error(res.error || "Failed to process sale return");
  }
  return res.data?.data || res.data;
}

// ==========================================
// 6. SYNC & CONNECTIVITY STATUS
// ==========================================

export async function fetchSyncStatus() {
  const res = await apiGet("/sync/status");
  if (!res.success) {
    return {
      online: false,
      mode: "offline",
      pendingSyncCount: 0,
      message: "Sync status currently offline.",
    };
  }
  return res.data;
}
