import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/auth/users - List users in organisation
 */

import { fetchStaffMembers } from "./Staffapi";

export const fetchUsersstaff = () => fetchStaffMembers();

export async function fetchUsers() {
  return apiGet('/api/auth/users');
}
