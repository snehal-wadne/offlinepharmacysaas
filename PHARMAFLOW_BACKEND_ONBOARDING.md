# PHARMAFLOW — BACKEND TEAM MEMBER ONBOARDING

> **Document type:** Read-only technical reference. As-is, no spin.  
> **As of:** September 2026 — post-Phase-4 merge, pre-Phase-5.  
> **Author:** Generated from live codebase inspection.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Backend Architecture](#4-backend-architecture)
5. [API Architecture — Full Route Table](#5-api-architecture--full-route-table)
6. [Authentication](#6-authentication)
7. [Multi-Tenancy](#7-multi-tenancy)
8. [Database Design — Domain by Domain](#8-database-design--domain-by-domain)
9. [Database Relationships](#9-database-relationships)
10. [Number Sequences](#10-number-sequences)
11. [Transaction Model](#11-transaction-model)
12. [RBAC — Role-Based Access Control](#12-rbac--role-based-access-control)
13. [Superadmin Architecture](#13-superadmin-architecture)
14. [Branch Model](#14-branch-model)
15. [Offline Architecture](#15-offline-architecture)
16. [Sync Engine](#16-sync-engine)
17. [Business Module Overview](#17-business-module-overview)
18. [Sales / POS Flow](#18-sales--pos-flow)
19. [Purchase / GRN Flow](#19-purchase--grn-flow)
20. [Customer & Credit Flow](#20-customer--credit-flow)
21. [Inventory Flow](#21-inventory-flow)
22. [Reporting](#22-reporting)
23. [Audit Logging](#23-audit-logging)
24. [Error Handling Conventions](#24-error-handling-conventions)
25. [Current Known Issues](#25-current-known-issues)
26. [Locked Design Decisions](#26-locked-design-decisions)
27. [What NOT To Do](#27-what-not-to-do)
28. [How to Add a New Module](#28-how-to-add-a-new-module)
29. [Testing](#29-testing)
30. [Environment & Local Dev Setup](#30-environment--local-dev-setup)
31. [Demo Tenant](#31-demo-tenant)
32. [Code Ownership](#32-code-ownership)
33. [Team Context](#33-team-context)
34. [Final Summary](#34-final-summary)

---

## 1. Project Overview

**PharmaFlow** is a multi-tenant pharmacy billing SaaS / ERP.

| Concept          | Meaning                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Organisation** | A pharmacy business / tenant (e.g. "MedLife Care Chemist"). The highest isolation boundary.    |
| **Branch**       | A physical pharmacy location belonging to an organisation (e.g. "Main Branch", "Pune Branch"). |
| **User**         | An employee. Can be a member of one or more organisations.                                     |

**Core design philosophy:** _Working vertical slices over architectural perfection._ The application must operate online **and** fully offline (a cashier in a pharmacy with no internet must still be able to generate bills, then sync when connectivity resumes).

**Current active development phase:** Phase 5 (Cash register / session management fully wired; sync engine stable; permission enforcement is next).

---

## 2. Technology Stack

### Backend

| Layer            | Technology                                 | Version                        |
| ---------------- | ------------------------------------------ | ------------------------------ |
| Runtime          | Node.js                                    | Latest LTS                     |
| Language         | JavaScript (CommonJS — **NOT ES modules**) | —                              |
| HTTP Framework   | Express                                    | ^5.2.1                         |
| Database Driver  | `pg` (node-postgres)                       | ^8.23.0                        |
| Auth (primary)   | Supabase Auth (JWKS-validated JWT)         | @supabase/supabase-js ^2.116.0 |
| Auth (legacy)    | signed JWT                                 | jsonwebtoken ^9.0.3            |
| Password hashing | bcrypt                                     | ^6.0.0                         |
| Caching          | Redis                                      | redis ^6.2.1                   |
| Payment gateway  | Razorpay                                   | ^2.9.8                         |
| Dev server       | nodemon                                    | ^3.1.14                        |

### Frontend

| Layer             | Technology                           | Version       |
| ----------------- | ------------------------------------ | ------------- |
| Framework         | React Native (Expo) targeting Web    | expo ~51.0.28 |
| Language          | TypeScript (screens: JavaScript)     | ~5.3.3        |
| Navigation        | React Navigation v6 (Stack + Drawer) | ^6.x          |
| Offline DB        | Dexie v4 (IndexedDB wrapper)         | ^4.4.6        |
| Cloud Auth client | @supabase/supabase-js                | ^2.116.0      |
| Icons             | lucide-react-native                  | ^1.38.0       |
| React             | 18.2.0                               | —             |
| React Native      | 0.74.5                               | —             |
| React Native Web  | ~0.19.10                             | —             |

### Cloud / Infrastructure

| Layer                     | Technology                      |
| ------------------------- | ------------------------------- |
| Transactional database    | PostgreSQL (hosted on Supabase) |
| Auth service              | Supabase Auth                   |
| Local IndexedDB (offline) | Dexie v4                        |
| Backend port              | 5000 (default)                  |
| Frontend port             | 8081 (Expo Web)                 |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   BROWSER / PWA (Port 8081)                     │
│                                                                  │
│  React Native Web (Expo) + TypeScript                           │
│  ┌────────────────┐   ┌────────────────────────────────────┐   │
│  │  Online Mode   │   │        Offline Mode                │   │
│  │  fetch() API   │   │  Dexie v4 IndexedDB                │   │
│  │  calls backend │   │  Outbox → SyncEngine → Backend     │   │
│  └────────────────┘   └────────────────────────────────────┘   │
└───────────────────────────────────────┬─────────────────────────┘
                                        │ HTTP / REST
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                 BACKEND (Express, Port 5000)                     │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  /auth   │  │ /cashier │  │  /sync   │  │ /superadmin  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │/purchases│  │/inventory│  │/reports  │  │  /branches   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                  │
│  Middleware: auth → rbac → controller → service → repository    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
          ┌─────────▼──────┐       ┌──────────▼────────┐
          │   PostgreSQL   │       │   Supabase Auth   │
          │  (via Supabase)│       │   (JWKS/JWT)      │
          └────────────────┘       └───────────────────┘
```

---

## 4. Backend Architecture

### Entry Point

`backend/src/server.js` — Express app, CORS, JSON body parsing (10 MB limit), route registration, startup.

### Module Structure

```
backend/src/
├── server.js               ← Entry point
├── db/
│   ├── connection.js       ← pg Pool, testConnection(), isDbOnline()
│   ├── schema.sql          ← Canonical DDL (2499 lines, 46 tables)
│   ├── auto-init.js        ← Runs schema on startup if needed
│   ├── seed-*.js           ← Various seed scripts
│   └── permission-catalogue.js  ← 139 permissions, 6 system roles (canonical source)
├── middlewares/
│   ├── auth.middleware.js          ← authenticate() — sets req.user
│   ├── rbac.middleware.js          ← requirePermission() — currently UNUSED in routes
│   ├── sync-auth.middleware.js     ← requireSyncAuth, optionalSyncAuth
│   └── superadmin-auth.middleware.js  ← requirePlatformSuperadmin
├── routes/          ← 15 route files (see §5)
├── controllers/     ← 15+ controller files — thin, delegates to service
├── services/        ← Business logic layer
├── repositories/    ← SQL query layer (46 files)
└── utils/
    ├── token.util.js        ← sign/verify legacy JWT
    └── supabase.js          ← verifySupabaseToken(), fetchJwksKeys()
```

### Request Processing Pipeline

```
Request
  → CORS
  → express.json() (10 MB)
  → Route match
      → authenticate()         ← sets req.user (org + branch context)
      → requirePermission()    ← CURRENTLY UNUSED IN ALL PRODUCTION ROUTES
      → Controller
          → Service
              → Repository
                  → pg Pool → PostgreSQL
          ← JSON response
```

### IMPORTANT: Language Conventions

- Backend is **CommonJS** (`require` / `module.exports`). Do NOT use `import/export`.
- All numbers arriving from PostgreSQL `NUMERIC` columns arrive as **strings** in Node.js `pg`. Always wrap in `Number()` or `parseFloat()` before arithmetic.
- All UUIDs use `gen_random_uuid()` (requires `pgcrypto` extension).

---

## 5. API Architecture — Full Route Table

All routes require `authenticate` middleware unless marked **[PUBLIC]**. None currently use `requirePermission`.

### `/api/auth` (auth.routes.js)

| Method | Path                        | Description                                   |
| ------ | --------------------------- | --------------------------------------------- |
| GET    | `/api/auth/me`              | Get current user profile + org/branch context |
| POST   | `/api/auth/login`           | Email/password login                          |
| POST   | `/api/auth/register`        | Register new user                             |
| POST   | `/api/auth/google`          | Google OAuth login                            |
| POST   | `/api/auth/google-onboard`  | Complete Google onboarding                    |
| POST   | `/api/auth/forgot-password` | Request password reset                        |
| POST   | `/api/auth/reset-password`  | Complete password reset                       |
| POST   | `/api/auth/pin-login`       | PIN login (cashier fast-login)                |

### `/api/cashier` (cashier.routes.js)

| Method | Path                           | Description                       |
| ------ | ------------------------------ | --------------------------------- |
| GET    | `/api/cashier/products`        | Search products/batches for POS   |
| POST   | `/api/cashier/sale`            | Create invoice + deduct inventory |
| GET    | `/api/cashier/held-bills`      | List held bills for branch        |
| POST   | `/api/cashier/held-bills`      | Save a held bill                  |
| GET    | `/api/cashier/held-bills/:id`  | Get held bill by ID               |
| PUT    | `/api/cashier/held-bills/:id`  | Update held bill                  |
| DELETE | `/api/cashier/held-bills/:id`  | Discard held bill                 |
| GET    | `/api/cashier/recent-sales`    | Recent invoice list               |
| GET    | `/api/cashier/sale/:invoiceNo` | Get sale by invoice number        |
| POST   | `/api/cashier/return`          | Process a sales return            |

### `/api/sync` (sync.routes.js)

| Method | Path                  | Auth              | Description                         |
| ------ | --------------------- | ----------------- | ----------------------------------- |
| GET    | `/api/sync/status`    | `requireSyncAuth` | Sync health + pending count         |
| POST   | `/api/sync/batch`     | `requireSyncAuth` | Process a batch of mutations        |
| POST   | `/api/sync/push`      | `requireSyncAuth` | Push outbox mutations               |
| GET    | `/api/sync/pull`      | `requireSyncAuth` | Pull server changes since watermark |
| GET    | `/api/sync/bootstrap` | `requireSyncAuth` | Fetch tenant master data            |
| POST   | `/api/sync/check`     | **[PUBLIC]**      | Connectivity probe                  |

### `/api/branches` (branch.routes.js)

| Method | Path                | Description           |
| ------ | ------------------- | --------------------- |
| GET    | `/api/branches`     | List branches for org |
| GET    | `/api/branches/:id` | Get branch by ID      |
| POST   | `/api/branches`     | Create branch         |
| PUT    | `/api/branches/:id` | Update branch         |
| DELETE | `/api/branches/:id` | Delete branch         |

> **⚠️ Known issue:** `branch.controller.js` reads `organisationId` from `req.query`, not `req.user`. A malicious caller can request branches for a different org by manipulating the query param.

### `/api/purchases` (purchase.routes.js)

| Method | Path                 | Description          |
| ------ | -------------------- | -------------------- |
| GET    | `/api/purchases`     | List purchase orders |
| GET    | `/api/purchases/:id` | Get PO by ID         |
| POST   | `/api/purchases`     | Create PO            |
| PUT    | `/api/purchases/:id` | Update PO            |
| DELETE | `/api/purchases/:id` | Delete PO            |

### `/api/goods-receipts` (goods-receipt.routes.js)

| Method | Path                      | Description              |
| ------ | ------------------------- | ------------------------ |
| GET    | `/api/goods-receipts`     | List GRNs                |
| GET    | `/api/goods-receipts/:id` | Get GRN                  |
| POST   | `/api/goods-receipts`     | Receive stock against PO |
| PUT    | `/api/goods-receipts/:id` | Update GRN               |

### `/api/inventory` (inventory.routes.js)

| Method | Path                           | Description            |
| ------ | ------------------------------ | ---------------------- |
| GET    | `/api/inventory`               | List inventory batches |
| GET    | `/api/inventory/:id`           | Get batch              |
| POST   | `/api/inventory/adjust`        | Stock adjustment       |
| GET    | `/api/inventory/transfers`     | List transfers         |
| POST   | `/api/inventory/transfers`     | Create transfer        |
| PUT    | `/api/inventory/transfers/:id` | Update transfer        |

### `/api/stock-transfers` (stock-transfer.routes.js)

Separate route module also handles stock transfers.

### `/api/customers` (customer.routes.js)

| Method | Path                 | Description     |
| ------ | -------------------- | --------------- |
| GET    | `/api/customers`     | List customers  |
| GET    | `/api/customers/:id` | Get customer    |
| POST   | `/api/customers`     | Create customer |
| PUT    | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

### `/api/prescriptions` (prescription.routes.js)

CRUD for prescriptions.

### `/api/taxes` (tax.routes.js)

CRUD for GST tax slabs.

### `/api/suppliers` (supplier.routes.js)

CRUD for suppliers.

### `/api/reports` (report.routes.js)

Sales, revenue, inventory, and purchase analytics.

### `/api/audit-logs` (audit.routes.js)

Read-only audit trail.

### `/api/superadmin` (superadmin.routes.js)

See §13.

---

## 6. Authentication

### Overview

Two distinct authentication paths in one middleware. Primary path: Supabase JWT. Fallback: Legacy signed JWT.

### auth.middleware.js — Full Flow

```
1. Extract Bearer token from Authorization header

2. Try verifySupabaseToken(token)
   └─ Validates against Supabase JWKS public keys
   └─ Looks up users table: supabase_auth_id = sub OR email match
   └─ If found & ACTIVE → req.user set, proceed

3. Else try verifyToken(token)  [legacy signed JWT]
   └─ verifies with SUPABASE_JWT_SECRET
   └─ Looks up users table: id = userId
   └─ If found & ACTIVE → req.user set, proceed

4. Dev bypass (NODE_ENV !== 'production' && ALLOW_DEV_AUTH === 'true')
   └─ jwt_online_<uuid>_<ts>, offline_token_<uuid>_<ts>, test_user_<uuid>
   └─ Direct UUID token (for internal tooling)
   └─ NEVER enable in production

5. Multi-tenancy context resolution
   └─ x-organisation-id header → validate membership
   └─ x-branch-id header → validate branch assignment
   └─ ADMIN/OWNER skip branch assignment check
   └─ Superadmin skips all membership checks
```

### req.user Object (Set by Middleware)

```javascript
{
  id: "uuid",
  supabaseAuthId: "uuid",
  name: "string",
  email: "string",
  phone: "string",
  staffId: "string",             // e.g. "EMP-1001"
  isPlatformSuperadmin: false,
  role: "OWNER|ADMIN|MANAGER|CASHIER|...",
  roleId: "uuid",
  organisationId: "uuid",
  branchId: "uuid | null",
}
```

### Role Resolution Logic

```javascript
role =
  membership.owner_id === user.id
    ? "OWNER"
    : membership.role_identifier || membership.role_name || "STAFF";
```

### GET /api/auth/me Response

```javascript
{
  user: {
    id, supabaseAuthId, name, email, phone, staffId,
    role, roleId, isPlatformSuperadmin,
    organisationId, organisationName, pharmacyCode,
    branchId, branchName, hasBranch,
    branch: { id, name, branchCode } | null
  }
}
```

> **CURRENT GAP:** The `/me` response does NOT include the user's permission array. Frontend cannot perform permission-based UI gating without a separate API call that doesn't exist yet.

### Frontend Auth State

- Supabase client in frontend detects login/logout via `onAuthStateChange`
- `AppNavigator.js` calls `restoreAuthSession()` on mount
- Auth token stored in Supabase session (NOT localStorage manually)
- `hasBranch` check in `AppNavigator.js` (line 278) shows a "No Branch Assigned" screen before allowing app access

---

## 7. Multi-Tenancy

### Model

```
Organisation (tenant)
  └── Branches (1..N)
  └── Users (via organisation_memberships)
        └── Branch Assignments (membership → branch → role)
```

### How Tenancy is Enforced

1. Every API call that needs org context reads `x-organisation-id` header (or falls back to first active membership).
2. Every API call that needs branch context reads `x-branch-id` header.
3. The middleware validates that the branch belongs to the organisation.
4. Repository queries **must** include `organisation_id = $n` in WHERE clauses. This is the only thing preventing data leakage between tenants.

### Header Protocol (Frontend → Backend)

```
Authorization: Bearer <supabase_access_token>
x-organisation-id: <uuid>
x-branch-id: <uuid>
```

### Superadmin Bypass

If `user.is_platform_superadmin = true`, the middleware skips membership validation and accepts any `x-organisation-id`. This is correct and intentional.

### Known Tenant Isolation Gap

`branch.controller.js` reads `organisationId` from `req.query` instead of `req.user.organisationId`. This allows crafted requests to enumerate branches of other organisations.

**`CURRENT IMPLEMENTATION`** — not yet fixed.

---

## 8. Database Design — Domain by Domain

The schema has **46 tables** defined in `backend/src/db/schema.sql` (2499 lines). All use UUID primary keys (`gen_random_uuid()`).

### Domain 1 — Identity & Platform

| Table                | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `users`              | Login identities. Has `supabase_auth_id`, `google_sub`, `password_hash`, `is_platform_superadmin`.        |
| `organisations`      | Tenant/business record. `owner_id → users`. `status` ∈ {PENDING_PAYMENT, ACTIVE, SUSPENDED, DEACTIVATED}. |
| `subscription_plans` | SaaS plan definitions (shared, platform-level).                                                           |
| `subscriptions`      | Org ↔ Plan binding. `status` ∈ {PENDING_PAYMENT, ACTIVE, EXPIRED, CANCELLED}.                             |

### Domain 2 — RBAC

| Table                      | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `roles`                    | Org-scoped roles. Has `role_identifier`, `clearance_level`.          |
| `organisation_memberships` | User ↔ Org link. `status` ∈ {ACTIVE, ...}.                           |
| `permissions`              | 139 system capability rows.                                          |
| `role_permissions`         | Many-to-many: role ↔ permission.                                     |
| `branch_assignments`       | membership → branch → role. Controls which branch a user can access. |

### Domain 3 — Branches

| Table      | Purpose                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `branches` | Physical locations. `facility_type` ∈ {HOSPITAL_PHARMACY, RETAIL_DISPENSARY, CENTRAL_WAREHOUSE}. |

### Domain 4 — Catalogue

| Table       | Purpose                                                        |
| ----------- | -------------------------------------------------------------- |
| `products`  | Medicine identity (name, brand, SKU, category). No stock here. |
| `suppliers` | Distributor/supplier master.                                   |

### Domain 5 — Inventory

| Table                  | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `inventory_batches`    | Stock per product per branch per batch. Holds `quantity`, `mrp`, `expiry_date`.      |
| `stock_transfers`      | Inter-branch movement request. `status` ∈ {DRAFT, IN_TRANSIT, COMPLETED, CANCELLED}. |
| `stock_transfer_items` | Line items in a transfer.                                                            |

### Domain 6 — Purchasing

| Table                 | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `purchases`           | Purchase order to supplier. `status` ∈ {DRAFT, PENDING, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED}. |
| `purchase_items`      | Line items in a PO.                                                                                         |
| `goods_receipts`      | Actual receipt of stock against a PO.                                                                       |
| `goods_receipt_items` | Line items in a GRN.                                                                                        |

### Domain 7 — Customer & Billing

| Table                      | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `customers`                | Patient/customer. Org-scoped (not branch-scoped). Has `customer_number` (e.g. CUST-1001). |
| `prescriptions`            | Prescription linked to a customer. `prescription_number` (e.g. RX-1001).                  |
| `customer_credit_accounts` | Credit facility for a customer.                                                           |
| `customer_ledger_entries`  | Double-entry style ledger for credit transactions.                                        |

### Domain 8 — POS / Cash Register

| Table                    | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `cash_registers`         | Physical register terminal per branch.                                                              |
| `cash_register_sessions` | One shift session (open → close). Has `opening_balance`, `closing_balance`.                         |
| `cash_movements`         | Cash-in/cash-out events within a session.                                                           |
| `cash_denominations`     | Denomination breakdown at session close.                                                            |
| `held_bills`             | Cart saved mid-sale. `status` ∈ {HOLD, PENDING_PRESCRIPTION, AWAITING_PAYMENT, RESUMED, DISCARDED}. |

### Domain 9 — Sales

| Table                  | Purpose                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `invoices`             | Completed sale. `invoice_number` branch-scoped (e.g. INV-1001). `status` ∈ {DRAFT, COMPLETED, PARTIALLY_PAID, PAID, VOID, CANCELLED}. |
| `invoice_items`        | Sold items with price/tax/discount snapshot at time of sale.                                                                          |
| `payments`             | Money received (the receipt). `receipt_number` branch-scoped.                                                                         |
| `payment_transactions` | Split payment detail (CASH, UPI, CARD, etc.).                                                                                         |
| `payment_allocations`  | Payment → Invoice allocation (for partial/credit payments).                                                                           |
| `returns`              | Sales return record.                                                                                                                  |
| `return_items`         | Line items in a return.                                                                                                               |

### Domain 10 — Tax

| Table                    | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `taxes`                  | GST slab definitions (0%, 5%, 12%, 18%, 28%). |
| `branch_gst_settings`    | Per-branch GST configuration.                 |
| `branch_tax_assignments` | Tax slabs applied to a branch.                |

### Domain 11 — Audit

| Table        | Purpose                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `audit_logs` | Append-only action log. `entity_type` + `entity_id` are not FK'd (generic). |

### Domain 12 — Platform / SaaS Operations

| Table                            | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `platform_tax_configs`           | Platform-level tax configuration.                |
| `platform_business_configs`      | Global business settings.                        |
| `platform_subscription_payments` | Payment records for SaaS subscriptions.          |
| `platform_payment_refunds`       | Refund records.                                  |
| `subscription_invoices`          | Invoice issued to organisation for subscription. |
| `razorpay_webhook_events`        | Idempotency store for Razorpay webhook replays.  |

### Domain 13 — Sequences

| Table              | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `number_sequences` | Human-readable number generator. See §10. |

---

## 9. Database Relationships

```
organisations
├── owner_id ──────────────────────────────────────────→ users
├── subscriptions (1:N) ──────────────────────────────→ subscription_plans
├── organisation_memberships (1:N) ─→ users
│       └── branch_assignments (1:N) ─→ branches, roles
├── branches (1:N)
│       ├── inventory_batches (1:N) ─→ products, suppliers
│       ├── cash_registers (1:N)
│       │       └── cash_register_sessions (1:N)
│       │               ├── cash_movements (1:N)
│       │               ├── held_bills (1:N)
│       │               └── invoices (1:N)
│       ├── invoices (1:N) ─→ customers, prescriptions
│       │       ├── invoice_items (1:N) ─→ products, inventory_batches
│       │       └── payments (1:N)
│       │               ├── payment_transactions (1:N)
│       │               └── payment_allocations (1:N) ─→ invoices
│       └── number_sequences (1:N, branch-scoped)
├── customers (1:N) ─→ [org-scoped]
│       ├── prescriptions (1:N)
│       └── customer_credit_accounts (1:1)
├── products (1:N)
├── suppliers (1:N)
├── roles (1:N)
│       └── role_permissions (N:M) ─→ permissions
├── purchases (1:N) ─→ suppliers, branches
│       ├── purchase_items (1:N) ─→ products
│       └── goods_receipts (1:N)
│               └── goods_receipt_items (1:N)
└── number_sequences (1:N, org-scoped)
```

---

## 10. Number Sequences

**`LOCKED DESIGN DECISION`** — All human-readable business numbers are generated by the `number_sequences` table using `SELECT ... FOR UPDATE` row-level locking inside a transaction. This prevents gaps or duplicates under concurrent load.

### Sequence Types and Scopes

| Sequence Type    | Scope        | Example   |
| ---------------- | ------------ | --------- |
| CUSTOMER         | Organisation | CUST-1001 |
| PRESCRIPTION     | Organisation | RX-1001   |
| INVOICE          | Branch       | INV-1001  |
| RECEIPT          | Branch       | REC-1001  |
| RETURN           | Branch       | RET-1001  |
| BRANCH           | Organisation | BR-001    |
| STAFF            | Organisation | EMP-1001  |
| PURCHASE         | Organisation | PO-1001   |
| STOCK_TRANSFER   | Organisation | TR-001    |
| GOODS_RECEIPT    | Organisation | GRN-1001  |
| REGISTER_SESSION | Branch       | RS-1001   |
| CASH_MOVEMENT    | Branch       | CM-1001   |
| HELD_BILL        | Branch       | HB-1001   |
| PHARMACY_CODE    | Platform     | —         |
| SAAS_INVOICE     | Platform     | —         |
| PLATFORM_PAYMENT | Platform     | —         |
| PLATFORM_REFUND  | Platform     | —         |

### How to Use in Code

```javascript
// Pattern: inside a BEGIN/COMMIT transaction block
await client.query("BEGIN");
const seq = await client.query(
  `SELECT next_number FROM number_sequences
   WHERE organisation_id = $1 AND branch_id = $2 AND sequence_type = $3
   FOR UPDATE`,
  [orgId, branchId, "INVOICE"],
);
const invoiceNumber = `INV-${seq.rows[0].next_number}`;
await client.query(
  `UPDATE number_sequences SET next_number = next_number + 1
   WHERE organisation_id = $1 AND branch_id = $2 AND sequence_type = $3`,
  [orgId, branchId, "INVOICE"],
);
// ... insert invoice ...
await client.query("COMMIT");
```

---

## 11. Transaction Model

### Invoice / Payment Separation

**`LOCKED DESIGN DECISION`** — An Invoice and a Payment are **separate records**. A customer can:

- Pay the full invoice immediately (cash/UPI/card)
- Pay partially
- Pay later (credit)
- Pay using split methods (₹2,000 cash + ₹3,000 UPI)

This separation is implemented via:

```
invoices ─────────────────────────────────────────────┐
                                                       │
payments ─→ payment_transactions (split methods)      │
         └──────────────────────────────────────────→ payment_allocations
```

`payment_allocations` links a payment to one or more invoices. `customer_ledger_entries` tracks the running balance.

### Stock Deduction on Sale

When a sale is created:

1. Insert `invoices` record
2. Insert `invoice_items` records (with product snapshot)
3. **Deduct** `inventory_batches.quantity` for each sold batch
4. Insert `payments` + `payment_transactions`
5. Insert `payment_allocations`
6. All in one PostgreSQL transaction (BEGIN/COMMIT)

---

## 12. RBAC — Role-Based Access Control

### Current Status

**`KNOWN GAP`** — RBAC is **fully designed and database-populated** but **not enforced on any production API route**.

### What Exists (Fully Implemented)

- `permissions` table: 139 rows seeded per organisation.
- `role_permissions` table: seeded per org when org is onboarded.
- `roles` table: 6 system roles seeded per org.
- `rbac.middleware.js`: `requirePermission(permissionName)` is complete and working.
- `role.repository.js`: `getRolePermissions`, `hasRolePermission`, `seedOrganisationSystemRoles` all implemented.
- `permission-catalogue.js`: Complete catalogue with 12 domains.

### What Does NOT Exist

- `requirePermission` is **imported in zero production route files** (verified by grep).
- No HTTP endpoint exposes `GET /roles/:id/permissions`.
- `RolesPermissionsScreen.js` on the frontend is **100% mock data** — no backend integration.
- `/api/auth/me` does not return the user's permissions array.

### The 6 System Roles

| Role Name        | Identifier  | Clearance           | Permissions |
| ---------------- | ----------- | ------------------- | ----------- |
| Administrator    | ADMIN       | ADMIN               | 139 (all)   |
| Manager          | MANAGER     | MANAGEMENT          | 113         |
| Chief Pharmacist | CHIEF_PHARM | CLINICAL_DISPENSING | 56          |
| Pharmacist       | PHARMACIST  | CLINICAL_DISPENSING | 46          |
| Cashier          | CASHIER     | STANDARD_POS        | 28          |
| Accountant       | ACCOUNTANT  | MANAGEMENT          | 44          |

### Effective Security Right Now

- Any **authenticated** ADMIN or OWNER user can call any API endpoint.
- Non-admin roles (CASHIER, PHARMACIST, etc.) have **zero permission enforcement** — they can also call any authenticated endpoint.
- The only "permission check" in the frontend is a string-based `roleName.includes('admin')` test in `Sidebar.js` that hides one menu item.

### Permission Domains (12 Total)

`BILLING`, `CASH_REGISTER`, `CUSTOMER_MANAGEMENT`, `INVENTORY`, `PURCHASE`, `REPORTING`, `SETTINGS`, `STAFF_MANAGEMENT`, `SUPERADMIN`, `RETURNS`, `STOCK_ADJUSTMENT`, `TAX`

### Permission Name Convention

`VERB_NOUN` — e.g. `CREATE_SALE`, `VIEW_USERS`, `ADJUST_STOCK`, `VIEW_AUDIT_LOG`

---

## 13. Superadmin Architecture

### Overview

The **Platform Superadmin** is completely separate from tenant users. It is a **different portal** (`/superadmin` URL path → `<SuperAdminLayout />`).

### Access Control

`requirePlatformSuperadmin` middleware in `superadmin-auth.middleware.js` gates all protected superadmin routes.

### Superadmin Route Map (`/api/superadmin/`)

| Path                            | Auth                        | Description                   |
| ------------------------------- | --------------------------- | ----------------------------- |
| POST `/onboard`                 | **PUBLIC**                  | Self-service org onboarding   |
| POST `/payment/initiate`        | **PUBLIC**                  | Initiate subscription payment |
| POST `/payment/verify`          | **PUBLIC**                  | Verify Razorpay payment       |
| POST `/payment/webhook`         | **PUBLIC**                  | Razorpay webhook              |
| GET `/auth/me`                  | `requirePlatformSuperadmin` | Superadmin profile            |
| GET `/organisations`            | `requirePlatformSuperadmin` | All orgs                      |
| GET `/organisations/:id`        | `requirePlatformSuperadmin` | Org detail                    |
| PUT `/organisations/:id/status` | `requirePlatformSuperadmin` | Activate/suspend org          |
| GET `/users`                    | `requirePlatformSuperadmin` | All users                     |
| GET `/analytics`                | `requirePlatformSuperadmin` | Platform analytics            |
| GET `/subscriptions`            | `requirePlatformSuperadmin` | All subscriptions             |

### Superadmin /me Response

```javascript
{
  role: "SUPERADMIN",
  isPlatformSuperadmin: true
}
```

---

## 14. Branch Model

### What a Branch Is

A physical pharmacy location. It has:

- `branch_code` (e.g. BR-001)
- `facility_type` ∈ {HOSPITAL_PHARMACY, RETAIL_DISPENSARY, CENTRAL_WAREHOUSE}
- `drug_license_number`
- `invoice_prefix` (optional custom prefix for invoice numbering)
- Its own `number_sequences` for INVOICE, RECEIPT, etc.
- Its own `cash_registers` and `cash_register_sessions`

### Branch-Scoped vs Org-Scoped Data

| Data              | Scope        |
| ----------------- | ------------ |
| Customers         | Organisation |
| Products          | Organisation |
| Suppliers         | Organisation |
| Roles             | Organisation |
| Invoice numbers   | Branch       |
| Receipt numbers   | Branch       |
| Inventory batches | Branch       |
| Cash registers    | Branch       |
| Held bills        | Branch       |

### Branch Assignment

A user can be assigned to zero, one, or multiple branches. The assignment carries a `role_id` — so the same user can be a Manager at Branch A and a Cashier at Branch B.

Users with `role_identifier IN ('ADMIN', 'OWNER')` are exempt from branch assignment checks and can access any branch.

---

## 15. Offline Architecture

### Principles

**`LOCKED DESIGN DECISION`** — "Push what happened. Pull what is now true."

The frontend is designed to be **fully operational without internet**. A cashier can:

1. Generate bills offline
2. Accept payments offline
3. View held bills offline
4. The sync engine resolves everything when connectivity returns

### Frontend Offline Storage (Dexie v4 / IndexedDB)

Key IndexedDB tables (from `pharmaflowDb.ts`):

- `sync_outbox` — Outgoing mutations waiting to be pushed to backend
- `sync_transactions` — Local transaction records with sync status
- `sync_metadata` — Sync watermarks, device ID, last sync timestamp
- `customers` — Locally cached customers
- `register_sessions` — Cash register session state
- `cash_movements` — Cash movement events
- Other cached master data tables

### Mutation Lifecycle (Frontend)

```
User action (e.g. creates sale)
  → Write to local IndexedDB immediately (optimistic)
  → Add mutation to sync_outbox with:
      - mutationId (UUID, generated once, never regenerated)
      - mutationType (e.g. "CREATE_SALE")
      - payload (full data)
      - organisationId, branchId, userId
      - status = "PENDING"
      - attemptCount = 0
  → Return success to UI
  → SyncEngine picks up outbox and pushes to backend
```

### Outbox Mutation Statuses

| Status             | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| PENDING            | Waiting to be pushed                             |
| IN_FLIGHT          | Currently being sent                             |
| SYNCED / COMPLETED | Successfully processed by backend                |
| FAILED_RETRYABLE   | Failed but will retry (with exponential backoff) |
| FAILED             | Permanently failed (no auto-retry)               |
| CONFLICT           | Backend rejected with a business conflict        |

---

## 16. Sync Engine

### Frontend SyncEngine (`frontend/src/sync/syncEngine.ts`)

A TypeScript class that manages the complete push/pull lifecycle.

**Key properties:**

- `isSyncing` — single-flight mutex: concurrent triggers share the same active promise
- `authToken` — Bearer token sent with every sync request
- `activeOrganisationId` / `activeBranchId` — tenant context headers
- `state` — observable `SyncEngineState` (status, pendingCount, failedCount, conflictCount, lastSuccessfulSyncAt)

**Lifecycle:**

```
syncEngine.start()
  → restore last sync timestamp from syncMetaRepo
  → start connectivity heartbeat monitoring
  → if online: trigger initial sync()

Connectivity change: offline→online
  → auto-trigger sync()

Manual: syncEngine.syncNow(resetRetries?)
  → optionally reset nextRetryAt on FAILED_RETRYABLE items
  → trigger sync()
```

**Push Sync Loop (`runSyncLoop`):**

```
while (hasMore) {
  1. Peek up to 25 PENDING mutations from outbox (FIFO by sequence)
  2. Mark each as IN_FLIGHT
  3. POST /api/sync/push with all 25 mutations + auth headers
  4. On transport failure:
     → classifySyncError() → categorize as RETRYABLE/PERMANENT/AUTHENTICATION
     → mark all items FAILED_RETRYABLE with exponential backoff
     → break loop
  5. On success:
     → per-mutation result processing:
        SUCCESS → markCompleted, update transaction status to SYNCED
        CONFLICT → markConflict, preserve diagnostics
        FAILED → markFailed (no retry), update transaction status
        other → markFailed (retryable) with backoff
  6. setLastSuccessfulSyncAt(now)
  7. refreshCounts()
}
```

**Idempotency guarantee:** `mutationId` is a UUID generated once at mutation creation and NEVER regenerated on retry. The backend uses this to detect and safely replay duplicates.

**Pull:** Handled by `PullWorker` (separate class). Calls `GET /api/sync/pull?since=<watermark>` to fetch server-side changes and apply them to IndexedDB.

**Bootstrap:** `GET /api/sync/bootstrap` fetches initial master data (products, customers, tax config, etc.) needed for the device to function offline.

### Backend Sync Service (`backend/src/services/sync.service.js` — 4208 lines)

#### Push Processing (`processPushBatch` ~line 3511)

For each mutation in the batch:

1. Check idempotency: has this `mutationId` been processed before? If yes → return SUCCESS (idempotent replay).
2. Route to mutation handler by `mutationType`.
3. Apply business logic (e.g. for CREATE_SALE: insert invoice, deduct stock, insert payment).
4. Return per-mutation result: `{ mutationId, status: 'SUCCESS'|'CONFLICT'|'FAILED'|'ERROR' }`.

#### Pull (`pullChanges` ~line 4090)

Returns all server-side changes newer than the client's `since` watermark (timestamp or sequence number). Scoped to `organisationId` + optional `branchId`.

### Sync Route Auth (Post-Merge — Current State)

All sync routes now use `requireSyncAuth` (the merge regression from prior audit has been confirmed resolved in `sync.routes.js`). The `optionalSyncAuth` function still exists in the middleware but is not used on production routes.

`requireSyncAuth` enforces:

1. Valid token (Supabase JWT primary, legacy JWT fallback, dev tokens if ALLOW_DEV_AUTH=true)
2. Active user in PostgreSQL
3. Organisation exists and is ACTIVE
4. User has active membership in organisation
5. Branch belongs to org and user is authorized for that branch

---

## 17. Business Module Overview

| Module              | Backend Routes            | Frontend Screen             | Status            |
| ------------------- | ------------------------- | --------------------------- | ----------------- |
| POS / Billing       | `/api/cashier`            | `PosBillingScreen.js`       | ✅ Working        |
| Held Bills          | `/api/cashier/held-bills` | `HeldBillsScreen.js`        | ✅ Working        |
| Sales Returns       | `/api/cashier/return`     | `SalesReturnsScreen.js`     | ✅ Working        |
| Cash Register       | `/api/sync` (mutations)   | `CashRegisterScreen.js`     | ✅ Working        |
| Customers           | `/api/customers`          | `CustomersScreen.js`        | ✅ Working        |
| Prescriptions       | `/api/prescriptions`      | `PrescriptionsScreen.js`    | ✅ Working        |
| Purchases           | `/api/purchases`          | `PurchasesScreen.js`        | ✅ Working        |
| Goods Receiving     | `/api/goods-receipts`     | `GoodsReceivingScreen.js`   | ✅ Working        |
| Inventory           | `/api/inventory`          | `InventoryScreen.js`        | ✅ Working        |
| Stock Transfers     | `/api/stock-transfers`    | `StockTransferScreen.js`    | ✅ Working        |
| Reports             | `/api/reports`            | `ReportsScreen.js`          | ✅ Working        |
| Audit Log           | `/api/audit-logs`         | `AuditLogScreen.js`         | ✅ Working        |
| Roles / Permissions | NOT IMPLEMENTED           | `RolesPermissionsScreen.js` | ❌ Mock data only |
| Users Management    | Partial                   | `UsersScreen.js`            | ⚠️ Partial        |
| Tax Settings        | `/api/taxes`              | `TaxSettingsScreen.js`      | ✅ Working        |
| Branch Management   | `/api/branches`           | `BranchManagementScreen.js` | ✅ Working        |
| Offline Sync        | `/api/sync`               | `SyncEngine.ts`             | ✅ Working        |

---

## 18. Sales / POS Flow

### Online Path (Direct API)

```
1. Cashier searches product → GET /api/cashier/products?search=Paracetamol&branchId=<uuid>
   ← Returns products with available batches and quantities

2. Cashier builds cart (local state only — no API call)

3. Cashier submits sale → POST /api/cashier/sale
   Body: { customerId, branchId, organisationId, items[], paymentMethods[], sessionId, ... }

   Backend:
   a. BEGIN transaction
   b. Resolve customer (or use walk-in customer)
   c. Generate invoice_number from branch INVOICE sequence (FOR UPDATE)
   d. Insert invoices record
   e. For each item:
      - Verify inventory_batch has sufficient quantity
      - Insert invoice_items (with price/tax snapshot)
      - UPDATE inventory_batches SET quantity = quantity - sold_qty
   f. Generate receipt_number from branch RECEIPT sequence
   g. Insert payments record
   h. Insert payment_transactions (one per payment method)
   i. Insert payment_allocations (link payment → invoice)
   j. Update customer outstanding_balance if credit sale
   k. COMMIT
   l. Return { invoiceNumber, receiptNumber, invoice, payment }
```

### Offline Path (via Sync Engine)

```
1. Same product search → served from local Dexie cache
2. Cart built locally
3. Submit sale → write CREATE_SALE mutation to sync_outbox
   - Also write to local Dexie invoices table (optimistic)
   - Return success immediately to UI
4. SyncEngine pushes when online
5. Backend processes identically to online path
6. On SUCCESS → outbox entry marked COMPLETED, Dexie record updated
```

### Hold Bill

```
POST /api/cashier/held-bills
Body: { cart_data, customer_name, subtotal, total_amount, ... }
← Returns held bill with hold_token (e.g. HB-1001)

Later: GET /api/cashier/held-bills → list, restore cart
```

---

## 19. Purchase / GRN Flow

### Purchase Order

```
POST /api/purchases
Body: { organisationId, branchId, supplierId, orderDate, items[] }
← Creates PO with status = PENDING

Status flow: DRAFT → PENDING → APPROVED → PARTIALLY_RECEIVED → RECEIVED
```

### Goods Receipt (GRN)

```
POST /api/goods-receipts
Body: { purchaseId, branchId, items[{ productId, batchNumber, expiryDate, mrp, quantity }] }

Backend:
a. BEGIN transaction
b. For each item:
   - Find or create inventory_batch (product + branch + batch_number)
   - UPDATE inventory_batches SET quantity = quantity + received_qty
c. Update purchase status (PARTIALLY_RECEIVED or RECEIVED)
d. Generate GRN number from GOODS_RECEIPT sequence
e. COMMIT
```

---

## 20. Customer & Credit Flow

### Customer Creation

```
POST /api/customers
Body: { organisationId, full_name, phone, email, category, ... }

Backend:
- Generate customer_number (CUSTOMER sequence, org-scoped)
- Insert customer record
```

### Credit Account

```
customer_credit_accounts (1:1 with customers)
  └── credit_limit
  └── outstanding_balance

customer_ledger_entries (append-only)
  └── debit/credit entries per transaction
```

### Customer is Org-Scoped

A customer `CUST-1001` can purchase from Main Branch or Pune Branch of the same org without creating a new customer record.

---

## 21. Inventory Flow

### Stock Lifecycle

```
PO created → GRN received → inventory_batches.quantity increases
                ↓
        Sale created → inventory_batches.quantity decreases
                ↓
        Return created → inventory_batches.quantity increases
                ↓
        Stock Adjustment → inventory_batches.quantity adjusted (±)
                ↓
        Stock Transfer → quantity moves from one branch to another
```

### Stock Adjustment

`POST /api/inventory/adjust`
Records a manual stock correction. Adjusts `inventory_batches.quantity` and logs to `audit_logs`.

### Stock Transfer

`POST /api/stock-transfers`
Creates a `stock_transfers` record with `status = IN_TRANSIT`. When accepted at destination, quantity moves from `from_branch` batches to `to_branch` batches.

---

## 22. Reporting

`GET /api/reports/sales` — Sales totals, revenue by period.
`GET /api/reports/inventory` — Stock levels, expiry alerts.
`GET /api/reports/purchases` — PO and GRN analytics.

Reports are read-only SQL aggregation queries. No state changes.

**`CURRENT IMPLEMENTATION`** — Reports module exists and is wired. No caching layer (Redis) has been applied to reports yet.

---

## 23. Audit Logging

`audit_logs` is an append-only table. It records:

- `action` — verb (e.g. `CREATE_INVOICE`, `ADJUST_STOCK`)
- `entity_type` + `entity_id` — what was acted on (not FK'd — generic)
- `user_id`, `organisation_id`
- `metadata` JSONB — arbitrary extra context
- `ip_address`, `user_agent`

**Important:** `entity_id` is NOT a foreign key. This is intentional — it allows recording events for any entity type without a schema change.

The audit service is called by various service functions after successful operations. Coverage is partial — not all mutations are audited.

---

## 24. Error Handling Conventions

### HTTP Status Codes

| Code | When                                         |
| ---- | -------------------------------------------- |
| 200  | Success                                      |
| 400  | Bad request / missing field / validation     |
| 401  | Unauthenticated (no/invalid token)           |
| 403  | Forbidden (authenticated but not authorized) |
| 404  | Record not found                             |
| 409  | Conflict (duplicate invoice number, etc.)    |
| 500  | Unexpected server error                      |

### Response Shape

```javascript
// Success
{ success: true, data: {...} }
{ success: true, invoice: {...}, payment: {...} }

// Error
{ success: false, error: "Human-readable error message" }
```

### PostgreSQL NUMERIC → Node.js String Bug

**`KNOWN GAP`** — The `pg` driver returns all `NUMERIC` columns as JavaScript strings. Any code doing arithmetic on `total_amount`, `mrp`, `unit_price`, etc. must wrap values with `Number()` or `parseFloat()`.

This was the root cause of the `TypeError: pendingDraftValue?.toFixed is not a function` bug fixed in prior sessions. The fix was applied to:

- `HeldBillsScreen.js`
- `SalesReturnsScreen.js`
- `PosBillingScreen.js`
- `PosContext.js`
- `cashier.service.js`

When writing new queries that return NUMERIC columns, **always** map them explicitly:

```javascript
const result = {
  total_amount: Number(row.total_amount),
  tax_amount: Number(row.tax_amount),
  // etc.
};
```

---

## 25. Current Known Issues

### ARCH-01 — RBAC Not Enforced

**Severity: HIGH**

`requirePermission` middleware exists and works, but is imported into zero production route files. All authenticated users can call all API endpoints regardless of their role.

**Status:** `KNOWN GAP — not fixed`

### ARCH-02 — /api/auth/me Omits Permissions

**Severity: HIGH**

The `/me` endpoint does not return the user's permission array. Frontend cannot perform permission-based UI gating.

**Status:** `KNOWN GAP — not fixed`

### ARCH-03 — RolesPermissionsScreen is Mock-Only

**Severity: MEDIUM**

`RolesPermissionsScreen.js` imports from `managementMockData.js`. No backend RBAC API is wired. Changes made in the UI are not persisted.

**Status:** `KNOWN GAP — not fixed`

### ARCH-04 — Branch Controller Reads OrgId from Query Param

**Severity: MEDIUM**

`branch.controller.js` takes `organisationId` from `req.query` instead of `req.user.organisationId`. A crafted request can enumerate other orgs' branches.

**Status:** `KNOWN GAP — not fixed`

### ARCH-05 — PostgreSQL NUMERIC → String Coercion

**Severity: MEDIUM** (will bite every new numeric query if not handled)

PostgreSQL `NUMERIC` columns arrive as JavaScript strings via the `pg` driver. Every service function that returns numeric values must explicitly coerce to `Number()`.

**Status:** `PARTIALLY FIXED — cashier module fixed; other modules may have the same issue`

### SEC-01 — (Resolved Post-Merge)

Post-audit review of `sync.routes.js` confirms all routes now use `requireSyncAuth`. The prior regression (optionalSyncAuth on push/pull) is fixed.

### PERF-01 — No Redis Caching Applied

Redis is configured (`redis ^6.2.1`, env vars `REDIS_HOST`, `REDIS_PORT`) but no actual caching is observed in service files. The connection is established but unused.

**Status:** `KNOWN GAP — not fixed`

---

## 26. Locked Design Decisions

These are not open for debate. Do not refactor them.

| #     | Decision                                        | Rationale                                                                                          |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| LD-01 | **Organisation = Tenant boundary**              | All data is org-scoped at the database level.                                                      |
| LD-02 | **Branch-scoped invoice/receipt numbers**       | Multi-branch orgs require per-branch sequences. INV-1001 can exist at two branches simultaneously. |
| LD-03 | **`number_sequences` with FOR UPDATE locking**  | PostgreSQL SERIAL cannot provide per-org/per-branch independent counters.                          |
| LD-04 | **Invoice ≠ Payment (separated records)**       | Multi-method split payments require payment_transactions. Credit requires payment_allocations.     |
| LD-05 | **Supabase JWT primary, legacy JWT fallback**   | Migration path from custom auth to Supabase Auth without breaking existing sessions.               |
| LD-06 | **CommonJS (require/module.exports)**           | Backend is Node.js CommonJS. Do not convert to ESM.                                                |
| LD-07 | **Dexie v4 IndexedDB for offline**              | Selected for offline-first PWA. Do not replace with localStorage or sessionStorage.                |
| LD-08 | **Outbox pattern with mutationId idempotency**  | Guarantees exactly-once processing even on transport retry. mutationId must never be regenerated.  |
| LD-09 | **Push-then-pull sync order**                   | Local changes must reach server before pulling server state, to avoid overwriting local work.      |
| LD-10 | **Customers are org-scoped, not branch-scoped** | A customer of Falah Pharmacy can purchase at any branch of Falah Pharmacy.                         |

---

## 27. What NOT To Do

- **Do NOT** use `localStorage` for offline data storage. Use Dexie IndexedDB.
- **Do NOT** add `import/export` syntax to backend files. Use `require/module.exports`.
- **Do NOT** skip `Number()` conversion when reading NUMERIC columns from PostgreSQL.
- **Do NOT** take `organisationId` from request body/query for tenant data queries. Use `req.user.organisationId` (from middleware).
- **Do NOT** create new routes that bypass `authenticate` middleware (except explicitly public endpoints like health checks and the Razorpay webhook).
- **Do NOT** change `mutationId` on retry in the sync outbox. It is the idempotency key.
- **Do NOT** add number sequence logic outside `SELECT ... FOR UPDATE` transactions.
- **Do NOT** remove the `invoice ≠ payment` separation — do not add a single `payment_method` column to invoices.
- **Do NOT** expose actual secret values in documentation, logs, or error responses. Log variable names only.
- **Do NOT** touch `permission-catalogue.js` without understanding the full downstream impact on seeding.

---

## 28. How to Add a New Module

Follow this checklist:

### 1. Database

- Add new table to `schema.sql` with proper `organisation_id` FK and tenant isolation.
- If human-readable numbers are needed, add a `sequence_type` to `number_sequences` CHECK constraint.
- Run `npm run db:schema` to apply.

### 2. Repository

- Create `backend/src/repositories/my-module.repository.js`
- All queries must include `organisation_id = $n` in WHERE clauses.
- Export a plain object with functions.
- Return `rows[0]` or `rows` from `pool.query()`.

### 3. Service

- Create `backend/src/services/my-module.service.js`
- Business logic lives here (not in controller or repository).
- Coerce NUMERIC columns to `Number()` in the mapping function.
- Write to `audit_logs` for state-changing operations.

### 4. Controller

- Create `backend/src/controllers/my-module.controller.js`
- Thin wrapper: extract from `req`, call service, return JSON.
- Follow error shape: `{ success: false, error: "message" }`.

### 5. Routes

- Create `backend/src/routes/my-module.routes.js`
- Apply `authenticate` to all protected routes.
- **DO** add `requirePermission('VIEW_MODULE')` etc. — RBAC enforcement is the next phase.

### 6. Register in server.js

```javascript
const myModuleRoutes = require("./routes/my-module.routes");
app.use("/api/my-module", myModuleRoutes);
```

### 7. Frontend Screen

- Create screen in `frontend/src/screens/<domain>/MyScreen.js`
- Call backend via `fetch(API_URL + '/api/my-module', ...)` with auth headers.
- Register in `AppNavigator.js`.
- Add to `Sidebar.js` with appropriate icon.

### 8. Offline Support (if needed)

- Add Dexie table in `pharmaflowDb.ts`.
- Write outbox mutation type handler in sync service.
- Add mutation type to sync engine result processing in `syncEngine.ts`.

---

## 29. Testing

### Backend Tests

```bash
cd backend
npm run test           # Runs e2e-verification.test.js
npm run test:e2e       # Same
```

`backend/src/tests/e2e-verification.test.js` — 60 tests. All should pass. Tests verify route availability and response shapes.

### Frontend Tests

```bash
cd frontend
npm run test:bootstrap   # 120-screen Babel AST validation
npm run test:sync        # Sync engine integration
npm run test:persistence # Dexie persistence
npm run test:payments    # Phase 2 payment flows
npm run test:receiving   # Phase 3 GRN flows
npm run test:phase4      # Phase 4 inventory flows
npm run test:phase5      # Phase 5 cash register flows
npm run test:integration # Canonical integration test
npm run test:shared      # Shared architecture test
```

All frontend tests use `ts-node` and `fake-indexeddb`. There are **no Jest/Mocha test runners** — scripts are standalone node programs.

---

## 30. Environment & Local Dev Setup

### Prerequisites

- Node.js LTS
- Access to Supabase project (PostgreSQL + Auth)
- Redis (optional — configured but not actively used)

### Environment Variables (Backend — `.env`)

Do NOT commit actual values. These are the variable NAMES only:

| Variable                    | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `DB_HOST`                   | PostgreSQL host                                                       |
| `DB_PORT`                   | PostgreSQL port                                                       |
| `DB_USER`                   | PostgreSQL user                                                       |
| `DB_PASSWORD`               | PostgreSQL password                                                   |
| `DB_DATABASE`               | Database name                                                         |
| `DATABASE_URL`              | Full connection string (alternative)                                  |
| `REDIS_HOST`                | Redis host                                                            |
| `REDIS_PORT`                | Redis port                                                            |
| `SUPABASE_URL`              | Supabase project URL                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only — NEVER expose to client) |
| `SUPABASE_ANON_KEY`         | Supabase anon key                                                     |
| `SUPABASE_JWT_SECRET`       | JWT secret for verifying Supabase tokens                              |
| `CLIENT_ID`                 | Google OAuth Client ID                                                |
| `CLIENT_SECRET`             | Google OAuth Client Secret                                            |
| `PORT`                      | Backend port (default: 5000)                                          |
| `NODE_ENV`                  | `development` or `production`                                         |
| `ALLOW_DEV_AUTH`            | `true` to enable dev-only token bypass (dev only)                     |
| `CORS_ORIGINS`              | Comma-separated allowed origins (leave blank in dev)                  |

### Starting the Dev Server

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev          # nodemon src/server.js on port 5000

# Terminal 2 — Frontend
cd frontend
npm install
npm start            # Expo web on port 8081
```

The `frontend/scripts/start-single-tier.js` script starts the backend automatically when `npm start` is run from the frontend directory.

### Database Setup

```bash
cd backend
npm run db:schema        # Apply schema.sql
npm run db:seed          # Seed basic data
npm run db:seed:branches # Seed demo branches
npm run seed:demo        # Seed full demo pharmacy
```

### Health Check

`GET http://localhost:5000/health` → `{ status: "OK" }`

---

## 31. Demo Tenant

| Field             | Value                                  |
| ----------------- | -------------------------------------- |
| Organisation Name | MedLife Care Chemist                   |
| Organisation ID   | `566a2312-ea81-4be9-9007-a925538d4d74` |
| Database          | `falah_pharmacy` (Supabase PostgreSQL) |
| Status            | ACTIVE                                 |

Use this org ID for manual API testing via Postman/curl:

```bash
curl -H "Authorization: Bearer <token>" \
     -H "x-organisation-id: 566a2312-ea81-4be9-9007-a925538d4d74" \
     http://localhost:5000/api/cashier/products?search=Para
```

---

## 32. Code Ownership

| Area                                           | Owner                                                 |
| ---------------------------------------------- | ----------------------------------------------------- |
| Backend API                                    | Backend team                                          |
| Frontend screens (`/screens/`)                 | Frontend team                                         |
| AppNavigator / routing                         | Frontend team                                         |
| Sync Engine (`syncEngine.ts`, `pullWorker.ts`) | Shared — coordinate changes                           |
| Database schema (`schema.sql`)                 | Backend team — communicate schema changes to frontend |
| Permission catalogue                           | Backend team — changes affect seeding                 |
| Superadmin portal                              | Backend team                                          |

---

## 33. Team Context

- **Active phase:** Phase 5 — Cash register fully wired, sync stable.
- **Next priorities:** Permission enforcement (add `requirePermission` to routes), `/api/auth/me` permissions response, frontend RBAC-aware navigation.
- **Principle:** Working vertical slices over architectural perfection. Don't refactor things that work; add to them.
- **Google OAuth:** Owner Google Login is implemented (post-Phase-4 merge). `POST /api/auth/google` and `POST /api/auth/google-onboard` are live.
- **Single-tier startup:** `frontend/scripts/start-single-tier.js` starts both frontend and backend from the frontend `npm start` command.
- **Branch:** `main`. Ahead of `origin/main` by several commits (local dev work not yet pushed).

---

## 34. Final Summary

| What                         | Status                                     |
| ---------------------------- | ------------------------------------------ |
| Backend Express API          | ✅ Running, all route modules wired        |
| PostgreSQL schema            | ✅ 46 tables, well-designed, FK-consistent |
| Supabase Auth (primary)      | ✅ JWKS-validated JWT, working             |
| Multi-tenancy isolation      | ✅ org-scoped queries in repositories      |
| Number sequences             | ✅ FOR UPDATE locking, all types seeded    |
| Invoice ≠ Payment separation | ✅ Fully implemented                       |
| RBAC database + permissions  | ✅ 139 permissions, 6 roles, seeded        |
| RBAC API enforcement         | ❌ requirePermission not used on any route |
| Offline-first frontend       | ✅ Dexie v4, full local operation          |
| Sync Engine (push)           | ✅ Single-flight, idempotent, batched      |
| Sync Engine (pull)           | ✅ Watermark-based                         |
| Sync auth security           | ✅ requireSyncAuth on all sync routes      |
| Cash register module         | ✅ Sessions, movements, denominations      |
| POS / billing                | ✅ Online and offline paths                |
| Held bills                   | ✅ Full CRUD, hold tokens                  |
| Purchases / GRN              | ✅ Working                                 |
| Inventory management         | ✅ Working                                 |
| Stock transfers              | ✅ Working                                 |
| Reports                      | ✅ Working                                 |
| Audit logging                | ⚠️ Partial coverage                        |
| Roles/Permissions UI         | ❌ Mock data only — no backend integration |
| Redis caching                | ❌ Configured but unused                   |
| Superadmin portal            | ✅ Separate portal, gated correctly        |

---

_Document created from live codebase inspection. No source code, database data, or configuration was modified during its creation._
