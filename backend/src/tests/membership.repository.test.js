/**
 * Membership Repository Integration Tests
 *
 * Tests the Membership Repository against the real
 * PostgreSQL database and local Redis instance.
 *
 * The tests verify:
 * - Membership creation
 * - Membership ID caching
 * - User + organisation membership caching
 * - User membership list caching
 * - Organisation member list caching
 * - Cache invalidation after creation
 * - Cache invalidation after status updates
 * - Cache invalidation after deletion
 */

require("dotenv").config();

const assert = require("assert");

const {
  createMembership,
  getMembershipById,
  getMembership,
  getUserMemberships,
  getOrganisationMembers,
  updateMembershipStatus,
  deleteMembership,
} = require("../repositories/membership.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildMembershipCacheKey = (membershipId) => `membership:${membershipId}`;

const buildUserOrganisationMembershipCacheKey = (userId, organisationId) =>
  `membership:user:${userId}:organisation:${organisationId}`;

const buildUserMembershipsCacheKey = (userId) => `membership:user:${userId}`;

const buildOrganisationMembersCacheKey = (organisationId) =>
  `membership:organisation:${organisationId}`;

const runTests = async () => {
  let ownerId = null;
  let memberId = null;
  let organisationId = null;
  let membershipId = null;

  const ownerEmail = `${uniqueValue("membership-owner")}@test.local`;

  const memberEmail = `${uniqueValue("membership-user")}@test.local`;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Membership Repository tests...\n");

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
        ownerEmail,
        "membership-owner-password",
        "Membership Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = ownerResult.rows[0].id;

    console.log("✓ 1. Create organisation owner");

    // ---------------------------------------------------------
    // Create test member
    // ---------------------------------------------------------

    const memberResult = await pool.query(
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
        memberEmail,
        "membership-user-password",
        "Membership Test User",
        "ACTIVE",
      ],
    );

    memberId = memberResult.rows[0].id;

    console.log("✓ 2. Create organisation member");

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
      [ownerId, "Membership Redis Test Pharmacy"],
    );

    organisationId = organisationResult.rows[0].id;

    console.log("✓ 3. Create test organisation");

    // ---------------------------------------------------------
    // Start with clean Redis
    // ---------------------------------------------------------

    await Promise.all([
      deleteCache(buildUserMembershipsCacheKey(memberId)),
      deleteCache(buildOrganisationMembersCacheKey(organisationId)),
      deleteCache(
        buildUserOrganisationMembershipCacheKey(memberId, organisationId),
      ),
    ]);

    // ---------------------------------------------------------
    // Create membership
    // ---------------------------------------------------------

    const membership = await createMembership({
      organisationId,
      userId: memberId,
      status: "ACTIVE",
    });

    membershipId = membership.id;

    assert.ok(membership);
    assert.ok(membership.id);
    assert.strictEqual(membership.organisation_id, organisationId);
    assert.strictEqual(membership.user_id, memberId);
    assert.strictEqual(membership.status, "ACTIVE");

    console.log("✓ 4. Create membership");

    // ---------------------------------------------------------
    // Get membership by ID
    // ---------------------------------------------------------

    const firstMembership = await getMembershipById(membershipId);

    assert.ok(firstMembership);
    assert.strictEqual(firstMembership.id, membershipId);

    const cachedMembership = await getCache(
      buildMembershipCacheKey(membershipId),
    );

    assert.ok(cachedMembership);
    assert.strictEqual(cachedMembership.id, membershipId);

    console.log("✓ 5. Membership ID cache miss populates Redis");

    // ---------------------------------------------------------
    // Get membership by user + organisation
    // ---------------------------------------------------------

    const membershipByScope = await getMembership(memberId, organisationId);

    assert.ok(membershipByScope);
    assert.strictEqual(membershipByScope.id, membershipId);

    const cachedScopedMembership = await getCache(
      buildUserOrganisationMembershipCacheKey(memberId, organisationId),
    );

    assert.ok(cachedScopedMembership);
    assert.strictEqual(cachedScopedMembership.id, membershipId);

    console.log("✓ 6. User + organisation membership cache works");

    // ---------------------------------------------------------
    // Get user memberships
    // ---------------------------------------------------------

    const userMemberships = await getUserMemberships(memberId);

    assert.ok(Array.isArray(userMemberships));

    const userMembership = userMemberships.find(
      (item) => item.id === membershipId,
    );

    assert.ok(userMembership);
    assert.strictEqual(userMembership.organisation_id, organisationId);

    const cachedUserMemberships = await getCache(
      buildUserMembershipsCacheKey(memberId),
    );

    assert.ok(Array.isArray(cachedUserMemberships));

    console.log("✓ 7. User memberships list populates Redis");

    // ---------------------------------------------------------
    // Get organisation members
    // ---------------------------------------------------------

    const organisationMembers = await getOrganisationMembers(organisationId);

    assert.ok(Array.isArray(organisationMembers));

    const organisationMember = organisationMembers.find(
      (item) => item.id === membershipId,
    );

    assert.ok(organisationMember);
    assert.strictEqual(organisationMember.user_id, memberId);

    const cachedOrganisationMembers = await getCache(
      buildOrganisationMembersCacheKey(organisationId),
    );

    assert.ok(Array.isArray(cachedOrganisationMembers));

    console.log("✓ 8. Organisation members list populates Redis");

    // ---------------------------------------------------------
    // Verify membership ID cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE organisation_memberships
        SET status = $1
        WHERE id = $2;
      `,
      ["SUSPENDED", membershipId],
    );

    const membershipIdCacheHit = await getMembershipById(membershipId);

    assert.strictEqual(membershipIdCacheHit.status, "ACTIVE");

    await pool.query(
      `
        UPDATE organisation_memberships
        SET status = $1
        WHERE id = $2;
      `,
      ["ACTIVE", membershipId],
    );

    console.log("✓ 9. Membership ID lookup uses Redis cache");

    // ---------------------------------------------------------
    // Verify scoped membership cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE organisation_memberships
        SET status = $1
        WHERE id = $2;
      `,
      ["SUSPENDED", membershipId],
    );

    const scopedCacheHit = await getMembership(memberId, organisationId);

    assert.strictEqual(scopedCacheHit.status, "ACTIVE");

    await pool.query(
      `
        UPDATE organisation_memberships
        SET status = $1
        WHERE id = $2;
      `,
      ["ACTIVE", membershipId],
    );

    console.log("✓ 10. Scoped membership lookup uses Redis cache");

    // ---------------------------------------------------------
    // Recreate all caches before invalidation test
    // ---------------------------------------------------------

    await getMembershipById(membershipId);
    await getMembership(memberId, organisationId);
    await getUserMemberships(memberId);
    await getOrganisationMembers(organisationId);

    assert.ok(await getCache(buildMembershipCacheKey(membershipId)));

    assert.ok(
      await getCache(
        buildUserOrganisationMembershipCacheKey(memberId, organisationId),
      ),
    );

    assert.ok(await getCache(buildUserMembershipsCacheKey(memberId)));

    assert.ok(await getCache(buildOrganisationMembersCacheKey(organisationId)));

    // ---------------------------------------------------------
    // Update membership status
    // ---------------------------------------------------------

    const updatedMembership = await updateMembershipStatus(
      membershipId,
      "SUSPENDED",
    );

    assert.ok(updatedMembership);
    assert.strictEqual(updatedMembership.status, "SUSPENDED");

    assert.strictEqual(
      await getCache(buildMembershipCacheKey(membershipId)),
      null,
    );

    assert.strictEqual(
      await getCache(
        buildUserOrganisationMembershipCacheKey(memberId, organisationId),
      ),
      null,
    );

    assert.strictEqual(
      await getCache(buildUserMembershipsCacheKey(memberId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildOrganisationMembersCacheKey(organisationId)),
      null,
    );

    console.log("✓ 11. Membership update invalidates all related caches");

    // ---------------------------------------------------------
    // Verify fresh values after invalidation
    // ---------------------------------------------------------

    const freshMembership = await getMembershipById(membershipId);

    assert.strictEqual(freshMembership.status, "SUSPENDED");

    const freshScopedMembership = await getMembership(memberId, organisationId);

    assert.strictEqual(freshScopedMembership.status, "SUSPENDED");

    const freshUserMemberships = await getUserMemberships(memberId);

    const freshUserMembership = freshUserMemberships.find(
      (item) => item.id === membershipId,
    );

    assert.strictEqual(freshUserMembership.status, "SUSPENDED");

    const freshOrganisationMembers =
      await getOrganisationMembers(organisationId);

    const freshOrganisationMember = freshOrganisationMembers.find(
      (item) => item.id === membershipId,
    );

    assert.strictEqual(freshOrganisationMember.status, "SUSPENDED");

    console.log("✓ 12. Fresh membership data is returned after invalidation");

    // ---------------------------------------------------------
    // Delete membership
    // ---------------------------------------------------------

    const deleted = await deleteMembership(membershipId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(
      await getCache(buildMembershipCacheKey(membershipId)),
      null,
    );

    assert.strictEqual(
      await getCache(
        buildUserOrganisationMembershipCacheKey(memberId, organisationId),
      ),
      null,
    );

    assert.strictEqual(
      await getCache(buildUserMembershipsCacheKey(memberId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildOrganisationMembersCacheKey(organisationId)),
      null,
    );

    const deletedMembership = await getMembershipById(membershipId);

    assert.strictEqual(deletedMembership, null);

    console.log(
      "✓ 13. Membership deletion removes database and all cache data",
    );

    console.log("\n✓ All Membership Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Membership Repository test failed.");
    console.error(error);

    throw error;
  } finally {
    // Delete membership first because it references
    // both the user and organisation.
    if (membershipId) {
      try {
        await pool.query(
          `
            DELETE FROM organisation_memberships
            WHERE id = $1;
          `,
          [membershipId],
        );
      } catch (error) {
        console.error("Membership cleanup failed:", error);
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

    if (memberId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [memberId],
        );
      } catch (error) {
        console.error("Member cleanup failed:", error);
      }
    }

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
