/**
 * Superadmin Platform Module — Database Migration Script
 *
 * Purpose:
 * Safely creates and extends tables for:
 * 1. Platform Superadmin user flag (users.is_platform_superadmin)
 * 2. Organisation extensions & statuses (PENDING_PAYMENT, ACTIVE, SUSPENDED, DEACTIVATED)
 * 3. Subscription plans extensions & tier catalog
 * 4. Subscriptions status & single active/pending unique index per organisation
 * 5. Number sequences platform support (organisation_id NULLABLE, new platform sequence types)
 * 6. Audit logs platform support (organisation_id NULLABLE)
 * 7. Platform tax configuration (effective-dated)
 * 8. Platform business configuration (single active seller profile)
 * 9. Platform subscription payments (Razorpay SaaS payments)
 * 10. Platform payment refunds (Two-phase reservation & ledger)
 * 11. Subscription invoices (B2B SaaS GST tax invoices)
 * 12. Razorpay webhook events (Crash-safe at-least-once ledger)
 *
 * Guarantees:
 * - Transactional (BEGIN ... COMMIT / ROLLBACK)
 * - Idempotent (safe to execute multiple times)
 * - Non-destructive (preserves all existing data and constraints)
 */

require("dotenv").config();
const { pool } = require("./connection");

const migrateSuperadminPlatform = async () => {
  const client = await pool.connect();

  try {
    console.log("=== Starting Superadmin Platform Migration ===");
    await client.query("BEGIN");

    // ============================================================
    // 1. USERS TABLE EXTENSIONS
    // ============================================================
    console.log("1. Adding is_platform_superadmin column to users table...");
    await client.query(`
      ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS is_platform_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS idx_users_is_platform_superadmin 
        ON users (is_platform_superadmin) 
        WHERE is_platform_superadmin = TRUE;
    `);

    // ============================================================
    // 2. ORGANISATIONS TABLE EXTENSIONS
    // ============================================================
    console.log(
      "2. Adding onboarding and status columns to organisations table...",
    );
    await client.query(`
      ALTER TABLE organisations
        ADD COLUMN IF NOT EXISTS pharmacy_code VARCHAR(50) UNIQUE,
        ADD COLUMN IF NOT EXISTS admin_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
        ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50),
        ADD COLUMN IF NOT EXISTS business_type VARCHAR(100) DEFAULT 'Private Limited',
        ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT';

      ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_status_check;
      ALTER TABLE organisations ADD CONSTRAINT organisations_status_check
        CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'));

      CREATE INDEX IF NOT EXISTS idx_organisations_status ON organisations (status);
      CREATE INDEX IF NOT EXISTS idx_organisations_created_at ON organisations (created_at DESC);
    `);

    // ============================================================
    // 3. SUBSCRIPTION PLANS TABLE EXTENSIONS
    // ============================================================
    console.log(
      "3. Adding tier and UI metadata columns to subscription_plans table...",
    );
    await client.query(`
      ALTER TABLE subscription_plans
        ADD COLUMN IF NOT EXISTS tier_code VARCHAR(50) NOT NULL DEFAULT 'BASIC',
        ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS module_summary VARCHAR(100) DEFAULT '2 Modules',
        ADD COLUMN IF NOT EXISTS color_hex VARCHAR(20) DEFAULT '#2563EB',
        ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_tier 
        ON subscription_plans (is_active, tier_code);
    `);

    // ============================================================
    // 4. SUBSCRIPTIONS TABLE EXTENSIONS & PARTIAL UNIQUE INDEX
    // ============================================================
    console.log(
      "4. Updating subscriptions table and single current active/pending constraint...",
    );
    await client.query(`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) NOT NULL DEFAULT 'ANNUAL',
        ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS max_branches_override INTEGER,
        ADD COLUMN IF NOT EXISTS max_users_override INTEGER;

      ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check
        CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL', 'YEARLY', 'CUSTOM'));

      ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
        CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED'));

      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_single_current_active
        ON subscriptions (organisation_id)
        WHERE status IN ('PENDING_PAYMENT', 'ACTIVE');
    `);

    // ============================================================
    // 5. NUMBER SEQUENCES EXTENSIONS (PLATFORM SEQUENCES)
    // ============================================================
    console.log(
      "5. Updating number_sequences table for platform-scoped sequences...",
    );
    await client.query(`
      ALTER TABLE number_sequences ALTER COLUMN organisation_id DROP NOT NULL;

      ALTER TABLE number_sequences DROP CONSTRAINT IF EXISTS number_sequences_type_check;
      ALTER TABLE number_sequences ADD CONSTRAINT number_sequences_type_check
        CHECK (
          sequence_type IN (
            'CUSTOMER', 'PRESCRIPTION', 'INVOICE', 'RECEIPT',
            'RETURN', 'BRANCH', 'STAFF', 'PURCHASE',
            'STOCK_TRANSFER', 'GOODS_RECEIPT', 'REGISTER_SESSION',
            'CASH_MOVEMENT', 'HELD_BILL',
            'PHARMACY_CODE', 'SAAS_INVOICE', 'PLATFORM_PAYMENT', 'PLATFORM_REFUND'
          )
        );

      CREATE UNIQUE INDEX IF NOT EXISTS number_sequences_platform_scope_unique
        ON number_sequences (sequence_type)
        WHERE organisation_id IS NULL AND branch_id IS NULL;
    `);

    // ============================================================
    // 6. AUDIT LOGS EXTENSION
    // ============================================================
    console.log("6. Allowing nullable organisation_id on audit_logs...");
    await client.query(`
      ALTER TABLE audit_logs ALTER COLUMN organisation_id DROP NOT NULL;
    `);

    // ============================================================
    // 7. PLATFORM TAX CONFIGS TABLE
    // ============================================================
    console.log("7. Creating platform_tax_configs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_tax_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_code VARCHAR(50) NOT NULL,
        tax_name VARCHAR(100) NOT NULL DEFAULT 'Goods and Services Tax',
        rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
        sac_code VARCHAR(20) NOT NULL DEFAULT '998313',
        description TEXT,
        effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        effective_to TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_platform_tax_lookup 
        ON platform_tax_configs (config_code, effective_from DESC);
    `);

    // ============================================================
    // 8. PLATFORM BUSINESS CONFIGS TABLE
    // ============================================================
    console.log("8. Creating platform_business_configs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_business_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        legal_name VARCHAR(150),
        trade_name VARCHAR(150),
        gstin VARCHAR(50),
        address_line1 TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(20),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_business_single_active 
        ON platform_business_configs (is_active) 
        WHERE is_active = TRUE;
    `);

    // ============================================================
    // 9. PLATFORM SUBSCRIPTION PAYMENTS TABLE
    // ============================================================
    console.log("9. Creating platform_subscription_payments table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_subscription_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_reference VARCHAR(50) UNIQUE NOT NULL,
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        subscription_id UUID NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
        transaction_type VARCHAR(30) NOT NULL 
          CHECK (transaction_type IN ('NEW_ONBOARDING', 'RENEWAL', 'PLAN_UPGRADE')),
        razorpay_order_id VARCHAR(100) NOT NULL,
        razorpay_payment_id VARCHAR(100) UNIQUE,
        razorpay_signature VARCHAR(255),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        base_amount NUMERIC(12, 2) NOT NULL,
        gst_rate NUMERIC(5, 2) NOT NULL,
        cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        total_amount NUMERIC(12, 2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY' 
          CHECK (payment_method IN ('RAZORPAY', 'UPI', 'CARD', 'NETBANKING', 'BANK_TRANSFER', 'MANUAL_OFFLINE')),
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING' 
          CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
        error_code VARCHAR(100),
        error_description TEXT,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_platform_payments_org ON platform_subscription_payments (organisation_id);
      CREATE INDEX IF NOT EXISTS idx_platform_payments_order ON platform_subscription_payments (razorpay_order_id);
      CREATE INDEX IF NOT EXISTS idx_platform_payments_status ON platform_subscription_payments (status);
      CREATE INDEX IF NOT EXISTS idx_platform_payments_paid_at ON platform_subscription_payments (paid_at DESC);
    `);

    // ============================================================
    // 10. PLATFORM PAYMENT REFUNDS TABLE
    // ============================================================
    console.log("10. Creating platform_payment_refunds table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_payment_refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID NOT NULL REFERENCES platform_subscription_payments (id) ON DELETE RESTRICT,
        refund_reference VARCHAR(50) UNIQUE NOT NULL,
        razorpay_refund_id VARCHAR(100) UNIQUE,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING' 
          CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
        error_message TEXT,
        processed_by UUID REFERENCES users (id) ON DELETE SET NULL,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_platform_refunds_payment ON platform_payment_refunds (payment_id);
      CREATE INDEX IF NOT EXISTS idx_platform_refunds_status ON platform_payment_refunds (status);
    `);

    // ============================================================
    // 11. SUBSCRIPTION INVOICES TABLE
    // ============================================================
    console.log("11. Creating subscription_invoices table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE RESTRICT,
        subscription_id UUID NOT NULL REFERENCES subscriptions (id) ON DELETE RESTRICT,
        payment_id UUID NOT NULL UNIQUE REFERENCES platform_subscription_payments (id) ON DELETE RESTRICT,
        seller_legal_name VARCHAR(150),
        seller_gstin VARCHAR(50),
        seller_address TEXT,
        seller_state VARCHAR(100),
        buyer_legal_name VARCHAR(150) NOT NULL,
        buyer_gstin VARCHAR(50),
        buyer_address TEXT NOT NULL,
        buyer_state VARCHAR(100) NOT NULL,
        sac_code VARCHAR(20) NOT NULL DEFAULT '998313',
        billing_period_start TIMESTAMPTZ NOT NULL,
        billing_period_end TIMESTAMPTZ NOT NULL,
        taxable_amount NUMERIC(12, 2) NOT NULL,
        gst_rate NUMERIC(5, 2) NOT NULL,
        is_interstate BOOLEAN NOT NULL DEFAULT FALSE,
        cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        total_amount NUMERIC(12, 2) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'VOID', 'REFUNDED')),
        pdf_url TEXT,
        issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON subscription_invoices (organisation_id);
    `);

    // ============================================================
    // 12. RAZORPAY WEBHOOK EVENTS TABLE
    // ============================================================
    console.log("12. Creating razorpay_webhook_events table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(100) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        payload JSONB NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED' 
          CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')),
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON razorpay_webhook_events (razorpay_order_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON razorpay_webhook_events (status);
    `);

    // ============================================================
    // 13. SEEDING SEED CONFIGURATIONS & PLATFORM SEQUENCES
    // ============================================================
    console.log("13. Seeding platform configurations and sequences...");

    // Seed effective-dated tax config if not exists
    await client.query(`
      INSERT INTO platform_tax_configs (config_code, tax_name, rate_percent, sac_code, description, effective_from)
      SELECT 'SAAS_SUBSCRIPTION_GST', 'GST on SaaS Services', 18.00, '998313', 'Standard Indian GST on Software as a Service', '2026-01-01 00:00:00+00'
      WHERE NOT EXISTS (
        SELECT 1 FROM platform_tax_configs WHERE config_code = 'SAAS_SUBSCRIPTION_GST'
      );
    `);

    // Seed platform business profile if not exists (configurable, not hardcoded dummy data)
    await client.query(`
      INSERT INTO platform_business_configs (trade_name, state, is_active)
      SELECT 'PharmaFlow Platform', 'Maharashtra', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM platform_business_configs WHERE is_active = TRUE
      );
    `);

    // Seed platform sequence types
    const sequenceTypes = [
      "PHARMACY_CODE",
      "SAAS_INVOICE",
      "PLATFORM_PAYMENT",
      "PLATFORM_REFUND",
    ];
    for (const seqType of sequenceTypes) {
      await client.query(
        `
        INSERT INTO number_sequences (organisation_id, branch_id, sequence_type, next_number)
        VALUES (NULL, NULL, $1, 1001)
        ON CONFLICT DO NOTHING;
      `,
        [seqType],
      );
    }

    // Seed default subscription plans matching frontend catalog if subscription_plans is empty
    const planCount = await client.query(
      "SELECT COUNT(*)::int AS count FROM subscription_plans;",
    );
    if (planCount.rows[0].count === 0) {
      console.log("Seeding subscription plans catalog...");
      const plans = [
        {
          name: "Basic",
          tier_code: "BASIC",
          description: "For small pharmacies",
          price: 9999.0,
          currency: "INR",
          billing_interval: "YEAR",
          max_branches: 1,
          max_users: 5,
          color_hex: "#2563EB",
          module_summary: "2 Modules",
          is_popular: false,
          features: JSON.stringify([
            "All Basic Features",
            "Inventory Tracking",
            "Single Store Support",
            "Daily Sales Reports",
          ]),
        },
        {
          name: "Standard",
          tier_code: "STANDARD",
          description: "For growing pharmacies",
          price: 19999.0,
          currency: "INR",
          billing_interval: "YEAR",
          max_branches: 3,
          max_users: 20,
          color_hex: "#D97706",
          module_summary: "5 Modules",
          is_popular: false,
          features: JSON.stringify([
            "All in Basic",
            "Inventory Management",
            "Purchases Modules",
            "Customers CRM",
            "Stock Transfer System",
          ]),
        },
        {
          name: "Professional",
          tier_code: "PROFESSIONAL",
          description: "For established pharmacies",
          price: 39999.0,
          currency: "INR",
          billing_interval: "YEAR",
          max_branches: 10,
          max_users: 50,
          color_hex: "#7C3AED",
          module_summary: "8 Modules",
          is_popular: true,
          features: JSON.stringify([
            "All in Standard",
            "Advanced Reports",
            "Stock Transfer",
            "Pharmacist Management",
            "Goods Receiving",
            "Users & Roles Access",
          ]),
        },
        {
          name: "Enterprise",
          tier_code: "ENTERPRISE",
          description: "For large pharmacies",
          price: 49999.0,
          currency: "INR",
          billing_interval: "YEAR",
          max_branches: 25,
          max_users: 100,
          color_hex: "#059669",
          module_summary: "All Modules",
          is_popular: false,
          features: JSON.stringify([
            "All Available Modules",
            "Priority 24/7 Support",
            "Custom Integrations",
            "Dedicated Onboarding",
            "Multi-Store Syncing",
          ]),
        },
        {
          name: "Custom",
          tier_code: "CUSTOM",
          description: "Build your own plan",
          price: 0.0,
          currency: "INR",
          billing_interval: "YEAR",
          max_branches: 25,
          max_users: 100,
          color_hex: "#475569",
          module_summary: "Custom Modules",
          is_popular: false,
          features: JSON.stringify([
            "Choose Specific Modules",
            "Custom User Limits",
            "Flexible Billing Options",
            "SLA Agreements",
          ]),
        },
      ];

      for (const p of plans) {
        await client.query(
          `
          INSERT INTO subscription_plans (
            name, tier_code, description, price, currency, billing_interval,
            max_branches, max_users, color_hex, module_summary, is_popular, features, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
        `,
          [
            p.name,
            p.tier_code,
            p.description,
            p.price,
            p.currency,
            p.billing_interval,
            p.max_branches,
            p.max_users,
            p.color_hex,
            p.module_summary,
            p.is_popular,
            p.features,
          ],
        );
      }
    }

    await client.query("COMMIT");
    console.log("=== Superadmin Platform Migration Completed Successfully ===");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrateSuperadminPlatform()
    .then(() => {
      console.log("Migration finished.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}

module.exports = { migrateSuperadminPlatform };
