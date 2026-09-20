/**
 * Purchase & Goods Receiving API Client Service
 *
 * Communicates with the Express backend REST endpoints.
 * Includes graceful error handling to preserve smooth UX even if
 * backend service is offline.
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./apiClient";

/**
 * GET /api/purchases
 */
export async function fetchPurchases(params = {}) {
  const query = new URLSearchParams();
  const rawBranch =
    typeof params.branchId === "object" && params.branchId !== null
      ? params.branchId.id || params.branchId.name
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
  return apiGet(`/purchases${queryString}`);
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
  return apiPost(`/purchases/${id}/receive`, receiveData);
}

/**
 * GET /api/goods-receipts
 */
export async function fetchGoodsReceipts(params = {}) {
  const query = new URLSearchParams();
  const rawBranch =
    typeof params.branchId === "object" && params.branchId !== null
      ? params.branchId.id || params.branchId.name
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
  return apiGet(`/api/goods-receipts${queryString}`);
}

/**
 * POST /api/goods-receipts
 */
export async function createGoodsReceipt(receiptData) {
  return apiPost("/api/goods-receipts", receiptData);
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
  return apiGet(`/api/suppliers${queryString}`);
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
