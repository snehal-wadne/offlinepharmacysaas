import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

/**
 * GET /api/roles - List organisation roles with their assigned permissions
 */
export async function fetchRoles() {
  return apiGet('/api/roles');
}

/**
 * GET /api/roles/permissions - Global permission catalogue grouped by domain
 */
export async function fetchPermissions() {
  return apiGet('/api/roles/permissions');
}

/**
 * POST /api/roles - Create a role
 */
export async function createRole(roleData) {
  return apiPost('/api/roles', roleData);
}

/**
 * PUT /api/roles/:id - Update role details
 */
export async function updateRole(roleId, roleData) {
  return apiPut(`/api/roles/${roleId}`, roleData);
}

/**
 * PUT /api/roles/:id/permissions - Replace the role's assigned permissions
 */
export async function updateRolePermissions(roleId, permissionIds) {
  return apiPut(`/api/roles/${roleId}/permissions`, { permissionIds });
}

/**
 * DELETE /api/roles/:id - Delete a custom role
 */
export async function deleteRole(roleId) {
  return apiDelete(`/api/roles/${roleId}`);
}
