import { Platform } from 'react-native';
import { getAccessToken } from './supabaseClient';

const API_ROOT =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000');
const API_BASE_URL = `${API_ROOT.replace(/\/$/, '')}/api/superadmin`;

let customSuperadminToken: string | null = null;

export function setSuperadminToken(token: string) {
  customSuperadminToken = token;
}

export function getSuperadminToken(): string | null {
  return customSuperadminToken;
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const token = customSuperadminToken || (await getAccessToken());

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
  };

  try {
    const response = await fetch(url, config);
    let data;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    return data;
  } catch (error: any) {
    console.error(`Superadmin API Error (${endpoint}):`, error.message);
    throw error;
  }
}

// ------------------------------------------------------------
// AUTH / PROFILE
// ------------------------------------------------------------

export async function fetchSuperadminMe() {
  return apiRequest('/auth/me', { method: 'GET' });
}

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------

export async function fetchDashboardMetrics() {
  return apiRequest('/dashboard/metrics', { method: 'GET' });
}

export async function fetchDashboardCharts() {
  return apiRequest('/dashboard/charts', { method: 'GET' });
}

export async function fetchDashboardActivity() {
  return apiRequest('/dashboard/activity', { method: 'GET' });
}

// ------------------------------------------------------------
// PHARMACIES / TENANTS
// ------------------------------------------------------------

export async function fetchPharmacies(params: {
  search?: string;
  status?: string;
  plan?: string;
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.status && params.status !== 'All Status') query.append('status', params.status);
  if (params.plan && params.plan !== 'All Plans') query.append('plan', params.plan);
  if (params.page) query.append('page', String(params.page));
  if (params.limit) query.append('limit', String(params.limit));

  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/pharmacies${qs}`, { method: 'GET' });
}

export async function fetchPharmacyDetail(id: string) {
  return apiRequest(`/pharmacies/${id}`, { method: 'GET' });
}

export async function provisionPharmacy(data: {
  name: string;
  adminName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  businessType?: string;
  planId?: string;
  planName?: string;
  branches?: number;
  billingCycle?: 'MONTHLY' | 'ANNUAL' | 'YEARLY';
}) {
  return apiRequest('/pharmacies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePharmacyStatus(
  id: string,
  status: 'ACTIVE' | 'DEACTIVATED' | 'SUSPENDED' | 'PENDING_PAYMENT',
) {
  return apiRequest(`/pharmacies/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function renewSubscription(id: string, data: { planId?: string; billingCycle?: string }) {
  return apiRequest(`/pharmacies/${id}/renew`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function upgradeSubscriptionPlan(id: string, data: { newPlanId: string; billingCycle?: string }) {
  return apiRequest(`/pharmacies/${id}/upgrade-plan`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ------------------------------------------------------------
// PLANS
// ------------------------------------------------------------

export async function fetchSubscriptionPlans(activeOnly = false) {
  const qs = activeOnly ? '?activeOnly=true' : '';
  return apiRequest(`/plans${qs}`, { method: 'GET' });
}

export async function fetchSubscriptionPlan(id: string) {
  return apiRequest(`/plans/${id}`, { method: 'GET' });
}

// ------------------------------------------------------------
// PAYMENTS & RAZORPAY CHECKOUT
// ------------------------------------------------------------

export async function fetchPayments(params: {
  search?: string;
  status?: string;
  month?: string;
  date?: string;
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.status && params.status !== 'All Status') query.append('status', params.status);
  if (params.month && params.month !== 'ALL') query.append('month', params.month);
  if (params.date) query.append('date', params.date);
  if (params.page) query.append('page', String(params.page));
  if (params.limit) query.append('limit', String(params.limit));

  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/payments${qs}`, { method: 'GET' });
}

export async function createPaymentOrder(data: {
  organisationId: string;
  subscriptionId?: string;
  planId?: string;
  billingCycle?: 'MONTHLY' | 'YEARLY';
}) {
  return apiRequest('/payments/create-order', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function verifyPayment(data: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  return apiRequest('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function processRefund(paymentId: string, data: { amount?: number; reason?: string }) {
  return apiRequest(`/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ------------------------------------------------------------
// INVOICES
// ------------------------------------------------------------

export async function fetchPharmacyInvoices(pharmacyId: string) {
  return apiRequest(`/pharmacies/${pharmacyId}/invoices`, { method: 'GET' });
}

/**
 * Downloads an invoice PDF and saves it to the user's device.
 * On web this triggers a normal browser file download.
 */
export async function downloadInvoicePdf(invoiceId: string, filename?: string) {
  const url = `${API_BASE_URL}/invoices/${invoiceId}/pdf`;
  const token = customSuperadminToken || (await getAccessToken());

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = `Failed to download invoice (status ${response.status}).`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || `${invoiceId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    return;
  }

  throw new Error('Invoice download is currently only supported on web.');
}
