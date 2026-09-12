/**
 * Migration: sync_changes Table (Server-side Change Tracking for Pull Sync)
 */

const { pool } = require("./connection");

async function migrateSyncChanges() {
  console.log("Running migration: sync_changes...");

  const query = `
    CREATE TABLE IF NOT EXISTS sync_changes (
      sequence BIGSERIAL PRIMARY KEY,
      organisation_id UUID NOT NULL,
      branch_id UUID,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      operation VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_sync_changes_org_seq ON sync_changes (organisation_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_sync_changes_org_branch_seq ON sync_changes (organisation_id, branch_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON sync_changes (entity_type, entity_id);
  `;

  try {
    await pool.query(query);
    console.log("✅ Migration sync_changes completed successfully.");
  } catch (err) {
    console.error("❌ Migration sync_changes failed:", err.message);
    throw err;
  }
}

if (require.main === module) {
  migrateSyncChanges()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateSyncChanges };
