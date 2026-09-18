import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/auth/users - List users in organisation
 */
export async function fetchUsers() {
  return apiGet('/api/auth/users');
}
