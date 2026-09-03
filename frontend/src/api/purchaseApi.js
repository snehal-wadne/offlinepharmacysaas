/**
 * Purchase & Goods Receiving API Client Service
 *
 * Communicates with the Express backend REST endpoints.
 * Includes graceful error handling to preserve smooth UX even if
 * backend service is offline.
 */

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';

import { Platform } from 'react-native';

/**
 * Helper to perform fetch with JSON body & headers
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error ${response.status}`);
    }
    return data;
  } catch (error) {
    console.warn(`[API] Request failed for ${url}:`, error.message);
    throw error;
  }
}

/**
 * GET /api/purchases
 */
export async function fetchPurchases(params = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'All Statuses') {
    query.append('status', params.status.toUpperCase().replace(' ', '_'));
  }
  if (params.search) {
    query.append('search', params.search);
  }

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/purchases${queryString}`, { method: 'GET' });
}

/**
 * POST /api/purchases
 */
export async function createPurchaseOrder(poData) {
  return apiRequest('/purchases', {
    method: 'POST',
    body: JSON.stringify(poData),
  });
}

/**
 * PATCH /api/purchases/:id/status
 */
export async function updatePurchaseStatus(id, status) {
  return apiRequest(`/purchases/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * POST /api/purchases/:id/receive
 */
export async function receivePurchaseStock(id, receiveData = {}) {
  return apiRequest(`/purchases/${id}/receive`, {
    method: 'POST',
    body: JSON.stringify(receiveData),
  });
}

/**
 * GET /api/goods-receipts
 */
export async function fetchGoodsReceipts(params = {}) {
  const query = new URLSearchParams();
  if (params.purchaseId) query.append('purchaseId', params.purchaseId);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/goods-receipts${queryString}`, { method: 'GET' });
}

/**
 * POST /api/goods-receipts
 */
export async function createGoodsReceipt(receiptData) {
  return apiRequest('/goods-receipts', {
    method: 'POST',
    body: JSON.stringify(receiptData),
  });
}

/**
 * PATCH /api/goods-receipts/:id/status
 */
export async function updateGoodsReceiptStatus(id, status) {
  return apiRequest(`/goods-receipts/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * GET /api/suppliers
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/suppliers${queryString}`, { method: 'GET' });
}

/**
 * POST /api/suppliers
 */
export async function createSupplier(supplierData) {
  return apiRequest('/suppliers', {
    method: 'POST',
    body: JSON.stringify(supplierData),
  });
}

/**
 * PATCH /api/suppliers/:id/status
 */
export async function updateSupplierStatus(id, status) {
  return apiRequest(`/suppliers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}


