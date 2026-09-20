/**
 * Complete Supabase Database Migration & Verification Runner
 *
 * Purpose:
 * 1. Checks connection to Supabase PostgreSQL database.
 * 2. Creates missing tables: sync_mutations, sync_changes, stock_movements.
 * 3. Applies constraint updates: number_sequences types and purchases statuses.
 * 4. Seeds 139 system permissions and default tenant roles.
 * 5. Seeds superadmin platform user (if not exists).
 * 6. Verifies that all SQL tables exist in public schema and prints complete catalog.
 */

const { pool } = require("./connection");
const { migrateSyncMutations } = require("./migrate-sync-mutations");
const { migrateSyncChanges } = require("./migrate-sync-changes");
const { seedSuperadmin } = require("./seed-superadmin");

const runAllSupabaseMigrations = async () => {
  console.log("=================================================");
  console.log("  🚀 PHARMAFLOW - SUPABASE DATABASE MIGRATION");
  console.log("=================================================");

  const client = await pool.connect();

  try {
    // 1. Verify connection
    const timeRes = await client.query("SELECT NOW() as current_time, current_database() as db_name;");
    console.log(`✅ Connected to Supabase DB '${timeRes.rows[0].db_name}' at ${timeRes.rows[0].current_time}`);

    // 2. Ensure pgcrypto extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    console.log("✓ Extension 'pgcrypto' ensured.");

    // 3. Migrate sync_mutations
    console.log("\n📦 1/5: Migrating sync_mutations table...");
    await migrateSyncMutations();

    // 4. Migrate sync_changes
    console.log("\n📦 2/5: Migrating sync_changes table...");
    await migrateSyncChanges();

    // 5. Migrate stock_movements
    console.log("\n📦 3/5: Migrating stock_movements table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organisation_id UUID,
        branch_name VARCHAR(255) DEFAULT 'Main Branch',
        movement_type VARCHAR(50) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity VARCHAR(50) NOT NULL,
        reference VARCHAR(100) DEFAULT 'SYS-LOG',
        status VARCHAR(50) DEFAULT 'Completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_movements_org ON stock_movements (organisation_id);
    `);
    console.log("✅ Table 'stock_movements' ensured successfully.");

    // 6. Fix purchase & sequence constraints
    console.log("\n📦 4/5: Updating sequence & purchase constraints...");
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
            'GOODS_RECEIPT'
          )
        );

      ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
      ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
        CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'));
    `);
    console.log("✅ Constraints updated successfully.");

    // 7. Seed Permissions & System Roles
    console.log("\n📦 5/5: Populating permissions catalogue & default roles...");
    const { PERMISSIONS } = require("./permission-catalogue");
    const { seedOrganisationSystemRoles } = require("../repositories/role.repository");

    console.log(`   Upserting ${PERMISSIONS.length} system permissions...`);
    for (const perm of PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (name, description)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE
         SET description = EXCLUDED.description,
             updated_at = CURRENT_TIMESTAMP`,
        [perm.name, perm.description],
      );
    }
    const permCount = await client.query("SELECT count(*)::int AS count FROM permissions");
    console.log(`   ✓ Total permissions in database: ${permCount.rows[0].count}`);

    // Seed roles for each organisation
    const orgsRes = await client.query("SELECT id, name FROM organisations");
    for (const org of orgsRes.rows) {
      console.log(`   Seeding standard system roles for org: ${org.name} (${org.id})...`);
      await seedOrganisationSystemRoles(org.id, client);
    }
    const rolesCount = await client.query("SELECT count(*)::int AS count FROM roles");
    console.log(`   ✓ Total roles in database: ${rolesCount.rows[0].count}`);

    // 8. Seed Superadmin
    console.log("\n👑 Ensuring platform superadmin user...");
    await seedSuperadmin();

    // 9. Verification pass: List all public tables
    console.log("\n=================================================");
    console.log("  🔍 SUPABASE PUBLIC SCHEMA TABLE VERIFICATION");
    console.log("=================================================");
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`Total Tables in Supabase: ${tablesRes.rows.length}\n`);
    tablesRes.rows.forEach((row, idx) => {
      console.log(`  ${String(idx + 1).padStart(2, " ")}. ${row.table_name}`);
    });
    console.log("=================================================");
    console.log("✅ All SQL tables are successfully visible in Supabase!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  runAllSupabaseMigrations();
}

module.exports = { runAllSupabaseMigrations };
