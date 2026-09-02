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
-- Stores the identity of a medicine/product.
-- Stock, batch, branch and quantity are stored separately
-- in inventory_batches.

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
    medicine_name VARCHAR(200) NOT NULL,
    brand_name VARCHAR(200) NOT NULL,
    strength VARCHAR(100),
    pack_size VARCHAR(100),
    manufacturer VARCHAR(200),
    sku VARCHAR(100) NOT NULL,
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
                'DRAFT'
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
-- 19. GOODS RECEIPTS
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
-- 20. GOODS RECEIPT ITEMS
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