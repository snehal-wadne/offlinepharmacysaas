/**
 * Audit API Client Service
 *
 * Communicates with backend REST API for GxP/HIPAA compliance audit events.
 */

import { apiGet } from './apiClient';

/**
 * GET /api/audit-logs
 */
export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId && params.branchId !== 'All Branches') query.append('branchId', params.branchId);
  if (params.search) query.append('search', params.search);
  if (params.entityType) query.append('entityType', params.entityType);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiGet(`/audit-logs${queryString}`);
}
