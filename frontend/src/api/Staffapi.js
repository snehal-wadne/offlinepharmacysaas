/**
 * Staff API Client
 *
 * Thin wrappers around the backend's /api/staff endpoints
 * (routes/staff.routes.js).
 */

import { apiGet, apiPost, apiPut } from "./apiClient";

export const fetchStaffMembers = () => apiGet("/api/staff");

// payload: { email, name, phone?, roleId, branchId,
//            professionalRegistrationNumber?, workingShift? }
export const inviteStaffMember = (payload) => apiPost("/api/staff/invite", payload);

// status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
export const updateStaffStatus = (membershipId, status) =>
  apiPut(`/api/staff/${membershipId}/status`, { status });

export const resendInvite = (membershipId) =>
  apiPost(`/api/staff/${membershipId}/resend-invite`);

// Public endpoint — used on the "set your password" screen the
// invited person lands on, before they have signed in, so it does
// not depend on an authenticated session.
export const acceptInvite = (token, password) =>
  apiPost("/api/staff/accept-invite", { token, password });