/**
 * Mock data for Purchases Screen
 */

export const PURCHASES_KPIS = [
  {
    id: 'po-kpi-1',
    label: 'Total Purchases',
    value: '₹4,28,500',
    subtext: 'This fiscal month',
    variant: 'teal',
  },
  {
    id: 'po-kpi-2',
    label: 'Pending Orders',
    value: '12',
    subtext: 'Awaiting delivery',
    variant: 'amber',
  },
  {
    id: 'po-kpi-3',
    label: 'Received This Month',
    value: '36',
    subtext: 'Fully processed',
    variant: 'teal',
  },
  {
    id: 'po-kpi-4',
    label: 'Cancelled Orders',
    value: '2',
    subtext: 'Supplier out-of-stock',
    variant: 'red',
  },
];

export const MOCK_PURCHASE_ORDERS_LIST = [
  {
    id: 'PO-1025',
    supplier: 'Sun Pharma Care',
    orderDate: '29 Aug 2026',
    expectedDate: '02 Sep 2026',
    amount: '₹12,450.00',
    itemsCount: 5,
    status: 'Pending',
    branch: 'Main Branch',
    createdBy: 'Manager',
  },
  {
    id: 'PO-1024',
    supplier: 'Cipla Healthcare',
    orderDate: '28 Aug 2026',
    expectedDate: '31 Aug 2026',
    amount: '₹8,200.00',
    itemsCount: 3,
    status: 'Received',
    branch: 'Downtown Branch',
    createdBy: 'Admin',
  },
  {
    id: 'PO-1023',
    supplier: 'Abbott Laboratories',
    orderDate: '27 Aug 2026',
    expectedDate: '01 Sep 2026',
    amount: '₹15,800.00',
    itemsCount: 8,
    status: 'Pending',
    branch: 'Main Branch',
    createdBy: 'Manager',
  },
  {
    id: 'PO-1022',
    supplier: 'GenSupply Dist.',
    orderDate: '25 Aug 2026',
    expectedDate: '28 Aug 2026',
    amount: '₹6,400.00',
    itemsCount: 2,
    status: 'Received',
    branch: 'East Clinic',
    createdBy: 'Admin',
  },
  {
    id: 'PO-1021',
    supplier: 'PharmaCo Ltd',
    orderDate: '24 Aug 2026',
    expectedDate: '27 Aug 2026',
    amount: '₹9,800.00',
    itemsCount: 4,
    status: 'Approved',
    branch: 'Downtown Branch',
    createdBy: 'Manager',
  },
  {
    id: 'PO-1020',
    supplier: 'MedLife Distribution',
    orderDate: '22 Aug 2026',
    expectedDate: '25 Aug 2026',
    amount: '₹18,200.00',
    itemsCount: 6,
    status: 'Received',
    branch: 'Main Branch',
    createdBy: 'Staff',
  },
];

export const PO_STATUS_FILTER = [
  'All Statuses',
  'Pending',
  'Approved',
  'Received',
  'Partially Received',
  'Cancelled',
];
