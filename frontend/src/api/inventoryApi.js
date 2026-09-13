/**
 * Inventory API Client Service
 *
 * Communicates with backend REST API for inventory management and stock adjustments.
 */

import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/inventory
 */
export async function fetchInventory(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/inventory${queryString}`);
}

/**
 * GET /api/inventory/summary
 */
export async function fetchInventorySummary(params = {}) {
  const query = new URLSearchParams();
  if (params?.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/inventory/summary${queryString}`);
}

/**
 * GET /api/inventory/movements
 */
export async function fetchStockMovements(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.append('limit', params.limit);
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/inventory/movements${queryString}`);
}

/**
 * POST /api/inventory/movements
 */
export async function recordStockMovementApi(movementData) {
  return apiPost('/inventory/movements', movementData);
}

/**
 * POST /api/inventory
 */
export async function saveInventoryEntry(itemData) {
  return apiPost('/inventory', itemData);
}

/**
 * PUT /api/inventory/:id
 */
export async function updateInventoryEntry(id, itemData) {
  return apiPut(`/inventory/${id}`, itemData);
}

/**
 * DELETE /api/inventory/:id
 */
export async function deleteInventoryEntry(id) {
  return apiDelete(`/inventory/${id}`);
}

/**
 * GET /api/inventory/:id/barcode
 * Generates barcode data, SVG representation, and printable thermal HTML
 */
export async function fetchItemBarcode(id) {
  return apiGet(`/inventory/${id}/barcode`);
}

