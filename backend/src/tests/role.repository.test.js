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
 */

require("dotenv").config();

const assert = require("assert");

const {
  createRole,
  getRoleById,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  removePermissionFromRole,
  getRolePermissions,
  getRolesWithPermission,
  hasRolePermission,
} = require("../repositories/role.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

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
    // Create permission
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

    console.log("✓ 3. Create test permission");

    // ---------------------------------------------------------
    // Create role
    // ---------------------------------------------------------

    const role = await createRole({
      organisationId,
      name: "Test Cashier",
      description: "Role repository test role",
      isSystemRole: false,
    });

    roleId = role.id;

    assert.ok(role);
    assert.strictEqual(role.organisation_id, organisationId);
    assert.strictEqual(role.name, "Test Cashier");

    console.log("✓ 4. Create role");

    // ---------------------------------------------------------
    // Get role by ID
    // ---------------------------------------------------------

    const firstRole = await getRoleById(roleId);

    assert.ok(firstRole);
    assert.strictEqual(firstRole.id, roleId);

    const cachedRole = await getCache(buildRoleCacheKey(roleId));

    assert.ok(cachedRole);
    assert.strictEqual(cachedRole.id, roleId);

    console.log("✓ 5. Role cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify role cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE roles
        SET name = $1
        WHERE id = $2;
      `,
      ["Database Role Name", roleId],
    );

    const roleCacheHit = await getRoleById(roleId);

    assert.strictEqual(roleCacheHit.name, "Test Cashier");

    await pool.query(
      `
        UPDATE roles
        SET name = $1
        WHERE id = $2;
      `,
      ["Test Cashier", roleId],
    );

    console.log("✓ 6. Role lookup uses Redis cache");

    // ---------------------------------------------------------
    // Organisation roles list
    // ---------------------------------------------------------

    await deleteCache(buildOrganisationRolesCacheKey(organisationId));

    const organisationRoles = await getOrganisationRoles(organisationId);

    assert.ok(Array.isArray(organisationRoles));

    assert.ok(organisationRoles.some((item) => item.id === roleId));

    const cachedOrganisationRoles = await getCache(
      buildOrganisationRolesCacheKey(organisationId),
    );

    assert.ok(Array.isArray(cachedOrganisationRoles));

    console.log("✓ 7. Organisation role list cache works");

    // ---------------------------------------------------------
    // Assign permission
    // ---------------------------------------------------------

    const permissionAssignment = await assignPermissionToRole(
      roleId,
      permissionId,
    );

    assert.ok(permissionAssignment);
    assert.strictEqual(permissionAssignment.role_id, roleId);
    assert.strictEqual(permissionAssignment.permission_id, permissionId);

    console.log("✓ 8. Assign permission to role");

    // ---------------------------------------------------------
    // Get role permissions
    // ---------------------------------------------------------

    const rolePermissions = await getRolePermissions(roleId);

    assert.ok(Array.isArray(rolePermissions));

    assert.ok(
      rolePermissions.some((permission) => permission.id === permissionId),
    );

    const cachedRolePermissions = await getCache(
      buildRolePermissionsCacheKey(roleId),
    );

    assert.ok(Array.isArray(cachedRolePermissions));

    console.log("✓ 9. Role permissions cache works");

    // ---------------------------------------------------------
    // Check role permission
    // ---------------------------------------------------------

    const hasPermission = await hasRolePermission(roleId, permissionId);

    assert.strictEqual(hasPermission, true);

    const cachedPermissionCheck = await getCache(
      buildRolePermissionCheckCacheKey(roleId, permissionId),
    );

    assert.strictEqual(cachedPermissionCheck, true);

    console.log("✓ 10. Role permission check cache works");

    // ---------------------------------------------------------
    // Get roles with permission
    // ---------------------------------------------------------

    const rolesWithPermission = await getRolesWithPermission(permissionId);

    assert.ok(Array.isArray(rolesWithPermission));

    assert.ok(rolesWithPermission.some((item) => item.id === roleId));

    const cachedRolesWithPermission = await getCache(
      buildPermissionRolesCacheKey(permissionId),
    );

    assert.ok(Array.isArray(cachedRolesWithPermission));

    console.log("✓ 11. Roles-with-permission cache works");

    // ---------------------------------------------------------
    // Recreate caches
    // ---------------------------------------------------------

    await getRoleById(roleId);
    await getOrganisationRoles(organisationId);
    await getRolePermissions(roleId);
    await getRolesWithPermission(permissionId);
    await hasRolePermission(roleId, permissionId);

    // ---------------------------------------------------------
    // Update role
    // ---------------------------------------------------------

    const updatedRole = await updateRole(roleId, {
      name: "Updated Cashier",
      description: "Updated role description",
    });

    assert.ok(updatedRole);
    assert.strictEqual(updatedRole.name, "Updated Cashier");

    assert.strictEqual(await getCache(buildRoleCacheKey(roleId)), null);

    assert.strictEqual(
      await getCache(buildOrganisationRolesCacheKey(organisationId)),
      null,
    );

    console.log("✓ 12. Role update invalidates role caches");

    // ---------------------------------------------------------
    // Remove permission
    // ---------------------------------------------------------

    // Repopulate permission-related caches first.
    await getRolePermissions(roleId);
    await getRolesWithPermission(permissionId);
    await hasRolePermission(roleId, permissionId);

    const removedPermission = await removePermissionFromRole(
      roleId,
      permissionId,
    );

    assert.strictEqual(removedPermission, true);

    assert.strictEqual(
      await getCache(buildRolePermissionsCacheKey(roleId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildPermissionRolesCacheKey(permissionId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
      null,
    );

    console.log("✓ 13. Permission removal invalidates related caches");

    // ---------------------------------------------------------
    // Verify permission no longer exists
    // ---------------------------------------------------------

    const permissionAfterRemoval = await hasRolePermission(
      roleId,
      permissionId,
    );

    assert.strictEqual(permissionAfterRemoval, false);

    console.log("✓ 14. Removed permission is no longer assigned");

    // ---------------------------------------------------------
    // Reassign permission
    // ---------------------------------------------------------

    await assignPermissionToRole(roleId, permissionId);

    const permissionAfterReassign = await hasRolePermission(
      roleId,
      permissionId,
    );

    assert.strictEqual(permissionAfterReassign, true);

    console.log("✓ 15. Permission can be assigned again");

    // ---------------------------------------------------------
    // Create second role
    // ---------------------------------------------------------

    const secondRole = await createRole({
      organisationId,
      name: "Test Manager",
      description: "Second test role",
      isSystemRole: false,
    });

    secondRoleId = secondRole.id;

    console.log("✓ 16. Create second role");

    // ---------------------------------------------------------
    // Assign same permission to second role
    // ---------------------------------------------------------

    await assignPermissionToRole(secondRoleId, permissionId);

    const rolesAfterSecondAssignment =
      await getRolesWithPermission(permissionId);

    assert.ok(rolesAfterSecondAssignment.some((item) => item.id === roleId));

    assert.ok(
      rolesAfterSecondAssignment.some((item) => item.id === secondRoleId),
    );

    console.log("✓ 17. Permission can belong to multiple roles");

    // ---------------------------------------------------------
    // Delete first role
    // ---------------------------------------------------------

    // Populate role cache before deletion.
    await getRoleById(roleId);
    await getRolePermissions(roleId);

    const deleted = await deleteRole(roleId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(await getCache(buildRoleCacheKey(roleId)), null);

    assert.strictEqual(
      await getCache(buildRolePermissionsCacheKey(roleId)),
      null,
    );

    const deletedRole = await getRoleById(roleId);

    assert.strictEqual(deletedRole, null);

    console.log("✓ 18. Role deletion removes database and cache data");

    console.log("\n✓ All Role Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Role Repository test failed.");
    console.error(error);

    throw error;
  } finally {
    if (roleId || secondRoleId) {
      try {
        await pool.query(
          `
            DELETE FROM roles
            WHERE id = ANY($1::uuid[]);
          `,
          [[roleId, secondRoleId].filter(Boolean)],
        );
      } catch (error) {
        console.error("Role cleanup failed:", error);
      }
    }

    if (permissionId) {
      try {
        await pool.query(
          `
            DELETE FROM permissions
            WHERE id = $1;
          `,
          [permissionId],
        );
      } catch (error) {
        console.error("Permission cleanup failed:", error);
      }
    }

    if (organisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationId],
        );
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
