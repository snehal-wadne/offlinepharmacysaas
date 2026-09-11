import { Platform } from 'react-native';

const API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:5000/api/superadmin'
    : 'http://localhost:5000/api/superadmin';

// Default platform token for superadmin clearance
let superadminToken = 'pf_platform_default_dev';

export function setSuperadminToken(token: string) {
  superadminToken = token;
}

export function getSuperadminToken(): string {
  return superadminToken;
}

async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${superadminToken}`,
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
    const data = await response.json().catch(() => ({}));
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
  billingCycle?: 'MONTHLY' | 'YEARLY';
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
