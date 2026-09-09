export type PlanName =
  | 'Basic'
  | 'Standard'
  | 'Professional'
  | 'Enterprise'
  | 'Custom';

export type PharmacyStatus =
  | 'Active'
  | 'Expiring Soon'
  | 'Expired'
  | 'Deactivated';

export type Pharmacy = {
  id: string;
  name: string;
  initials: string;
  adminName: string;
  email: string;
  plan: PlanName;
  usersUsed: number;
  userLimit: number;
  branches: number;
  expiryDate: string;
  status: PharmacyStatus;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  businessType?: string;
};
