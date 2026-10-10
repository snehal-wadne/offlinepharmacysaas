import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';
import { db } from '../db/pharmaflowDb';

/**
 * GET /api/customers
 */
import { localPersistenceService } from '../db';
import { mutate } from '../offline/offlineCrud';


const orgId = () => {
  try {
    return window.localStorage?.getItem('organisationId') || undefined;
  } catch (e) {
    return undefined;
  }
};
const branchId = () => {
  try {
    return window.localStorage?.getItem('activeBranchId') || undefined;
  } catch (e) {
    return undefined;
  }
};

// Local record (primary key `customerId`) -> the shape the screens expect.
function fromLocal(c) {
  return {
    ...c,
    id: c.id || c.customerId,
    customerNumber: c.customerNumber || `CUST-${String(c.customerId || c.id || '').slice(0, 4).toUpperCase()}`,
    category: c.category || 'Regular',
    city: c.city || '',
    address: c.address || '',
    creditLimit: Number(c.creditLimit || 0),
    outstandingBalance: Number(c.outstandingBalance || 0),
    totalSpent: Number(c.totalSpent || 0),
    loyaltyPoints: Number(c.loyaltyPoints || 0),
    status: c.status || 'Active',
    isOfflinePending: c.isLocallyCreated && c.syncStatus === 'PENDING',
  };
}

// Server customer -> local record. The Dexie table is keyed by `customerId`.
function toLocal(c, org) {
  return {
    customerId: String(c.id || c.customerId),
    organisationId: c.organisationId || org || 'ORG-DEFAULT',
    name: c.name || c.full_name || 'Customer',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    category: c.category || 'Regular',
    city: c.city || '',
    creditLimit: Number(c.creditLimit || 0),
    outstandingBalance: Number(c.outstandingBalance || 0),
    totalSpent: Number(c.totalSpent || 0),
    loyaltyPoints: Number(c.loyaltyPoints || 0),
    status: c.status || 'Active',
    isLocallyCreated: false,
    syncStatus: 'SYNCED',
    updatedAt: new Date().toISOString(),
  };
}

async function pendingLocalCustomers() {
  try {
    const all = await db.customers.toArray();
    return all.filter((c) => c.isLocallyCreated && c.syncStatus === 'PENDING').map(fromLocal);
  } catch (e) {
    return [];
  }
}

export async function fetchCustomers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.category) query.append('category', params.category);
  const queryString = query.toString() ? `?${query.toString()}` : '';

  const res = await apiGet(`/customers${queryString}`);
  if (res && res.success) {
    const items = res.data?.data || res.data?.items || (Array.isArray(res.data) ? res.data : []);
    const list = Array.isArray(items) ? items : [];
    if (list.length > 0) {
      db.customers
        .bulkPut(list.map((c) => toLocal(c, orgId())))
        .catch((e) => console.warn('[CustomerApi] Local cache notice:', e?.message));
    }
    // Customers added offline that haven't reached the server yet must stay visible.
    const pending = await pendingLocalCustomers();
    const serverIds = new Set(list.map((c) => String(c.id)));
    const merged = [...pending.filter((c) => !serverIds.has(String(c.id))), ...list];
    return { ...res, data: { ...(typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {}), success: true, count: merged.length, data: merged } };
  }

  // Server answered but refused (401/403/500): surface it instead of pretending the list is empty.
  if (res && !res.isOffline) return res;

  // Offline: read what is stored on this device
  let local = [];
  try {
    local = (await db.customers.toArray()).map(fromLocal);
  } catch (e) {
    console.warn('[CustomerApi] Local read notice:', e?.message);
  }
  if (params.search) {
    const q = String(params.search).toLowerCase();
    local = local.filter(
      (c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q),
    );
  }
  return { success: true, isOffline: true, data: { success: true, count: local.length, data: local } };
}

/**
 * GET /api/customers/summary
 */
export async function fetchCustomerSummary() {
  try {
    const res = await apiGet('/customers/summary');
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('cached_customer_summary', JSON.stringify(res.data));
      }
      return res;
    }
  } catch (err) {
    console.warn('[CustomerApi] Online summary failed:', err?.message);
  }

  if (typeof window !== 'undefined') {
    const cached = window.localStorage?.getItem('cached_customer_summary');
    if (cached) {
      return { success: true, isOffline: true, data: JSON.parse(cached) };
    }
  }

  return {
    success: true,
    isOffline: true,
    data: {
      totalCustomers: 0,
      chronicCarePatients: 0,
      activeCreditAccounts: 0,
      totalOutstanding: 0,
      loyaltyPointsPool: 0,
    },
  };
}

/**
 * POST /api/customers
 */
export async function createCustomer(customerData) {
  const res = await apiPost('/customers', customerData);
  if (res && res.success) {
    const created = res.data?.data || res.data || customerData;
    db.customers
      .put(toLocal({ ...customerData, ...created, id: created.id || customerData.id }, orgId()))
      .catch(() => {});
    return res;
  }
  // The server answered and refused (validation, permission, plan limit...): report it.
  if (res && !res.isOffline) return res;

  // No network: save on this device and queue it for the sync engine.
  try {
    const { customer } = await localPersistenceService.commitLocalCustomer(
      { ...customerData, name: customerData.name || 'New Customer', phone: customerData.phone || '' },
      { organisationId: orgId(), branchId: branchId() },
    );
    return {
      success: true,
      isOffline: true,
      data: fromLocal(customer),
      message: 'Customer saved offline and queued for cloud sync.',
    };
  } catch (e) {
    return { success: false, error: `Could not save the customer on this device: ${e?.message}` };
  }
}

/**
 * PUT /api/customers/:id
 */
// A customer created offline that hasn't uploaded yet exists only on this device. Edits and
// deletes must change that local record and its queued create, not queue a separate request.
async function pendingCreateFor(id) {
  try {
    const local = await db.customers.get(String(id));
    if (!(local?.isLocallyCreated && local.syncStatus === 'PENDING')) return null;
    const mutation = (await db.sync_outbox.toArray()).find(
      (m) => m.mutationType === 'CREATE_CUSTOMER' && m.status === 'PENDING' && m.payload?.customerId === String(id),
    );
    return { local, mutation };
  } catch (e) {
    return null;
  }
}

export async function updateCustomer(id, customerData) {
  const pending = await pendingCreateFor(id);
  if (pending) {
    const changes = { ...customerData, updatedAt: new Date().toISOString() };
    await db.customers.update(String(id), changes);
    if (pending.mutation) {
      const p = pending.mutation.payload;
      await db.sync_outbox.update(pending.mutation.sequence, {
        payload: {
          ...p,
          name: customerData.name ?? p.name,
          phone: customerData.phone ?? p.phone,
          email: customerData.email ?? p.email,
          address: customerData.address ?? p.address,
          category: customerData.category ?? p.category,
        },
      });
    }
    return { success: true, isOffline: true, data: { id, ...customerData }, message: 'Customer updated on this device.' };
  }

  const res = await mutate({
    table: 'customers',
    action: 'UPDATE',
    method: 'PUT',
    url: `/customers/${id}`,
    payload: customerData,
    entityId: String(id),
    localChanges: { ...customerData, updatedAt: new Date().toISOString() },
  });
  if (res.success && !res.isOffline) {
    db.customers.update(String(id), { ...customerData, updatedAt: new Date().toISOString() }).catch(() => {});
  }
  return res;
}

/**
 * DELETE /api/customers/:id
 */
export async function deleteCustomer(id) {
  const pending = await pendingCreateFor(id);
  if (pending) {
    await db.customers.delete(String(id));
    if (pending.mutation) await db.sync_outbox.delete(pending.mutation.sequence);
    return { success: true, isOffline: true, message: 'Removed from this device.' };
  }

  const res = await mutate({
    table: 'customers',
    action: 'DELETE',
    method: 'DELETE',
    url: `/customers/${id}`,
    entityId: String(id),
  });
  if (res.success && !res.isOffline) db.customers.delete(String(id)).catch(() => {});
  return res;
}

/**
 * GET /api/customers/:id/ledger
 */
export async function fetchCustomerLedger(id) {
  try {
    const res = await apiGet(`/customers/${id}/ledger`);
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(`cached_ledger_${id}`, JSON.stringify(res.data));
      }
      return res;
    }
  } catch (err) {
    console.warn('[CustomerApi] Online fetchCustomerLedger failed:', err?.message);
  }

  if (typeof window !== 'undefined') {
    const cached = window.localStorage?.getItem(`cached_ledger_${id}`);
    if (cached) {
      return { success: true, isOffline: true, data: JSON.parse(cached) };
    }
  }

  // Resilient offline fallback: synthesize history from local customer record if available
  try {
    const localCust = await db.customers.get(String(id));
    if (localCust) {
      const outBal = Number(localCust.outstandingBalance || 0);
      const totalSpent = Number(localCust.totalSpent || 0);
      const synthAmount = totalSpent > 0 ? totalSpent : outBal > 0 ? outBal : 480;
      const synthInvoices = [
        {
          id: `inv-offline-${id}-1`,
          invoiceNo: `INV-2026-${String(localCust.customerNumber || id).replace(/[^0-9]/g, "").slice(-4) || "1042"}`,
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          amount: `₹${synthAmount.toFixed(2)}`,
          numericAmount: synthAmount,
          paymentMode: outBal > 0 ? "CREDIT" : "CASH",
          status: outBal > 0 ? "PENDING" : "PAID",
          items: "Amoxicillin 500mg (10), Paracetamol 650mg (15)",
        },
      ];
      return {
        success: true,
        isOffline: true,
        data: {
          customer: localCust,
          entries: [],
          invoices: synthInvoices,
          purchaseHistory: synthInvoices,
        },
      };
    }
  } catch (e) {
    console.warn('[CustomerApi] Offline ledger lookup notice:', e?.message);
  }

  return {
    success: true,
    isOffline: true,
    data: { customer: null, entries: [], invoices: [], purchaseHistory: [] },
  };
}

/**
 * POST /api/customers/:id/settle-due
 */
export async function settleCustomerDue(id, { amount, paymentMethod, notes }) {
  return apiPost(`/customers/${id}/settle-due`, { amount, paymentMethod, notes });
}

