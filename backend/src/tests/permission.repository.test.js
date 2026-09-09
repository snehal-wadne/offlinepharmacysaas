/**
 * Permission Repository Integration Tests
 *
 * Tests the Permission Repository against the real PostgreSQL
 * database and local Redis instance.
 *
 * The tests verify:
 * - Permission creation
 * - Permission ID cache miss and hit
 * - Permission name cache miss and hit
 * - All permissions list caching
 * - Cache invalidation after creation
 * - Cache invalidation after updates
 * - Cache invalidation after deletion
 * - Old permission-name cache invalidation
 * - Bulk getPermissionsByNames
 * - Grouped permissions getPermissionsGrouped
 * - Domain filtered getPermissionsByDomain
 * - Transaction client Redis bypass
 * - Full 139 catalogue integrity (descriptions, uniqueness, no invalid domains)
 */

require("dotenv").config();

const assert = require("assert");

const {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
  getPermissionsByNames,
  getPermissionsGrouped,
  getPermissionsByDomain,
  updatePermission,
  deletePermission,
} = require("../repositories/permission.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");
const {
  PERMISSIONS,
  PERMISSION_DOMAINS,
} = require("../db/permission-catalogue");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildPermissionCacheKey = (permissionId) => `permission:${permissionId}`;

const buildPermissionNameCacheKey = (name) => `permission:name:${name}`;

const PERMISSION_ALL_CACHE_KEY = "permission:all";

const runTests = async () => {
  let permissionId = null;

  const permissionName = uniqueValue("VIEW_TEST");

  const updatedPermissionName = uniqueValue("UPDATED_TEST");

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Permission Repository tests...\n");

    // ---------------------------------------------------------
    // Clean global permission-list cache
    // ---------------------------------------------------------

    await deleteCache(PERMISSION_ALL_CACHE_KEY);

    // ---------------------------------------------------------
    // Create permission
    // ---------------------------------------------------------

    const permission = await createPermission({
      name: permissionName,
      description: "Permission repository Redis test",
    });

    permissionId = permission.id;

    assert.ok(permission);
    assert.ok(permission.id);
    assert.strictEqual(permission.name, permissionName);
    assert.strictEqual(
      permission.description,
      "Permission repository Redis test",
    );

    assert.strictEqual(await getCache(PERMISSION_ALL_CACHE_KEY), null);

    console.log("✓ 1. Create permission invalidates permission list cache");

    // ---------------------------------------------------------
    // Get permission by ID
    // ---------------------------------------------------------

    const firstPermission = await getPermissionById(permissionId);

    assert.ok(firstPermission);
    assert.strictEqual(firstPermission.id, permissionId);

    const cachedById = await getCache(buildPermissionCacheKey(permissionId));

    assert.ok(cachedById);
    assert.strictEqual(cachedById.id, permissionId);

    console.log("✓ 2. Permission ID cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify ID cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE permissions
        SET description = $1
        WHERE id = $2;
      `,
      ["Database description change", permissionId],
    );

    const idCacheHit = await getPermissionById(permissionId);

    assert.strictEqual(
      idCacheHit.description,
      "Permission repository Redis test",
    );

    await pool.query(
      `
        UPDATE permissions
        SET description = $1
        WHERE id = $2;
      `,
      ["Permission repository Redis test", permissionId],
    );

    console.log("✓ 3. Permission ID lookup uses Redis cache");

    // ---------------------------------------------------------
    // Get permission by name
    // ---------------------------------------------------------

    await deleteCache(buildPermissionNameCacheKey(permissionName));

    const permissionByName = await getPermissionByName(permissionName);

    assert.ok(permissionByName);
    assert.strictEqual(permissionByName.id, permissionId);

    const cachedByName = await getCache(
      buildPermissionNameCacheKey(permissionName),
    );

    assert.ok(cachedByName);
    assert.strictEqual(cachedByName.id, permissionId);

    console.log("✓ 4. Permission name cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify name cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE permissions
        SET description = $1
        WHERE id = $2;
      `,
      ["Database description change", permissionId],
    );

    const nameCacheHit = await getPermissionByName(permissionName);

    assert.strictEqual(
      nameCacheHit.description,
      "Permission repository Redis test",
    );

    await pool.query(
      `
        UPDATE permissions
        SET description = $1
        WHERE id = $2;
      `,
      ["Permission repository Redis test", permissionId],
    );

    console.log("✓ 5. Permission name lookup uses Redis cache");

    // ---------------------------------------------------------
    // All permissions list caching
    // ---------------------------------------------------------

    await deleteCache(PERMISSION_ALL_CACHE_KEY);

    const permissions = await getAllPermissions();

    assert.ok(Array.isArray(permissions));
    assert.ok(permissions.length > 0);

    const cachedPermissions = await getCache(PERMISSION_ALL_CACHE_KEY);

    assert.ok(Array.isArray(cachedPermissions));
    assert.strictEqual(cachedPermissions.length, permissions.length);

    console.log("✓ 6. All permissions cache works");

    const cachedPermissionsAgain = await getAllPermissions();

    assert.strictEqual(cachedPermissionsAgain.length, cachedPermissions.length);

    console.log("✓ 7. All permissions lookup uses Redis cache");

    // ---------------------------------------------------------
    // Update permission
    // ---------------------------------------------------------

    const updatedPermission = await updatePermission(permissionId, {
      name: updatedPermissionName,
      description: "Updated permission description",
    });

    assert.ok(updatedPermission);
    assert.strictEqual(updatedPermission.id, permissionId);
    assert.strictEqual(updatedPermission.name, updatedPermissionName);
    assert.strictEqual(
      updatedPermission.description,
      "Updated permission description",
    );

    assert.strictEqual(
      await getCache(buildPermissionCacheKey(permissionId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildPermissionNameCacheKey(permissionName)),
      null,
    );

    assert.strictEqual(
      await getCache(buildPermissionNameCacheKey(updatedPermissionName)),
      null,
    );

    assert.strictEqual(await getCache(PERMISSION_ALL_CACHE_KEY), null);

    console.log(
      "✓ 8. Permission update invalidates ID, old-name, new-name, and list caches",
    );

    // ---------------------------------------------------------
    // Verify update lookup
    // ---------------------------------------------------------

    const freshUpdatedPermission = await getPermissionByName(
      updatedPermissionName,
    );

    assert.ok(freshUpdatedPermission);

    assert.strictEqual(freshUpdatedPermission.id, permissionId);

    assert.strictEqual(
      freshUpdatedPermission.description,
      "Updated permission description",
    );

    console.log("✓ 9. Updated permission can be found by its new name");

    // ---------------------------------------------------------
    // Verify old name no longer works
    // ---------------------------------------------------------

    const oldNamePermission = await getPermissionByName(permissionName);

    assert.strictEqual(oldNamePermission, null);

    console.log("✓ 10. Old permission name no longer resolves");

    // ---------------------------------------------------------
    // Recreate caches before delete
    // ---------------------------------------------------------

    await getPermissionById(permissionId);

    await getPermissionByName(updatedPermissionName);

    await getAllPermissions();

    // ---------------------------------------------------------
    // Delete permission
    // ---------------------------------------------------------

    const deleted = await deletePermission(permissionId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(
      await getCache(buildPermissionCacheKey(permissionId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildPermissionNameCacheKey(updatedPermissionName)),
      null,
    );

    assert.strictEqual(await getCache(PERMISSION_ALL_CACHE_KEY), null);

    const deletedPermission = await getPermissionById(permissionId);

    assert.strictEqual(deletedPermission, null);
    permissionId = null;

    console.log("✓ 11. Permission deletion removes database and cache data");

    // ---------------------------------------------------------
    // 12. getPermissionsByNames
    // ---------------------------------------------------------
    const targetNames = ["VIEW_DASHBOARD", "VIEW_SALES", "CREATE_SALE"];
    const fetched = await getPermissionsByNames(targetNames);
    assert.strictEqual(fetched.length, 3);
    assert.ok(fetched.some((p) => p.name === "VIEW_DASHBOARD"));
    assert.ok(fetched.some((p) => p.name === "VIEW_SALES"));
    assert.ok(fetched.some((p) => p.name === "CREATE_SALE"));
    console.log(
      "✓ 12. getPermissionsByNames fetches specified permission batch",
    );

    // ---------------------------------------------------------
    // 13. getPermissionsGrouped
    // ---------------------------------------------------------
    const grouped = await getPermissionsGrouped();
    assert.strictEqual(Object.keys(grouped).length, 14);
    assert.strictEqual(grouped.Dashboard.length, 2);
    assert.strictEqual(grouped.Sales.length, 15);
    assert.strictEqual(grouped.Customers.length, 7);
    assert.strictEqual(grouped.Inventory.length, 21);
    assert.strictEqual(grouped.Purchases.length, 9);
    assert.strictEqual(grouped["Goods Receiving"].length, 9);
    assert.strictEqual(grouped["Stock Transfer"].length, 10);
    assert.strictEqual(grouped["Sales Returns"].length, 10);
    assert.strictEqual(grouped.Reports.length, 17);
    assert.strictEqual(grouped.Branches.length, 6);
    assert.strictEqual(grouped.Users.length, 9);
    assert.strictEqual(grouped.Roles.length, 6);
    assert.strictEqual(grouped.Audit.length, 2);
    assert.strictEqual(grouped.Settings.length, 16);
    console.log(
      "✓ 13. getPermissionsGrouped groups all 14 functional domains correctly",
    );

    // ---------------------------------------------------------
    // 14. getPermissionsByDomain
    // ---------------------------------------------------------
    const salesPerms = await getPermissionsByDomain("Sales");
    assert.strictEqual(salesPerms.length, 15);
    const auditPerms = await getPermissionsByDomain("Audit");
    assert.strictEqual(auditPerms.length, 2);
    console.log(
      "✓ 14. getPermissionsByDomain returns domain-filtered permissions",
    );

    // ---------------------------------------------------------
    // 15. Transaction Client Redis Bypass
    // ---------------------------------------------------------
    const txClient = await pool.connect();
    try {
      await txClient.query("BEGIN");
      const txPerm = await getPermissionByName("VIEW_DASHBOARD", txClient);
      assert.ok(txPerm);
      assert.strictEqual(txPerm.name, "VIEW_DASHBOARD");
      await txClient.query("ROLLBACK");
    } finally {
      txClient.release();
    }
    console.log("✓ 15. Transaction client executes without cache dependency");

    // ---------------------------------------------------------
    // 16. Catalogue Integrity & Invariant Assertions
    // ---------------------------------------------------------
    const allDbPerms = await getAllPermissions();
    assert.ok(
      allDbPerms.length >= 139,
      `Expected at least 139 permissions, got ${allDbPerms.length}`,
    );

    // Every permission must have a non-empty description
    for (const p of allDbPerms) {
      assert.ok(
        p.description && p.description.trim().length > 0,
        `Permission ${p.name} missing description`,
      );
    }

    // No duplicate names
    const namesSet = new Set(allDbPerms.map((p) => p.name));
    assert.strictEqual(
      namesSet.size,
      allDbPerms.length,
      "Permission names must be unique",
    );

    // Prohibited permission keywords (No separate Prescription or Expiry modules)
    for (const p of allDbPerms) {
      assert.ok(
        !p.name.includes("PRESCRIPTION"),
        `Found prohibited permission: ${p.name}`,
      );
      assert.ok(
        !p.name.includes("EXPIRY"),
        `Found prohibited permission: ${p.name}`,
      );
      assert.ok(
        !p.name.includes("AUDITOR"),
        `Found prohibited permission: ${p.name}`,
      );
      assert.ok(
        !p.name.includes("STORE_MANAGER"),
        `Found prohibited permission: ${p.name}`,
      );
    }
    console.log(
      "✓ 16. 139 permissions catalogue integrity, uniqueness, and constraints verified",
    );

    console.log("\n✓ All Permission Repository tests passed successfully.\n");
  } catch (error) {
    console.error("\n✗ Permission Repository test failed.");
    console.error(error);

    throw error;
  } finally {
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
