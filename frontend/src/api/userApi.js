/**
 * User & Staff Management API Client Service (Offline-First)
 *
 * Reads: server when reachable (cached in db.users), otherwise the local copy, always
 *        including staff created offline that haven't uploaded yet.
 * Writes: server first; with no network the change is stored locally and queued.
 */

import { apiGet } from './apiClient';
import { db } from '../db/pharmaflowDb';
import { fetchStaffMembers } from "./Staffapi";
import { mutate, newLocalId, pendingLocalRows } from '../offline/offlineCrud';

export const fetchUsersstaff = () => fetchStaffMembers();

const orgId = () => {
  try {
    return window.localStorage?.getItem('organisationId') || 'ORG-DEFAULT';
  } catch (e) {
    return 'ORG-DEFAULT';
  }
};

const unwrap = (body) =>
  Array.isArray(body) ? body : body?.data || body?.users || body?.items || [];

export async function fetchUsers() {
  const res = await apiGet('/api/auth/users');

  if (res && res.success) {
    const items = unwrap(res.data);
    const pending = await pendingLocalRows('users');
    try {
      const serverIds = new Set(items.map((u) => String(u.id)));
      const pendingIds = new Set(pending.map((u) => u.id));
      const stale = (await db.users.toArray())
        .filter((u) => !serverIds.has(u.id) && !pendingIds.has(u.id))
        .map((u) => u.id);
      if (stale.length) await db.users.bulkDelete(stale);
      if (items.length) {
        await db.users.bulkPut(
          items.map((u) => ({
            ...u,
            id: String(u.id),
            organisationId: u.organisation_id || u.organisationId || orgId(),
            branchId: u.branchId || u.primaryBranchId || '',
          })),
        );
      }
    } catch (e) {
      console.warn('[UserApi] Local cache notice:', e?.message);
    }
    const merged = [...pending, ...items];
    const data = Array.isArray(res.data) ? merged : { ...res.data, count: merged.length, data: merged };
    return { ...res, data };
  }

  if (res && !res.isOffline) return res;

  let local = [];
  try {
    local = await db.users.toArray();
  } catch (e) {
    console.warn('[UserApi] Local read notice:', e?.message);
  }
  const pendingIds = new Set((await pendingLocalRows('users')).map((u) => u.id));
  local = local.map((u) => ({ ...u, isOfflinePending: pendingIds.has(u.id) }));
  return { success: true, isOffline: true, data: { success: true, count: local.length, data: local } };
}

async function branchNameFor(branchId) {
  if (!branchId) return 'Main Branch';
  try {
    const b = await db.branches.get(String(branchId));
    return b?.name || 'Main Branch';
  } catch (e) {
    return 'Main Branch';
  }
}

export async function createUser(userData) {
  const localId = newLocalId('usr');
  const localRecord = {
    id: localId,
    organisationId: userData.organisationId || orgId(),
    name: userData.name || userData.email?.split('@')[0] || 'New Staff',
    email: userData.email || '',
    phone: userData.phone || '',
    role: userData.roleName || userData.role || 'Staff',
    role_id: userData.roleId || null,
    branchId: userData.branchId || '',
    primaryBranch: await branchNameFor(userData.branchId),
    status: 'ACTIVE',
  };
  return mutate({
    table: 'users',
    action: 'INSERT',
    method: 'POST',
    url: '/api/auth/users',
    payload: userData,
    entityId: localId,
    localRecord,
  });
}

export async function updateUser(userId, userData) {
  const changes = { ...userData };
  if (userData.branchId) changes.primaryBranch = await branchNameFor(userData.branchId);
  const res = await mutate({
    table: 'users',
    action: 'UPDATE',
    method: 'PUT',
    url: `/api/auth/users/${userId}`,
    payload: userData,
    entityId: String(userId),
    localChanges: changes,
  });
  if (res.success && !res.isOffline) db.users.update(String(userId), changes).catch(() => {});
  return res;
}

export async function updateUserStatus(userId, status) {
  const res = await mutate({
    table: 'users',
    action: 'UPDATE',
    method: 'PATCH',
    url: `/api/auth/users/${userId}/status`,
    payload: { status },
    entityId: String(userId),
    localChanges: { status },
  });
  if (res.success && !res.isOffline) db.users.update(String(userId), { status }).catch(() => {});
  return res;
}
