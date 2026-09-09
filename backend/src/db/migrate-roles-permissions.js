/**
 * Database Migration & Seeding: PharmaFlow Role & Permission Foundation
 *
 * Purpose:
 * 1. Seeds the complete, finalized catalogue of 139 system permissions across 14 domains.
 * 2. Provisions the 6 standard default system roles for every tenant organisation:
 *    - Administrator (ADMIN, ADMIN, 139 permissions)
 *    - Manager (MANAGER, MANAGEMENT, 113 permissions)
 *    - Chief Pharmacist (CHIEF_PHARM, CLINICAL_DISPENSING, 56 permissions)
 *    - Pharmacist (PHARMACIST, CLINICAL_DISPENSING, 46 permissions)
 *    - Cashier (CASHIER, STANDARD_POS, 28 permissions)
 *    - Accountant (ACCOUNTANT, MANAGEMENT, 44 permissions)
 * 3. Reconciles legacy 'Billing / Cashier' role records to 'Cashier'.
 * 4. Preserves custom roles and custom role permissions.
 * 5. Idempotent: completely safe to execute repeatedly without duplicates.
 */

require("dotenv").config();
const { pool } = require("./connection");
const { PERMISSIONS } = require("./permission-catalogue");
const {
  seedOrganisationSystemRoles,
} = require("../repositories/role.repository");

const runMigration = async () => {
  const client = await pool.connect();

  try {
    console.log("=== Starting Roles & Permissions Foundation Migration ===");

    await client.query("BEGIN");

    // ============================================================
    // 1. Seed / Upsert Permissions Catalogue (139 Permissions)
    // ============================================================
    console.log(`1. Upserting ${PERMISSIONS.length} system permissions...`);

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

    const permCountRes = await client.query(
      "SELECT count(*)::int AS count FROM permissions",
    );
    console.log(
      `✓ Total permissions in database: ${permCountRes.rows[0].count}`,
    );

    // ============================================================
    // 2. Ensure Default System Roles & Permissions for All Orgs
    // ============================================================
    const orgsRes = await client.query("SELECT id, name FROM organisations");
    console.log(
      `2. Provisioning 6 system roles & default permissions for ${orgsRes.rows.length} organisation(s)...`,
    );

    for (const org of orgsRes.rows) {
      const seeded = await seedOrganisationSystemRoles(org.id, client);
      console.log(
        `  ✓ Org [${org.name}] (${org.id}): ${seeded.length} system roles seeded/verified.`,
      );
    }

    await client.query("COMMIT");
    console.log("=== Migration Transaction Committed Successfully ===");

    // ============================================================
    // 3. Post-Migration Invariants Verification
    // ============================================================
    console.log("\n=== Verifying Post-Migration Invariants ===");

    // Verify permission catalogue count
    const totalPerms = await client.query(
      "SELECT count(*)::int AS count FROM permissions",
    );
    if (totalPerms.rows[0].count < 139) {
      throw new Error(
        `Expected at least 139 permissions, got ${totalPerms.rows[0].count}`,
      );
    }
    console.log(`✓ Permissions verified: ${totalPerms.rows[0].count}`);

    // Verify negative constraints (no separate prescription or expiry permissions)
    const invalidPerms = await client.query(
      `SELECT name FROM permissions
       WHERE name LIKE '%PRESCRIPTION%'
          OR name LIKE '%EXPIRY%'
          OR name LIKE '%AUDITOR%'
          OR name LIKE '%STORE_MANAGER%'`,
    );
    if (invalidPerms.rows.length > 0) {
      throw new Error(
        `Prohibited permissions discovered: ${invalidPerms.rows.map((r) => r.name).join(", ")}`,
      );
    }
    console.log(
      "✓ Prohibited permission check verified (0 invalid permissions).",
    );

    // Verify roles and permission counts for each organisation
    for (const org of orgsRes.rows) {
      const rolesRes = await client.query(
        `SELECT
           r.id,
           r.name,
           r.role_identifier,
           r.clearance_level,
           r.is_system_role,
           COUNT(rp.permission_id)::int AS permission_count
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE r.organisation_id = $1 AND r.is_system_role = TRUE
         GROUP BY r.id, r.name, r.role_identifier, r.clearance_level, r.is_system_role
         ORDER BY r.role_identifier ASC`,
        [org.id],
      );

      console.log(`Org [${org.name}] System Roles:`);
      for (const r of rolesRes.rows) {
        console.log(
          `  - ${r.name} (${r.role_identifier}, ${r.clearance_level}): ${r.permission_count} permissions`,
        );
      }

      const roleMap = new Map(rolesRes.rows.map((r) => [r.role_identifier, r]));
      if (
        !roleMap.has("ADMIN") ||
        roleMap.get("ADMIN").permission_count !== 139
      ) {
        throw new Error(
          `Org ${org.id} ADMIN role has invalid permission count.`,
        );
      }
      if (
        !roleMap.has("MANAGER") ||
        roleMap.get("MANAGER").permission_count !== 113
      ) {
        throw new Error(
          `Org ${org.id} MANAGER role has invalid permission count.`,
        );
      }
      if (
        !roleMap.has("CHIEF_PHARM") ||
        roleMap.get("CHIEF_PHARM").permission_count !== 56
      ) {
        throw new Error(
          `Org ${org.id} CHIEF_PHARM role has invalid permission count.`,
        );
      }
      if (
        !roleMap.has("PHARMACIST") ||
        roleMap.get("PHARMACIST").permission_count !== 46
      ) {
        throw new Error(
          `Org ${org.id} PHARMACIST role has invalid permission count.`,
        );
      }
      if (
        !roleMap.has("CASHIER") ||
        roleMap.get("CASHIER").permission_count !== 28
      ) {
        throw new Error(
          `Org ${org.id} CASHIER role has invalid permission count.`,
        );
      }
      if (
        !roleMap.has("ACCOUNTANT") ||
        roleMap.get("ACCOUNTANT").permission_count !== 44
      ) {
        throw new Error(
          `Org ${org.id} ACCOUNTANT role has invalid permission count.`,
        );
      }
    }

    console.log("✓ All organisation roles and permission counts verified.\n");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runMigration };
