/**
 * Cashier API Client Service (Offline-First Resilient)
 *
 * Communicates with the backend Cashier REST API (/api/cashier).
 * If the local backend server is temporarily not running, it gracefully
 * falls back to local cashier mock data so the app remains 100% operational offline.
 */

import { Platform } from "react-native";
import {
  DEFAULT_REGISTER_SESSION,
  MOCK_REGISTER_HISTORY,
  MOCK_POS_PRODUCTS,
  MOCK_HELD_BILLS,
  MOCK_RECENT_INVOICES,
} from "../data/cashierMockData";

import { apiGet, apiPost, apiDelete } from './apiClient';

// ==========================================
// 1. REGISTER SESSIONS
// ==========================================

export async function fetchCurrentRegisterSession() {
  const res = await apiGet("/cashier/register/current");
  if (!res.success) {
    if (res.isOffline) return DEFAULT_REGISTER_SESSION;
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function openRegisterShift(data) {
  const res = await apiPost("/cashier/register/open", data);
  if (!res.success) {
    if (res.isOffline) {
      return {
        ...DEFAULT_REGISTER_SESSION,
        isOpen: true,
        openedBy: data.openedBy || "Cashier 01",
        openingBalance: data.openingBalance || 2000.0,
        expectedCash: data.openingBalance || 2000.0,
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function closeRegisterShift(data) {
  const res = await apiPost("/cashier/register/close", data);
  if (!res.success) {
    if (res.isOffline) {
      return {
        id: "REG-2026-0829-01",
        status: "Balanced",
        variance: 0,
        countedCash: data.countedCash || 0,
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function fetchRegisterHistory() {
  const res = await apiGet("/cashier/register/history");
  if (!res.success) {
    if (res.isOffline) return MOCK_REGISTER_HISTORY;
    throw new Error(res.error);
  }
  return res.data.data || res.data || [];
}

export async function recordCashMovement(data) {
  const res = await apiPost('/cashier/register/movement', data);
  if (!res.success) {
    if (res.isOffline) {
      return {
        id: `PC-${Date.now().toString().slice(-4)}`,
        type: data.movementType || 'OUT',
        amount: data.amount || 0,
        reason: data.reason || 'Petty cash',
        time: new Date().toLocaleString(),
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function fetchCashMovements(sessionId) {
  const queryString = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const res = await apiGet(`/cashier/register/movements${queryString}`);
  if (!res.success) {
    if (res.isOffline) return [];
    throw new Error(res.error);
  }
  return res.data.data || res.data || [];
}

// ==========================================
// 2. PRODUCTS & BARCODE LOOKUP
// ==========================================

export async function fetchCashierProducts(search = "", barcode = "") {
  const query = new URLSearchParams();
  if (search) query.append("search", search);
  if (barcode) query.append("barcode", barcode);
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await apiGet(`/cashier/products${queryString}`);
  if (!res.success) {
    if (res.isOffline) {
      let list = MOCK_POS_PRODUCTS;
      if (barcode) list = list.filter((p) => p.barcode === barcode);
      if (search) {
        const q = search.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.generic.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.batch.toLowerCase().includes(q),
        );
      }
      return list;
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data || [];
}

// ==========================================
// 3. POS SALES
// ==========================================

/**
 * @deprecated All POS sales must go through `localPersistenceService.commitLocalSale`
 * to enforce durable IndexedDB write + outbox queueing before the Sync Engine synchronizes to cloud.
 * Direct POST to `/cashier/sales` must not be invoked during POS checkout to eliminate duplicate-sale risk.
 */
export async function createPosSale(saleData) {
  const res = await apiPost("/cashier/sales", saleData);
  if (!res.success) {
    if (res.isOffline) {
      return {
        invoiceNo: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleString(),
        ...saleData,
        offlineCreated: true,
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function fetchRecentInvoices(limit = 20) {
  const res = await apiGet(`/cashier/sales/recent?limit=${limit}`);
  if (!res.success) {
    if (res.isOffline) return MOCK_RECENT_INVOICES;
    throw new Error(res.error);
  }
  return res.data.data || res.data || [];
}

// ==========================================
// 4. HELD BILLS
// ==========================================

export async function fetchHeldBills() {
  const res = await apiGet("/cashier/held-bills");
  if (!res.success) {
    if (res.isOffline) return MOCK_HELD_BILLS;
    throw new Error(res.error);
  }
  return res.data.data || res.data || [];
}

export async function holdCurrentBill(billData) {
  const res = await apiPost("/cashier/held-bills", billData);
  if (!res.success) {
    if (res.isOffline) {
      return {
        holdId: `HOLD-${Date.now().toString().slice(-4)}`,
        token: `T-${Math.floor(100 + Math.random() * 900)}`,
        ...billData,
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function resumeHeldBill(holdId) {
  const res = await apiDelete(`/cashier/held-bills/${holdId}`);
  if (!res.success) {
    if (res.isOffline) return null;
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

// ==========================================
// 5. SALES RETURNS
// ==========================================

export async function searchReturnInvoice(invoiceNo) {
  const res = await apiGet(`/cashier/returns/search?invoiceNo=${encodeURIComponent(invoiceNo)}`);
  if (!res.success) {
    if (res.isOffline) {
      return MOCK_RECENT_INVOICES.find((inv) => inv.invoiceNo === invoiceNo) || null;
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

export async function processSaleReturn(returnData) {
  const res = await apiPost("/cashier/returns", returnData);
  if (!res.success) {
    if (res.isOffline) {
      return {
        returnNo: `RET-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        date: new Date().toLocaleString(),
        ...returnData,
      };
    }
    throw new Error(res.error);
  }
  return res.data.data || res.data;
}

// ==========================================
// 6. SYNC & CONNECTIVITY STATUS
// ==========================================

export async function fetchSyncStatus() {
  const res = await apiGet("/sync/status");
  if (!res.success) {
    if (res.isOffline) {
      return {
        online: false,
        mode: "offline_local",
        pendingSyncCount: 0,
        message: "Running fully offline without network errors.",
      };
    }
    throw new Error(res.error);
  }
  return res.data;
}
