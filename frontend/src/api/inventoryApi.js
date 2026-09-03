/**
 * Inventory API Client Service
 *
 * Communicates with backend REST API for inventory management and stock adjustments.
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
      throw new Error(data.error || `HTTP error ${response.status}`);
    }
    return data;
  } catch (error) {
    console.warn(`[Inventory API] Request failed for ${url}:`, error.message);
    throw error;
  }
}

/**
 * GET /api/inventory
 */
export async function fetchInventory(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/inventory${queryString}`, { method: 'GET' });
}

/**
 * POST /api/inventory
 */
export async function saveInventoryEntry(itemData) {
  return apiRequest('/inventory', {
    method: 'POST',
    body: JSON.stringify(itemData),
  });
}

/**
 * PUT /api/inventory/:id
 */
export async function updateInventoryEntry(id, itemData) {
  return apiRequest(`/inventory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(itemData),
  });
}

/**
 * DELETE /api/inventory/:id
 */
export async function deleteInventoryEntry(id) {
  return apiRequest(`/inventory/${id}`, {
    method: 'DELETE',
  });
}
