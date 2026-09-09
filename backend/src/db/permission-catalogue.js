/**
 * PharmaFlow Permission & System Role Catalogue
 *
 * ARCHITECTURAL & SECURITY RATIONALE:
 *
 * 1. Why system roles are seeded per organisation:
 *    Roles in PharmaFlow have a strict foreign key (roles.organisation_id REFERENCES organisations(id)).
 *    Multi-tenant isolation requires each organisation to own its role definitions. This prevents
 *    cross-tenant data leakage, allows future organisation-specific policy adjustments, and ensures
 *    clean foreign-key integrity without relying on shared, unscoped global role rows.
 *
 * 2. Why custom roles must not be overwritten:
 *    Organisation administrators can define bespoke custom roles (is_system_role = FALSE) tailored
 *    to their specific staffing workflows. Any migration or seeding routine must respect tenant autonomy
 *    and never overwrite, modify, or delete custom role definitions or their custom role_permissions.
 *
 * 3. Why Administrator is unrestricted:
 *    The organisation Administrator (role_identifier = 'ADMIN', clearance_level = 'ADMIN') is the primary
 *    operational authority for a tenant. Granting all 139 permissions ensures the organisation owner/admin
 *    can configure, operate, and audit all facets of their SaaS pharmacy instance without artificial blocks.
 *
 * 4. Why user management is Administrator-only:
 *    User accounts control authentication credentials, security boundaries, and tenant membership.
 *    Allowing operational roles like Manager or Pharmacist to create users, reset passwords, or assign roles
 *    creates privilege escalation vectors. Branch assignment management (VIEW_BRANCH_ASSIGNMENTS,
 *    MANAGE_BRANCH_ASSIGNMENTS) is part of user management and controls which facilities employees access.
 *    Hence, user management and branch assignment management are strictly Administrator-only, while Manager
 *    retains facility-level operations (VIEW_BRANCHES, UPDATE_BRANCH). Role management is also Administrator-only.
 *
 * 5. Why prescription permissions are not separate:
 *    In pharmacy workflows, prescriptions represent customer clinical artifacts and medical history.
 *    Prescription intake, doctor linkage, dispensing history, and refill tracking are fundamentally integrated
 *    into the Customer domain rather than existing as an isolated, detached silo.
 *
 * 6. Why expiry permissions are not separate:
 *    Expiry dates are intrinsic batch properties of inventory items. Inventory tracking, lot adjustments,
 *    and FEFO (First-Expiry-First-Out) dispensing rely on the Inventory and Batch permissions (VIEW_BATCHES,
 *    VIEW_STOCK, etc.) rather than a synthetic standalone module.
 *
 * 7. Why transactional DELETE permissions are avoided:
 *    Regulated healthcare and pharmaceutical billing require complete audit trails, accounting consistency,
 *    and GST/tax compliance. Financial transactions, inventory adjustments, purchase orders, goods receipts,
 *    and sales returns must never be permanently deleted; instead, they are held, cancelled, or voided
 *    (e.g., VOID_SALE, CANCEL_DRAFT_SALE, VOID_PURCHASE) with immutable audit records.
 *
 * 8. Why organisation/branch scope is not represented by role permissions themselves:
 *    Permissions define *capabilities* (what action can be performed, e.g. VIEW_SALES). Data scope (which
 *    branches or organisations a user can view or operate in) is governed by organisation memberships and
 *    branch_assignments. Mixing scope into permission identifiers (e.g. VIEW_SALES_BRANCH_A) causes
 *    combinatorial explosion and couples access rules to ephemeral business topologies.
 */

const PERMISSION_DOMAINS = {
  Dashboard: ["VIEW_DASHBOARD", "VIEW_CONSOLIDATED_DASHBOARD"],
  Sales: [
    "VIEW_SALES",
    "CREATE_SALE",
    "UPDATE_DRAFT_SALE",
    "CANCEL_DRAFT_SALE",
    "VOID_SALE",
    "HOLD_SALE",
    "RESUME_HELD_SALE",
    "CREATE_PAYMENT",
    "VOID_PAYMENT",
    "APPLY_DISCOUNT",
    "APPROVE_DISCOUNT",
    "OVERRIDE_SELLING_PRICE",
    "APPROVE_PRICE_OVERRIDE",
    "PRINT_SALE",
    "EXPORT_SALES",
  ],
  Customers: [
    "VIEW_CUSTOMERS",
    "CREATE_CUSTOMER",
    "UPDATE_CUSTOMER",
    "ARCHIVE_CUSTOMER",
    "VOID_CUSTOMER_RECORD",
    "PRINT_CUSTOMER",
    "EXPORT_CUSTOMERS",
  ],
  Inventory: [
    "VIEW_PRODUCTS",
    "CREATE_PRODUCT",
    "UPDATE_PRODUCT",
    "ARCHIVE_PRODUCT",
    "VIEW_CATEGORIES",
    "CREATE_CATEGORY",
    "UPDATE_CATEGORY",
    "ARCHIVE_CATEGORY",
    "VIEW_SUPPLIERS",
    "CREATE_SUPPLIER",
    "UPDATE_SUPPLIER",
    "ARCHIVE_SUPPLIER",
    "EXPORT_SUPPLIERS",
    "VIEW_STOCK",
    "VIEW_BATCHES",
    "CREATE_STOCK_ADJUSTMENT",
    "UPDATE_STOCK_ADJUSTMENT",
    "CANCEL_STOCK_ADJUSTMENT",
    "APPROVE_STOCK_ADJUSTMENT",
    "PRINT_STOCK_ADJUSTMENT",
    "EXPORT_STOCK",
  ],
  Purchases: [
    "VIEW_PURCHASES",
    "CREATE_PURCHASE",
    "UPDATE_DRAFT_PURCHASE",
    "CANCEL_DRAFT_PURCHASE",
    "SUBMIT_PURCHASE",
    "APPROVE_PURCHASE",
    "VOID_PURCHASE",
    "PRINT_PURCHASE",
    "EXPORT_PURCHASES",
  ],
  "Goods Receiving": [
    "VIEW_GOODS_RECEIVING",
    "CREATE_GOODS_RECEIPT",
    "UPDATE_DRAFT_GOODS_RECEIPT",
    "SUBMIT_GOODS_RECEIPT",
    "VERIFY_GOODS_RECEIPT",
    "APPROVE_GOODS_RECEIPT",
    "CANCEL_GOODS_RECEIPT",
    "PRINT_GOODS_RECEIPT",
    "EXPORT_GOODS_RECEIVING",
  ],
  "Stock Transfer": [
    "VIEW_STOCK_TRANSFERS",
    "CREATE_STOCK_TRANSFER",
    "UPDATE_DRAFT_STOCK_TRANSFER",
    "SUBMIT_STOCK_TRANSFER",
    "APPROVE_STOCK_TRANSFER",
    "DISPATCH_STOCK_TRANSFER",
    "RECEIVE_STOCK_TRANSFER",
    "CANCEL_STOCK_TRANSFER",
    "PRINT_STOCK_TRANSFER",
    "EXPORT_STOCK_TRANSFERS",
  ],
  "Sales Returns": [
    "VIEW_SALES_RETURNS",
    "CREATE_SALES_RETURN",
    "UPDATE_DRAFT_SALES_RETURN",
    "CANCEL_DRAFT_SALES_RETURN",
    "APPROVE_SALES_RETURN",
    "VOID_SALES_RETURN",
    "INITIATE_REFUND",
    "APPROVE_REFUND",
    "PRINT_SALES_RETURN",
    "EXPORT_SALES_RETURNS",
  ],
  Reports: [
    "VIEW_REPORTS",
    "VIEW_SALES_REPORTS",
    "EXPORT_SALES_REPORTS",
    "VIEW_CUSTOMER_REPORTS",
    "EXPORT_CUSTOMER_REPORTS",
    "VIEW_INVENTORY_REPORTS",
    "EXPORT_INVENTORY_REPORTS",
    "VIEW_PURCHASE_REPORTS",
    "EXPORT_PURCHASE_REPORTS",
    "VIEW_GST_REPORTS",
    "EXPORT_GST_REPORTS",
    "VIEW_FINANCIAL_REPORTS",
    "EXPORT_FINANCIAL_REPORTS",
    "VIEW_PROFIT_REPORTS",
    "EXPORT_PROFIT_REPORTS",
    "VIEW_AUDIT_REPORTS",
    "EXPORT_AUDIT_REPORTS",
  ],
  Branches: [
    "VIEW_BRANCHES",
    "CREATE_BRANCH",
    "UPDATE_BRANCH",
    "ACTIVATE_DEACTIVATE_BRANCH",
    "VIEW_BRANCH_ASSIGNMENTS",
    "MANAGE_BRANCH_ASSIGNMENTS",
  ],
  Users: [
    "VIEW_USERS",
    "CREATE_USER",
    "UPDATE_USER",
    "DEACTIVATE_USER",
    "RESET_USER_PASSWORD",
    "ASSIGN_USER_BRANCH",
    "ASSIGN_USER_ROLE",
    "VIEW_USER_ACTIVITY",
    "EXPORT_USERS",
  ],
  Roles: [
    "VIEW_ROLES",
    "CREATE_ROLE",
    "UPDATE_ROLE",
    "DELETE_ROLE",
    "CLONE_ROLE",
    "MANAGE_ROLE_PERMISSIONS",
  ],
  Audit: ["VIEW_AUDIT_LOG", "EXPORT_AUDIT_LOG"],
  Settings: [
    "VIEW_SETTINGS",
    "VIEW_BUSINESS_SETTINGS",
    "UPDATE_BUSINESS_SETTINGS",
    "VIEW_TAX_SETTINGS",
    "UPDATE_TAX_SETTINGS",
    "VIEW_BRANCH_SETTINGS",
    "UPDATE_BRANCH_SETTINGS",
    "VIEW_INVOICE_SETTINGS",
    "UPDATE_INVOICE_SETTINGS",
    "MANAGE_INVOICE_TEMPLATES",
    "VIEW_POS_SETTINGS",
    "UPDATE_POS_SETTINGS",
    "VIEW_APPROVAL_SETTINGS",
    "UPDATE_APPROVAL_SETTINGS",
    "VIEW_SECURITY_SETTINGS",
    "UPDATE_SECURITY_SETTINGS",
  ],
};

const PERMISSIONS = [
  // Dashboard (2)
  {
    name: "VIEW_DASHBOARD",
    domain: "Dashboard",
    description: "View standard pharmacy dashboard metrics and KPIs.",
  },
  {
    name: "VIEW_CONSOLIDATED_DASHBOARD",
    domain: "Dashboard",
    description:
      "View consolidated multi-branch dashboard analytics and metrics.",
  },

  // Sales (15)
  {
    name: "VIEW_SALES",
    domain: "Sales",
    description: "View sales/invoices and their permitted details.",
  },
  {
    name: "CREATE_SALE",
    domain: "Sales",
    description: "Create a new sale/POS transaction.",
  },
  {
    name: "UPDATE_DRAFT_SALE",
    domain: "Sales",
    description: "Modify a sale while it is still in draft state.",
  },
  {
    name: "CANCEL_DRAFT_SALE",
    domain: "Sales",
    description: "Cancel a draft sale prior to completion.",
  },
  {
    name: "VOID_SALE",
    domain: "Sales",
    description: "Void a completed sale transaction.",
  },
  {
    name: "HOLD_SALE",
    domain: "Sales",
    description: "Place an active POS transaction on hold.",
  },
  {
    name: "RESUME_HELD_SALE",
    domain: "Sales",
    description: "Resume and complete a previously held POS transaction.",
  },
  {
    name: "CREATE_PAYMENT",
    domain: "Sales",
    description: "Record a customer payment against a sale or invoice.",
  },
  {
    name: "VOID_PAYMENT",
    domain: "Sales",
    description: "Void a previously recorded payment transaction.",
  },
  {
    name: "APPLY_DISCOUNT",
    domain: "Sales",
    description: "Apply a standard discount to an item or bill.",
  },
  {
    name: "APPROVE_DISCOUNT",
    domain: "Sales",
    description: "Approve a discount that requires elevated authorization.",
  },
  {
    name: "OVERRIDE_SELLING_PRICE",
    domain: "Sales",
    description: "Override default product selling price during billing.",
  },
  {
    name: "APPROVE_PRICE_OVERRIDE",
    domain: "Sales",
    description:
      "Approve a price override requiring supervisory authorization.",
  },
  {
    name: "PRINT_SALE",
    domain: "Sales",
    description: "Print invoices, receipts, and billing summaries.",
  },
  {
    name: "EXPORT_SALES",
    domain: "Sales",
    description: "Export sales and invoice transaction data.",
  },

  // Customers (7)
  {
    name: "VIEW_CUSTOMERS",
    domain: "Customers",
    description:
      "View customer profiles, contact info, and prescription history.",
  },
  {
    name: "CREATE_CUSTOMER",
    domain: "Customers",
    description: "Register a new customer profile.",
  },
  {
    name: "UPDATE_CUSTOMER",
    domain: "Customers",
    description: "Update customer details and profile information.",
  },
  {
    name: "ARCHIVE_CUSTOMER",
    domain: "Customers",
    description: "Archive an inactive customer record.",
  },
  {
    name: "VOID_CUSTOMER_RECORD",
    domain: "Customers",
    description: "Void or remove an erroneously created customer record.",
  },
  {
    name: "PRINT_CUSTOMER",
    domain: "Customers",
    description: "Print customer profile, statement, and prescription records.",
  },
  {
    name: "EXPORT_CUSTOMERS",
    domain: "Customers",
    description: "Export customer directory and account summary data.",
  },

  // Inventory (21)
  {
    name: "VIEW_PRODUCTS",
    domain: "Inventory",
    description: "View product catalogue, details, and pricing.",
  },
  {
    name: "CREATE_PRODUCT",
    domain: "Inventory",
    description: "Create a new product record in the catalogue.",
  },
  {
    name: "UPDATE_PRODUCT",
    domain: "Inventory",
    description: "Modify product details, pricing, and classifications.",
  },
  {
    name: "ARCHIVE_PRODUCT",
    domain: "Inventory",
    description: "Archive a discontinued or inactive product.",
  },
  {
    name: "VIEW_CATEGORIES",
    domain: "Inventory",
    description: "View product categories and classification hierarchies.",
  },
  {
    name: "CREATE_CATEGORY",
    domain: "Inventory",
    description: "Create a new product category.",
  },
  {
    name: "UPDATE_CATEGORY",
    domain: "Inventory",
    description: "Modify an existing product category.",
  },
  {
    name: "ARCHIVE_CATEGORY",
    domain: "Inventory",
    description: "Archive an inactive product category.",
  },
  {
    name: "VIEW_SUPPLIERS",
    domain: "Inventory",
    description: "View supplier profiles and contact information.",
  },
  {
    name: "CREATE_SUPPLIER",
    domain: "Inventory",
    description: "Create a new supplier profile.",
  },
  {
    name: "UPDATE_SUPPLIER",
    domain: "Inventory",
    description: "Update supplier information and terms.",
  },
  {
    name: "ARCHIVE_SUPPLIER",
    domain: "Inventory",
    description: "Archive an inactive supplier profile.",
  },
  {
    name: "EXPORT_SUPPLIERS",
    domain: "Inventory",
    description: "Export supplier directory and contact information.",
  },
  {
    name: "VIEW_STOCK",
    domain: "Inventory",
    description: "View stock levels and inventory balances across locations.",
  },
  {
    name: "VIEW_BATCHES",
    domain: "Inventory",
    description:
      "View inventory batches and batch details, including expiry information.",
  },
  {
    name: "CREATE_STOCK_ADJUSTMENT",
    domain: "Inventory",
    description: "Initiate a stock adjustment or stock discrepancy record.",
  },
  {
    name: "UPDATE_STOCK_ADJUSTMENT",
    domain: "Inventory",
    description: "Modify a draft stock adjustment record.",
  },
  {
    name: "CANCEL_STOCK_ADJUSTMENT",
    domain: "Inventory",
    description: "Cancel an unapproved draft stock adjustment.",
  },
  {
    name: "APPROVE_STOCK_ADJUSTMENT",
    domain: "Inventory",
    description: "Approve and apply a stock adjustment to inventory.",
  },
  {
    name: "PRINT_STOCK_ADJUSTMENT",
    domain: "Inventory",
    description:
      "Print stock adjustment vouchers and inventory discrepancy sheets.",
  },
  {
    name: "EXPORT_STOCK",
    domain: "Inventory",
    description:
      "Export stock level balances, batch details, and inventory valuations.",
  },

  // Purchases (9)
  {
    name: "VIEW_PURCHASES",
    domain: "Purchases",
    description: "View purchase orders and procurement history.",
  },
  {
    name: "CREATE_PURCHASE",
    domain: "Purchases",
    description: "Create a new purchase order.",
  },
  {
    name: "UPDATE_DRAFT_PURCHASE",
    domain: "Purchases",
    description: "Modify a purchase order while still in draft state.",
  },
  {
    name: "CANCEL_DRAFT_PURCHASE",
    domain: "Purchases",
    description: "Cancel a draft purchase order.",
  },
  {
    name: "SUBMIT_PURCHASE",
    domain: "Purchases",
    description: "Submit a purchase order for supervisory approval.",
  },
  {
    name: "APPROVE_PURCHASE",
    domain: "Purchases",
    description: "Approve a purchase order for supplier issuance.",
  },
  {
    name: "VOID_PURCHASE",
    domain: "Purchases",
    description: "Void an approved or submitted purchase order.",
  },
  {
    name: "PRINT_PURCHASE",
    domain: "Purchases",
    description: "Print purchase orders and procurement documentation.",
  },
  {
    name: "EXPORT_PURCHASES",
    domain: "Purchases",
    description: "Export purchase orders and vendor procurement data.",
  },

  // Goods Receiving (9)
  {
    name: "VIEW_GOODS_RECEIVING",
    domain: "Goods Receiving",
    description: "View goods receipt notes (GRN) and incoming shipments.",
  },
  {
    name: "CREATE_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Create a goods receipt note for inbound stock.",
  },
  {
    name: "UPDATE_DRAFT_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Modify a goods receipt note in draft status.",
  },
  {
    name: "SUBMIT_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Submit a goods receipt note for inspection and verification.",
  },
  {
    name: "VERIFY_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Verify received quantities, batch numbers, and expiry dates.",
  },
  {
    name: "APPROVE_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description:
      "Approve a goods receipt note and release stock into inventory.",
  },
  {
    name: "CANCEL_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Cancel an unapproved goods receipt note.",
  },
  {
    name: "PRINT_GOODS_RECEIPT",
    domain: "Goods Receiving",
    description: "Print goods receipt notes and inspection reports.",
  },
  {
    name: "EXPORT_GOODS_RECEIVING",
    domain: "Goods Receiving",
    description: "Export goods receiving records and receipt audit trails.",
  },

  // Stock Transfer (10)
  {
    name: "VIEW_STOCK_TRANSFERS",
    domain: "Stock Transfer",
    description: "View inter-branch stock transfers and status.",
  },
  {
    name: "CREATE_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Create an inter-branch stock transfer request.",
  },
  {
    name: "UPDATE_DRAFT_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Modify a draft stock transfer request.",
  },
  {
    name: "SUBMIT_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Submit a stock transfer request for authorization.",
  },
  {
    name: "APPROVE_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Approve an inter-branch stock transfer request.",
  },
  {
    name: "DISPATCH_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Record dispatch and transit details of transferred stock.",
  },
  {
    name: "RECEIVE_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description:
      "Acknowledge and receive transferred stock at the destination branch.",
  },
  {
    name: "CANCEL_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Cancel an unfulfilled stock transfer request.",
  },
  {
    name: "PRINT_STOCK_TRANSFER",
    domain: "Stock Transfer",
    description: "Print stock transfer delivery challans and dispatch notes.",
  },
  {
    name: "EXPORT_STOCK_TRANSFERS",
    domain: "Stock Transfer",
    description: "Export stock transfer history and branch movement logs.",
  },

  // Sales Returns (10)
  {
    name: "VIEW_SALES_RETURNS",
    domain: "Sales Returns",
    description: "View customer return notes and credit memos.",
  },
  {
    name: "CREATE_SALES_RETURN",
    domain: "Sales Returns",
    description: "Initiate a sales return for billed items.",
  },
  {
    name: "UPDATE_DRAFT_SALES_RETURN",
    domain: "Sales Returns",
    description: "Modify a draft sales return record.",
  },
  {
    name: "CANCEL_DRAFT_SALES_RETURN",
    domain: "Sales Returns",
    description: "Cancel a draft sales return.",
  },
  {
    name: "APPROVE_SALES_RETURN",
    domain: "Sales Returns",
    description: "Approve a customer sales return.",
  },
  {
    name: "VOID_SALES_RETURN",
    domain: "Sales Returns",
    description: "Void an approved sales return record.",
  },
  {
    name: "INITIATE_REFUND",
    domain: "Sales Returns",
    description: "Initiate a customer refund payment for returned items.",
  },
  {
    name: "APPROVE_REFUND",
    domain: "Sales Returns",
    description: "Approve a customer refund disbursement.",
  },
  {
    name: "PRINT_SALES_RETURN",
    domain: "Sales Returns",
    description: "Print sales return vouchers and credit memos.",
  },
  {
    name: "EXPORT_SALES_RETURNS",
    domain: "Sales Returns",
    description: "Export sales returns and customer refund transaction data.",
  },

  // Reports (17)
  {
    name: "VIEW_REPORTS",
    domain: "Reports",
    description: "Access the general reporting dashboard and report lists.",
  },
  {
    name: "VIEW_SALES_REPORTS",
    domain: "Reports",
    description: "View sales analysis, turnover, and revenue reports.",
  },
  {
    name: "EXPORT_SALES_REPORTS",
    domain: "Reports",
    description: "Export sales analysis and revenue reports.",
  },
  {
    name: "VIEW_CUSTOMER_REPORTS",
    domain: "Reports",
    description: "View customer statements, balances, and credit reports.",
  },
  {
    name: "EXPORT_CUSTOMER_REPORTS",
    domain: "Reports",
    description: "Export customer statements and aging balance reports.",
  },
  {
    name: "VIEW_INVENTORY_REPORTS",
    domain: "Reports",
    description:
      "View inventory valuation, slow-moving, and stock movement reports.",
  },
  {
    name: "EXPORT_INVENTORY_REPORTS",
    domain: "Reports",
    description: "Export inventory valuation and stock movement reports.",
  },
  {
    name: "VIEW_PURCHASE_REPORTS",
    domain: "Reports",
    description: "View procurement analysis and vendor purchase reports.",
  },
  {
    name: "EXPORT_PURCHASE_REPORTS",
    domain: "Reports",
    description: "Export procurement analysis and purchase reports.",
  },
  {
    name: "VIEW_GST_REPORTS",
    domain: "Reports",
    description:
      "View GST compliance reports (GSTR-1, GSTR-2, GSTR-3B summaries).",
  },
  {
    name: "EXPORT_GST_REPORTS",
    domain: "Reports",
    description: "Export GST tax liability and input credit reports.",
  },
  {
    name: "VIEW_FINANCIAL_REPORTS",
    domain: "Reports",
    description:
      "View accounting ledgers, cash flows, and financial statements.",
  },
  {
    name: "EXPORT_FINANCIAL_REPORTS",
    domain: "Reports",
    description: "Export financial ledgers and accounting reports.",
  },
  {
    name: "VIEW_PROFIT_REPORTS",
    domain: "Reports",
    description: "View gross and net profitability reports.",
  },
  {
    name: "EXPORT_PROFIT_REPORTS",
    domain: "Reports",
    description: "Export profitability analysis reports.",
  },
  {
    name: "VIEW_AUDIT_REPORTS",
    domain: "Reports",
    description: "View regulatory and security compliance audit reports.",
  },
  {
    name: "EXPORT_AUDIT_REPORTS",
    domain: "Reports",
    description: "Export compliance and security audit reports.",
  },

  // Branches (6)
  {
    name: "VIEW_BRANCHES",
    domain: "Branches",
    description: "View branch locations, details, and operational status.",
  },
  {
    name: "CREATE_BRANCH",
    domain: "Branches",
    description: "Create a new branch or facility within the organisation.",
  },
  {
    name: "UPDATE_BRANCH",
    domain: "Branches",
    description:
      "Update branch contact details, facility type, and operational metadata.",
  },
  {
    name: "ACTIVATE_DEACTIVATE_BRANCH",
    domain: "Branches",
    description:
      "Toggle branch operational status between active and inactive.",
  },
  {
    name: "VIEW_BRANCH_ASSIGNMENTS",
    domain: "Branches",
    description: "View staff assignments to specific branches.",
  },
  {
    name: "MANAGE_BRANCH_ASSIGNMENTS",
    domain: "Branches",
    description: "Assign or reassign staff members to organisation branches.",
  },

  // Users (9)
  {
    name: "VIEW_USERS",
    domain: "Users",
    description: "View user accounts, profiles, and employment status.",
  },
  {
    name: "CREATE_USER",
    domain: "Users",
    description: "Create new user credentials and organisation memberships.",
  },
  {
    name: "UPDATE_USER",
    domain: "Users",
    description: "Update user personal details, contact info, and profile.",
  },
  {
    name: "DEACTIVATE_USER",
    domain: "Users",
    description: "Deactivate or suspend user accounts.",
  },
  {
    name: "RESET_USER_PASSWORD",
    domain: "Users",
    description: "Trigger password resets or update user security credentials.",
  },
  {
    name: "ASSIGN_USER_BRANCH",
    domain: "Users",
    description: "Assign or remove branch access for users.",
  },
  {
    name: "ASSIGN_USER_ROLE",
    domain: "Users",
    description: "Assign or alter roles for organisation users.",
  },
  {
    name: "VIEW_USER_ACTIVITY",
    domain: "Users",
    description: "View user login history and operational activity.",
  },
  {
    name: "EXPORT_USERS",
    domain: "Users",
    description: "Export user account listings and directory data.",
  },

  // Roles (6)
  {
    name: "VIEW_ROLES",
    domain: "Roles",
    description: "View system and custom access roles.",
  },
  {
    name: "CREATE_ROLE",
    domain: "Roles",
    description: "Create custom organisation access roles.",
  },
  {
    name: "UPDATE_ROLE",
    domain: "Roles",
    description: "Update role names, descriptions, and clearance levels.",
  },
  {
    name: "DELETE_ROLE",
    domain: "Roles",
    description: "Delete custom access roles that are not in use.",
  },
  {
    name: "CLONE_ROLE",
    domain: "Roles",
    description: "Duplicate an existing role to create a new access profile.",
  },
  {
    name: "MANAGE_ROLE_PERMISSIONS",
    domain: "Roles",
    description: "Add or remove permissions from custom roles.",
  },

  // Audit (2)
  {
    name: "VIEW_AUDIT_LOG",
    domain: "Audit",
    description: "View organisation audit events permitted to the user.",
  },
  {
    name: "EXPORT_AUDIT_LOG",
    domain: "Audit",
    description: "Export organisation audit log records and compliance trails.",
  },

  // Settings (16)
  {
    name: "VIEW_SETTINGS",
    domain: "Settings",
    description: "View system settings menu and general configurations.",
  },
  {
    name: "VIEW_BUSINESS_SETTINGS",
    domain: "Settings",
    description:
      "View organisation profile, legal identity, and business information.",
  },
  {
    name: "UPDATE_BUSINESS_SETTINGS",
    domain: "Settings",
    description:
      "Update organisation business profile, address, and legal details.",
  },
  {
    name: "VIEW_TAX_SETTINGS",
    domain: "Settings",
    description: "View tax configuration, GST rates, and cess definitions.",
  },
  {
    name: "UPDATE_TAX_SETTINGS",
    domain: "Settings",
    description: "Create, update, or configure tax rates and rules.",
  },
  {
    name: "VIEW_BRANCH_SETTINGS",
    domain: "Settings",
    description:
      "View branch-level settings, invoice prefixes, and operating parameters.",
  },
  {
    name: "UPDATE_BRANCH_SETTINGS",
    domain: "Settings",
    description:
      "Update branch-specific operational parameters and receipt formats.",
  },
  {
    name: "VIEW_INVOICE_SETTINGS",
    domain: "Settings",
    description: "View billing parameters and invoice sequence configurations.",
  },
  {
    name: "UPDATE_INVOICE_SETTINGS",
    domain: "Settings",
    description:
      "Update invoice generation rules, prefixes, and billing options.",
  },
  {
    name: "MANAGE_INVOICE_TEMPLATES",
    domain: "Settings",
    description: "Configure and customize invoice print layouts and templates.",
  },
  {
    name: "VIEW_POS_SETTINGS",
    domain: "Settings",
    description:
      "View point-of-sale terminal settings and barcode configurations.",
  },
  {
    name: "UPDATE_POS_SETTINGS",
    domain: "Settings",
    description:
      "Update point-of-sale behavior, cash drawer, and barcode scanner rules.",
  },
  {
    name: "VIEW_APPROVAL_SETTINGS",
    domain: "Settings",
    description: "View authorization thresholds and approval workflow rules.",
  },
  {
    name: "UPDATE_APPROVAL_SETTINGS",
    domain: "Settings",
    description:
      "Configure authorization limits for discounts, refunds, and adjustments.",
  },
  {
    name: "VIEW_SECURITY_SETTINGS",
    domain: "Settings",
    description:
      "View authentication policies, session timeouts, and security logs.",
  },
  {
    name: "UPDATE_SECURITY_SETTINGS",
    domain: "Settings",
    description:
      "Configure authentication requirements, MFA, and security policies.",
  },
];

/**
 * Authoritative 6 Default System Roles
 */
const SYSTEM_ROLES = [
  {
    name: "Administrator",
    identifier: "ADMIN",
    clearance: "ADMIN",
    description:
      "Full administrative access to all organisation resources, system settings, and user management.",
  },
  {
    name: "Manager",
    identifier: "MANAGER",
    clearance: "MANAGEMENT",
    description:
      "Operational and branch management oversight with comprehensive clinical, purchasing, and reporting access.",
  },
  {
    name: "Chief Pharmacist",
    identifier: "CHIEF_PHARM",
    clearance: "CLINICAL_DISPENSING",
    description:
      "Senior supervising pharmacist with elevated clinical dispensing, approval, and transaction override capabilities.",
  },
  {
    name: "Pharmacist",
    identifier: "PHARMACIST",
    clearance: "CLINICAL_DISPENSING",
    description:
      "Licensed pharmacist responsible for dispensing, customer prescriptions, inventory handling, and sales.",
  },
  {
    name: "Cashier",
    identifier: "CASHIER",
    clearance: "STANDARD_POS",
    description:
      "Point-of-sale cashier focused on billing, customer sales, return drafts, and payment processing.",
  },
  {
    name: "Accountant",
    identifier: "ACCOUNTANT",
    clearance: "MANAGEMENT",
    description:
      "Financial auditor and accountant with extensive reporting, audit log, refund approval, and ledger visibility.",
  },
];

/**
 * Default Role-Permission Mappings
 */

// 1. Administrator: All 139 permissions
const ADMIN_PERMISSIONS = PERMISSIONS.map((p) => p.name);

// 2. Manager: 113 permissions (No Users, No Roles, No Branch Assignments, No UPDATE_TAX_SETTINGS, No UPDATE_BUSINESS_SETTINGS, No Security Settings)
const MANAGER_PERMISSIONS = [
  ...PERMISSION_DOMAINS.Dashboard,
  ...PERMISSION_DOMAINS.Sales,
  ...PERMISSION_DOMAINS.Customers,
  ...PERMISSION_DOMAINS.Inventory,
  ...PERMISSION_DOMAINS.Purchases,
  ...PERMISSION_DOMAINS["Goods Receiving"],
  ...PERMISSION_DOMAINS["Stock Transfer"],
  ...PERMISSION_DOMAINS["Sales Returns"],
  ...PERMISSION_DOMAINS.Reports,
  "VIEW_BRANCHES",
  "UPDATE_BRANCH",
  ...PERMISSION_DOMAINS.Audit,
  "VIEW_SETTINGS",
  "VIEW_BUSINESS_SETTINGS",
  "VIEW_TAX_SETTINGS",
  "VIEW_BRANCH_SETTINGS",
  "UPDATE_BRANCH_SETTINGS",
  "VIEW_INVOICE_SETTINGS",
  "VIEW_POS_SETTINGS",
  "UPDATE_POS_SETTINGS",
  "VIEW_APPROVAL_SETTINGS",
];

// 3. Pharmacist: 46 permissions
const PHARMACIST_PERMISSIONS = [
  "VIEW_DASHBOARD",
  "VIEW_SALES",
  "CREATE_SALE",
  "UPDATE_DRAFT_SALE",
  "CANCEL_DRAFT_SALE",
  "HOLD_SALE",
  "RESUME_HELD_SALE",
  "CREATE_PAYMENT",
  "APPLY_DISCOUNT",
  "PRINT_SALE",
  "VIEW_CUSTOMERS",
  "CREATE_CUSTOMER",
  "UPDATE_CUSTOMER",
  "PRINT_CUSTOMER",
  "VIEW_PRODUCTS",
  "VIEW_CATEGORIES",
  "VIEW_SUPPLIERS",
  "VIEW_STOCK",
  "VIEW_BATCHES",
  "CREATE_STOCK_ADJUSTMENT",
  "UPDATE_STOCK_ADJUSTMENT",
  "PRINT_STOCK_ADJUSTMENT",
  "VIEW_PURCHASES",
  "PRINT_PURCHASE",
  "VIEW_GOODS_RECEIVING",
  "CREATE_GOODS_RECEIPT",
  "UPDATE_DRAFT_GOODS_RECEIPT",
  "SUBMIT_GOODS_RECEIPT",
  "VERIFY_GOODS_RECEIPT",
  "PRINT_GOODS_RECEIPT",
  "VIEW_STOCK_TRANSFERS",
  "CREATE_STOCK_TRANSFER",
  "UPDATE_DRAFT_STOCK_TRANSFER",
  "SUBMIT_STOCK_TRANSFER",
  "RECEIVE_STOCK_TRANSFER",
  "PRINT_STOCK_TRANSFER",
  "VIEW_SALES_RETURNS",
  "CREATE_SALES_RETURN",
  "UPDATE_DRAFT_SALES_RETURN",
  "CANCEL_DRAFT_SALES_RETURN",
  "PRINT_SALES_RETURN",
  "VIEW_REPORTS",
  "VIEW_SALES_REPORTS",
  "VIEW_CUSTOMER_REPORTS",
  "VIEW_INVENTORY_REPORTS",
  "VIEW_PURCHASE_REPORTS",
];

// 4. Chief Pharmacist: 56 permissions (All 46 Pharmacist permissions + 10 approvals/overrides)
const CHIEF_PHARMACIST_PERMISSIONS = [
  ...PHARMACIST_PERMISSIONS,
  "VOID_SALE",
  "APPROVE_DISCOUNT",
  "OVERRIDE_SELLING_PRICE",
  "APPROVE_PRICE_OVERRIDE",
  "APPROVE_STOCK_ADJUSTMENT",
  "APPROVE_PURCHASE",
  "APPROVE_GOODS_RECEIPT",
  "APPROVE_STOCK_TRANSFER",
  "APPROVE_SALES_RETURN",
  "APPROVE_REFUND",
];

// 5. Cashier: 28 permissions
const CASHIER_PERMISSIONS = [
  "VIEW_DASHBOARD",
  "VIEW_SALES",
  "CREATE_SALE",
  "UPDATE_DRAFT_SALE",
  "CANCEL_DRAFT_SALE",
  "HOLD_SALE",
  "RESUME_HELD_SALE",
  "CREATE_PAYMENT",
  "APPLY_DISCOUNT",
  "PRINT_SALE",
  "VIEW_CUSTOMERS",
  "CREATE_CUSTOMER",
  "UPDATE_CUSTOMER",
  "PRINT_CUSTOMER",
  "VIEW_PRODUCTS",
  "VIEW_STOCK",
  "VIEW_BATCHES",
  "VIEW_SALES_RETURNS",
  "CREATE_SALES_RETURN",
  "UPDATE_DRAFT_SALES_RETURN",
  "CANCEL_DRAFT_SALES_RETURN",
  "INITIATE_REFUND",
  "PRINT_SALES_RETURN",
  "VIEW_REPORTS",
  "VIEW_SALES_REPORTS",
  "VIEW_CUSTOMER_REPORTS",
  "VIEW_BRANCHES",
  "VIEW_POS_SETTINGS",
];

// 6. Accountant: 44 permissions
const ACCOUNTANT_PERMISSIONS = [
  "VIEW_DASHBOARD",
  "VIEW_CONSOLIDATED_DASHBOARD",
  "VIEW_SALES",
  "VIEW_CUSTOMERS",
  "VIEW_PRODUCTS",
  "VIEW_STOCK",
  "VIEW_BATCHES",
  "VIEW_SUPPLIERS",
  "VIEW_PURCHASES",
  "PRINT_PURCHASE",
  "EXPORT_PURCHASES",
  "VIEW_GOODS_RECEIVING",
  "PRINT_GOODS_RECEIPT",
  "EXPORT_GOODS_RECEIVING",
  "VIEW_SALES_RETURNS",
  "INITIATE_REFUND",
  "APPROVE_REFUND",
  "PRINT_SALES_RETURN",
  "EXPORT_SALES_RETURNS",
  "VIEW_REPORTS",
  "VIEW_SALES_REPORTS",
  "EXPORT_SALES_REPORTS",
  "VIEW_CUSTOMER_REPORTS",
  "EXPORT_CUSTOMER_REPORTS",
  "VIEW_INVENTORY_REPORTS",
  "EXPORT_INVENTORY_REPORTS",
  "VIEW_PURCHASE_REPORTS",
  "EXPORT_PURCHASE_REPORTS",
  "VIEW_GST_REPORTS",
  "EXPORT_GST_REPORTS",
  "VIEW_FINANCIAL_REPORTS",
  "EXPORT_FINANCIAL_REPORTS",
  "VIEW_PROFIT_REPORTS",
  "EXPORT_PROFIT_REPORTS",
  "VIEW_AUDIT_REPORTS",
  "EXPORT_AUDIT_REPORTS",
  "VIEW_AUDIT_LOG",
  "EXPORT_AUDIT_LOG",
  "VIEW_SETTINGS",
  "VIEW_BUSINESS_SETTINGS",
  "VIEW_TAX_SETTINGS",
  "VIEW_BRANCH_SETTINGS",
  "VIEW_INVOICE_SETTINGS",
  "VIEW_APPROVAL_SETTINGS",
];

const ROLE_DEFAULT_PERMISSIONS = {
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  CHIEF_PHARM: CHIEF_PHARMACIST_PERMISSIONS,
  PHARMACIST: PHARMACIST_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  ACCOUNTANT: ACCOUNTANT_PERMISSIONS,
};

module.exports = {
  PERMISSIONS,
  PERMISSION_DOMAINS,
  SYSTEM_ROLES,
  ROLE_DEFAULT_PERMISSIONS,
};
