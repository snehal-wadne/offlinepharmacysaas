import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { Pharmacy } from './types';

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

type SuperAdminContextValue = {
  pharmacies: Pharmacy[];
  activePharmacies: Pharmacy[];
  expiringPharmacies: Pharmacy[];
  expiredPharmacies: Pharmacy[];
  addPharmacy: (pharmacy: Pharmacy) => void;
  updatePharmacy: (id: string, changes: Partial<Pharmacy>) => void;
  getPharmacy: (id: string) => Pharmacy | undefined;
};

const SuperAdminContext = createContext<SuperAdminContextValue | null>(null);

export function SuperAdminProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pharmacies, setPharmacies] =
    useState<Pharmacy[]>(INITIAL_PHARMACIES);

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

      addPharmacy: (pharmacy) => {
        setPharmacies((current) => [...current, pharmacy]);

        // Backend integration:
        // Replace this local update with POST /api/super-admin/pharmacies.
      },

      updatePharmacy: (id, changes) => {
        setPharmacies((current) =>
          current.map((pharmacy) =>
            pharmacy.id === id
              ? { ...pharmacy, ...changes }
              : pharmacy,
          ),
        );

        // Backend integration:
        // Replace this local update with PATCH /api/super-admin/pharmacies/:id.
      },

      getPharmacy: (id) =>
        pharmacies.find((pharmacy) => pharmacy.id === id),
    }),
    [pharmacies],
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
