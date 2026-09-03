/**
 * Organisation Repository Integration Tests
 *
 * Tests the Organisation Repository against the real
 * PostgreSQL database and local Redis instance.
 *
 * The tests verify:
 * - Organisation creation
 * - Redis cache miss and hit
 * - Owner organisation list caching
 * - Cache invalidation after creation
 * - Cache invalidation after update
 * - Cache invalidation after deletion
 */

require("dotenv").config();

const assert = require("assert");

const {
  createOrganisation,
  getOrganisationById,
  getOrganisationsByOwnerId,
  updateOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildOrganisationCacheKey = (organisationId) =>
  `organisation:${organisationId}`;

const buildOwnerOrganisationsCacheKey = (ownerId) =>
  `organisation:owner:${ownerId}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;

  const ownerEmail = `${uniqueValue("organisation-owner")}@test.local`;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Organisation Repository tests...\n");

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
        ownerEmail,
        "organisation-test-password",
        "Organisation Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = userResult.rows[0].id;

    console.log("✓ 1. Create test owner");

    // ---------------------------------------------------------
    // Ensure owner list cache starts clean
    // ---------------------------------------------------------

    await deleteCache(buildOwnerOrganisationsCacheKey(ownerId));

    // ---------------------------------------------------------
    // Create organisation
    // ---------------------------------------------------------

    const organisation = await createOrganisation({
      ownerId,
      name: "Redis Test Pharmacy",
    });

    organisationId = organisation.id;

    assert.ok(organisation);
    assert.ok(organisation.id);
    assert.strictEqual(organisation.owner_id, ownerId);
    assert.strictEqual(organisation.name, "Redis Test Pharmacy");

    console.log("✓ 2. Create organisation");

    // ---------------------------------------------------------
    // Get organisation by ID
    // ---------------------------------------------------------

    const firstOrganisation = await getOrganisationById(organisationId);

    assert.ok(firstOrganisation);
    assert.strictEqual(firstOrganisation.id, organisationId);

    const cachedOrganisation = await getCache(
      buildOrganisationCacheKey(organisationId),
    );

    assert.ok(cachedOrganisation);
    assert.strictEqual(cachedOrganisation.id, organisationId);

    console.log("✓ 3. Organisation ID cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify ID cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE organisations
        SET name = $1
        WHERE id = $2;
      `,
      ["Database Organisation Name", organisationId],
    );

    const organisationCacheHit = await getOrganisationById(organisationId);

    assert.strictEqual(organisationCacheHit.name, "Redis Test Pharmacy");

    await pool.query(
      `
        UPDATE organisations
        SET name = $1
        WHERE id = $2;
      `,
      ["Redis Test Pharmacy", organisationId],
    );

    console.log("✓ 4. Organisation ID lookup uses Redis cache");

    // ---------------------------------------------------------
    // Owner organisations list
    // ---------------------------------------------------------

    await deleteCache(buildOwnerOrganisationsCacheKey(ownerId));

    const firstOwnerList = await getOrganisationsByOwnerId(ownerId);

    assert.ok(Array.isArray(firstOwnerList));

    const createdOrganisation = firstOwnerList.find(
      (item) => item.id === organisationId,
    );

    assert.ok(createdOrganisation);

    const cachedOwnerList = await getCache(
      buildOwnerOrganisationsCacheKey(ownerId),
    );

    assert.ok(Array.isArray(cachedOwnerList));

    console.log("✓ 5. Owner organisation list populates Redis");

    // ---------------------------------------------------------
    // Verify owner list cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE organisations
        SET name = $1
        WHERE id = $2;
      `,
      ["Database Owner List Name", organisationId],
    );

    const ownerListCacheHit = await getOrganisationsByOwnerId(ownerId);

    const cachedItem = ownerListCacheHit.find(
      (item) => item.id === organisationId,
    );

    assert.strictEqual(cachedItem.name, "Redis Test Pharmacy");

    await pool.query(
      `
        UPDATE organisations
        SET name = $1
        WHERE id = $2;
      `,
      ["Redis Test Pharmacy", organisationId],
    );

    console.log("✓ 6. Owner organisation list uses Redis cache");

    // ---------------------------------------------------------
    // Recreate caches before update test
    // ---------------------------------------------------------

    await getOrganisationById(organisationId);
    await getOrganisationsByOwnerId(ownerId);

    assert.ok(await getCache(buildOrganisationCacheKey(organisationId)));

    assert.ok(await getCache(buildOwnerOrganisationsCacheKey(ownerId)));

    // ---------------------------------------------------------
    // Update organisation
    // ---------------------------------------------------------

    const updatedOrganisation = await updateOrganisation(
      organisationId,
      "Updated Redis Pharmacy",
    );

    assert.ok(updatedOrganisation);
    assert.strictEqual(updatedOrganisation.name, "Updated Redis Pharmacy");

    assert.strictEqual(
      await getCache(buildOrganisationCacheKey(organisationId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildOwnerOrganisationsCacheKey(ownerId)),
      null,
    );

    console.log("✓ 7. Organisation update invalidates both caches");

    // ---------------------------------------------------------
    // Verify fresh values after invalidation
    // ---------------------------------------------------------

    const freshOrganisation = await getOrganisationById(organisationId);

    assert.strictEqual(freshOrganisation.name, "Updated Redis Pharmacy");

    const freshOwnerList = await getOrganisationsByOwnerId(ownerId);

    const freshListItem = freshOwnerList.find(
      (item) => item.id === organisationId,
    );

    assert.strictEqual(freshListItem.name, "Updated Redis Pharmacy");

    console.log("✓ 8. Fresh database values are returned after invalidation");

    // ---------------------------------------------------------
    // Delete organisation
    // ---------------------------------------------------------

    const deleted = await deleteOrganisation(organisationId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(
      await getCache(buildOrganisationCacheKey(organisationId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildOwnerOrganisationsCacheKey(ownerId)),
      null,
    );

    const deletedOrganisation = await getOrganisationById(organisationId);

    assert.strictEqual(deletedOrganisation, null);

    console.log("✓ 9. Organisation deletion removes database and cache data");

    console.log("\n✓ All Organisation Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Organisation Repository test failed.");
    console.error(error);

    throw error;
  } finally {
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
