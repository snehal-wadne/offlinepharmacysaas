/**
 * Audit API Client Service
 *
 * Communicates with backend REST API for GxP/HIPAA compliance audit events.
 */

import { apiGet, apiPost } from "./apiClient";

/**
 * GET /api/audit-logs
 */
export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams();
  const rawBranch =
    typeof params.branchId === "object" && params.branchId !== null
      ? params.branchId.id
      : params.branchId;
  if (
    rawBranch &&
    rawBranch !== "All Branches" &&
    rawBranch !== "all" &&
    rawBranch !== "No Active Branch"
  ) {
    query.append("branchId", rawBranch);
  }
  if (params.search) query.append("search", params.search);
  if (params.entityType) query.append("entityType", params.entityType);
  if (params.limit) query.append("limit", params.limit);
  if (params.offset) query.append("offset", params.offset);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return apiGet(`/audit-logs${queryString}`);
}

/**
 * POST /api/audit-logs
 */
export async function createAuditLog(data) {
  return apiPost("/audit-logs", data);
}

