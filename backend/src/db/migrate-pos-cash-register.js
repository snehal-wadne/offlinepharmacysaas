/**
 * POS & Cash Register Portal — Database Migration Script
 *
 * Purpose:
 * Safely creates tables and constraints for the POS & Cash Register foundation:
 * - cash_registers (physical counter terminals)
 * - cash_register_sessions (cashier shift sessions)
 * - cash_movements (petty cash float additions & expense payouts)
 * - cash_denominations (closing physical cash counts)
 * - held_bills (parked POS draft carts)
 *
 * Extends existing billing tables:
 * - invoices.cash_register_session_id
 * - payments.cash_register_session_id
 * - returns.cash_register_session_id
 *
 * Enforces database-level composite foreign key relationships to guarantee:
 * - A cash register's branch belongs to the register's organisation.
 * - A session's cash register belongs to the session's branch and organisation.
 * - Invoices, payments, and returns cannot reference a session in a different branch or organisation.
 * - Cash movements cannot reference a session in a different branch or organisation.
 *
 * Updates number_sequences constraint to permit:
 * - REGISTER_SESSION (REG-1001)
 * - CASH_MOVEMENT (PC-1001)
 * - HELD_BILL (HB-1001)
 *
 * Idempotent: can be executed multiple times safely without data loss.
 */

require("dotenv").config();
const { pool } = require("./connection");

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log("=== Starting POS & Cash Register Migration ===");

    await client.query("BEGIN");

    // 1. Update number_sequences_type_check constraint
    console.log("1. Updating number_sequences_type_check constraint...");
    await client.query(`
      ALTER TABLE number_sequences DROP CONSTRAINT IF EXISTS number_sequences_type_check;
      ALTER TABLE number_sequences ADD CONSTRAINT number_sequences_type_check
        CHECK (
          sequence_type IN (
            'CUSTOMER',
            'PRESCRIPTION',
            'INVOICE',
            'RECEIPT',
            'RETURN',
            'BRANCH',
            'STAFF',
            'PURCHASE',
            'STOCK_TRANSFER',
            'GOODS_RECEIPT',
            'REGISTER_SESSION',
            'CASH_MOVEMENT',
            'HELD_BILL'
          )
        );
    `);

    // 2. Ensure composite unique constraint on branches (id, organisation_id)
    console.log("2. Ensuring composite unique constraint on branches (id, organisation_id)...");
    await client.query(`
      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'branches_id_org_unique'
        ) THEN
          ALTER TABLE branches ADD CONSTRAINT branches_id_org_unique UNIQUE (id, organisation_id);
        END IF;
      END \$\$;
    `);

    // 3. Create cash_registers table
    console.log("3. Creating cash_registers table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_registers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        identifier VARCHAR(50) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT cash_registers_branch_identifier_unique UNIQUE (branch_id, identifier)
      );

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_registers_branch_org_fk'
        ) THEN
          ALTER TABLE cash_registers ADD CONSTRAINT cash_registers_branch_org_fk
            FOREIGN KEY (branch_id, organisation_id) REFERENCES branches (id, organisation_id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_registers_id_branch_org_unique'
        ) THEN
          ALTER TABLE cash_registers ADD CONSTRAINT cash_registers_id_branch_org_unique
            UNIQUE (id, branch_id, organisation_id);
        END IF;
      END \$\$;

      CREATE INDEX IF NOT EXISTS idx_cash_registers_org_branch ON cash_registers (organisation_id, branch_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_registers_branch_identifier_lower ON cash_registers (branch_id, LOWER(identifier));
    `);

    // 4. Create cash_register_sessions table
    console.log("4. Creating cash_register_sessions table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_register_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        cash_register_id UUID NOT NULL,
        cashier_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        session_number VARCHAR(50) NOT NULL,
        shift_name VARCHAR(50) DEFAULT 'Day Shift',
        opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMPTZ,
        opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        counted_cash NUMERIC(12, 2),
        expected_cash NUMERIC(12, 2),
        variance NUMERIC(12, 2),
        status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
        variance_status VARCHAR(30),
        opening_notes TEXT,
        closing_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT cash_register_sessions_opening_balance_check CHECK (opening_balance >= 0),
        CONSTRAINT cash_register_sessions_status_check CHECK (status IN ('OPEN', 'CLOSED')),
        CONSTRAINT cash_register_sessions_variance_status_check CHECK (
          variance_status IS NULL OR variance_status IN ('BALANCED', 'SHORTAGE', 'OVERAGE')
        )
      );

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_sessions_branch_org_fk'
        ) THEN
          ALTER TABLE cash_register_sessions ADD CONSTRAINT cash_register_sessions_branch_org_fk
            FOREIGN KEY (branch_id, organisation_id) REFERENCES branches (id, organisation_id) ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_sessions_register_branch_org_fk'
        ) THEN
          ALTER TABLE cash_register_sessions ADD CONSTRAINT cash_register_sessions_register_branch_org_fk
            FOREIGN KEY (cash_register_id, branch_id, organisation_id) REFERENCES cash_registers (id, branch_id, organisation_id) ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_sessions_id_branch_org_unique'
        ) THEN
          ALTER TABLE cash_register_sessions ADD CONSTRAINT cash_register_sessions_id_branch_org_unique
            UNIQUE (id, branch_id, organisation_id);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_sessions_id_org_unique'
        ) THEN
          ALTER TABLE cash_register_sessions ADD CONSTRAINT cash_register_sessions_id_org_unique
            UNIQUE (id, organisation_id);
        END IF;
      END \$\$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_session_per_register
        ON cash_register_sessions (cash_register_id)
        WHERE status = 'OPEN';

      CREATE INDEX IF NOT EXISTS idx_register_sessions_org_branch ON cash_register_sessions (organisation_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_register_sessions_cashier ON cash_register_sessions (cashier_id);
      CREATE INDEX IF NOT EXISTS idx_register_sessions_register ON cash_register_sessions (cash_register_id);
    `);

    // 5. Create cash_movements table
    console.log("5. Creating cash_movements table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        cash_register_session_id UUID NOT NULL,
        cashier_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        movement_number VARCHAR(50) NOT NULL,
        movement_type VARCHAR(10) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT cash_movements_type_check CHECK (movement_type IN ('IN', 'OUT')),
        CONSTRAINT cash_movements_amount_check CHECK (amount > 0)
      );

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_branch_org_fk'
        ) THEN
          ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_branch_org_fk
            FOREIGN KEY (branch_id, organisation_id) REFERENCES branches (id, organisation_id) ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_session_branch_org_fk'
        ) THEN
          ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_session_branch_org_fk
            FOREIGN KEY (cash_register_session_id, branch_id, organisation_id) REFERENCES cash_register_sessions (id, branch_id, organisation_id) ON DELETE RESTRICT;
        END IF;
      END \$\$;

      CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements (cash_register_session_id);
      CREATE INDEX IF NOT EXISTS idx_cash_movements_org_branch ON cash_movements (organisation_id, branch_id);
    `);

    // 6. Create cash_denominations table
    console.log("6. Creating cash_denominations table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_denominations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        cash_register_session_id UUID NOT NULL,
        denomination_value NUMERIC(10, 2) NOT NULL,
        denomination_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT cash_denominations_value_check CHECK (denomination_value > 0),
        CONSTRAINT cash_denominations_count_check CHECK (denomination_count >= 0),
        CONSTRAINT cash_denominations_session_val_unique UNIQUE (cash_register_session_id, denomination_value)
      );

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cash_denominations_session_org_fk'
        ) THEN
          ALTER TABLE cash_denominations ADD CONSTRAINT cash_denominations_session_org_fk
            FOREIGN KEY (cash_register_session_id, organisation_id) REFERENCES cash_register_sessions (id, organisation_id) ON DELETE CASCADE;
        END IF;
      END \$\$;

      CREATE INDEX IF NOT EXISTS idx_cash_denominations_session ON cash_denominations (cash_register_session_id);
    `);

    // 7. Create held_bills table
    console.log("7. Creating held_bills table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS held_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        cash_register_session_id UUID,
        held_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        hold_token VARCHAR(50) NOT NULL,
        customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
        customer_name VARCHAR(150) NOT NULL DEFAULT 'Walk-in Customer',
        customer_phone VARCHAR(50),
        items_count INTEGER NOT NULL DEFAULT 0,
        items_summary TEXT,
        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        cart_data JSONB NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'HOLD',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT held_bills_items_count_check CHECK (items_count >= 0),
        CONSTRAINT held_bills_total_amount_check CHECK (total_amount >= 0),
        CONSTRAINT held_bills_status_check CHECK (
          status IN ('HOLD', 'PENDING_PRESCRIPTION', 'AWAITING_PAYMENT', 'RESUMED', 'DISCARDED')
        )
      );

      DO \$\$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'held_bills_branch_org_fk'
        ) THEN
          ALTER TABLE held_bills ADD CONSTRAINT held_bills_branch_org_fk
            FOREIGN KEY (branch_id, organisation_id) REFERENCES branches (id, organisation_id) ON DELETE RESTRICT;
        END IF;

        ALTER TABLE held_bills DROP CONSTRAINT IF EXISTS held_bills_session_branch_org_fk;
        ALTER TABLE held_bills ADD CONSTRAINT held_bills_session_branch_org_fk
          FOREIGN KEY (cash_register_session_id, branch_id, organisation_id) REFERENCES cash_register_sessions (id, branch_id, organisation_id) ON DELETE RESTRICT;
      END \$\$;

      CREATE INDEX IF NOT EXISTS idx_held_bills_org_branch_status ON held_bills (organisation_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_held_bills_token ON held_bills (organisation_id, hold_token);
      CREATE INDEX IF NOT EXISTS idx_held_bills_customer ON held_bills (customer_id);
    `);

    // 8. Alter existing tables: invoices, payments, returns
    console.log(
      "8. Extending existing tables (invoices, payments, returns) with composite relationship integrity...",
    );
    await client.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cash_register_session_id UUID;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_register_session_id UUID;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS cash_register_session_id UUID;

      DO \$\$
      BEGIN
        ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_cash_register_session_id_fkey;
        ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_session_branch_org_fk;
        ALTER TABLE invoices ADD CONSTRAINT invoices_session_branch_org_fk
          FOREIGN KEY (cash_register_session_id, branch_id, organisation_id) REFERENCES cash_register_sessions (id, branch_id, organisation_id) ON DELETE RESTRICT;

        ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_cash_register_session_id_fkey;
        ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_session_branch_org_fk;
        ALTER TABLE payments ADD CONSTRAINT payments_session_branch_org_fk
          FOREIGN KEY (cash_register_session_id, branch_id, organisation_id) REFERENCES cash_register_sessions (id, branch_id, organisation_id) ON DELETE RESTRICT;

        ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_cash_register_session_id_fkey;
        ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_session_branch_org_fk;
        ALTER TABLE returns ADD CONSTRAINT returns_session_branch_org_fk
          FOREIGN KEY (cash_register_session_id, branch_id, organisation_id) REFERENCES cash_register_sessions (id, branch_id, organisation_id) ON DELETE RESTRICT;
      END \$\$;

      CREATE INDEX IF NOT EXISTS idx_invoices_cash_register_session_id ON invoices (cash_register_session_id);
      CREATE INDEX IF NOT EXISTS idx_payments_cash_register_session_id ON payments (cash_register_session_id);
      CREATE INDEX IF NOT EXISTS idx_returns_cash_register_session_id ON returns (cash_register_session_id);
    `);

    // 9. Verification
    console.log("9. Verifying migration objects and composite constraints...");
    const seqCheck = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'number_sequences'::regclass
        AND conname = 'number_sequences_type_check';
    `);
    if (
      !seqCheck.rows.length ||
      !seqCheck.rows[0].def.includes("REGISTER_SESSION")
    ) {
      throw new Error(
        "Failed to verify updated number_sequences_type_check constraint.",
      );
    }

    const tablesCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'cash_registers',
          'cash_register_sessions',
          'cash_movements',
          'cash_denominations',
          'held_bills'
        );
    `);
    if (tablesCheck.rows.length !== 5) {
      throw new Error(
        `Expected 5 new tables, but found ${tablesCheck.rows.length}`,
      );
    }

    const colCheck = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'cash_register_session_id'
        AND table_name IN ('invoices', 'payments', 'returns');
    `);
    if (colCheck.rows.length !== 3) {
      throw new Error(
        `Expected cash_register_session_id in 3 tables, found ${colCheck.rows.length}`,
      );
    }

    const fkCheck = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'cash_registers_branch_org_fk',
        'cash_register_sessions_register_branch_org_fk',
        'cash_movements_session_branch_org_fk',
        'invoices_session_branch_org_fk',
        'payments_session_branch_org_fk',
        'returns_session_branch_org_fk'
      );
    `);
    if (fkCheck.rows.length !== 6) {
      throw new Error(
        `Expected 6 composite FK constraints, found ${fkCheck.rows.length}`,
      );
    }

    await client.query("COMMIT");
    console.log("=== POS & Cash Register Migration Completed Successfully ===");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
