/**
 * Frontend UI & Domain Constants
 *
 * Presentation options, domain filters, status options, and RBAC matrix definitions.
 * Contains NO business data records (no fake customers, products, invoices, or transactions).
 */

// --- Branches & Management ---
export const BRANCH_TYPES = [
  "Retail Dispensary",
  "Hospital Pharmacy",
  "Central Medical Warehouse",
  "Clinic Dispensary",
  "Outpatient Pharmacy",
  "Compounding Pharmacy",
];

export const USER_ROLES_FILTER = [
  "All Roles",
  "Admin / Owner",
  "Pharmacist",
  "Cashier / Billing",
  "Inventory Manager",
  "Store Manager",
];

export const BRANCH_FILTER_OPTIONS = ["All Branches"];

// --- Roles & RBAC System Roles Definition ---
export const SYSTEM_ROLES_LIST = [
  {
    id: "role-admin",
    name: "Admin / Owner",
    code: "ADMIN",
    description:
      "Complete unrestricted access to all pharmacy operations, financial ledgers, settings, and multi-branch management.",
    isSystem: true,
    userCount: 1,
    permissionsCount: 45,
    badgeColor: "#0F766E",
    clearanceLevel: "Full Authority",
  },
  {
    id: "role-pharmacist",
    name: "Pharmacist",
    code: "PHARMACIST",
    description:
      "Licensed to verify prescriptions, dispense Schedule H/X drugs, record batch numbers, and adjust stock counts.",
    isSystem: true,
    userCount: 1,
    permissionsCount: 28,
    badgeColor: "#2563EB",
    clearanceLevel: "Clinical Dispensing",
  },
  {
    id: "role-cashier",
    name: "Cashier / Billing",
    code: "CASHIER",
    description:
      "Operates POS billing terminal, accepts split payments, issues thermal invoices, and manages daily cash register drawer.",
    isSystem: true,
    userCount: 1,
    permissionsCount: 12,
    badgeColor: "#16A34A",
    clearanceLevel: "Standard POS",
  },
  {
    id: "role-manager",
    name: "Store Manager",
    code: "MANAGER",
    description:
      "Oversees daily branch shift operations, approves purchase orders, processes goods receipt notes, and oversees transfers.",
    isSystem: true,
    userCount: 1,
    permissionsCount: 34,
    badgeColor: "#7C3AED",
    clearanceLevel: "Store Operations",
  },
];

export const PERMISSION_GROUPS = [
  {
    id: "grp-pos",
    name: "Point of Sale & Billing",
    permissions: [
      {
        id: "pos.create_invoice",
        name: "Create & Print Invoices",
        description: "Dispense medicines and issue final bills",
      },
      {
        id: "pos.discount",
        name: "Apply Custom Discounts",
        description: "Apply bill-level discounts above 10%",
      },
      {
        id: "pos.returns",
        name: "Process Sales Returns",
        description: "Accept medicine returns and issue cash/credit refunds",
      },
      {
        id: "pos.reprint",
        name: "Reprint Past Receipts",
        description: "Reprint duplicate receipts for audited transactions",
      },
    ],
  },
  {
    id: "grp-inventory",
    name: "Inventory & Drug Control",
    permissions: [
      {
        id: "inv.view",
        name: "View Stock & Batches",
        description: "Check quantities, MRP, and expiry dates across racks",
      },
      {
        id: "inv.adjust",
        name: "Stock Adjustments",
        description: "Write-off expired stock or rectify inventory counts",
      },
      {
        id: "inv.transfer",
        name: "Inter-Branch Transfers",
        description: "Dispatch and accept stock transferred between branches",
      },
      {
        id: "inv.h_drugs",
        name: "Dispense Schedule H / X Drugs",
        description: "Requires entering patient identity and doctor Reg No",
      },
    ],
  },
  {
    id: "grp-procurement",
    name: "Procurement & Vendors",
    permissions: [
      {
        id: "po.create",
        name: "Create Purchase Orders",
        description: "Draft order requests to pharmaceutical distributors",
      },
      {
        id: "po.grn",
        name: "Inspect Goods Receipts (GRN)",
        description: "Receive consignments and verify batches against invoices",
      },
      {
        id: "po.suppliers",
        name: "Manage Supplier Directory",
        description: "Add, edit, or block supplier contracts and credit terms",
      },
    ],
  },
  {
    id: "grp-finance",
    name: "Financials & Reports",
    permissions: [
      {
        id: "rep.sales",
        name: "View Revenue & Sales Reports",
        description: "Daily, monthly, and annual sales analytics",
      },
      {
        id: "rep.pnl",
        name: "View Profit & Loss Statements",
        description: "Gross margins, purchase costs, and store net profit",
      },
      {
        id: "rep.gst",
        name: "Export GST Filing Reports",
        description: "GSTR-1, GSTR-2B, and GSTR-3B monthly tax summaries",
      },
      {
        id: "cash.close",
        name: "Cash Register Reconciliation",
        description: "Close daily cash drawers and audit float variances",
      },
    ],
  },
];

export const PAGE_PERMISSION_MODULES = [
  { id: "pos", name: "POS Billing & Checkout", route: "pos" },
  { id: "inventory", name: "Inventory & Stock Management", route: "inventory" },
  { id: "purchases", name: "Purchases & Procurement", route: "purchases" },
  { id: "customers", name: "Customer & Patient Profiles", route: "customers" },
  { id: "reports", name: "Business Reports & Analytics", route: "reports" },
  { id: "management", name: "Branch & User Settings", route: "management" },
];

export const DEFAULT_ROLE_PAGE_PERMISSIONS = {
  ADMIN: [
    "pos",
    "inventory",
    "purchases",
    "customers",
    "reports",
    "management",
  ],
  PHARMACIST: ["pos", "inventory", "customers"],
  CASHIER: ["pos", "customers"],
  MANAGER: ["pos", "inventory", "purchases", "customers", "reports"],
};

// --- Audit Log Filters ---
export const AUDIT_ACTION_TYPES = [
  "All Actions",
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "STOCK_ADJUSTMENT",
  "DISPENSE_NARCOTICS",
  "REFUND_ISSUED",
  "PRICE_OVERRIDE",
];

export const AUDIT_SEVERITY_LEVELS = [
  "All Severities",
  "INFO",
  "WARNING",
  "CRITICAL",
];

// --- Suppliers & Purchases ---
export const SUPPLIER_CATEGORY_FILTER = [
  "All Categories",
  "Medicines & Injections",
  "Generic Medicines",
  "Nutrition & Diagnostics",
  "Supplements & Vitamins",
  "Medical Consumables",
];

export const PO_STATUS_FILTER = [
  "All Statuses",
  "Draft",
  "Pending",
  "Approved",
  "Received",
  "Partially Received",
  "Cancelled",
];

export const GRN_STATUS_FILTER = [
  "All Statuses",
  "Verified",
  "Pending Inspection",
  "Discrepancy",
];

// --- Stock Transfers & Adjustments ---
export const TRANSFER_STATUS_FILTER = [
  "All Statuses",
  "Draft",
  "In Transit",
  "Completed",
  "Cancelled",
];

export const ADJUSTMENT_REASONS = [
  "Physical stock count adjustment",
  "Damaged in transit / handling",
  "Quarantined expired stock",
  "Returned to manufacturer",
  "Customer sample distribution",
  "Discrepancy reconciliation",
];

export const ADJUSTMENT_STATUS_FILTER = [
  "All Statuses",
  "In Stock",
  "Low Stock",
  "Critical",
  "Out of Stock",
];

// --- Customers & Patients ---
export const PATIENT_TYPE_FILTER = [
  "All Customers",
  "Regular",
  "Chronic Care",
  "Senior Citizen",
  "Pediatric",
  "Credit Allowed",
];

export const LEDGER_AGING_FILTER = [
  "All Ledgers",
  "Current (0-30 days)",
  "Overdue (31-60 days)",
  "Critical (60+ days)",
  "Zero Balance",
];

export const PAYMENT_MODE_FILTER = [
  "All Modes",
  "Cash",
  "UPI / QR",
  "Debit/Credit Card",
  "Net Banking",
  "Cheque",
];
