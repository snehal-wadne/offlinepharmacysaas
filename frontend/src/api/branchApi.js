import { apiGet, apiPost, apiPut ,apiDelete} from "./apiClient";

/**
 * GET /api/branches
 */



/**
 * DELETE /api/branches/:id
 */
export async function deleteBranch(id) {
  return apiDelete(`/api/branches/${id}`);
}

/**
 * Branch API Client
 *
 * Thin wrappers around the backend's /api/branches endpoints
 * (routes/branch.routes.js). Follows the same calling convention
 * already used elsewhere in the app: apiGet/apiPost/apiPut all
 * resolve to { success, data, error, isOffline }.
 */



export const fetchBranches = (params = {}) => {
  const hasParams = params.limit !== undefined || params.offset !== undefined;
  const query = hasParams ? `?${new URLSearchParams(params).toString()}` : "";
  return apiGet(`/api/branches${query}`);
};

export const fetchBranchById = (id) => apiGet(`/api/branches/${id}`);

export const createBranch = (payload) => apiPost("/api/branches", payload);

export const updateBranch = (id, payload) => apiPut(`/api/branches/${id}`, payload);

// Status is a separate endpoint on the backend — the generic
// updateBranch() call above does NOT change status, so toggling
// active/inactive must go through this function.
export const updateBranchStatus = (id, status) =>
  apiPut(`/api/branches/${id}/status`, { status });
