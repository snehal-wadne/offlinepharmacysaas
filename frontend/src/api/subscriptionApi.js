import { apiGet } from './apiClient';

/**
 * GET /api/subscriptions/current - The organisation's active/pending subscription + plan
 */
export async function fetchCurrentSubscription() {
  return apiGet('/api/subscriptions/current');
}

/**
 * GET /api/superadmin/public/plans - All available subscription plans (public endpoint)
 */
export async function fetchSubscriptionPlans() {
  return apiGet('/api/superadmin/public/plans');
}
