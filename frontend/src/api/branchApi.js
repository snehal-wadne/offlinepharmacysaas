import { apiGet, apiPost, apiPut, apiDelete } from "./apiClient";

/**
 * GET /api/branches
 */
export async function fetchBranches() {
  return apiGet("/api/branches");
}

/**
 * GET /api/branches/:id
 */
export async function fetchBranchById(id) {
  return apiGet(`/api/branches/${id}`);
}

/**
 * POST /api/branches
 */
export async function createBranch(branchData) {
  return apiPost("/api/branches", branchData);
}

/**
 * PUT /api/branches/:id
 */
export async function updateBranch(id, branchData) {
  return apiPut(`/api/branches/${id}`, branchData);
}

/**
 * DELETE /api/branches/:id
 */
export async function deleteBranch(id) {
  return apiDelete(`/api/branches/${id}`);
}
