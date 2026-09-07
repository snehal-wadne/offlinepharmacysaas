-- ============================================================
-- Pharmacy Billing SaaS - Database Schema
-- PostgreSQL
-- ============================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
-- Stores login identities. Organisation-specific access is
-- handled through organisation_memberships.

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

-- Primary account identity used by the application.
email VARCHAR(255) UNIQUE NOT NULL,

-- BCrypt/Argon2-style password hash for local authentication.
-- NULL means the user does not currently have password login enabled.
password_hash VARCHAR(255),

-- Stable Google account identifier obtained from the verified Google identity.
-- NULL means Google login has not been linked to this account.
google_sub VARCHAR(255) UNIQUE,
name VARCHAR(100) NOT NULL,
status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
email_verified_at TIMESTAMPTZ,
last_login_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- Every user must have at least one way to authenticate.
CONSTRAINT users_auth_method_check
        CHECK (
            password_hash IS NOT NULL
            OR google_sub IS NOT NULL
        )
);
-- ============================================================
-- 2. ORGANISATIONS
-- ============================================================
-- An organisation is the tenant/business boundary.
-- owner_id identifies the person who owns the organisation.

CREATE TABLE IF NOT EXISTS organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    owner_id UUID NOT NULL REFERENCES users (id),
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SUBSCRIPTION PLANS
-- ============================================================
-- Defines the plans offered by the SaaS application.
-- These records are shared by all organisations.

CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    billing_interval VARCHAR(20) NOT NULL,
    max_branches INTEGER,
    max_users INTEGER,
    max_storage_bytes BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subscription_plans_price_check CHECK (price >= 0),
    CONSTRAINT subscription_plans_limits_check CHECK (
        (
            max_branches IS NULL
            OR max_branches >= 0
        )
        AND (
            max_users IS NULL
            OR max_users >= 0
        )
        AND (
            max_storage_bytes IS NULL
            OR max_storage_bytes >= 0
        )
    )
);

-- ============================================================
-- 4. SUBSCRIPTIONS
-- ============================================================
-- Connects an organisation to a subscription plan.
-- Keeping this separate from subscription_plans allows
-- subscription history to be retained.

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id),
    plan_id UUID NOT NULL REFERENCES subscription_plans (id),
    status VARCHAR(30) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. ROLES
-- ============================================================
-- Defines organisation-specific access roles such as
-- Owner, Manager and Cashier.

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roles_organisation_name_unique UNIQUE (organisation_id, name)
);

-- ============================================================
-- 6. ORGANISATION MEMBERSHIPS
-- ============================================================
-- Connects a user to an organisation and gives that
-- membership a role.

CREATE TABLE IF NOT EXISTS organisation_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT organisation_memberships_unique_user UNIQUE (organisation_id, user_id)
);

-- ============================================================
-- 7. PERMISSIONS
-- ============================================================
-- Each row represents one system capability, for example
-- CREATE_INVOICE or ADJUST_STOCK.

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. ROLE PERMISSIONS
-- ============================================================
-- A role can have many permissions and a permission can be
-- assigned to many roles. Each row represents one such
-- relationship.

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- 9. BRANCHES
-- ============================================================
-- Physical pharmacy locations belonging to an organisation.

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT branches_organisation_name_unique UNIQUE (organisation_id, name)
);

-- ============================================================
-- 10. BRANCH ASSIGNMENTS
-- ============================================================
-- Controls which branches an organisation membership can
-- access. One membership may be assigned to multiple branches.

CREATE TABLE IF NOT EXISTS branch_assignments (
    membership_id UUID NOT NULL REFERENCES organisation_memberships (id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    PRIMARY KEY (membership_id, branch_id)
);

-- ============================================================
-- 11. AUDIT LOGS
-- ============================================================
-- Records important actions performed by users.
-- entity_id is intentionally not an FK because this table
-- can record events for different entity types.

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. PRODUCTS
-- ============================================================

-- Stores the identity and characteristics of a medicine/product.
--
-- Stock, batch, branch and quantity are stored separately
-- in inventory_batches.
--
-- Category belongs to the product because it describes what
-- kind of product it is, rather than a particular stock batch.

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL DEFAULT 'OTHERS',
    medicine_name VARCHAR(200) NOT NULL,
    brand_name VARCHAR(200) NOT NULL,
    strength VARCHAR(100),
    pack_size VARCHAR(100),
    manufacturer VARCHAR(200),
    sku VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_rx_required BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT products_organisation_sku_unique UNIQUE (organisation_id, sku)
);

-- ============================================================
-- 13. SUPPLIERS
-- ============================================================
-- Stores reusable supplier/distributor information for an
-- organisation.

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(30),
    email VARCHAR(255),
    city VARCHAR(100),
    gstin VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    category VARCHAR(100) DEFAULT 'Medicines & Injections',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 14. INVENTORY BATCHES
-- ============================================================
-- Represents stock of a product at a branch for a particular
-- batch. Batch number, expiry, MRP and quantity belong here,
-- not in products.
-- branch_number is human readable number for batch like B-001, -- B-002

CREATE TABLE IF NOT EXISTS inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers (id),
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    shelf_location VARCHAR(100),
    updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_batches_mrp_check CHECK (mrp >= 0),
    CONSTRAINT inventory_batches_quantity_check CHECK (quantity >= 0)
);

-- ============================================================
-- 15. STOCK TRANSFERS
-- ============================================================
-- Represents a stock movement request between two branches.
-- A transfer can contain multiple products/batches through
-- stock_transfer_items.


CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    from_branch_id UUID NOT NULL
        REFERENCES branches(id),

    to_branch_id UUID NOT NULL
        REFERENCES branches(id),

    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

    transfer_number VARCHAR(50) NOT NULL,
    -- transfer_number is human readable text like TR-001

    notes TEXT,

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- A branch cannot transfer stock to itself.
CONSTRAINT stock_transfers_different_branches CHECK (
    from_branch_id <> to_branch_id
),

-- Keep transfer states limited to the states supported
-- by the stock transfer workflow.
CONSTRAINT stock_transfers_status_check
        CHECK (
            status IN (
                'DRAFT',
                'IN_TRANSIT',
                'COMPLETED',
                'CANCELLED'
            )
        )
);

-- ============================================================
-- 16. STOCK TRANSFER ITEMS
-- ============================================================
-- Contains the products/batches included in a transfer.
-- One transfer can contain multiple items.


CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transfer_id UUID NOT NULL
        REFERENCES stock_transfers(id)
        ON DELETE CASCADE,

    inventory_batch_id UUID NOT NULL
        REFERENCES inventory_batches(id),

    quantity INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- A transfer item must contain a positive quantity.
CONSTRAINT stock_transfer_items_quantity_check CHECK (quantity > 0),

-- The same inventory batch should not appear twice in
-- one transfer. Its quantity should be represented by
-- a single item row.
CONSTRAINT stock_transfer_items_unique_batch
        UNIQUE (transfer_id, inventory_batch_id)
);

-- ============================================================
-- 17. PURCHASES
-- ============================================================
-- Represents a purchase order created for a supplier and
-- intended for a specific branch.
--
-- The products and quantities in the order are stored in
-- purchase_items.


CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations(id)
        ON DELETE CASCADE,

-- Human-readable PO number shown to users.


purchase_number VARCHAR(50) NOT NULL,

    supplier_id UUID NOT NULL
        REFERENCES suppliers(id),

    branch_id UUID NOT NULL
        REFERENCES branches(id),

    order_date DATE NOT NULL DEFAULT CURRENT_DATE,

    expected_date DATE,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    notes TEXT,

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT purchases_status_check
        CHECK (
            status IN (
                'DRAFT',
                'PENDING',
                'APPROVED',
                'PARTIALLY_RECEIVED',
                'RECEIVED',
                'CANCELLED'
            )
        ),

    CONSTRAINT purchases_organisation_number_unique
        UNIQUE (organisation_id, purchase_number)
);

-- ============================================================
-- 18. PURCHASE ITEMS
-- ============================================================
-- Contains the products and quantities included in a purchase
-- order.
--
-- One purchase can contain multiple purchase items.


CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    purchase_id UUID NOT NULL
        REFERENCES purchases(id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id),

    ordered_quantity INTEGER NOT NULL,

    unit_cost NUMERIC(12, 2) NOT NULL,

    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT purchase_items_quantity_check
        CHECK (ordered_quantity > 0),

    CONSTRAINT purchase_items_unit_cost_check
        CHECK (unit_cost >= 0),

    CONSTRAINT purchase_items_tax_check
        CHECK (tax_amount >= 0),

    CONSTRAINT purchase_items_discount_check
        CHECK (discount_amount >= 0),

-- The same product should appear only once in a purchase
-- order. Its quantity should be updated instead.
CONSTRAINT purchase_items_unique_product
        UNIQUE (purchase_id, product_id)
);

-- ============================================================
-- CUSTOMER & BILLING DOMAIN
-- ============================================================
--
-- This section contains the database structures required for
-- customer management, prescriptions, customer credit,
-- invoices, payments, payment allocation and customer ledger.
--
-- The design deliberately separates:
--
--   Customer
--       ↓
--   Invoice
--       ↓
--   Invoice Items
--
--   Customer
--       ↓
--   Payment
--       ↓
--   Payment Transactions
--
--   Payment
--       ↓
--   Payment Allocations
--       ↓
--   Invoice
--
--   Invoice / Payment / future Return or Adjustment
--       ↓
--   Customer Ledger
--
-- PostgreSQL UUIDs remain the technical primary keys.
-- Human-readable numbers such as CUST-1001 and INV-1001
-- are generated separately using number_sequences.
--
-- Important:
-- organisation_id and branch_id supplied by the client must
-- always be validated by the service layer. PostgreSQL foreign
-- keys guarantee that referenced records exist, but they do
-- not by themselves guarantee that two separately supplied IDs
-- belong to the same organisation.
-- ============================================================

-- ============================================================
-- 19. NUMBER SEQUENCES
-- ============================================================
--
-- Generates human-readable business numbers such as:
--
--   CUST-1001
--   CUST-1002
--   INV-1001
--   REC-1001
--   RX-1001
--
-- The counter is scoped according to the business requirement:
--
--   CUSTOMER     → organisation
--   PRESCRIPTION → organisation
--   INVOICE      → branch
--   RECEIPT      → branch
--
-- This is intentionally separate from UUID primary keys.
--
-- A PostgreSQL SERIAL/IDENTITY column cannot directly provide
-- independent counters for every organisation or branch.
--
-- The application must obtain and increment these counters
-- inside a PostgreSQL transaction using row-level locking.
-- ============================================================


CREATE TABLE IF NOT EXISTS number_sequences (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

-- Organisation owning this sequence.
organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,

-- Branch for branch-scoped sequences.
--
-- NULL means the sequence is organisation-scoped.
-- For example, customer numbers use NULL here.
branch_id UUID REFERENCES branches (id) ON DELETE CASCADE,

-- Identifies what kind of business number this sequence
-- generates.
sequence_type VARCHAR(30) NOT NULL,

-- Next number that should be issued.
--
-- The application locks this row with SELECT ... FOR UPDATE
-- before reading and incrementing the value.


next_number BIGINT NOT NULL DEFAULT 1001,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT number_sequences_type_check
        CHECK (
            sequence_type IN (
                'CUSTOMER',
                'PRESCRIPTION',
                'INVOICE',
                'RECEIPT',
                'RETURN'
            )
        ),

    CONSTRAINT number_sequences_next_number_check
        CHECK (next_number > 0)
);

-- Organisation-scoped sequences.
-- Example:
--   Organisation A → CUSTOMER
--   Organisation B → CUSTOMER
--
-- Both organisations can independently have CUST-1001.
CREATE UNIQUE INDEX IF NOT EXISTS number_sequences_organisation_scope_unique ON number_sequences (
    organisation_id,
    sequence_type
)
WHERE
    branch_id IS NULL;

-- Branch-scoped sequences.
-- Example:
--   Branch A → INVOICE
--   Branch B → INVOICE
--
-- Each branch maintains its own invoice sequence.
CREATE UNIQUE INDEX IF NOT EXISTS number_sequences_branch_scope_unique ON number_sequences (
    organisation_id,
    branch_id,
    sequence_type
)
WHERE
    branch_id IS NOT NULL;

-- Useful when looking up all sequences belonging to an
-- organisation.
CREATE INDEX IF NOT EXISTS idx_number_sequences_organisation ON number_sequences (organisation_id);

-- ============================================================
-- 20. CUSTOMERS
-- ============================================================
--
-- Represents a pharmacy customer/patient.
--
-- A customer belongs to an organisation rather than a branch.
-- The same customer can therefore purchase from multiple
-- branches of the same pharmacy organisation.
--
-- Example:
--
--   Organisation: Falah Pharmacy
--
--   CUST-1001 → Rajesh Verma
--
-- Rajesh can later purchase from Main Branch or another branch
-- without creating another customer record.
--
-- customer_number is generated by the organisation-scoped
-- CUSTOMER sequence in number_sequences.
-- ============================================================


CREATE TABLE IF NOT EXISTS customers (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

-- Tenant owning this customer.
organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,

-- Human-readable customer identifier.
-- Example: CUST-1001
customer_number VARCHAR(50) NOT NULL,

-- Customer's full name.
full_name VARCHAR(200) NOT NULL,
phone VARCHAR(30),
email VARCHAR(255),

-- Date of birth is preferred over storing age because
-- age changes over time and can be calculated when needed.
date_of_birth DATE, gender VARCHAR(30),

-- Customer category shown by the customer-management
-- workflow, for example REGULAR, CORPORATE, etc.


category VARCHAR(50),

        address VARCHAR(500),

        status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT customers_number_unique
            UNIQUE (organisation_id, customer_number),

        CONSTRAINT customers_status_check
            CHECK (
                status IN (
                    'ACTIVE',
                    'INACTIVE'
                )
            )
);

-- Customer directory commonly filters/searches customers
-- within an organisation.
CREATE INDEX IF NOT EXISTS idx_customers_organisation ON customers (organisation_id);

-- Useful for customer directory ordering/searching.
CREATE INDEX IF NOT EXISTS idx_customers_organisation_name ON customers (organisation_id, full_name);

-- Phone is a common customer lookup field.
CREATE INDEX IF NOT EXISTS idx_customers_organisation_phone ON customers (organisation_id, phone);

-- ============================================================
-- 21. PRESCRIPTIONS
-- ============================================================
--
-- Represents a prescription associated with a customer.
--
-- Prescription and doctor/prescriber information are intentionally
-- kept in ONE table based on the current project decision.
--
-- One customer can have many prescriptions.
--
-- Example:
--
--   CUST-1001
--       |
--       +── RX-1001 → Dr. Rahul Sharma
--       |
--       +── RX-1002 → Dr. Priya Patel
--
-- prescription_number is generated by the organisation-scoped
-- PRESCRIPTION sequence.
--
-- prescription_reference is different:
-- it represents a reference supplied by the doctor/hospital/
-- external prescription and is NOT generated by our system.
-- ============================================================


CREATE TABLE IF NOT EXISTS prescriptions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations (id)
        ON DELETE CASCADE,

    customer_id UUID NOT NULL
        REFERENCES customers (id)
        ON DELETE CASCADE,

-- System-generated prescription identifier.
-- Example: RX-1001
prescription_number VARCHAR(50) NOT NULL,

-- Optional external/doctor-provided prescription reference.
prescription_reference VARCHAR(100),

-- Doctor / prescriber information.
doctor_name VARCHAR(200) NOT NULL,
specialization VARCHAR(150),
hospital_or_clinic VARCHAR(200),
doctor_registration_number VARCHAR(100),

-- Optional clinical information shown by the current
-- customer/prescription workflow.


chronic_conditions TEXT,

    drug_allergies TEXT,

    prescription_date DATE NOT NULL DEFAULT CURRENT_DATE,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT prescriptions_number_unique
        UNIQUE (organisation_id, prescription_number),

    CONSTRAINT prescriptions_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'EXPIRED',
                'CANCELLED'
            )
        )
);

-- Customer prescription history.
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions (
    customer_id,
    prescription_date DESC
);

-- Organisation-level prescription searches.
CREATE INDEX IF NOT EXISTS idx_prescriptions_organisation ON prescriptions (organisation_id);

-- Useful when searching prescriptions by external reference.
CREATE INDEX IF NOT EXISTS idx_prescriptions_reference ON prescriptions (
    organisation_id,
    prescription_reference
);

-- ============================================================
-- 22. CUSTOMER CREDIT ACCOUNTS
-- ============================================================
--
-- Represents the credit facility/configuration for a customer.
--
-- This is NOT the customer's transaction history.
--
-- Example:
--
--   Customer: Rajesh
--   Credit Enabled: YES
--   Credit Limit: ₹10,000
--
-- The customer's current outstanding balance is represented
-- through financial transactions / ledger logic rather than
-- storing a manually maintained "outstanding" value here.
--
-- Relationship:
--
--   customers 1 : 0..1 customer_credit_accounts
--
-- A customer who does not use credit does not necessarily need
-- a credit-account row.
-- ============================================================


CREATE TABLE IF NOT EXISTS customer_credit_accounts (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations (id)
        ON DELETE CASCADE,

    customer_id UUID NOT NULL
        REFERENCES customers (id)
        ON DELETE CASCADE,

-- Whether this customer is allowed to purchase on credit.
credit_enabled BOOLEAN NOT NULL DEFAULT FALSE,

-- Maximum outstanding credit allowed.
credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0,
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- One credit account per customer.


CONSTRAINT customer_credit_accounts_customer_unique
        UNIQUE (customer_id),

    CONSTRAINT customer_credit_accounts_limit_check
        CHECK (credit_limit >= 0)
);

-- Organisation-level customer credit lookup.
CREATE INDEX IF NOT EXISTS idx_customer_credit_accounts_organisation ON customer_credit_accounts (organisation_id);

-- ============================================================
-- 23. INVOICES
-- ============================================================
--
-- Represents a sale/bill issued by a pharmacy branch.
--
-- IMPORTANT:
--
-- An invoice is NOT a payment.
--
-- Example:
--
--   INV-1001
--   Customer: Rajesh
--   Total: ₹5,000
--
-- The customer may:
--
--   pay immediately,
--   pay partially,
--   pay later,
--   or pay using multiple payment methods.
--
-- The invoice therefore exists independently of payments.
--
-- Invoice numbering is branch-scoped.
--
-- Example:
--
--   Main Branch:
--       INV-1001
--       INV-1002
--
--   Pune Branch:
--       INV-1001
--       INV-1002
--
-- This is intentional.
-- ============================================================


CREATE TABLE IF NOT EXISTS invoices (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations (id)
        ON DELETE CASCADE,

    branch_id UUID NOT NULL
        REFERENCES branches (id)
        ON DELETE RESTRICT,

    customer_id UUID NOT NULL
        REFERENCES customers (id)
        ON DELETE RESTRICT,

-- Optional prescription associated with this sale.
--
-- A prescription can exist independently and may be reused
-- for more than one related sale depending on business rules.
prescription_id UUID REFERENCES prescriptions (id) ON DELETE SET NULL,

-- System-generated branch-scoped invoice number.
-- Example: INV-1001
invoice_number VARCHAR(50) NOT NULL,
invoice_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- Amount before discount/tax.
subtotal NUMERIC(12, 2) NOT NULL,
discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

-- Final amount payable.
total_amount NUMERIC(12, 2) NOT NULL,
status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
notes TEXT,

-- User who created the invoice.


created_by UUID
        REFERENCES users (id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT invoices_number_unique
        UNIQUE (branch_id, invoice_number),

    CONSTRAINT invoices_subtotal_check
        CHECK (subtotal >= 0),

    CONSTRAINT invoices_discount_check
        CHECK (discount_amount >= 0),

    CONSTRAINT invoices_tax_check
        CHECK (tax_amount >= 0),

    CONSTRAINT invoices_total_check
        CHECK (total_amount >= 0),

    CONSTRAINT invoices_status_check
        CHECK (
            status IN (
                'DRAFT',
                'COMPLETED',
                'PARTIALLY_PAID',
                'PAID',
                'VOID',
                'CANCELLED'
            )
        )
);

-- Customer purchase history.
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices (
    customer_id,
    invoice_date DESC
);

-- Branch billing history.
CREATE INDEX IF NOT EXISTS idx_invoices_branch_date ON invoices (branch_id, invoice_date DESC);

-- Organisation-level invoice reporting.
CREATE INDEX IF NOT EXISTS idx_invoices_organisation_date ON invoices (
    organisation_id,
    invoice_date DESC
);

-- Useful for prescription-linked billing queries.
CREATE INDEX IF NOT EXISTS idx_invoices_prescription ON invoices (prescription_id);

-- ============================================================
-- 24. INVOICE ITEMS
-- ============================================================
--
-- Stores the individual products sold on an invoice.
--
-- Example:
--
--   INV-1001
--       |
--       +── Crocin 500 × 2
--       +── Omeprazole × 1
--       +── Syrup × 1
--
-- One invoice can therefore contain many invoice items.
--
-- inventory_batch_id is retained so the billing transaction
-- can identify the exact stock batch from which the medicine
-- was sold.
-- ============================================================


CREATE TABLE IF NOT EXISTS invoice_items (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES invoices (id)
        ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products (id)
        ON DELETE RESTRICT,

    inventory_batch_id UUID
        REFERENCES inventory_batches (id)
        ON DELETE RESTRICT,

-- Product information at the time of sale.
--
-- These values are intentionally stored on the invoice item
-- rather than always recalculated from the current product
-- record. Product prices/details may change later, while the
-- historical invoice must remain accurate.


product_name VARCHAR(200) NOT NULL,

    batch_number VARCHAR(100),

    quantity INTEGER NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,

    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

    line_total NUMERIC(12,2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT invoice_items_quantity_check
        CHECK (quantity > 0),

    CONSTRAINT invoice_items_unit_price_check
        CHECK (unit_price >= 0),

    CONSTRAINT invoice_items_discount_check
        CHECK (discount_amount >= 0),

    CONSTRAINT invoice_items_tax_check
        CHECK (tax_amount >= 0),

    CONSTRAINT invoice_items_line_total_check
        CHECK (line_total >= 0)
);

-- Most invoice queries retrieve all items for one invoice.
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

-- Useful for product sales reports.
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items (product_id);

-- Useful when tracing sales back to a specific stock batch.
CREATE INDEX IF NOT EXISTS idx_invoice_items_inventory_batch ON invoice_items (inventory_batch_id);

-- ============================================================
-- 25. PAYMENTS
-- ============================================================
--
-- Represents the overall money received from a customer.
--
-- IMPORTANT:
--
-- A payment does NOT contain one payment_method column because
-- the client requires split payments.
--
-- Example:
--
--   REC-1001
--   Total = ₹5,000
--
--   Payment Transactions:
--       CASH → ₹2,000
--       UPI  → ₹3,000
--
-- The payment itself represents the complete receipt.
--
-- Receipt numbering is branch-scoped.
-- ============================================================


CREATE TABLE IF NOT EXISTS payments (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations (id)
        ON DELETE CASCADE,

    branch_id UUID NOT NULL
        REFERENCES branches (id)
        ON DELETE RESTRICT,

    customer_id UUID NOT NULL
        REFERENCES customers (id)
        ON DELETE RESTRICT,

-- Human-readable receipt number.
-- Example: REC-1001
receipt_number VARCHAR(50) NOT NULL,
payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

-- Total received across all payment methods.
--
-- Example:
--   Cash ₹2,000 + UPI ₹3,000 = ₹5,000
total_amount NUMERIC(12, 2) NOT NULL,
status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
notes TEXT,

-- User/cashier who recorded the payment.


received_by UUID
        REFERENCES users (id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payments_receipt_unique
        UNIQUE (branch_id, receipt_number),

    CONSTRAINT payments_total_amount_check
        CHECK (total_amount > 0),

    CONSTRAINT payments_status_check
        CHECK (
            status IN (
                'PENDING',
                'COMPLETED',
                'VOID',
                'REFUNDED'
            )
        )
);

-- Customer payment history.
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments (
    customer_id,
    payment_date DESC
);

-- Branch payment history.
CREATE INDEX IF NOT EXISTS idx_payments_branch_date ON payments (branch_id, payment_date DESC);

-- Organisation-level payment reporting.
CREATE INDEX IF NOT EXISTS idx_payments_organisation_date ON payments (
    organisation_id,
    payment_date DESC
);

-- ============================================================
-- 26. PAYMENT TRANSACTIONS
-- ============================================================
--
-- Represents the individual payment-method components of one
-- payment.
--
-- This table directly supports the client's split-payment
-- requirement.
--
-- Example:
--
--   Payment REC-1001
--   Total = ₹5,000
--
--       CASH          ₹2,000
--       UPI           ₹3,000
--
-- Another payment could be:
--
--       CASH          ₹1,000
--       UPI           ₹2,000
--       BANK_TRANSFER ₹2,000
--
-- transaction_reference is supplied by the external payment
-- system when applicable.
--
-- Examples:
--
--   UPI transaction ID
--   Bank UTR
--   Card transaction reference
--
-- Cash normally has no external transaction reference.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    payment_id UUID NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
    payment_method VARCHAR(30) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_reference VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payment_transactions_method_check CHECK (
        payment_method IN (
            'CASH',
            'UPI',
            'BANK_TRANSFER',
            'CARD',
            'CHEQUE'
        )
    ),
    CONSTRAINT payment_transactions_amount_check CHECK (amount > 0)
);

-- Retrieve the payment breakdown for one receipt.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment ON payment_transactions (payment_id);

-- Useful when searching external transaction references.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions (transaction_reference);

-- ============================================================
-- 27. PAYMENT ALLOCATIONS
-- ============================================================
--
-- Connects payments to invoices.
--
-- This table answers:
--
--   "Which invoice did this payment settle?"
--
-- It does NOT describe whether the payment was Cash, UPI,
-- Bank Transfer, etc. That responsibility belongs to
-- payment_transactions.
--
-- Example:
--
--   Payment REC-1001 = ₹7,000
--
--   Allocation:
--       INV-1001 → ₹5,000
--       INV-1002 → ₹2,000
--
-- Therefore one payment can settle multiple invoices.
--
-- Likewise, one invoice can receive multiple payments over time.
--
-- This creates:
--
--   payments N : M invoices
--
-- through this junction table.
-- ============================================================


CREATE TABLE IF NOT EXISTS payment_allocations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_id UUID NOT NULL
        REFERENCES payments (id)
        ON DELETE CASCADE,

    invoice_id UUID NOT NULL
        REFERENCES invoices (id)
        ON DELETE RESTRICT,

-- Amount of this payment applied to the invoice.
allocated_amount NUMERIC(12, 2) NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT payment_allocations_amount_check CHECK (allocated_amount > 0),

-- The same payment should not contain two separate allocation
-- rows for the same invoice.
CONSTRAINT payment_allocations_payment_invoice_unique
        UNIQUE (payment_id, invoice_id)
);

-- Invoice outstanding/payment history queries.
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations (invoice_id);

-- Payment settlement queries.
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations (payment_id);

-- ============================================================
-- 28. CUSTOMER LEDGER ENTRIES
-- ============================================================
--
-- Represents the customer's financial statement.
--
-- The ledger records financial movements rather than replacing
-- the source transaction tables.
--
-- Typical entries:
--
--   INVOICE     → DEBIT
--   PAYMENT     → CREDIT
--
-- Future entries may include:
--
--   RETURN      → CREDIT
--   ADJUSTMENT  → DEBIT/CREDIT
--
-- Example:
--
--   Invoice      ₹5,000 debit
--   Payment      ₹2,000 credit
--   Payment      ₹1,000 credit
--
--   Balance      ₹2,000
--
-- reference_type + reference_id identify the source transaction.
--
-- This is intentionally not implemented as a conventional FK
-- because the ledger can eventually reference multiple entity
-- types (invoice, payment, return, adjustment).
--
-- The application/service layer is responsible for ensuring
-- that reference_type and reference_id point to a valid source
-- record belonging to the same organisation/customer.
-- ============================================================


CREATE TABLE IF NOT EXISTS customer_ledger_entries (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations (id)
        ON DELETE CASCADE,

    customer_id UUID NOT NULL
        REFERENCES customers (id)
        ON DELETE RESTRICT,

    branch_id UUID
        REFERENCES branches (id)
        ON DELETE RESTRICT,

    entry_type VARCHAR(30) NOT NULL,

-- Identifies the source entity.
--
-- Examples:
--   INVOICE
--   PAYMENT
--   RETURN
--   ADJUSTMENT
reference_type VARCHAR(30) NOT NULL,

-- UUID of the referenced source transaction.
reference_id UUID NOT NULL,
debit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

-- Running balance after this ledger entry.
--
-- This is useful for displaying the customer's statement
-- without recalculating the complete history for every row.
balance_after NUMERIC(12, 2) NOT NULL,
entry_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
description TEXT,
created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT customer_ledger_entry_type_check CHECK (
    entry_type IN (
        'INVOICE',
        'PAYMENT',
        'RETURN',
        'ADJUSTMENT'
    )
),
CONSTRAINT customer_ledger_reference_type_check CHECK (
    reference_type IN (
        'INVOICE',
        'PAYMENT',
        'RETURN',
        'ADJUSTMENT'
    )
),
CONSTRAINT customer_ledger_debit_check CHECK (debit_amount >= 0),
CONSTRAINT customer_ledger_credit_check CHECK (credit_amount >= 0),

-- A single ledger entry cannot simultaneously represent
-- both a debit and a credit.
CONSTRAINT customer_ledger_one_side_check
        CHECK (
            (
                debit_amount > 0
                AND credit_amount = 0
            )
            OR
            (
                debit_amount = 0
                AND credit_amount > 0
            )
        )
);

-- The customer ledger screen primarily retrieves a customer's
-- statement ordered by date.
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_date ON customer_ledger_entries (customer_id, entry_date DESC);

-- Organisation-scoped ledger reporting.
CREATE INDEX IF NOT EXISTS idx_customer_ledger_organisation_date ON customer_ledger_entries (
    organisation_id,
    entry_date DESC
);

-- Useful when opening the ledger entries related to a specific
-- invoice/payment.
CREATE INDEX IF NOT EXISTS idx_customer_ledger_reference ON customer_ledger_entries (reference_type, reference_id);

-- Branch-level financial reporting.
CREATE INDEX IF NOT EXISTS idx_customer_ledger_branch_date ON customer_ledger_entries (branch_id, entry_date DESC);

-- ============================================================
-- 29. GOODS RECEIPTS
-- ============================================================
-- Represents one physical shipment/receiving event against
-- a purchase order.
--
-- A purchase may be received in multiple shipments, so goods
-- receiving is kept separate from purchases.


CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    purchase_id UUID NOT NULL
        REFERENCES purchases(id),

-- Human-readable GRN number shown to users.
receipt_number VARCHAR(50) NOT NULL,
received_date DATE NOT NULL DEFAULT CURRENT_DATE,
received_by UUID REFERENCES users (id) ON DELETE SET NULL,

-- Invoice number provided by the supplier.


supplier_invoice_number VARCHAR(100),

    package_count INTEGER NOT NULL DEFAULT 0,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_INSPECTION',

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT goods_receipts_status_check
        CHECK (
            status IN (
                'PENDING_INSPECTION',
                'VERIFIED',
                'DISCREPANCY'
            )
        ),

    CONSTRAINT goods_receipts_package_count_check
        CHECK (package_count >= 0),

    CONSTRAINT goods_receipts_organisation_number_unique
        UNIQUE (organisation_id, receipt_number)
);

-- ============================================================
-- 30. GOODS RECEIPT ITEMS
-- ============================================================
-- Contains the actual quantities received for the products
-- included in a goods receipt.
--
-- A receipt item points back to the purchase item so that
-- ordered and received quantities can be compared.


CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    goods_receipt_id UUID NOT NULL
        REFERENCES goods_receipts(id)
        ON DELETE CASCADE,

    purchase_item_id UUID NOT NULL
        REFERENCES purchase_items(id),

    received_quantity INTEGER NOT NULL,

    rejected_quantity INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT goods_receipt_items_received_quantity_check
        CHECK (received_quantity > 0),

    CONSTRAINT goods_receipt_items_rejected_quantity_check
        CHECK (
            rejected_quantity >= 0
            AND rejected_quantity <= received_quantity
        ),

-- A purchase item can occur only once in a particular
-- goods receipt.
CONSTRAINT goods_receipt_items_unique_purchase_item
        UNIQUE (goods_receipt_id, purchase_item_id)
);


-- ============================================================
-- 31. RETURNS
-- ============================================================
-- Represents a customer's request to return items from an invoice.
--
-- The return records the refund, its method, the processing status,
-- and the users responsible for recording and processing it.

CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organisation_id UUID NOT NULL
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    branch_id UUID NOT NULL
        REFERENCES branches(id)
        ON DELETE RESTRICT,

    customer_id UUID NOT NULL
        REFERENCES customers(id)
        ON DELETE RESTRICT,

    invoice_id UUID NOT NULL
        REFERENCES invoices(id)
        ON DELETE RESTRICT,

-- Human-readable return number.
-- Example: RET-1001
return_number VARCHAR(50) NOT NULL,
return_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',

-- Total amount refunded for this return.
refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

-- How the customer received the refund.
refund_method VARCHAR(30) NOT NULL,

-- Reason supplied for the return.
reason TEXT,

-- Additional internal notes.
notes TEXT,

-- User who created/recorded the return.
created_by UUID REFERENCES users (id) ON DELETE SET NULL,

-- User who processed the return.


processed_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT returns_number_unique
        UNIQUE (branch_id, return_number),

    CONSTRAINT returns_status_check
        CHECK (
            status IN (
                'PENDING',
                'APPROVED',
                'PROCESSED',
                'REJECTED',
                'CANCELLED'
            )
        ),

    CONSTRAINT returns_refund_amount_check
        CHECK (refund_amount >= 0),

    CONSTRAINT returns_refund_method_check
        CHECK (
            refund_method IN (
                'CASH',
                'STORE_CREDIT'
            )
        )
);


-- ============================================================
-- 32. RETURN ITEMS
-- ============================================================
-- Contains the invoice items included in a return.
--
-- Each item records the quantity returned, the refund allocated to
-- that item, its physical condition, and the quantity restocked.

CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    return_id UUID NOT NULL
        REFERENCES returns(id)
        ON DELETE CASCADE,

-- Exact invoice item being returned.
invoice_item_id UUID NOT NULL REFERENCES invoice_items (id) ON DELETE RESTRICT,

-- Number of units returned.
quantity_returned INTEGER NOT NULL,

-- Refund allocated to this returned item.
--
-- This MUST be derived from the original invoice item's
-- historical line_total and quantity.
refund_amount NUMERIC(12, 2) NOT NULL,

-- Physical condition of the returned medicine.
return_condition VARCHAR(30) NOT NULL DEFAULT 'SEALED',

-- Quantity that can actually be placed back into stock.

restock_quantity INTEGER NOT NULL DEFAULT 0,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT return_items_quantity_check
        CHECK (quantity_returned > 0),

    CONSTRAINT return_items_refund_amount_check
        CHECK (refund_amount >= 0),

    CONSTRAINT return_items_restock_quantity_check
        CHECK (
            restock_quantity >= 0
            AND restock_quantity <= quantity_returned
        ),

    CONSTRAINT return_items_condition_check
        CHECK (
            return_condition IN (
                'SEALED',
                'OPENED',
                'DAMAGED',
                'EXPIRED',
                'OTHER'
            )
        ),

    CONSTRAINT return_items_return_invoice_item_unique
        UNIQUE (return_id, invoice_item_id)
);

CREATE INDEX IF NOT EXISTS idx_returns_organisation_date ON returns (
    organisation_id,
    return_date DESC
);

CREATE INDEX IF NOT EXISTS idx_returns_branch_date ON returns (branch_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_returns_customer_date ON returns (customer_id, return_date DESC);

CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns (invoice_id);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items (return_id);

CREATE INDEX IF NOT EXISTS idx_return_items_invoice_item ON return_items (invoice_item_id);

-- ============================================================
-- INDEXES
-- ============================================================
-- Foreign keys are used heavily by joins and tenant-scoped
-- queries, so indexes are added for the main lookup paths.

CREATE INDEX IF NOT EXISTS idx_organisations_owner_id ON organisations (owner_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_organisation_id ON subscriptions (organisation_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS idx_roles_organisation_id ON roles (organisation_id);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON organisation_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_organisation_id ON organisation_memberships (organisation_id);

CREATE INDEX IF NOT EXISTS idx_branches_organisation_id ON branches (organisation_id);

CREATE INDEX IF NOT EXISTS idx_branch_assignments_branch_id ON branch_assignments (branch_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organisation_id ON audit_logs (organisation_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_products_organisation_id ON products (organisation_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_organisation_id ON suppliers (organisation_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON inventory_batches (product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_branch_id ON inventory_batches (branch_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_supplier_id ON inventory_batches (supplier_id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry_date ON inventory_batches (expiry_date);

-- ============================================================
-- STOCK TRANSFER INDEXES
-- ============================================================

-- Used when listing transfers for an organisation.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_organisation_id ON stock_transfers (organisation_id);

-- Used when filtering transfers by source branch.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_branch_id ON stock_transfers (from_branch_id);

-- Used when filtering transfers by destination branch.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_branch_id ON stock_transfers (to_branch_id);

-- Used for transfer status filters such as Draft,
-- In Transit, Completed and Cancelled.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers (status);

-- Useful for recent-transfer lists and date-based reports.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_transfer_date ON stock_transfers (transfer_date);

-- Used when displaying transfers created by a particular user.
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON stock_transfers (created_by);

-- Used to retrieve all items belonging to a transfer.
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_id ON stock_transfer_items (transfer_id);

-- Used when finding transfers involving a particular
-- inventory batch.
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_inventory_batch_id ON stock_transfer_items (inventory_batch_id);

-- ============================================================
-- PURCHASE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_purchases_organisation_id ON purchases (organisation_id);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON purchases (branch_id);

CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status);

CREATE INDEX IF NOT EXISTS idx_purchases_order_date ON purchases (order_date);

CREATE INDEX IF NOT EXISTS idx_purchases_expected_date ON purchases (expected_date);

CREATE INDEX IF NOT EXISTS idx_purchases_created_by ON purchases (created_by);

-- ============================================================
-- PURCHASE ITEM INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items (product_id);

-- ============================================================
-- GOODS RECEIPT INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_goods_receipts_organisation_id ON goods_receipts (organisation_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_purchase_id ON goods_receipts (purchase_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_received_by ON goods_receipts (received_by);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts (status);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_received_date ON goods_receipts (received_date);

-- ============================================================
-- GOODS RECEIPT ITEM INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_receipt_id ON goods_receipt_items (goods_receipt_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_purchase_item_id ON goods_receipt_items (purchase_item_id);