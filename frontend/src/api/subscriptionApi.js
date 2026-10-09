import { apiGet } from './apiClient';
import { db } from '../db/pharmaflowDb';

export const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    id: 'plan-starter',
    tier_code: 'STARTER',
    name: 'Starter ERP',
    price: 1499,
    billing_interval: 'MONTH',
    features: [
      'Single Store POS & Thermal Billing',
      'Up to 2,000 Inventory Medicine SKUs',
      'Basic Customer Directory & Ledger',
      'Real-time Offline Sales Persistence',
      'Barcode Scanner & Receipt Printing',
      'Standard Email & In-App Support',
    ],
    is_popular: false,
  },
  {
    id: 'plan-growth',
    tier_code: 'GROWTH',
    name: 'Growth ERP',
    price: 2999,
    billing_interval: 'MONTH',
    features: [
      'Multi-Branch Architecture & Store Switching',
      'Unlimited Inventory & Batch Tracking (Expiry Alert)',
      'Purchase Orders & Supplier Notification Portal',
      'Schedule H1 & Narcotics Register Compliance',
      'Full Audit Trail & Role-Based Security Vault',
      'Comprehensive Reports with CSV & PDF Export',
      'Priority 24/7 Phone & WhatsApp Support',
    ],
    is_popular: true,
  },
  {
    id: 'plan-enterprise',
    tier_code: 'ENTERPRISE',
    name: 'Enterprise ERP',
    price: 5999,
    billing_interval: 'MONTH',
    features: [
      'Unlimited Pharmacy Branches & Central Warehouses',
      'Inter-Store Stock Transfers with Dispatch Approval',
      'Advanced Cash Drawer Float & Shift Register Reconciliation',
      'Custom GxP / Schedule M Regulatory Compliance Audit',
      'Custom ERP API Webhooks & Dedicated Database Failover',
      'Dedicated Account Manager & SLA Guarantee',
    ],
    is_popular: false,
  },
];

export const DEFAULT_CURRENT_SUBSCRIPTION = {
  id: 'sub-active-license',
  plan_id: 'plan-growth',
  plan_name: 'Growth ERP',
  status: 'ACTIVE',
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  pharmacy_gstin: '27AABCU9603R1ZM',
  sac_code: '998313',
  gst_rate: 18,
};

/**
 * GET /api/subscriptions/current - The organisation's active/pending subscription + plan
 */
export async function fetchCurrentSubscription() {
  try {
    const res = await apiGet('/api/subscriptions/current');
    if (res && res.success && res.data) {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('cached_current_subscription', JSON.stringify(res.data));
      }
      return res;
    }
  } catch (err) {
    console.warn('[SubscriptionApi] Online fetchCurrentSubscription failed:', err?.message);
  }

  // Resilient offline fallback
  if (typeof window !== 'undefined') {
    const cached = window.localStorage?.getItem('cached_current_subscription');
    if (cached) {
      try {
        return { success: true, isOffline: true, data: JSON.parse(cached) };
      } catch (e) {}
    }
  }

  return {
    success: true,
    isOffline: true,
    data: DEFAULT_CURRENT_SUBSCRIPTION,
  };
}

/**
 * GET /api/superadmin/public/plans - All available subscription plans (public endpoint)
 */
export async function fetchSubscriptionPlans() {
  try {
    const res = await apiGet('/api/superadmin/public/plans');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      db.subscription_plans
        .bulkPut(
          res.data.map((p) => ({
            id: String(p.id),
            tierCode: p.tier_code || p.tierCode || 'TIER',
            name: p.name || 'SaaS Plan',
            price: Number(p.price || 0),
            billingInterval: p.billing_interval || 'MONTH',
            features: Array.isArray(p.features) ? p.features : [],
            isPopular: Boolean(p.is_popular),
            createdAt: new Date().toISOString(),
          }))
        )
        .catch((e) => console.warn('[SubscriptionApi] Dexie cache notice:', e?.message));

      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('cached_subscription_plans', JSON.stringify(res.data));
      }
      return res;
    }
  } catch (err) {
    console.warn('[SubscriptionApi] Online fetchSubscriptionPlans failed:', err?.message);
  }

  // Resilient offline fallback: Try Dexie -> localStorage -> Canonical Defaults
  try {
    const localPlans = await db.subscription_plans.toArray();
    if (localPlans && localPlans.length > 0) {
      return {
        success: true,
        isOffline: true,
        data: localPlans.map((p) => ({
          id: p.id,
          tier_code: p.tierCode,
          name: p.name,
          price: p.price,
          billing_interval: p.billingInterval,
          features: p.features,
          is_popular: p.isPopular,
        })),
      };
    }

    if (typeof window !== 'undefined') {
      const cached = window.localStorage?.getItem('cached_subscription_plans');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, isOffline: true, data: parsed };
        }
      }
    }
  } catch (offlineErr) {
    console.warn('[SubscriptionApi] Offline fallback error:', offlineErr?.message);
  }

  // Persist canonical default plans so next offline read finds them in Dexie
  db.subscription_plans
    .bulkPut(
      DEFAULT_SUBSCRIPTION_PLANS.map((p) => ({
        id: p.id,
        tierCode: p.tier_code,
        name: p.name,
        price: p.price,
        billingInterval: p.billing_interval,
        features: p.features,
        isPopular: p.is_popular,
        createdAt: new Date().toISOString(),
      }))
    )
    .catch(() => {});

  if (typeof window !== 'undefined') {
    window.localStorage?.setItem('cached_subscription_plans', JSON.stringify(DEFAULT_SUBSCRIPTION_PLANS));
  }

  return {
    success: true,
    isOffline: true,
    data: DEFAULT_SUBSCRIPTION_PLANS,
  };
}
