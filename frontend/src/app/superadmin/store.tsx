import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { Pharmacy, PharmacyStatus, PlanName } from './types';
import {
  fetchDashboardActivity,
  fetchDashboardCharts,
  fetchDashboardMetrics,
  fetchPharmacies,
  updatePharmacyStatus as apiUpdatePharmacyStatus,
} from '../../api/superadminApi';

function mapBackendPharmacy(item: any): Pharmacy {
  const name = item.name || 'Pharmacy';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PH';

  let status: PharmacyStatus = 'Active';
  const stUpper = String(item.status || '').toUpperCase();
  if (stUpper === 'DEACTIVATED' || stUpper === 'SUSPENDED') {
    status = 'Deactivated';
  } else if (stUpper === 'PENDING_PAYMENT' || stUpper === 'PENDING PAYMENT') {
    status = 'Pending Payment';
  } else if (item.expiry_date) {
    const expiry = new Date(item.expiry_date).getTime();
    const now = Date.now();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) {
      status = 'Expired';
    } else if (daysLeft <= 30) {
      status = 'Expiring Soon';
    } else {
      status = 'Active';
    }
  }

  let expiryFormatted = '01 Sep 2027';
  if (item.expiry_date) {
    try {
      const d = new Date(item.expiry_date);
      expiryFormatted = d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      expiryFormatted = String(item.expiry_date);
    }
  }

  return {
    id: item.pharmacy_code || item.id,
    name,
    initials,
    adminName: item.admin_name || 'Admin',
    email: item.email || '',
    plan: (item.plan_name as PlanName) || 'Professional',
    usersUsed: Number(item.users_count || 0),
    userLimit: Number(item.max_users || 50),
    branches: Number(item.branches_count || 1),
    expiryDate: expiryFormatted,
    status,
    phone: item.phone,
    address: item.address,
    city: item.city,
    state: item.state,
    pincode: item.pincode,
    gstNumber: item.gst_number,
    businessType: item.business_type || 'Private Limited',
  };
}

export type DashboardMetrics = {
  totalPharmacies: number;
  activeSubscriptions: number;
  expiringSoon: number;
  expiredSubscriptions: number;
  monthlyRevenue: number;
  totalUsersUsed: number;
  totalUserLimit: number;
};

export type DashboardCharts = {
  statusDistribution?: {
    active: number;
    expiringSoon: number;
    expired: number;
    deactivated: number;
  };
  trend?: Array<{ month: string; month_key: string; count: number }>;
  topPlans?: Array<{ plan_name: string; color_hex: string; subscriber_count: number; total_revenue: number }>;
};

type SuperAdminContextValue = {
  pharmacies: Pharmacy[];
  activePharmacies: Pharmacy[];
  expiringPharmacies: Pharmacy[];
  expiredPharmacies: Pharmacy[];
  metrics: DashboardMetrics | null;
  charts: DashboardCharts | null;
  activity: any[];
  isLoading: boolean;
  loadError: string | null;
  addPharmacy: (pharmacy: Pharmacy) => void;
  updatePharmacy: (id: string, changes: Partial<Pharmacy>) => void;
  getPharmacy: (id: string) => Pharmacy | undefined;
  refreshPharmacies: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
};

const SuperAdminContext = createContext<SuperAdminContextValue | null>(null);

export function SuperAdminProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshPharmacies = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchPharmacies({ limit: 100 });
      if (res && res.success && Array.isArray(res.data)) {
        setPharmacies(res.data.map(mapBackendPharmacy));
        setLoadError(null);
      } else {
        throw new Error(res?.error || 'Failed to load pharmacies from the server.');
      }
    } catch (err: any) {
      console.warn('Could not fetch pharmacies from backend:', err);
      setLoadError(err?.message || 'Failed to load pharmacies from the server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const [mRes, aRes, cRes] = await Promise.all([
        fetchDashboardMetrics().catch(() => null),
        fetchDashboardActivity().catch(() => null),
        fetchDashboardCharts().catch(() => null),
      ]);

      if (mRes && mRes.success && mRes.data) {
        setMetrics({
          totalPharmacies: mRes.data.totalPharmacies ?? mRes.data.total_pharmacies ?? 0,
          activeSubscriptions: mRes.data.activeSubscriptions ?? mRes.data.active_subscriptions ?? 0,
          expiringSoon: mRes.data.expiringSoon ?? mRes.data.expiring_soon ?? 0,
          expiredSubscriptions: mRes.data.expiredSubscriptions ?? mRes.data.expired_subscriptions ?? 0,
          monthlyRevenue: Number(mRes.data.monthlySaasRevenue ?? mRes.data.monthly_revenue ?? 0),
          totalUsersUsed: Number(mRes.data.totalSaasUsers ?? mRes.data.total_users_used ?? 0),
          totalUserLimit: Number(mRes.data.totalUserLimit ?? mRes.data.total_user_limit ?? 0),
        });
      }

      if (aRes && aRes.success && Array.isArray(aRes.data)) {
        setActivity(aRes.data);
      }

      if (cRes && cRes.success && cRes.data) {
        setCharts(cRes.data);
      }
    } catch (err) {
      console.warn('Dashboard data fetch error:', err);
    }
  }, []);

  useEffect(() => {
    refreshPharmacies();
    refreshDashboard();
  }, [refreshPharmacies, refreshDashboard]);

  const value = useMemo<SuperAdminContextValue>(
    () => ({
      pharmacies,
      activePharmacies: pharmacies.filter(
        (pharmacy) => pharmacy.status === 'Active',
      ),
      expiringPharmacies: pharmacies.filter(
        (pharmacy) => pharmacy.status === 'Expiring Soon',
      ),
      expiredPharmacies: pharmacies.filter(
        (pharmacy) => pharmacy.status === 'Expired',
      ),
      metrics,
      charts,
      activity,
      isLoading,
      loadError,

      addPharmacy: (pharmacy) => {
        setPharmacies((current) => [pharmacy, ...current]);
      },

      updatePharmacy: async (id, changes) => {
        setPharmacies((current) =>
          current.map((pharmacy) =>
            pharmacy.id === id ? { ...pharmacy, ...changes } : pharmacy,
          ),
        );

        // If status changed, notify backend
        if (changes.status) {
          const backendStatus =
            changes.status === 'Deactivated'
              ? 'DEACTIVATED'
              : changes.status === 'Active'
              ? 'ACTIVE'
              : changes.status === 'Pending Payment'
              ? 'PENDING_PAYMENT'
              : 'ACTIVE';

          try {
            await apiUpdatePharmacyStatus(id, backendStatus);
          } catch (err) {
            console.error('Failed to sync status update to backend:', err);
          }
        }
      },

      getPharmacy: (id) =>
        pharmacies.find((pharmacy) => pharmacy.id === id),

      refreshPharmacies,
      refreshDashboard,
    }),
    [pharmacies, metrics, activity, isLoading, loadError, refreshPharmacies, refreshDashboard],
  );

  return (
    <SuperAdminContext.Provider value={value}>
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const context = useContext(SuperAdminContext);

  if (!context) {
    throw new Error(
      'useSuperAdmin must be used inside SuperAdminProvider',
    );
  }

  return context;
}

