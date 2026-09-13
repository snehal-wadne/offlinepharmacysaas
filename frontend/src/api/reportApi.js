/**
 * Report API Client Service
 *
 * Communicates with backend REST API for sales, inventory, profit-loss, and expiry analytics.
 */

import { apiGet } from './apiClient';

/**
 * GET /api/reports/sales
 */
export async function fetchSalesReport(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/reports/sales${queryString}`);
}

/**
 * GET /api/reports/inventory
 */
export async function fetchInventoryReport(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/reports/inventory${queryString}`);
}

/**
 * GET /api/reports/profit-loss
 */
export async function fetchProfitLossReport(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/reports/profit-loss${queryString}`);
}

/**
 * GET /api/reports/expiry
 */
export async function fetchExpiryReport(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  if (params.days) query.append('days', params.days);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/reports/expiry${queryString}`);
}

/**
 * GET /api/reports/gst
 */
export async function fetchGstReport(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/reports/gst${queryString}`);
}
