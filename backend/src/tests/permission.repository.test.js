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
 */

require("dotenv").config();

const assert = require("assert");

const {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
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
      ["Database name lookup change", permissionId],
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
    // Get all permissions
    // ---------------------------------------------------------

    await deleteCache(PERMISSION_ALL_CACHE_KEY);

    const allPermissions = await getAllPermissions();

    assert.ok(Array.isArray(allPermissions));

    assert.ok(allPermissions.some((item) => item.id === permissionId));

    const cachedAllPermissions = await getCache(PERMISSION_ALL_CACHE_KEY);

    assert.ok(Array.isArray(cachedAllPermissions));

    console.log("✓ 6. All permissions cache works");

    // ---------------------------------------------------------
    // Verify all-permissions cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE permissions
        SET description = $1
        WHERE id = $2;
      `,
      ["Database all-list change", permissionId],
    );

    const allPermissionsCacheHit = await getAllPermissions();

    const cachedPermission = allPermissionsCacheHit.find(
      (item) => item.id === permissionId,
    );

    assert.strictEqual(
      cachedPermission.description,
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

    console.log("✓ 7. All permissions lookup uses Redis cache");

    // ---------------------------------------------------------
    // Recreate all caches before update
    // ---------------------------------------------------------

    await getPermissionById(permissionId);

    await getPermissionByName(permissionName);

    await getAllPermissions();

    assert.ok(await getCache(buildPermissionCacheKey(permissionId)));

    assert.ok(await getCache(buildPermissionNameCacheKey(permissionName)));

    assert.ok(await getCache(PERMISSION_ALL_CACHE_KEY));

    // ---------------------------------------------------------
    // Update permission name
    // ---------------------------------------------------------

    const updatedPermission = await updatePermission(permissionId, {
      name: updatedPermissionName,
      description: "Updated permission description",
    });

    assert.ok(updatedPermission);
    assert.strictEqual(updatedPermission.name, updatedPermissionName);

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
    // Verify new name works
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

    console.log("✓ 11. Permission deletion removes database and cache data");

    console.log("\n✓ All Permission Repository tests passed.\n");
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
