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
export const MOCK_KPI_DATA = DASHBOARD_KPIS;
