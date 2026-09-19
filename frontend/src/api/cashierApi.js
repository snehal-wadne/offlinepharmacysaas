/**
 * Cashier API Client Service
 *
 * Communicates with the backend Cashier REST API (/api/cashier).
 * Fully data-driven; empty or error states produce empty/error responses without fake fallbacks.
 */

import { apiGet, apiPost, apiDelete } from "./apiClient";

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

  const res = await apiGet(`/cashier/products${queryString}`);
  if (!res.success) {
    return [];
  }
  const list = res.data?.data || res.data?.products || res.data || [];
  console.log("Products List: ", list);
  return Array.isArray(list) ? list : [];
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

export async function fetchRecentInvoices(limit = 20) {
  const res = await apiGet(`/cashier/sales/recent?limit=${limit}`);
  if (!res.success) {
    return [];
  }
  const list = res.data?.data || res.data || [];
  return Array.isArray(list) ? list : [];
}

// ==========================================
// 4. HELD BILLS
// ==========================================

export async function fetchHeldBills() {
  const res = await apiGet("/cashier/held-bills");
  if (!res.success) {
    return [];
  }
  const list = res.data?.data || res.data || [];
  console.log("Held bills: ", list);
  return Array.isArray(list) ? list : [];
}

export async function holdCurrentBill(billData) {
  const res = await apiPost("/cashier/held-bills", billData);
  if (!res.success) {
    throw new Error(res.error || "Failed to hold bill");
  }
  return res.data?.data || res.data;
}

export async function resumeHeldBill(holdId) {
  const res = await apiDelete(`/cashier/held-bills/${holdId}`);
  if (!res.success) {
    return null;
  }
  return res.data?.data || res.data;
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
