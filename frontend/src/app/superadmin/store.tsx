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

const INITIAL_PHARMACIES: Pharmacy[] = [
  {
    id: 'PH-001',
    name: 'Falah Pharmacy',
    initials: 'FP',
    adminName: 'Abhinav Khan',
    email: 'abhinav@falah.com',
    plan: 'Custom',
    usersUsed: 34,
    userLimit: 40,
    branches: 3,
    expiryDate: '01 Sep 2027',
    status: 'Active',
    phone: '+91 98765 43210',
    address: 'No. 12, Residency Road, Bangalore - 560001',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    gstNumber: '29ABCDE1234F1Z5',
    businessType: 'Private Limited',
  },
  {
    id: 'PH-002',
    name: 'City Medico',
    initials: 'CM',
    adminName: 'Sora Sravan',
    email: 'sravan@citymedico.com',
    plan: 'Basic',
    usersUsed: 2,
    userLimit: 5,
    branches: 1,
    expiryDate: '12 Jun 2026',
    status: 'Active',
    phone: '+91 98765 43211',
    businessType: 'Private Limited',
  },
  {
    id: 'PH-003',
    name: 'HealthCare Pharmacy',
    initials: 'HC',
    adminName: 'Rahman Ali',
    email: 'rahman@healthcare.com',
    plan: 'Professional',
    usersUsed: 48,
    userLimit: 50,
    branches: 5,
    expiryDate: '03 Sep 2026',
    status: 'Expiring Soon',
    phone: '+91 98765 43212',
    businessType: 'Private Limited',
  },
  {
    id: 'PH-004',
    name: 'Sunrise Medicos',
    initials: 'SM',
    adminName: 'Neha Verma',
    email: 'neha@sunrisemed.com',
    plan: 'Standard',
    usersUsed: 18,
    userLimit: 20,
    branches: 2,
    expiryDate: '15 Mar 2027',
    status: 'Active',
    phone: '+91 98765 43213',
    businessType: 'Private Limited',
  },
  {
    id: 'PH-005',
    name: 'LifeCare Pharmacy',
    initials: 'LH',
    adminName: 'Imran Siddiqui',
    email: 'imran@lifecare.com',
    plan: 'Custom',
    usersUsed: 9,
    userLimit: 10,
    branches: 1,
    expiryDate: '20 Aug 2023',
    status: 'Expired',
    phone: '+91 98765 43214',
    businessType: 'Private Limited',
  },
];

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
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>(INITIAL_PHARMACIES);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshPharmacies = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetchPharmacies({ limit: 100 });
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        const livePharmacies = res.data.map(mapBackendPharmacy);
        setPharmacies(livePharmacies);
      }
    } catch (err) {
      console.warn('Could not fetch pharmacies from backend, using current state:', err);
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
    [pharmacies, metrics, activity, isLoading, refreshPharmacies, refreshDashboard],
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

