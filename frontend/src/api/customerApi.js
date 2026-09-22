import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/customers
 */
export async function fetchCustomers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.category) query.append('category', params.category);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/customers${queryString}`);
}

/**
 * GET /api/customers/summary
 */
export async function fetchCustomerSummary() {
  return apiGet('/customers/summary');
}

/**
 * POST /api/customers
 */
export async function createCustomer(customerData) {
  return apiPost('/customers', customerData);
}

/**
 * PUT /api/customers/:id
 */
export async function updateCustomer(id, customerData) {
  return apiPut(`/customers/${id}`, customerData);
}

/**
 * DELETE /api/customers/:id
 */
export async function deleteCustomer(id) {
  return apiDelete(`/customers/${id}`);
}

/**
 * GET /api/customers/:id/ledger
 */
export async function fetchCustomerLedger(id) {
  return apiGet(`/customers/${id}/ledger`);
}

/**
 * POST /api/customers/:id/settle-due
 */
export async function settleCustomerDue(id, { amount, paymentMethod, notes }) {
  return apiPost(`/customers/${id}/settle-due`, { amount, paymentMethod, notes });
}
