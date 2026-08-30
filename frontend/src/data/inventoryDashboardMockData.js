/**
 * Mock data for Master Dashboard (Screen 1)
 */

export const MOCK_KPI_DATA = [
  {
    id: 'kpi-1',
    label: 'Total Products',
    value: '1,248',
    subtext: 'Active catalogue',
    variant: 'teal',
  },
  {
    id: 'kpi-2',
    label: 'Low Stock Items',
    value: '24',
    subtext: 'Below minimum threshold',
    variant: 'amber',
  },
  {
    id: 'kpi-3',
    label: 'Near Expiry Items',
    value: '18',
    subtext: 'Expiring in 90 days',
    variant: 'blue',
  },
  {
    id: 'kpi-4',
    label: 'Expired Items',
    value: '6',
    subtext: 'Action required',
    variant: 'red',
  },
];

export const MOCK_STOCK_SUMMARY = [
  {
    category: 'Medicines',
    totalItems: 680,
    inStock: 580,
    lowStock: 18,
    outOfStock: 12,
  },
  {
    category: 'Supplements',
    totalItems: 320,
    inStock: 260,
    lowStock: 5,
    outOfStock: 8,
  },
  {
    category: 'Personal Care',
    totalItems: 180,
    inStock: 175,
    lowStock: 1,
    outOfStock: 4,
  },
  {
    category: 'Others',
    totalItems: 68,
    inStock: 60,
    lowStock: 0,
    outOfStock: 2,
  },
];

export const MOCK_PURCHASE_ORDERS = [
  {
    id: 'PO-1025',
    supplierName: 'GSK Pharmaceuticals',
    amount: '₹12,450.00',
    timeAgo: '2 hrs ago',
    status: 'Pending',
  },
  {
    id: 'PO-1024',
    supplierName: 'Micro Labs Ltd',
    amount: '₹8,200.00',
    timeAgo: '3 hrs ago',
    status: 'Received',
  },
  {
    id: 'PO-1023',
    supplierName: 'Abbott Healthcare',
    amount: '₹15,800.00',
    timeAgo: '5 hrs ago',
    status: 'Pending',
  },
];

export const MOCK_RECENT_MOVEMENTS = [
  {
    id: 'mov-1',
    date: '29 Aug 2026',
    type: 'Purchase',
    item: 'Crocin 500 (Paracetamol 500mg)',
    quantity: '+500',
    reference: 'PO-1025',
    status: 'Completed',
  },
  {
    id: 'mov-2',
    date: '29 Aug 2026',
    type: 'Sale',
    item: 'Amoxil 500 (Amoxicillin 500mg)',
    quantity: '-120',
    reference: 'INV-2401',
    status: 'Completed',
  },
  {
    id: 'mov-3',
    date: '28 Aug 2026',
    type: 'Adjustment',
    item: 'Dolo 650 (Paracetamol 650mg)',
    quantity: '-5',
    reference: 'ADJ-015',
    status: 'Approved',
  },
  {
    id: 'mov-4',
    date: '28 Aug 2026',
    type: 'Transfer',
    item: 'Brufen 400 (Ibuprofen 400mg)',
    quantity: '-100',
    reference: 'TR-001',
    status: 'In Transit',
  },
  {
    id: 'mov-5',
    date: '27 Aug 2026',
    type: 'Return',
    item: 'Cetcip 10mg (Cetirizine 10mg)',
    quantity: '+30',
    reference: 'RET-008',
    status: 'Completed',
  },
];
