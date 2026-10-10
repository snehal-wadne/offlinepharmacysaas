/**
 * Report API Client Service
 *
 * Communicates with backend REST API for sales, inventory, profit-loss, and expiry analytics.
 */

import { apiGet } from "./apiClient";
import {
  buildOfflineInventoryReport,
  buildOfflineExpiryReport,
  buildOfflineProfitLoss,
  buildOfflineSalesReport,
  asApiResponse,
} from "../offline/offlineReports";

const cleanBranchId = (branchId) => {
  const bid =
    typeof branchId === "object" && branchId !== null ? branchId.id : branchId;
  if (
    !bid ||
    bid === "All Branches" ||
    bid === "all" ||
    bid === "No Active Branch"
  ) {
    return null;
  }
  return bid;
};

/**
 * GET /api/reports/sales
 */
export async function fetchSalesReport(params = {}) {
  const query = new URLSearchParams();
  const bid = cleanBranchId(params.branchId);
  if (bid) query.append("branchId", bid);
  if (params.startDate) query.append("startDate", params.startDate);
  if (params.endDate) query.append("endDate", params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/reports/sales${queryString}`);
  if (res.success || !res.isOffline) return res;
  // Sales screens read the report body directly (res.data.overview), so unwrap one level.
  const offline = asApiResponse(await buildOfflineSalesReport({ ...params, branchId: bid }));
  return { ...offline, data: offline.data.data };
}

/**
 * GET /api/reports/inventory
 */
export async function fetchInventoryReport(params = {}) {
  const query = new URLSearchParams();
  const bid = cleanBranchId(params.branchId);
  if (bid) query.append("branchId", bid);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/reports/inventory${queryString}`);
  if (res.success || !res.isOffline) return res;
  // Offline: build the report from the stock stored on this device
  return asApiResponse(await buildOfflineInventoryReport({ branchId: bid }));
}

/**
 * GET /api/reports/profit-loss
 */
export async function fetchProfitLossReport(params = {}) {
  const query = new URLSearchParams();
  const bid = cleanBranchId(params.branchId);
  if (bid) query.append("branchId", bid);
  if (params.startDate) query.append("startDate", params.startDate);
  if (params.endDate) query.append("endDate", params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/reports/profit-loss${queryString}`);
  if (res.success || !res.isOffline) return res;
  return asApiResponse(await buildOfflineProfitLoss({ ...params, branchId: bid }));
}

/**
 * GET /api/reports/expiry
 */
export async function fetchExpiryReport(params = {}) {
  const query = new URLSearchParams();
  const bid = cleanBranchId(params.branchId);
  if (bid) query.append("branchId", bid);
  if (params.days) query.append("days", params.days);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const res = await apiGet(`/reports/expiry${queryString}`);
  if (res.success || !res.isOffline) return res;
  return asApiResponse(await buildOfflineExpiryReport({ branchId: bid }));
}

/**
 * GET /api/reports/gst
 */
export async function fetchGstReport(params = {}) {
  const query = new URLSearchParams();
  const bid = cleanBranchId(params.branchId);
  if (bid) query.append("branchId", bid);
  if (params.startDate) query.append("startDate", params.startDate);
  if (params.endDate) query.append("endDate", params.endDate);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return apiGet(`/reports/gst${queryString}`, { offlineCache: true });
}
