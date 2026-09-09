/**
 * Role Repository Integration Tests
 *
 * Tests the Role Repository against the real PostgreSQL
 * database and local Redis instance.
 *
 * The tests verify:
 * - Role creation
 * - Role cache miss and hit
 * - Organisation role list caching
 * - Permission assignment
 * - Role permission list caching
 * - Permission existence caching
 * - Roles-with-permission caching
 * - Cache invalidation after role updates
 * - Cache invalidation after permission changes
 * - Cache invalidation after role deletion
 * - Bulk assignPermissionsToRole
 * - syncRolePermissions
 * - getRoleWithPermissions
 * - seedOrganisationSystemRoles provision of all 6 standard system roles
 * - Role permission counts and strict security assertions:
 *   - Administrator (139/139)
 *   - Manager (113/139 - NO user/role management)
 *   - Chief Pharmacist (56/139 - 10 clinical/operational overrides)
 *   - Pharmacist (46/139)
 *   - Cashier (28/139)
 *   - Accountant (44/139)
 * - Custom role & permission preservation
 * - Idempotency without duplicates
 * - Transaction client Redis bypass
 */

require("dotenv").config();

const assert = require("assert");

const {
  createRole,
  getRoleById,
  getRoleByIdentifier,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  assignPermissionsToRole,
  syncRolePermissions,
  removePermissionFromRole,
  getRolePermissions,
  getRoleWithPermissions,
  getRolesWithPermission,
  hasRolePermission,
  seedOrganisationSystemRoles,
} = require("../repositories/role.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");
const {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} = require("../db/permission-catalogue");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildRoleCacheKey = (roleId) => `role:${roleId}`;

const buildOrganisationRolesCacheKey = (organisationId) =>
  `role:organisation:${organisationId}`;

const buildRolePermissionsCacheKey = (roleId) => `role:permissions:${roleId}`;

const buildPermissionRolesCacheKey = (permissionId) =>
  `role:permission:${permissionId}`;

const buildRolePermissionCheckCacheKey = (roleId, permissionId) =>
  `role:has-permission:${roleId}:${permissionId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let roleId = null;
  let secondRoleId = null;
  let permissionId = null;
  let secondPermissionId = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Role Repository tests...\n");

    // ---------------------------------------------------------
    // Create test owner
    // ---------------------------------------------------------

    const userResult = await pool.query(
      `
        INSERT INTO users (
          email,
          password_hash,
          name,
          status
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [
        `${uniqueValue("role-owner")}@test.local`,
        "test-password",
        "Role Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = userResult.rows[0].id;

    console.log("✓ 1. Create test owner");

    // ---------------------------------------------------------
    // Create organisation
    // ---------------------------------------------------------

    const organisationResult = await pool.query(
      `
          INSERT INTO organisations (
            owner_id,
            name
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [ownerId, uniqueValue("Role Test Pharmacy")],
    );

    organisationId = organisationResult.rows[0].id;

    console.log("✓ 2. Create test organisation");

    // ---------------------------------------------------------
    // Create test permissions
    // ---------------------------------------------------------

    const permissionResult = await pool.query(
      `
          INSERT INTO permissions (
            name,
            description
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [uniqueValue("VIEW_TEST"), "Role repository test permission"],
    );

    permissionId = permissionResult.rows[0].id;

    const secondPermResult = await pool.query(
      `
          INSERT INTO permissions (
            name,
            description
          )
          VALUES ($1, $2)
          RETURNING id;
        `,
      [uniqueValue("EDIT_TEST"), "Role repository test permission 2"],
    );

    secondPermissionId = secondPermResult.rows[0].id;

    console.log("✓ 3. Create test permissions");

    // ---------------------------------------------------------
    // Create role
    // ---------------------------------------------------------

    const role = await createRole({
      organisationId,
      name: "Test Cashier",
      description: "Handles POS billing",
    });

    roleId = role.id;

    assert.ok(role);
    assert.strictEqual(role.name, "Test Cashier");
    assert.strictEqual(role.organisation_id, organisationId);

    console.log("✓ 4. Create role");

    // ---------------------------------------------------------
    // Role cache miss and hit
    // ---------------------------------------------------------

    await deleteCache(buildRoleCacheKey(roleId));

    const roleFirstRead = await getRoleById(roleId);

    assert.ok(roleFirstRead);
    assert.strictEqual(roleFirstRead.id, roleId);

    const cachedRole = await getCache(buildRoleCacheKey(roleId));

    assert.ok(cachedRole);
    assert.strictEqual(cachedRole.id, roleId);

    console.log("✓ 5. Role cache miss populates Redis");

    await pool.query(
      `
        UPDATE roles
        SET description = $1
        WHERE id = $2;
      `,
      ["Database modified description", roleId],
    );

    const roleCacheHit = await getRoleById(roleId);

    assert.strictEqual(roleCacheHit.description, "Handles POS billing");

    await pool.query(
      `
        UPDATE roles
        SET description = $1
        WHERE id = $2;
      `,
      ["Handles POS billing", roleId],
    );

    console.log("✓ 6. Role lookup uses Redis cache");

    // ---------------------------------------------------------
    // Organisation role list caching
    // ---------------------------------------------------------

    await deleteCache(buildOrganisationRolesCacheKey(organisationId));

    const rolesList = await getOrganisationRoles(organisationId);

    assert.ok(Array.isArray(rolesList));
    assert.ok(rolesList.length >= 1);

    const cachedRolesList = await getCache(
      buildOrganisationRolesCacheKey(organisationId),
    );

    assert.ok(Array.isArray(cachedRolesList));
    assert.strictEqual(cachedRolesList.length, rolesList.length);

    console.log("✓ 7. Organisation role list cache works");

    // ---------------------------------------------------------
    // Assign permission to role
    // ---------------------------------------------------------

    const assignment = await assignPermissionToRole(roleId, permissionId);

    assert.ok(assignment);
    assert.strictEqual(assignment.role_id, roleId);
    assert.strictEqual(assignment.permission_id, permissionId);

    console.log("✓ 8. Assign permission to role");

    // ---------------------------------------------------------
    // Role permissions list caching
    // ---------------------------------------------------------

    await deleteCache(buildRolePermissionsCacheKey(roleId));

    const permissions = await getRolePermissions(roleId);

    assert.ok(Array.isArray(permissions));
    assert.strictEqual(permissions.length, 1);
    assert.strictEqual(permissions[0].id, permissionId);

    const cachedPermissions = await getCache(
      buildRolePermissionsCacheKey(roleId),
    );

    assert.ok(Array.isArray(cachedPermissions));
    assert.strictEqual(cachedPermissions.length, 1);

    console.log("✓ 9. Role permissions cache works");

    // ---------------------------------------------------------
    // Role permission check caching
    // ---------------------------------------------------------

    await deleteCache(buildRolePermissionCheckCacheKey(roleId, permissionId));

    const hasPermission = await hasRolePermission(roleId, permissionId);

    assert.strictEqual(hasPermission, true);

    const cachedHasPermission = await getCache(
      buildRolePermissionCheckCacheKey(roleId, permissionId),
    );

    assert.strictEqual(cachedHasPermission, true);

    console.log("✓ 10. Role permission check cache works");

    // ---------------------------------------------------------
    // Roles with permission caching
    // ---------------------------------------------------------

    await deleteCache(buildPermissionRolesCacheKey(permissionId));

    const rolesWithPerm = await getRolesWithPermission(permissionId);

    assert.ok(Array.isArray(rolesWithPerm));
    assert.strictEqual(rolesWithPerm.length, 1);
    assert.strictEqual(rolesWithPerm[0].id, roleId);

    const cachedRolesWithPerm = await getCache(
      buildPermissionRolesCacheKey(permissionId),
    );

    assert.ok(Array.isArray(cachedRolesWithPerm));
    assert.strictEqual(cachedRolesWithPerm.length, 1);

    console.log("✓ 11. Roles-with-permission cache works");

    // ---------------------------------------------------------
    // Role update invalidation
    // ---------------------------------------------------------

    const updatedRole = await updateRole(roleId, {
      name: "Lead Cashier",
      description: "Supervises cashiers",
    });

    assert.ok(updatedRole);
    assert.strictEqual(updatedRole.name, "Lead Cashier");

    assert.strictEqual(await getCache(buildRoleCacheKey(roleId)), null);
    assert.strictEqual(
      await getCache(buildOrganisationRolesCacheKey(organisationId)),
      null,
    );

    console.log("✓ 12. Role update invalidates role caches");

    // ---------------------------------------------------------
    // Remove permission
    // ---------------------------------------------------------

    const removed = await removePermissionFromRole(roleId, permissionId);

    assert.strictEqual(removed, true);

    assert.strictEqual(
      await getCache(buildRolePermissionsCacheKey(roleId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildPermissionRolesCacheKey(permissionId)),
      null,
    );

    console.log("✓ 13. Permission removal invalidates related caches");

    const permissionsAfterRemoval = await getRolePermissions(roleId);

    assert.strictEqual(permissionsAfterRemoval.length, 0);

    console.log("✓ 14. Removed permission is no longer assigned");

    // Re-assign for later tests
    await assignPermissionToRole(roleId, permissionId);

    console.log("✓ 15. Permission can be assigned again");

    // ---------------------------------------------------------
    // Multi-role sharing
    // ---------------------------------------------------------

    const secondRole = await createRole({
      organisationId,
      name: "Pharmacist Assistant",
      description: "Assists pharmacists",
    });

    secondRoleId = secondRole.id;

    await assignPermissionToRole(secondRoleId, permissionId);

    console.log("✓ 16. Create second role");

    const multiRolesWithPerm = await getRolesWithPermission(permissionId);

    assert.strictEqual(multiRolesWithPerm.length, 2);

    console.log("✓ 17. Permission can belong to multiple roles");

    // ---------------------------------------------------------
    // Delete role
    // ---------------------------------------------------------

    const deleted = await deleteRole(roleId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(await getCache(buildRoleCacheKey(roleId)), null);
    assert.strictEqual(
      await getCache(buildOrganisationRolesCacheKey(organisationId)),
      null,
    );
    assert.strictEqual(
      await getCache(buildRolePermissionsCacheKey(roleId)),
      null,
    );

    const deletedRole = await getRoleById(roleId);

    assert.strictEqual(deletedRole, null);
    roleId = null;

    console.log("✓ 18. Role deletion removes database and cache data");

    // ---------------------------------------------------------
    // 19. Role identifier and clearance level support
    // ---------------------------------------------------------
    const clinicalRole = await createRole({
      organisationId,
      name: "Clinical Lead",
      roleIdentifier: "CLINICAL_LEAD",
      clearanceLevel: "CLINICAL_DISPENSING",
      description: "Clinical dispensing lead",
      isSystemRole: false,
    });

    assert.ok(clinicalRole);
    assert.strictEqual(clinicalRole.role_identifier, "CLINICAL_LEAD");
    assert.strictEqual(clinicalRole.clearance_level, "CLINICAL_DISPENSING");

    const fetchedRole = await getRoleById(clinicalRole.id);
    assert.strictEqual(fetchedRole.role_identifier, "CLINICAL_LEAD");
    assert.strictEqual(fetchedRole.clearance_level, "CLINICAL_DISPENSING");

    const fetchedByIdentifier = await getRoleByIdentifier(
      organisationId,
      "CLINICAL_LEAD",
    );
    assert.ok(fetchedByIdentifier);
    assert.strictEqual(fetchedByIdentifier.id, clinicalRole.id);

    const updatedClinicalRole = await updateRole(clinicalRole.id, {
      clearanceLevel: "MANAGEMENT",
    });
    assert.strictEqual(updatedClinicalRole.clearance_level, "MANAGEMENT");
    assert.strictEqual(updatedClinicalRole.role_identifier, "CLINICAL_LEAD");

    await deleteRole(clinicalRole.id);

    console.log(
      "✓ 19. Role identifier and clearance level created, read, and updated",
    );

    // ---------------------------------------------------------
    // 20. Bulk assignPermissionsToRole
    // ---------------------------------------------------------
    const customRole = await createRole({
      organisationId,
      name: "Custom Supervisor",
      roleIdentifier: "CUSTOM_SUP",
      clearanceLevel: "MANAGEMENT",
      isSystemRole: false,
    });

    const bulkAssigned = await assignPermissionsToRole(customRole.id, [
      permissionId,
      secondPermissionId,
    ]);
    assert.strictEqual(bulkAssigned.length, 2);

    const customPerms = await getRolePermissions(customRole.id);
    assert.strictEqual(customPerms.length, 2);
    console.log("✓ 20. assignPermissionsToRole bulk assigns permissions");

    // ---------------------------------------------------------
    // 21. syncRolePermissions
    // ---------------------------------------------------------
    // Sync to just permissionId
    const synced = await syncRolePermissions(customRole.id, [permissionId]);
    assert.strictEqual(synced.length, 1);
    assert.strictEqual(synced[0].id, permissionId);

    // Sync to empty
    const syncedEmpty = await syncRolePermissions(customRole.id, []);
    assert.strictEqual(syncedEmpty.length, 0);
    console.log("✓ 21. syncRolePermissions replaces permissions atomically");

    // ---------------------------------------------------------
    // 22. getRoleWithPermissions
    // ---------------------------------------------------------
    await assignPermissionToRole(customRole.id, permissionId);
    const compound = await getRoleWithPermissions(customRole.id);
    assert.ok(compound);
    assert.strictEqual(compound.id, customRole.id);
    assert.ok(Array.isArray(compound.permissions));
    assert.strictEqual(compound.permissions.length, 1);
    assert.strictEqual(compound.permission_count, 1);
    console.log(
      "✓ 22. getRoleWithPermissions returns role with assigned permissions",
    );

    // ---------------------------------------------------------
    // 23. seedOrganisationSystemRoles
    // ---------------------------------------------------------
    const seeded = await seedOrganisationSystemRoles(organisationId);
    assert.strictEqual(seeded.length, 6);
    console.log("✓ 23. seedOrganisationSystemRoles provisions 6 default roles");

    // Retrieve all 6 system roles from DB
    const adminRole = await getRoleByIdentifier(organisationId, "ADMIN");
    const managerRole = await getRoleByIdentifier(organisationId, "MANAGER");
    const chiefRole = await getRoleByIdentifier(organisationId, "CHIEF_PHARM");
    const pharmRole = await getRoleByIdentifier(organisationId, "PHARMACIST");
    const cashierRole = await getRoleByIdentifier(organisationId, "CASHIER");
    const acctRole = await getRoleByIdentifier(organisationId, "ACCOUNTANT");

    assert.ok(adminRole && adminRole.is_system_role);
    assert.ok(managerRole && managerRole.is_system_role);
    assert.ok(chiefRole && chiefRole.is_system_role);
    assert.ok(pharmRole && pharmRole.is_system_role);
    assert.ok(cashierRole && cashierRole.is_system_role);
    assert.ok(acctRole && acctRole.is_system_role);

    // Fetch permissions for all 6
    const adminPerms = (await getRolePermissions(adminRole.id)).map(
      (p) => p.name,
    );
    const managerPerms = (await getRolePermissions(managerRole.id)).map(
      (p) => p.name,
    );
    const chiefPerms = (await getRolePermissions(chiefRole.id)).map(
      (p) => p.name,
    );
    const pharmPerms = (await getRolePermissions(pharmRole.id)).map(
      (p) => p.name,
    );
    const cashierPerms = (await getRolePermissions(cashierRole.id)).map(
      (p) => p.name,
    );
    const acctPerms = (await getRolePermissions(acctRole.id)).map(
      (p) => p.name,
    );

    // ---------------------------------------------------------
    // 24. Administrator: 139 / 139 permissions
    // ---------------------------------------------------------
    assert.strictEqual(adminPerms.length, 139);
    for (const p of PERMISSIONS) {
      assert.ok(adminPerms.includes(p.name), `Admin missing ${p.name}`);
    }
    console.log(
      "✓ 24. Administrator receives all 139 permissions (unrestricted)",
    );

    // ---------------------------------------------------------
    // 25. Manager: 113 permissions (NO user or role management)
    // ---------------------------------------------------------
    assert.strictEqual(managerPerms.length, 113);
    const prohibitedManagerPerms = [
      "CREATE_USER",
      "UPDATE_USER",
      "DEACTIVATE_USER",
      "RESET_USER_PASSWORD",
      "ASSIGN_USER_BRANCH",
      "ASSIGN_USER_ROLE",
      "VIEW_USER_ACTIVITY",
      "EXPORT_USERS",
      "VIEW_ROLES",
      "CREATE_ROLE",
      "UPDATE_ROLE",
      "DELETE_ROLE",
      "CLONE_ROLE",
      "MANAGE_ROLE_PERMISSIONS",
      "UPDATE_TAX_SETTINGS",
      "UPDATE_BUSINESS_SETTINGS",
      "VIEW_SECURITY_SETTINGS",
      "UPDATE_SECURITY_SETTINGS",
      "VIEW_BRANCH_ASSIGNMENTS",
      "MANAGE_BRANCH_ASSIGNMENTS",
    ];
    for (const p of prohibitedManagerPerms) {
      assert.ok(!managerPerms.includes(p), `Manager illegally possesses ${p}`);
    }

    // Manager must retain VIEW_BRANCHES and UPDATE_BRANCH
    assert.ok(
      managerPerms.includes("VIEW_BRANCHES"),
      "Manager must retain VIEW_BRANCHES",
    );
    assert.ok(
      managerPerms.includes("UPDATE_BRANCH"),
      "Manager must retain UPDATE_BRANCH",
    );

    // Administrator must retain VIEW_BRANCH_ASSIGNMENTS and MANAGE_BRANCH_ASSIGNMENTS
    assert.ok(
      adminPerms.includes("VIEW_BRANCH_ASSIGNMENTS"),
      "Administrator must retain VIEW_BRANCH_ASSIGNMENTS",
    );
    assert.ok(
      adminPerms.includes("MANAGE_BRANCH_ASSIGNMENTS"),
      "Administrator must retain MANAGE_BRANCH_ASSIGNMENTS",
    );

    console.log(
      "✓ 25. Manager receives 113 permissions with 0 user/role/branch-assignment/tax/security management",
    );

    // ---------------------------------------------------------
    // 26. Chief Pharmacist: 56 permissions
    // ---------------------------------------------------------
    assert.strictEqual(chiefPerms.length, 56);
    const chiefElevated = [
      "VOID_SALE",
      "APPROVE_DISCOUNT",
      "OVERRIDE_SELLING_PRICE",
      "APPROVE_PRICE_OVERRIDE",
      "APPROVE_STOCK_ADJUSTMENT",
      "APPROVE_PURCHASE",
      "APPROVE_GOODS_RECEIPT",
      "APPROVE_STOCK_TRANSFER",
      "APPROVE_SALES_RETURN",
      "APPROVE_REFUND",
    ];
    for (const p of chiefElevated) {
      assert.ok(
        chiefPerms.includes(p),
        `Chief Pharmacist missing override ${p}`,
      );
    }
    console.log(
      "✓ 26. Chief Pharmacist receives 56 permissions including all 10 elevated overrides",
    );

    // ---------------------------------------------------------
    // 27. Pharmacist: 46 permissions (and NO Chief elevated approvals)
    // ---------------------------------------------------------
    assert.strictEqual(pharmPerms.length, 46);
    for (const p of chiefElevated) {
      assert.ok(
        !pharmPerms.includes(p),
        `Standard Pharmacist illegally possesses ${p}`,
      );
    }
    console.log(
      "✓ 27. Pharmacist receives 46 permissions without supervisory approvals",
    );

    // ---------------------------------------------------------
    // 28. Cashier: 28 permissions
    // ---------------------------------------------------------
    assert.strictEqual(cashierPerms.length, 28);
    const prohibitedCashier = [
      "APPROVE_DISCOUNT",
      "OVERRIDE_SELLING_PRICE",
      "APPROVE_PRICE_OVERRIDE",
      "VOID_SALE",
      "VOID_PAYMENT",
      "APPROVE_REFUND",
      "CREATE_STOCK_ADJUSTMENT",
      "CREATE_PURCHASE",
      "CREATE_GOODS_RECEIPT",
      "CREATE_STOCK_TRANSFER",
    ];
    for (const p of prohibitedCashier) {
      assert.ok(!cashierPerms.includes(p), `Cashier illegally possesses ${p}`);
    }
    console.log(
      "✓ 28. Cashier receives 28 permissions without discount approval, refund approval, or inventory mutations",
    );

    // ---------------------------------------------------------
    // 29. Accountant: 44 permissions
    // ---------------------------------------------------------
    assert.strictEqual(acctPerms.length, 44);
    assert.ok(acctPerms.includes("VIEW_FINANCIAL_REPORTS"));
    assert.ok(acctPerms.includes("VIEW_GST_REPORTS"));
    assert.ok(acctPerms.includes("VIEW_PROFIT_REPORTS"));
    assert.ok(acctPerms.includes("VIEW_AUDIT_LOG"));
    assert.ok(acctPerms.includes("APPROVE_REFUND"));
    assert.ok(!acctPerms.includes("CREATE_SALE"));
    assert.ok(!acctPerms.includes("CREATE_STOCK_ADJUSTMENT"));
    console.log(
      "✓ 29. Accountant receives 44 financial and audit reporting permissions",
    );

    // ---------------------------------------------------------
    // 30. Custom Role Preservation
    // ---------------------------------------------------------
    const customRoleCheck = await getRoleById(customRole.id);
    assert.ok(
      customRoleCheck,
      "Custom role must NOT be deleted by system role seeder",
    );
    assert.strictEqual(customRoleCheck.is_system_role, false);
    const customRolePermsCheck = await getRolePermissions(customRole.id);
    assert.strictEqual(customRolePermsCheck.length, 1);
    assert.strictEqual(customRolePermsCheck[0].id, permissionId);
    console.log(
      "✓ 30. Custom roles and their permissions are strictly preserved",
    );

    // ---------------------------------------------------------
    // 31. Idempotency Check (Run seeder again)
    // ---------------------------------------------------------
    await seedOrganisationSystemRoles(organisationId);
    const allOrgRoles = await getOrganisationRoles(organisationId);
    // 6 system roles + 1 custom role + secondRole if still there
    const systemRolesCount = allOrgRoles.filter((r) => r.is_system_role).length;
    assert.strictEqual(
      systemRolesCount,
      6,
      "Must not create duplicate system roles",
    );

    const reAdminPerms = await getRolePermissions(adminRole.id);
    assert.strictEqual(
      reAdminPerms.length,
      139,
      "Must not create duplicate role permissions",
    );
    console.log(
      "✓ 31. Re-running seeder does not create duplicate roles or permissions",
    );

    // ---------------------------------------------------------
    // 32. Transaction Client Redis Bypass
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txRoles = await getOrganisationRoles(organisationId, txClient);
      assert.ok(Array.isArray(txRoles));
      assert.ok(txRoles.length >= 6);
      await txClient.query("ROLLBACK");
    } finally {
      txClient.release();
    }
    console.log("✓ 32. Transaction client executes successfully on PostgreSQL");

    // Clean up custom role
    await deleteRole(customRole.id);

    console.log("\n✓ All Role Repository tests passed successfully.\n");
  } catch (error) {
    console.error("\n✗ Role Repository test failed.");
    console.error(error);

    throw error;
  } finally {
    if (secondRoleId) {
      try {
        await pool.query("DELETE FROM roles WHERE id = $1;", [secondRoleId]);
      } catch (error) {
        console.error("Second role cleanup failed:", error);
      }
    }

    if (permissionId || secondPermissionId) {
      try {
        await pool.query(
          "DELETE FROM permissions WHERE id = ANY($1::uuid[]);",
          [[permissionId, secondPermissionId].filter(Boolean)],
        );
      } catch (error) {
        console.error("Permission cleanup failed:", error);
      }
    }

    if (organisationId) {
      try {
        await pool.query("DELETE FROM organisations WHERE id = $1;", [
          organisationId,
        ]);
      } catch (error) {
        console.error("Organisation cleanup failed:", error);
      }
    }

    if (ownerId) {
      try {
        await pool.query("DELETE FROM users WHERE id = $1;", [ownerId]);
      } catch (error) {
        console.error("Owner cleanup failed:", error);
      }
    }

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (error) {
      console.error("Redis disconnect failed:", error);
    }

    await pool.end();
  }
};

runTests().catch(() => {
  process.exit(1);
});
