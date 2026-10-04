require("dotenv").config();
const { pool } = require("./connection");
const { seedOrganisationSystemRoles } = require("../repositories/role.repository");

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("=== Running Roles & Columns Migration ===");
    await client.query("BEGIN");

    // 1. Add role column to users if missing
    console.log("1. Ensuring 'role' column on users table...");
    await client.query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'STAFF';
    `);

    // 2. Add supplier_id column to users if missing
    console.log("2. Ensuring 'supplier_id' column on users table...");
    await client.query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
    `);

    // 3. Ensure sync_changes table exists
    console.log("3. Ensuring sync_changes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_changes (
        sequence BIGSERIAL PRIMARY KEY,
        organisation_id UUID NOT NULL,
        branch_id UUID,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        operation VARCHAR(20) NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_sync_changes_org_seq ON sync_changes (organisation_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_sync_changes_org_branch_seq ON sync_changes (organisation_id, branch_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON sync_changes (entity_type, entity_id);
    `);

    // 4. Update existing users role if null
    console.log("4. Updating existing users with default role if null...");
    await client.query(`
      UPDATE public.users 
      SET role = CASE 
        WHEN is_platform_superadmin = TRUE THEN 'SUPERADMIN'
        WHEN id IN (SELECT owner_id FROM organisations) THEN 'ADMIN'
        ELSE 'STAFF'
      END
      WHERE role IS NULL;
    `);

    await client.query("COMMIT");
    console.log("✓ Roles & columns schema updated successfully!");

    // 5. Seed system roles for all organisations
    console.log("5. Re-seeding system roles for all organisations...");
    const orgs = await pool.query("SELECT id, name FROM organisations");
    for (const org of orgs.rows) {
      await seedOrganisationSystemRoles(org.id, client);
      console.log(`  ✓ Seeded roles for ${org.name} (${org.id})`);
    }

    console.log("=== Migration Completed Successfully ===");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
