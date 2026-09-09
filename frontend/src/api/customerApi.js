import { Platform } from 'react-native';

const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-organisation-id': 'c206390c-2dae-41e5-a698-bf8259a73912',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error.message);
    throw error;
  }
}

/**
 * GET /api/customers
 */
export async function fetchCustomers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.category) query.append('category', params.category);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/customers${queryString}`, { method: 'GET' });
}

/**
 * GET /api/customers/summary
 */
export async function fetchCustomerSummary() {
  return apiRequest('/customers/summary', { method: 'GET' });
}

/**
 * POST /api/customers
 */
export async function createCustomer(customerData) {
  return apiRequest('/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  });
}

/**
 * PUT /api/customers/:id
 */
export async function updateCustomer(id, customerData) {
  return apiRequest(`/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(customerData),
  });
}

/**
 * DELETE /api/customers/:id
 */
export async function deleteCustomer(id) {
  return apiRequest(`/customers/${id}`, {
    method: 'DELETE',
  });
}
