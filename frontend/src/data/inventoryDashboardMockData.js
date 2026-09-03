/**
 * Mock data for Master Admin Dashboard (Matching POS UI Reference)
 */

export const DASHBOARD_KPIS = [
  {
    id: 'kpi-sales',
    title: 'Total Sales',
    value: '₹1,24,560.00',
    trend: '+12.5% vs yesterday',
    trendPositive: true,
    icon: '🛒',
    iconBg: '#ECFDF5',
    iconColor: '#0F766E',
    sparklineColor: '#10B981',
    sparklinePoints: [18, 25, 20, 32, 28, 42, 38],
  },
  {
    id: 'kpi-orders',
    title: 'Total Orders',
    value: '236',
    trend: '+8.2% vs yesterday',
    trendPositive: true,
    icon: '📦',
    iconBg: '#EFF6FF',
    iconColor: '#2563EB',
    sparklineColor: '#3B82F6',
    sparklinePoints: [12, 18, 15, 24, 20, 28, 30],
  },
  {
    id: 'kpi-customers',
    title: 'Total Customers',
    value: '1,842',
    trend: '+6.8% vs yesterday',
    trendPositive: true,
    icon: '👥',
    iconBg: '#FAF5FF',
    iconColor: '#7C3AED',
    sparklineColor: '#8B5CF6',
    sparklinePoints: [10, 14, 12, 19, 16, 23, 27],
  },
  {
    id: 'kpi-profit',
    title: 'Total Profit',
    value: '₹32,540.00',
    trend: '+9.1% vs yesterday',
    trendPositive: true,
    icon: '$',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    sparklineColor: '#F59E0B',
    sparklinePoints: [8, 13, 11, 17, 15, 21, 24],
  },
];

export const SALES_OVERVIEW_DATA = [
  { day: 'Mon', value: 18200, label: '₹18.2k' },
  { day: 'Tue', value: 24500, label: '₹24.5k' },
  { day: 'Wed', value: 19800, label: '₹19.8k' },
  { day: 'Thu', value: 28600, label: '₹28.6k' },
  { day: 'Fri', value: 22400, label: '₹22.4k' },
  { day: 'Sat', value: 32100, label: '₹32.1k' },
  { day: 'Sun', value: 26800, label: '₹26.8k' },
];

export const PAYMENT_METHODS_DATA = [
  {
    id: 'cash',
    name: 'Cash',
    percentage: 62,
    amount: '₹77,213.00',
    color: '#0F766E',
  },
  {
    id: 'upi',
    name: 'UPI',
    percentage: 21,
    amount: '₹26,110.00',
    color: '#8B5CF6',
  },
  {
    id: 'card',
    name: 'Card',
    percentage: 13,
    amount: '₹16,432.00',
    color: '#EC4899',
  },
  {
    id: 'other',
    name: 'Other',
    percentage: 4,
    amount: '₹4,772.00',
    color: '#3B82F6',
  },
];

export const QUICK_ACCESS_BUTTONS = [
  { id: 'new-sale', label: 'New Sale', icon: '🛒', route: 'stock-adjustments' },
  { id: 'held-bills', label: 'Held Bills', icon: '⏸️', route: 'stock-adjustments' },
  { id: 'cash-register', label: 'Cash Register', icon: '🏬', route: 'stock-adjustments' },
  { id: 'current-stock', label: 'Current Stock', icon: '📦', route: 'stock-adjustments' },
  { id: 'purchases', label: 'Purchases', icon: '💳', route: 'purchases' },
  { id: 'reports', label: 'Reports', icon: '📊', route: 'inventory-reports' },
];

export const PERMISSION_OVERVIEW_ROWS = [
  {
    id: 'role-admin',
    role: 'Admin / Owner',
    users: 2,
    accessLevel: 'Full Access (All Pages)',
    status: 'Active',
  },
  {
    id: 'role-inv-mgr',
    role: 'Inventory Manager',
    users: 3,
    accessLevel: 'Inventory + Reports',
    status: 'Active',
  },
  {
    id: 'role-cashier',
    role: 'Cashier',
    users: 4,
    accessLevel: 'Sales + Customers + Register',
    status: 'Active',
  },
];

// Preserved for legacy components if needed
export const MOCK_KPI_DATA = [
  {
    id: 'kpi-1',
    label: 'Total Products',
    value: '1,420',
    subtext: '+24 new this month',
    variant: 'teal',
  },
  {
    id: 'kpi-2',
    label: 'Low Stock Alerts',
    value: '28',
    subtext: 'Requires reorder soon',
    variant: 'amber',
  },
  {
    id: 'kpi-3',
    label: 'Near Expiry (< 60d)',
    value: '14',
    subtext: 'Discount or return',
    variant: 'blue',
  },
  {
    id: 'kpi-4',
    label: 'Expired Stock',
    value: '3',
    subtext: 'Pending disposal/return',
    variant: 'red',
  },
];

export const MOCK_STOCK_SUMMARY = [
  {
    id: 'cat-1',
    category: 'Antibiotics & Antibacterials',
    totalItems: 340,
    inStock: 310,
    lowStock: 22,
    outOfStock: 8,
  },
  {
    id: 'cat-2',
    category: 'Pain Relief & Analgesics',
    totalItems: 285,
    inStock: 260,
    lowStock: 18,
    outOfStock: 7,
  },
  {
    id: 'cat-3',
    category: 'Cardiovascular & Hypertension',
    totalItems: 195,
    inStock: 182,
    lowStock: 10,
    outOfStock: 3,
  },
  {
    id: 'cat-4',
    category: 'Vitamins & Dietary Supplements',
    totalItems: 240,
    inStock: 225,
    lowStock: 12,
    outOfStock: 3,
  },
  {
    id: 'cat-5',
    category: 'Dermatologicals & Skincare',
    totalItems: 160,
    inStock: 152,
    lowStock: 6,
    outOfStock: 2,
  },
  {
    id: 'cat-6',
    category: 'Respiratory & Anti-Allergy',
    totalItems: 210,
    inStock: 198,
    lowStock: 9,
    outOfStock: 3,
  },
];

export const MOCK_PURCHASE_ORDERS = [
  {
    id: 'PO-2026-1025',
    rawId: 'po-1',
    supplierName: 'Sun Pharma Care Ltd',
    amount: '₹34,800.00',
    timeAgo: '2 hours ago',
  },
  {
    id: 'PO-2026-1024',
    rawId: 'po-2',
    supplierName: 'Cipla Healthcare',
    amount: '₹18,450.00',
    timeAgo: '5 hours ago',
  },
  {
    id: 'PO-2026-1023',
    rawId: 'po-3',
    supplierName: 'Dr. Reddy\'s Laboratories',
    amount: '₹42,100.00',
    timeAgo: '1 day ago',
  },
  {
    id: 'PO-2026-1022',
    rawId: 'po-4',
    supplierName: 'Mankind Pharma Ltd',
    amount: '₹9,650.00',
    timeAgo: '2 days ago',
  },
  {
    id: 'PO-2026-1021',
    rawId: 'po-5',
    supplierName: 'Torrent Pharmaceuticals',
    amount: '₹15,200.00',
    timeAgo: '3 days ago',
  },
];

export const MOCK_RECENT_MOVEMENTS = [
  {
    id: 'mov-1',
    date: '03 Sep 2026, 14:20',
    type: 'Purchase',
    item: 'Amoxicillin 500mg Strips',
    quantity: '+100',
    reference: 'PO-1025',
    status: 'Completed',
  },
  {
    id: 'mov-2',
    date: '03 Sep 2026, 13:45',
    type: 'Sale',
    item: 'Paracetamol 650mg Tabs',
    quantity: '-20',
    reference: 'INV-8821',
    status: 'Completed',
  },
  {
    id: 'mov-3',
    date: '03 Sep 2026, 11:15',
    type: 'Transfer',
    item: 'Azithromycin 250mg Tabs',
    quantity: '-30',
    reference: 'TR-0412',
    status: 'In Transit',
  },
  {
    id: 'mov-4',
    date: '02 Sep 2026, 17:30',
    type: 'Adjustment',
    item: 'Cough Syrup 100ml Bottle',
    quantity: '-5',
    reference: 'ADJ-019',
    status: 'Approved',
  },
  {
    id: 'mov-5',
    date: '02 Sep 2026, 15:10',
    type: 'Purchase',
    item: 'Omeprazole 20mg Capsules',
    quantity: '+250',
    reference: 'PO-1023',
    status: 'Completed',
  },
  {
    id: 'mov-6',
    date: '02 Sep 2026, 10:05',
    type: 'Return',
    item: 'Cetirizine 10mg Tabs',
    quantity: '+10',
    reference: 'RET-005',
    status: 'Completed',
  },
];
