/**
 * Tax & GST API Client Service (Offline-First Resilient)
 *
 * Communicates with backend REST API (/api/taxes).
 * Falls back gracefully to local mock data if server is offline.
 */

import { Platform } from 'react-native';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';

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
      throw new Error(data.message || data.error || `HTTP error ${response.status}`);
    }
    return data;
  } catch (error) {
    console.warn(`[Tax API] Network request failed for ${url}:`, error.message);
    throw error;
  }
}

/**
 * GET /api/taxes - Fetch all tax slabs
 */
export async function fetchTaxes() {
  try {
    const res = await apiRequest('/taxes', { method: 'GET' });
    return res.data || [];
  } catch {
    return null;
  }
}

/**
 * POST /api/taxes - Create new tax slab
 */
export async function createTax(taxData) {
  try {
    const res = await apiRequest('/taxes', {
      method: 'POST',
      body: JSON.stringify(taxData),
    });
    return res.data;
  } catch (err) {
    console.warn('[Tax API] createTax fallback:', err.message);
    return {
      id: `tax-local-${Date.now()}`,
      ...taxData,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * PUT /api/taxes/:id - Update existing tax slab
 */
export async function updateTax(id, taxData) {
  try {
    const res = await apiRequest(`/taxes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(taxData),
    });
    return res.data;
  } catch (err) {
    console.warn('[Tax API] updateTax fallback:', err.message);
    return { id, ...taxData };
  }
}

/**
 * PATCH /api/taxes/:id/status - Toggle tax slab active/applied status
 */
export async function toggleTaxStatus(id, isActive) {
  try {
    const res = await apiRequest(`/taxes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive, isApplied: isActive }),
    });
    return res.data;
  } catch (err) {
    console.warn('[Tax API] toggleTaxStatus fallback:', err.message);
    return { id, is_active: isActive };
  }
}

/**
 * DELETE /api/taxes/:id - Delete tax slab
 */
export async function deleteTax(id) {
  try {
    const res = await apiRequest(`/taxes/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  } catch (err) {
    console.warn('[Tax API] deleteTax fallback:', err.message);
    return { id, deleted: true };
  }
}

/**
 * GET /api/taxes/branch-gst/:branchId - Fetch GST configuration
 */
export async function fetchBranchGst(branchId = 'main') {
  try {
    const res = await apiRequest(`/taxes/branch-gst/${branchId}`, { method: 'GET' });
    return res.data;
  } catch {
    return null;
  }
}

/**
 * PUT /api/taxes/branch-gst/:branchId - Update GST configuration
 */
export async function updateBranchGst(branchId = 'main', gstData) {
  try {
    const res = await apiRequest(`/taxes/branch-gst/${branchId}`, {
      method: 'PUT',
      body: JSON.stringify(gstData),
    });
    return res.data;
  } catch (err) {
    console.warn('[Tax API] updateBranchGst fallback:', err.message);
    return gstData;
  }
}
