/**
 * User & Staff Management API Client Service (Offline-First)
 *
 * Communicates with backend /api/auth/users endpoints.
 * Integrates Dexie local storage (db.users), sync outbox queueing, and localStorage fallback.
 */

import { apiGet, apiPost, apiPut, apiPatch } from './apiClient';
import { db } from '../db/pharmaflowDb';
import { fetchStaffMembers } from "./Staffapi";

export const fetchUsersstaff = () => fetchStaffMembers();

const CANONICAL_USERS = [
  {
    id: "usr-admin-01",
    name: "Dr. Farooq Siddiqui",
    email: "farooq@pharmaflow.com",
    role: "Owner / Admin",
    primaryBranch: "Main Pharmacy Store",
    status: "ACTIVE",
    isOwner: true,
  },
  {
    id: "usr-mgr-02",
    name: "Snehal Wadne",
    email: "snehal@pharmaflow.com",
    role: "Store Manager",
    primaryBranch: "Main Pharmacy Store",
    status: "ACTIVE",
    isOwner: false,
  },
  {
    id: "usr-cashier-03",
    name: "Harshal Pharmacist",
    email: "harshal@pharmaflow.com",
    role: "Lead Pharmacist",
    primaryBranch: "Main Pharmacy Store",
    status: "ACTIVE",
    isOwner: false,
  },
];

export async function fetchUsers() {
  try {
    const res = await apiGet('/api/auth/users');
    if (res && res.success) {
      const items = res.data?.data || res.data?.users || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(items) && items.length > 0) {
        db.users
          .bulkPut(
            items.map((u) => ({
              id: String(u.id || `usr-${Date.now()}`),
              organisationId: u.organisation_id || u.organisationId || 'ORG-DEFAULT',
              name: u.name || u.email?.split('@')[0] || 'Staff User',
              email: u.email || '',
              role: u.role || 'Staff',
              branchId: u.branchId || u.primaryBranchId || '',
              status: u.status || 'ACTIVE',
            }))
          )
          .catch((e) => console.warn('[UserApi] Dexie cache notice:', e?.message));

        if (typeof window !== 'undefined') {
          window.localStorage?.setItem('cached_users', JSON.stringify(items));
        }
      }
      return res;
    }
  } catch (err) {
    console.warn('[UserApi] Online fetchUsers failed, reading local database:', err?.message);
  }

  // Resilient Offline Fallback
  try {
    const localUsers = await db.users.toArray();
    if (localUsers && localUsers.length > 0) {
      const mapped = localUsers.map((u) => ({
        ...u,
        primaryBranch: 'Main Pharmacy Store',
      }));
      return {
        success: true,
        isOffline: true,
        data: { data: mapped, users: mapped },
      };
    }

    if (typeof window !== 'undefined') {
      const cached = window.localStorage?.getItem('cached_users');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            success: true,
            isOffline: true,
            data: { data: parsed, users: parsed },
          };
        }
      }
    }
  } catch (offlineErr) {
    console.warn('[UserApi] Offline fallback error:', offlineErr?.message);
  }

  // Seed canonical users into Dexie
  db.users
    .bulkPut(
      CANONICAL_USERS.map((u) => ({
        id: u.id,
        organisationId: 'ORG-DEFAULT',
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
      }))
    )
    .catch(() => {});

  return {
    success: true,
    isOffline: true,
    data: { data: CANONICAL_USERS, users: CANONICAL_USERS },
  };
}

export async function createUser(userData) {
  const localId = `usr-local-${Date.now()}`;
  const localUser = {
    id: localId,
    organisationId: userData.organisationId || 'ORG-DEFAULT',
    name: userData.name || userData.email?.split('@')[0] || 'New Staff',
    email: userData.email || '',
    role: userData.role || 'Pharmacist',
    branchId: userData.branchId || '',
    status: 'ACTIVE',
    primaryBranch: 'Main Pharmacy Store',
  };

  try {
    await db.users.put(localUser);
    await db.sync_outbox.add({
      table: 'users',
      action: 'INSERT',
      entityId: localId,
      payload: userData,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[UserApi] Offline save notice:', e?.message);
  }

  try {
    const res = await apiPost('/api/auth/users', userData);
    if (res && res.success) return res;
  } catch (err) {
    console.warn('[UserApi] Online createUser failed, saved offline:', err?.message);
  }

  return {
    success: true,
    isOffline: true,
    data: localUser,
    message: 'User created offline and queued for cloud sync.',
  };
}

export async function updateUser(userId, userData) {
  try {
    await db.users.update(String(userId), { ...userData }).catch(() => {});
    await db.sync_outbox.add({
      table: 'users',
      action: 'UPDATE',
      entityId: String(userId),
      payload: userData,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
  } catch (e) {}

  try {
    const res = await apiPut(`/api/auth/users/${userId}`, userData);
    if (res && res.success) return res;
  } catch (err) {}

  return {
    success: true,
    isOffline: true,
    data: { id: userId, ...userData },
  };
}

export async function updateUserStatus(userId, status) {
  try {
    await db.users.update(String(userId), { status }).catch(() => {});
  } catch (e) {}

  try {
    return await apiPatch(`/api/auth/users/${userId}/status`, { status });
  } catch (err) {
    return { success: true, isOffline: true, data: { id: userId, status } };
  }
}
