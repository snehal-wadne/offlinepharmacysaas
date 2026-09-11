/**
 * Migration: Sync Mutations Table (Idempotency and Audit for Offline-First Sync)
 */

const { pool } = require("./connection");

async function migrateSyncMutations() {
  console.log("Running migration: sync_mutations...");

  const query = `
    CREATE TABLE IF NOT EXISTS sync_mutations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mutation_id VARCHAR(100) NOT NULL,
      organisation_id UUID,
      branch_id UUID,
      user_id UUID,
      device_id VARCHAR(100) NOT NULL,
      mutation_type VARCHAR(50) NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL, -- 'PROCESSED', 'FAILED', 'CONFLICT'
      payload JSONB NOT NULL,
      result JSONB,
      error_code VARCHAR(50),
      error_message TEXT,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_sync_mutations_org_mutation UNIQUE (organisation_id, mutation_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_mutations_org_branch ON sync_mutations (organisation_id, branch_id);
    CREATE INDEX IF NOT EXISTS idx_sync_mutations_device_occurred ON sync_mutations (device_id, occurred_at);

    -- Multi-tenant isolation migration for existing table
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_sync_mutations_mutation_id' AND table_name = 'sync_mutations'
      ) THEN
        ALTER TABLE sync_mutations DROP CONSTRAINT uq_sync_mutations_mutation_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_sync_mutations_org_mutation' AND table_name = 'sync_mutations'
      ) THEN
        ALTER TABLE sync_mutations ADD CONSTRAINT uq_sync_mutations_org_mutation UNIQUE (organisation_id, mutation_id);
      END IF;
    END $$;
  `;

  try {
    await pool.query(query);
    console.log("✅ Migration sync_mutations completed successfully.");
  } catch (err) {
    console.error("❌ Migration sync_mutations failed:", err.message);
    throw err;
  }
}

if (require.main === module) {
  migrateSyncMutations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateSyncMutations };
