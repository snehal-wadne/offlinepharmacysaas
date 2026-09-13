/**
 * Tax & GST API Client Service (Offline-First Resilient)
 *
 * Communicates with backend REST API (/api/taxes).
 * Falls back gracefully to local mock data if server is offline.
 */

import { apiGet, apiPost, apiPut, apiDelete, apiRequest } from './apiClient';

/**
 * GET /api/taxes - Fetch all tax slabs
 */
export async function fetchTaxes() {
  const res = await apiGet('/taxes');
  return res.success ? (res.data.data || res.data || []) : null;
}

/**
 * POST /api/taxes - Create new tax slab
 */
export async function createTax(taxData) {
  const res = await apiPost('/taxes', taxData);
  if (!res.success) {
    return { success: false, isOffline: res.isOffline, error: res.error };
  }
  return res.data.data || res.data;
}

/**
 * PUT /api/taxes/:id - Update existing tax slab
 */
export async function updateTax(id, taxData) {
  const res = await apiPut(`/taxes/${id}`, taxData);
  if (!res.success) {
    return { success: false, isOffline: res.isOffline, error: res.error };
  }
  return res.data.data || res.data;
}

/**
 * PATCH /api/taxes/:id/status - Toggle tax slab active/applied status
 */
export async function toggleTaxStatus(id, isActive) {
  const res = await apiRequest(`/taxes/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive, isApplied: isActive }),
  });
  if (!res.success) {
    return { success: false, isOffline: res.isOffline, error: res.error };
  }
  return res.data.data || res.data;
}

/**
 * DELETE /api/taxes/:id - Delete tax slab
 */
export async function deleteTax(id) {
  const res = await apiDelete(`/taxes/${id}`);
  if (!res.success) {
    return { success: false, isOffline: res.isOffline, error: res.error };
  }
  return res.data.data || res.data;
}

/**
 * GET /api/taxes/branch-gst/:branchId - Fetch GST configuration
 */
export async function fetchBranchGst(branchId = 'main') {
  const res = await apiGet(`/taxes/branch-gst/${branchId}`);
  return res.success ? (res.data.data || res.data) : null;
}

/**
 * PUT /api/taxes/branch-gst/:branchId - Update GST configuration
 */
export async function updateBranchGst(branchId = 'main', gstData) {
  const res = await apiPut(`/taxes/branch-gst/${branchId}`, gstData);
  if (!res.success) {
    return { success: false, isOffline: res.isOffline, error: res.error };
  }
  return res.data.data || res.data;
}
