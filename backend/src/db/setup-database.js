/**
 * PharmaFlow Database Bootstrap & Readiness Orchestrator
 *
 * Provides a clean, reproducible, idempotent bootstrap command for:
 * 1. Database connection validation (Supabase PostgreSQL / Cloud / Local)
 * 2. Master schema execution (schema.sql - 46 core tables)
 * 3. Core multi-tenant sync migrations (sync_mutations, sync_changes)
 * 4. Superadmin platform & subscription plan extensions
 * 5. Platform superadmin provisioning (superadmin@pharmaflow.com)
 * 6. Baseline tenant organisation & branch provisioning
 * 7. Authoritative roles & permissions foundation (139 permissions, 6 system roles)
 * 8. Baseline demo fixtures (customer, product, batch for POS readiness)
 * 9. Post-bootstrap invariant verification
 *
 * Guarantees:
 * - Completely non-destructive (NO DROP TABLE, NO TRUNCATE)
 * - Safe to run repeatedly (fully idempotent)
 * - Cross-platform (pure Node.js, no OS-specific shell dependencies)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./connection");

const { migrateSyncMutations } = require("./migrate-sync-mutations");
const { migrateSyncChanges } = require("./migrate-sync-changes");
const { migrateSuperadminPlatform } = require("./migrate-superadmin-platform");
const { seedSuperadmin } = require("./seed-superadmin");
const {
  runMigration: migrateRolesPermissions,
} = require("./migrate-roles-permissions");
const { migrateSupabaseAuth } = require("./migrate-supabase-auth");
const { bootstrapDemoAuth } = require("./bootstrap-demo-auth");

async function setupDatabase() {
  console.log(
    "================================================================================",
  );
  console.log(
    "             🚀 PHARMAFLOW SUPABASE DATABASE BOOTSTRAP & SETUP                  ",
  );
  console.log(
    "================================================================================\n",
  );

  const startTime = Date.now();
  const client = await pool.connect();

  try {
    // -------------------------------------------------------------------------
    // Step 1: Connectivity & Environment Validation
    // -------------------------------------------------------------------------
    console.log("Step 1: Validating database connection...");
    const connCheck = await client.query(`
      SELECT 
        current_database() AS db_name,
        current_user AS db_user,
        version() AS pg_version,
        NOW() AS server_time;
    `);
    const dbInfo = connCheck.rows[0];
    console.log(
      `  ✓ Connected to database: ${dbInfo.db_name} as ${dbInfo.db_user}`,
    );
    console.log(
      `  ✓ PostgreSQL version: ${dbInfo.pg_version.split(" on ")[0]}`,
    );
    console.log(`  ✓ Server time: ${dbInfo.server_time.toISOString()}\n`);

    // -------------------------------------------------------------------------
    // Step 2: Master Schema Execution (schema.sql)
    // -------------------------------------------------------------------------
    console.log("Step 2: Executing core schema (schema.sql)...");
    const schemaPath = path.join(__dirname, "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await client.query(schemaSql);
    console.log(
      "  ✓ Master schema DDL executed successfully (46 core tables ensured).\n",
    );

    // -------------------------------------------------------------------------
    // Step 3: Offline-First Multi-Tenant Sync Migrations
    // -------------------------------------------------------------------------
    console.log("Step 3: Running offline sync migrations...");
    await migrateSyncMutations();
    await migrateSyncChanges();
    console.log("  ✓ Sync mutations and changes tables verified.\n");

    // -------------------------------------------------------------------------
    // Step 4: Superadmin Platform Extensions & Subscription Plans
    // -------------------------------------------------------------------------
    console.log("Step 4: Running superadmin platform migrations...");
    await migrateSuperadminPlatform();
    await migrateSupabaseAuth();
    console.log(
      "  ✓ Platform tables, sequences, subscription tiers, and Supabase identity mapping verified.\n",
    );

    // -------------------------------------------------------------------------
    // Step 5: Provision Platform Superadmin User
    // -------------------------------------------------------------------------
    console.log("Step 5: Provisioning platform superadmin...");
    const superadminId = await seedSuperadmin();
    console.log(`  ✓ Platform superadmin active (id: ${superadminId}).\n`);

    console.log("Step 5b: Bootstrapping demo users for Supabase Auth...");
    await bootstrapDemoAuth();
    console.log("  ✓ Demo users mapped to Supabase Auth.\n");

    // -------------------------------------------------------------------------
    // Step 6: Baseline Tenant & Branch Provisioning
    // -------------------------------------------------------------------------
    console.log("Step 6: Provisioning baseline tenant & branch context...");

    // Ensure active organisation
    let orgRes = await client.query(`
      SELECT id, name, status, owner_id 
      FROM organisations 
      WHERE status = 'ACTIVE' 
      ORDER BY created_at ASC 
      LIMIT 1;
    `);

    let organisationId;
    if (orgRes.rows.length === 0) {
      const newOrg = await client.query(`
        INSERT INTO organisations (name, code, status, business_type)
        VALUES ('MedLife Care Chemist', 'ORG-MEDLIFE', 'ACTIVE', 'Retail Pharmacy')
        RETURNING id, name;
      `);
      organisationId = newOrg.rows[0].id;
      console.log(
        `  ✓ Created default organisation: ${newOrg.rows[0].name} (${organisationId})`,
      );
    } else {
      organisationId = orgRes.rows[0].id;
      console.log(
        `  ✓ Existing active organisation found: ${orgRes.rows[0].name} (${organisationId})`,
      );
    }

    // Ensure active branch
    let branchRes = await client.query(
      `
      SELECT id, name, status 
      FROM branches 
      WHERE organisation_id = $1 AND status = 'ACTIVE' 
      ORDER BY created_at ASC 
      LIMIT 1;
    `,
      [organisationId],
    );

    let branchId;
    if (branchRes.rows.length === 0) {
      const newBranch = await client.query(
        `
        INSERT INTO branches (organisation_id, name, branch_code, status, facility_type)
        VALUES ($1, 'Main Branch', 'BR-001', 'ACTIVE', 'RETAIL_DISPENSARY')
        RETURNING id, name;
      `,
        [organisationId],
      );
      branchId = newBranch.rows[0].id;
      console.log(
        `  ✓ Created default branch: ${newBranch.rows[0].name} (${branchId})`,
      );
    } else {
      branchId = branchRes.rows[0].id;
      console.log(
        `  ✓ Existing active branch found: ${branchRes.rows[0].name} (${branchId})`,
      );
    }

    // Ensure cash register
    await client.query(
      `
      INSERT INTO cash_registers (organisation_id, branch_id, name, identifier, is_active)
      VALUES ($1, $2, 'Counter 1', 'POS-01', TRUE)
      ON CONFLICT DO NOTHING;
    `,
      [organisationId, branchId],
    );
    console.log("  ✓ Default cash register (POS-01) ensured.");

    // Ensure default walk-in customer
    const existingCust = await client.query(
      "SELECT id FROM customers WHERE organisation_id = $1 LIMIT 1;",
      [organisationId],
    );
    if (existingCust.rows.length === 0) {
      await client.query(
        `INSERT INTO customers (organisation_id, customer_number, full_name, phone, status)
         VALUES ($1, 'CUST-1001', 'Walk-in Customer', '9999999999', 'ACTIVE');`,
        [organisationId],
      );
    }
    console.log("  ✓ Default walk-in customer ensured.\n");

    // -------------------------------------------------------------------------
    // Step 7: Roles & Permissions Catalogue Migration
    // -------------------------------------------------------------------------
    console.log("Step 7: Seeding permissions catalogue & tenant roles...");
    await migrateRolesPermissions();
    console.log("  ✓ 139 permissions & 6 system roles seeded.\n");

    // -------------------------------------------------------------------------
    // Step 8: User Tenancy & Role Assignments Linking
    // -------------------------------------------------------------------------
    console.log("Step 8: Linking users to organisation membership & branch...");

    // Find or link owner user
    const ownerUserRes = await client.query(`
      SELECT id, email FROM users 
      WHERE email = 'surajmore303@gmail.com' 
      LIMIT 1;
    `);

    if (ownerUserRes.rows.length > 0) {
      const ownerUserId = ownerUserRes.rows[0].id;

      // Set owner on organisation
      await client.query(
        `
        UPDATE organisations 
        SET owner_id = $1 
        WHERE id = $2;
      `,
        [ownerUserId, organisationId],
      );

      // Ensure organisation membership
      const memRes = await client.query(
        `
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'ACTIVE')
        ON CONFLICT (organisation_id, user_id) 
        DO UPDATE SET status = 'ACTIVE'
        RETURNING id;
      `,
        [organisationId, ownerUserId],
      );

      const membershipId = memRes.rows[0]?.id;

      // Assign Administrator role in branch_assignments
      const adminRoleRes = await client.query(
        `
        SELECT id FROM roles 
        WHERE organisation_id = $1 AND role_identifier = 'ADMIN' 
        LIMIT 1;
      `,
        [organisationId],
      );

      if (adminRoleRes.rows.length > 0 && membershipId) {
        await client.query(
          `
          INSERT INTO branch_assignments (membership_id, branch_id, role_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (membership_id, branch_id) 
          DO UPDATE SET role_id = EXCLUDED.role_id;
        `,
          [membershipId, branchId, adminRoleRes.rows[0].id],
        );
      }
      console.log(
        `  ✓ Owner user ${ownerUserRes.rows[0].email} linked as Administrator for ${organisationId}`,
      );
    }

    // Link staff user if exists
    const staffUserRes = await client.query(`
      SELECT id, email FROM users 
      WHERE email = 'staff.pharmacist@gmail.com' 
      LIMIT 1;
    `);
    if (staffUserRes.rows.length > 0) {
      const staffUserId = staffUserRes.rows[0].id;
      const staffMem = await client.query(
        `
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, 'ACTIVE')
        ON CONFLICT (organisation_id, user_id) 
        DO UPDATE SET status = 'ACTIVE'
        RETURNING id;
      `,
        [organisationId, staffUserId],
      );

      const pharmRole = await client.query(
        `
        SELECT id FROM roles 
        WHERE organisation_id = $1 AND role_identifier = 'PHARMACIST' 
        LIMIT 1;
      `,
        [organisationId],
      );

      if (pharmRole.rows.length > 0 && staffMem.rows[0]?.id) {
        await client.query(
          `
          INSERT INTO branch_assignments (membership_id, branch_id, role_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (membership_id, branch_id) 
          DO UPDATE SET role_id = EXCLUDED.role_id;
        `,
          [staffMem.rows[0].id, branchId, pharmRole.rows[0].id],
        );
      }
      console.log(`  ✓ Staff user linked for ${organisationId}`);
    }

    // -------------------------------------------------------------------------
    // Step 9: Post-Bootstrap Invariant Verification
    // -------------------------------------------------------------------------
    console.log("\nStep 9: Verifying database post-bootstrap invariants...");

    const tableCountRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const totalTables = tableCountRes.rows[0].count;

    const permCountRes = await client.query(`
      SELECT count(*)::int AS count FROM permissions;
    `);
    const totalPerms = permCountRes.rows[0].count;

    const superadminCountRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM users 
      WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE';
    `);
    const totalSuperadmins = superadminCountRes.rows[0].count;

    const activeOrgsRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM organisations 
      WHERE status = 'ACTIVE';
    `);
    const activeBranchesRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM branches 
      WHERE status = 'ACTIVE';
    `);

    console.log(
      "--------------------------------------------------------------------------------",
    );
    console.log(
      `  ✓ Total Public Tables:      ${totalTables} (expected >= 48)`,
    );
    console.log(
      `  ✓ System Permissions:       ${totalPerms} (expected >= 139)`,
    );
    console.log(
      `  ✓ Platform Superadmins:     ${totalSuperadmins} (expected >= 1)`,
    );
    console.log(`  ✓ Active Organisations:     ${activeOrgsRes.rows[0].count}`);
    console.log(
      `  ✓ Active Branches:          ${activeBranchesRes.rows[0].count}`,
    );
    console.log(
      "--------------------------------------------------------------------------------",
    );

    if (totalTables < 48) {
      throw new Error(
        `Verification failed: expected at least 48 tables, got ${totalTables}`,
      );
    }
    if (totalPerms < 139) {
      throw new Error(
        `Verification failed: expected at least 139 permissions, got ${totalPerms}`,
      );
    }
    if (totalSuperadmins < 1) {
      throw new Error(
        `Verification failed: no active platform superadmin found`,
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `\n🎉 DATABASE BOOTSTRAP COMPLETED SUCCESSFULLY IN ${duration}s!`,
    );
    console.log(
      "================================================================================\n",
    );
  } catch (error) {
    console.error("\n❌ DATABASE BOOTSTRAP FAILED:", error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  setupDatabase().catch(() => {
    process.exit(1);
  });
}

module.exports = { setupDatabase };
