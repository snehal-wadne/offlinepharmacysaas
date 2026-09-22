/**
 * Role API Client
 *
 * Thin wrappers around the backend's /api/roles endpoints
 * (routes/role.routes.js).
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./apiClient";

export const fetchRoles = () => apiGet("/api/roles");

export const fetchRoleById = (id) => apiGet(`/api/roles/${id}`);

// payload: { name, clearanceLevel, description, permissionNames? }
// clearanceLevel must be one of: ADMIN, CLINICAL_DISPENSING,
// MANAGEMENT, STANDARD_POS, AUDIT (the backend's CHECK constraint).
export const createRole = (payload) => apiPost("/api/roles", payload);

export const updateRole = (id, payload) => apiPut(`/api/roles/${id}`, payload);

export const deleteRole = (id) => apiDelete(`/api/roles/${id}`);