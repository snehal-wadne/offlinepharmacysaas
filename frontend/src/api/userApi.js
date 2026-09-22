import { apiGet, apiPost, apiPut, apiPatch } from './apiClient';

/**
 * GET /api/auth/users - List users in organisation
 */

import { fetchStaffMembers } from "./Staffapi";

export const fetchUsersstaff = () => fetchStaffMembers();

export async function fetchUsers() {
  return apiGet('/api/auth/users');
}

/**
 * POST /api/auth/users - Invite / create a staff member
 */
export async function createUser(userData) {
  return apiPost('/api/auth/users', userData);
}

/**
 * PUT /api/auth/users/:id - Update a staff member's profile/role/branch
 */
export async function updateUser(userId, userData) {
  return apiPut(`/api/auth/users/${userId}`, userData);
}

/**
 * PATCH /api/auth/users/:id/status - Activate or deactivate a staff member
 */
export async function updateUserStatus(userId, status) {
  return apiPatch(`/api/auth/users/${userId}/status`, { status });
}
