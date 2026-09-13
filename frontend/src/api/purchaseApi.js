/**
 * Purchase & Goods Receiving API Client Service
 *
 * Communicates with the Express backend REST endpoints.
 * Includes graceful error handling to preserve smooth UX even if
 * backend service is offline.
 */

import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/purchases
 */
export async function fetchPurchases(params = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All Statuses") {
    query.append("status", params.status.toUpperCase().replace(" ", "_"));
  }
  if (params.search) {
    query.append("search", params.search);
  }

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/purchases${queryString}`);
}

/**
 * POST /api/purchases
 */
export async function createPurchaseOrder(poData) {
  return apiPost('/purchases', poData);
}

/**
 * PATCH /api/purchases/:id/status
 */
export async function updatePurchaseStatus(id, status) {
  return apiPut(`/purchases/${id}/status`, { status }, { method: 'PATCH' });
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
  if (params.purchaseId) query.append("purchaseId", params.purchaseId);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/goods-receipts${queryString}`);
}

/**
 * POST /api/goods-receipts
 */
export async function createGoodsReceipt(receiptData) {
  return apiPost('/goods-receipts', receiptData);
}

/**
 * PATCH /api/goods-receipts/:id/status
 */
export async function updateGoodsReceiptStatus(id, status) {
  return apiPut(`/goods-receipts/${id}/status`, { status }, { method: 'PATCH' });
}

/**
 * GET /api/suppliers
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/suppliers${queryString}`);
}

/**
 * POST /api/suppliers
 */
export async function createSupplier(supplierData) {
  return apiPost('/suppliers', supplierData);
}

/**
 * PATCH /api/suppliers/:id/status
 */
export async function updateSupplierStatus(id, status) {
  return apiPut(`/suppliers/${id}/status`, { status }, { method: 'PATCH' });
}

/**
 * PUT /api/suppliers/:id
 */
export async function updateSupplier(id, supplierData) {
  return apiPut(`/suppliers/${id}`, supplierData);
}

/**
 * DELETE /api/suppliers/:id
 */
export async function deleteSupplier(id) {
  return apiDelete(`/suppliers/${id}`);
}
