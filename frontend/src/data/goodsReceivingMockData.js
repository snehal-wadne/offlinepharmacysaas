/**
 * Mock data for Goods Receiving (GRN) Screen
 */

export const GRN_KPIS = [
  {
    id: 'grn-kpi-1',
    label: 'Shipments Received',
    value: '48',
    subtext: 'This fiscal month',
    variant: 'teal',
  },
  {
    id: 'grn-kpi-2',
    label: 'Pending Inspection',
    value: '5',
    subtext: 'Awaiting QC check',
    variant: 'amber',
  },
  {
    id: 'grn-kpi-3',
    label: 'Fully Verified',
    value: '41',
    subtext: 'Added to inventory',
    variant: 'teal',
  },
  {
    id: 'grn-kpi-4',
    label: 'Discrepancies',
    value: '2',
    subtext: 'Requires resolution',
    variant: 'red',
  },
];

export const MOCK_GRN_LIST = [
  {
    id: 'GRN-2026-089',
    poReference: 'PO-1025',
    supplier: 'Sun Pharma Care',
    receivedDate: '29 Aug 2026',
    receivedBy: 'Manager (HP)',
    itemsCount: 5,
    packagesCount: 12,
    invoiceNo: 'INV-SP-8891',
    status: 'Verified',
    branch: 'Main Branch',
  },
  {
    id: 'GRN-2026-088',
    poReference: 'PO-1024',
    supplier: 'Cipla Healthcare',
    receivedDate: '28 Aug 2026',
    receivedBy: 'Staff (AK)',
    itemsCount: 3,
    packagesCount: 6,
    invoiceNo: 'CIP-44901',
    status: 'Verified',
    branch: 'Downtown Branch',
  },
  {
    id: 'GRN-2026-087',
    poReference: 'PO-1023',
    supplier: 'Abbott Laboratories',
    receivedDate: '27 Aug 2026',
    receivedBy: 'Inventory Admin',
    itemsCount: 8,
    packagesCount: 20,
    invoiceNo: 'ABT-99231',
    status: 'Pending Inspection',
    branch: 'Main Branch',
  },
  {
    id: 'GRN-2026-086',
    poReference: 'PO-1022',
    supplier: 'GenSupply Dist.',
    receivedDate: '25 Aug 2026',
    receivedBy: 'Manager (HP)',
    itemsCount: 2,
    packagesCount: 4,
    invoiceNo: 'GS-7721',
    status: 'Verified',
    branch: 'East Clinic',
  },
  {
    id: 'GRN-2026-085',
    poReference: 'PO-1021',
    supplier: 'PharmaCo Ltd',
    receivedDate: '24 Aug 2026',
    receivedBy: 'Staff (AK)',
    itemsCount: 4,
    packagesCount: 8,
    invoiceNo: 'PH-11029',
    status: 'Discrepancy',
    branch: 'Downtown Branch',
  },
];

export const GRN_STATUS_FILTER = [
  'All Statuses',
  'Verified',
  'Pending Inspection',
  'Discrepancy',
];
