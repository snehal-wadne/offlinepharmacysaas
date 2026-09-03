/**
 * Supplier Repository Integration Tests
 *
 * Tests the Supplier Repository against the real PostgreSQL
 * database and local Redis instance.
 *
 * The tests verify:
 *
 * - Supplier creation
 * - Supplier lookup by ID
 * - Supplier cache miss and cache population
 * - Supplier cache hit
 * - Tenant-safe cache keys
 * - Supplier list retrieval
 * - Supplier search
 * - Cache invalidation after update
 * - Fresh data after update
 * - Cache invalidation after delete
 * - Deleted supplier is no longer returned
 */

require("dotenv").config();

const assert = require("assert");

const {
  createSupplier,
  getSupplierById,
  getSuppliersByOrganisation,
  searchSuppliers,
  updateSupplier,
  deleteSupplier,
} = require("../repositories/supplier.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildSupplierCacheKey = (organisationId, supplierId) =>
  `organisation:${organisationId}:supplier:${supplierId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let supplierId = null;

  try {
    await pool.query("SELECT 1");

    await connectRedis();

    console.log("\nRunning Supplier Repository tests...\n");

    // ---------------------------------------------------------
    // Create test owner
    // ---------------------------------------------------------

    const ownerResult = await pool.query(
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
        `${uniqueValue("supplier-owner")}@test.local`,
        "test-password",
        "Supplier Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = ownerResult.rows[0].id;

    console.log("✓ 1. Create test owner");

    // ---------------------------------------------------------
    // Create test organisation
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
      [ownerId, uniqueValue("Supplier Test Pharmacy")],
    );

    organisationId = organisationResult.rows[0].id;

    console.log("✓ 2. Create test organisation");

    // ---------------------------------------------------------
    // Create supplier
    // ---------------------------------------------------------

    const supplier = await createSupplier({
      organisationId,
      name: "Medico Distributors",
      contactPerson: "Rajesh Kumar",
      phone: "9876543210",
      email: "sales@medicodistributors.example",
      city: "Delhi",
      gstin: "07ABCDE1234F1Z5",
      status: "ACTIVE",
    });

    assert.ok(supplier);

    assert.ok(supplier.id);

    assert.strictEqual(supplier.organisation_id, organisationId);

    assert.strictEqual(supplier.name, "Medico Distributors");

    assert.strictEqual(supplier.status, "ACTIVE");

    supplierId = supplier.id;

    console.log("✓ 3. Create supplier");

    // ---------------------------------------------------------
    // Ensure supplier cache is clean
    // ---------------------------------------------------------

    const supplierCacheKey = buildSupplierCacheKey(organisationId, supplierId);

    await deleteCache(supplierCacheKey);

    assert.strictEqual(await getCache(supplierCacheKey), null);

    // ---------------------------------------------------------
    // Cache miss
    // ---------------------------------------------------------

    const firstSupplierLookup = await getSupplierById(
      organisationId,
      supplierId,
    );

    assert.ok(firstSupplierLookup);

    assert.strictEqual(firstSupplierLookup.id, supplierId);

    assert.strictEqual(firstSupplierLookup.name, "Medico Distributors");

    const cachedSupplier = await getCache(supplierCacheKey);

    assert.ok(cachedSupplier);

    assert.strictEqual(cachedSupplier.id, supplierId);

    assert.strictEqual(cachedSupplier.name, "Medico Distributors");

    console.log("✓ 4. Supplier cache miss populates Redis");

    // ---------------------------------------------------------
    // Cache hit
    //
    // Change PostgreSQL directly. The repository lookup should
    // still return the original value because Redis contains it.
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE suppliers
        SET
          name = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["Changed Directly In Database", supplierId, organisationId],
    );

    const cacheHitSupplier = await getSupplierById(organisationId, supplierId);

    assert.ok(cacheHitSupplier);

    assert.strictEqual(cacheHitSupplier.name, "Medico Distributors");

    // Restore PostgreSQL to the original value.
    //
    // Redis should still contain the original cached supplier.
    await pool.query(
      `
        UPDATE suppliers
        SET
          name = $1
        WHERE id = $2
          AND organisation_id = $3;
      `,
      ["Medico Distributors", supplierId, organisationId],
    );

    console.log("✓ 5. Supplier lookup uses Redis cache");

    // ---------------------------------------------------------
    // Tenant-safe cache key
    //
    // A supplier cache entry must include the organisation ID.
    // Looking up the same supplier ID under another organisation
    // must not return this organisation's cached supplier.
    // ---------------------------------------------------------

    const otherOrganisationId = "00000000-0000-0000-0000-000000000001";

    assert.strictEqual(
      await getCache(buildSupplierCacheKey(otherOrganisationId, supplierId)),
      null,
    );

    const crossOrganisationLookup = await getSupplierById(
      otherOrganisationId,
      supplierId,
    );

    assert.strictEqual(crossOrganisationLookup, null);

    console.log("✓ 6. Supplier cache remains tenant-safe");

    // ---------------------------------------------------------
    // Get suppliers by organisation
    //
    // This query remains database-backed rather than cached.
    // ---------------------------------------------------------

    const suppliersByOrganisation =
      await getSuppliersByOrganisation(organisationId);

    assert.ok(Array.isArray(suppliersByOrganisation));

    assert.ok(suppliersByOrganisation.some((item) => item.id === supplierId));

    assert.ok(
      suppliersByOrganisation.every(
        (item) => item.organisation_id === organisationId,
      ),
    );

    console.log("✓ 7. Get suppliers by organisation works");

    // ---------------------------------------------------------
    // Search suppliers
    // ---------------------------------------------------------

    const searchResults = await searchSuppliers(organisationId, "Medico");

    assert.ok(Array.isArray(searchResults));

    assert.ok(searchResults.some((item) => item.id === supplierId));

    assert.ok(
      searchResults.every((item) => item.organisation_id === organisationId),
    );

    console.log("✓ 8. Supplier search works");

    // ---------------------------------------------------------
    // Recreate cache before update test
    // ---------------------------------------------------------

    await getSupplierById(organisationId, supplierId);

    assert.ok(await getCache(supplierCacheKey));

    // ---------------------------------------------------------
    // Update supplier
    // ---------------------------------------------------------

    const updatedSupplier = await updateSupplier(organisationId, supplierId, {
      name: "Medico Distributors Pvt Ltd",
      contactPerson: "Rajesh Kumar",
      phone: "9876543210",
      email: "sales@medicodistributors.example",
      city: "New Delhi",
      gstin: "07ABCDE1234F1Z5",
      status: "ACTIVE",
    });

    assert.ok(updatedSupplier);

    assert.strictEqual(updatedSupplier.id, supplierId);

    assert.strictEqual(updatedSupplier.name, "Medico Distributors Pvt Ltd");

    assert.strictEqual(updatedSupplier.city, "New Delhi");

    // The old cached supplier must be gone.
    assert.strictEqual(await getCache(supplierCacheKey), null);

    console.log("✓ 9. Supplier update invalidates Redis cache");

    // ---------------------------------------------------------
    // Fresh supplier after invalidation
    // ---------------------------------------------------------

    const freshSupplier = await getSupplierById(organisationId, supplierId);

    assert.ok(freshSupplier);

    assert.strictEqual(freshSupplier.id, supplierId);

    assert.strictEqual(freshSupplier.name, "Medico Distributors Pvt Ltd");

    assert.strictEqual(freshSupplier.city, "New Delhi");

    const refreshedSupplierCache = await getCache(supplierCacheKey);

    assert.ok(refreshedSupplierCache);

    assert.strictEqual(
      refreshedSupplierCache.name,
      "Medico Distributors Pvt Ltd",
    );

    console.log("✓ 10. Fresh supplier is returned after update");

    // ---------------------------------------------------------
    // Recreate cache before delete test
    // ---------------------------------------------------------

    await getSupplierById(organisationId, supplierId);

    assert.ok(await getCache(supplierCacheKey));

    // ---------------------------------------------------------
    // Delete supplier
    // ---------------------------------------------------------

    const deleted = await deleteSupplier(organisationId, supplierId);

    assert.strictEqual(deleted, true);

    // The cached supplier must be removed.
    assert.strictEqual(await getCache(supplierCacheKey), null);

    console.log("✓ 11. Supplier delete invalidates Redis cache");

    // ---------------------------------------------------------
    // Verify deleted supplier no longer exists
    // ---------------------------------------------------------

    const deletedSupplier = await getSupplierById(organisationId, supplierId);

    assert.strictEqual(deletedSupplier, null);

    console.log("✓ 12. Deleted supplier is no longer returned");

    // ---------------------------------------------------------
    // Verify deleting a non-existent supplier returns false
    // ---------------------------------------------------------

    const deleteAgain = await deleteSupplier(organisationId, supplierId);

    assert.strictEqual(deleteAgain, false);

    console.log("✓ 13. Deleting a missing supplier returns false");

    console.log("\n✓ All Supplier Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Supplier Repository test failed.");

    console.error(error);

    throw error;
  } finally {
    // ---------------------------------------------------------
    // Clean Redis test key
    // ---------------------------------------------------------

    if (redisClient.isOpen && organisationId && supplierId) {
      try {
        await deleteCache(buildSupplierCacheKey(organisationId, supplierId));
      } catch (error) {
        console.error("Supplier cache cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean test supplier
    // ---------------------------------------------------------

    if (supplierId) {
      try {
        await pool.query(
          `
            DELETE FROM suppliers
            WHERE id = $1;
          `,
          [supplierId],
        );
      } catch (error) {
        console.error("Supplier cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Clean test organisation
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // Clean test owner
    // ---------------------------------------------------------

    if (ownerId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [ownerId],
        );
      } catch (error) {
        console.error("Owner cleanup failed:", error);
      }
    }

    // ---------------------------------------------------------
    // Disconnect Redis
    // ---------------------------------------------------------

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (error) {
      console.error("Redis disconnect failed:", error);
    }

    // ---------------------------------------------------------
    // Close PostgreSQL pool
    // ---------------------------------------------------------

    await pool.end();
  }
};

runTests().catch(() => {
  process.exit(1);
});
