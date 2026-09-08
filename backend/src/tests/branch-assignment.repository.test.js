/**
 * Branch Assignment Repository Integration Tests
 *
 * Tests the Branch Assignment Repository against the real
 * PostgreSQL database and local Redis instance.
 *
 * The tests verify:
 * - Branch assignment creation
 * - Assignment cache miss and hit
 * - Membership assignment list caching
 * - Branch member list caching
 * - Branch access caching
 * - Cache invalidation after role updates
 * - Cache invalidation after assignment removal
 * - Cache invalidation after removing all assignments
 */

require("dotenv").config();

const assert = require("assert");

const {
  assignBranchToMembership,
  setPrimaryBranchAssignment,
  getAssignment,
  getMembershipAssignments,
  getBranchMembers,
  updateBranchAssignmentRole,
  isBranchAssigned,
  removeBranchAssignment,
  removeAllBranchAssignments,
} = require("../repositories/branch-assignment.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildAssignmentCacheKey = (membershipId, branchId) =>
  `branch-assignment:${membershipId}:${branchId}`;

const buildMembershipAssignmentsCacheKey = (membershipId) =>
  `branch-assignment:membership:${membershipId}`;

const buildBranchMembersCacheKey = (branchId) =>
  `branch-assignment:branch:${branchId}`;

const buildBranchAccessCacheKey = (membershipId, branchId) =>
  `branch-assignment:access:${membershipId}:${branchId}`;

const runTests = async () => {
  let ownerId = null;
  let memberId = null;
  let organisationId = null;
  let otherOrganisationId = null;
  let branchId = null;
  let secondBranchId = null;
  let otherBranchId = null;
  let roleId = null;
  let secondRoleId = null;
  let otherRoleId = null;
  let membershipId = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Branch Assignment Repository tests...\n");

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
        `${uniqueValue("branch-owner")}@test.local`,
        "test-password",
        "Branch Test Owner",
        "ACTIVE",
      ],
    );

    ownerId = ownerResult.rows[0].id;

    console.log("✓ 1. Create test owner");

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
        `${uniqueValue("branch-member")}@test.local`,
        "test-password",
        "Branch Test Member",
        "ACTIVE",
      ],
    );

    memberId = memberResult.rows[0].id;

    console.log("✓ 2. Create test member");

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
      [ownerId, uniqueValue("Branch Test Pharmacy")],
    );

    organisationId = organisationResult.rows[0].id;

    const otherOrganisationResult = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, uniqueValue("Other Branch Test Pharmacy")],
    );
    otherOrganisationId = otherOrganisationResult.rows[0].id;

    console.log("✓ 3. Create test organisation");

    // ---------------------------------------------------------
    // Create two branches
    // ---------------------------------------------------------

    const branchResult = await pool.query(
      `
        INSERT INTO branches (
          organisation_id,
          name,
          address,
          city,
          state,
          postal_code,
          phone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `,
      [
        organisationId,
        "Main Branch",
        "123 Main Street",
        "Test City",
        "Test State",
        "400001",
        "9000000001",
      ],
    );

    branchId = branchResult.rows[0].id;

    const secondBranchResult = await pool.query(
      `
          INSERT INTO branches (
            organisation_id,
            name,
            address,
            city,
            state,
            postal_code,
            phone
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id;
        `,
      [
        organisationId,
        "City Branch",
        "456 City Street",
        "Test City",
        "Test State",
        "400002",
        "9000000002",
      ],
    );

    secondBranchId = secondBranchResult.rows[0].id;

    const otherBranchResult = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [otherOrganisationId, "Other Organisation Branch"],
    );
    otherBranchId = otherBranchResult.rows[0].id;

    console.log("✓ 4. Create test branches");

    // ---------------------------------------------------------
    // Create roles
    // ---------------------------------------------------------

    const roleResult = await pool.query(
      `
        INSERT INTO roles (
          organisation_id,
          name,
          description,
          is_system_role
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `,
      [organisationId, "Cashier", "Branch test cashier role", false],
    );

    roleId = roleResult.rows[0].id;

    const secondRoleResult = await pool.query(
      `
          INSERT INTO roles (
            organisation_id,
            name,
            description,
            is_system_role
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id;
        `,
      [organisationId, "Manager", "Branch test manager role", false],
    );

    secondRoleId = secondRoleResult.rows[0].id;

    const otherRoleResult = await pool.query(
      `INSERT INTO roles (organisation_id, name, role_identifier, clearance_level)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [otherOrganisationId, "Other Cashier", "OTHER_CASHIER", "STANDARD_POS"],
    );
    otherRoleId = otherRoleResult.rows[0].id;

    console.log("✓ 5. Create test roles");

    // ---------------------------------------------------------
    // Create membership
    // ---------------------------------------------------------

    const membershipResult = await pool.query(
      `
          INSERT INTO organisation_memberships (
            organisation_id,
            user_id,
            status,
            joined_at
          )
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          RETURNING id;
        `,
      [organisationId, memberId, "ACTIVE"],
    );

    membershipId = membershipResult.rows[0].id;

    console.log("✓ 6. Create test membership");

    // ---------------------------------------------------------
    // Ensure Redis is clean
    // ---------------------------------------------------------

    await Promise.all([
      deleteCache(buildAssignmentCacheKey(membershipId, branchId)),
      deleteCache(buildMembershipAssignmentsCacheKey(membershipId)),
      deleteCache(buildBranchMembersCacheKey(branchId)),
      deleteCache(buildBranchAccessCacheKey(membershipId, branchId)),
    ]);

    // ---------------------------------------------------------
    // Assign branch
    // ---------------------------------------------------------

    const dashboardCacheKeys = [
      `organisation:${organisationId}:branch-mgmt:branch-stats`,
      `organisation:${organisationId}:branch-mgmt:staff-stats`,
      `organisation:${organisationId}:branch-mgmt:role-stats`,
    ];
    for (const key of dashboardCacheKeys) {
      await redisClient.set(key, JSON.stringify({ stale: true }), { EX: 60 });
    }

    assert.strictEqual(
      await assignBranchToMembership(membershipId, otherBranchId, roleId),
      null,
      "A membership cannot be assigned to a branch in another organisation",
    );
    assert.strictEqual(
      await assignBranchToMembership(membershipId, branchId, otherRoleId),
      null,
      "A membership cannot be assigned a role from another organisation",
    );

    const assignment = await assignBranchToMembership(
      membershipId,
      branchId,
      roleId,
    );

    assert.ok(assignment);
    assert.strictEqual(assignment.membership_id, membershipId);
    assert.strictEqual(assignment.branch_id, branchId);
    assert.strictEqual(assignment.role_id, roleId);
    for (const key of dashboardCacheKeys) {
      assert.strictEqual(
        await redisClient.get(key),
        null,
        "Branch-assignment writes must invalidate affected dashboard stats",
      );
    }

    console.log("✓ 7. Assign branch to membership");

    // ---------------------------------------------------------
    // Get assignment
    // ---------------------------------------------------------

    const firstAssignment = await getAssignment(membershipId, branchId);

    assert.ok(firstAssignment);
    assert.strictEqual(firstAssignment.role_id, roleId);

    const cachedAssignment = await getCache(
      buildAssignmentCacheKey(membershipId, branchId),
    );

    assert.ok(cachedAssignment);
    assert.strictEqual(cachedAssignment.role_id, roleId);

    console.log("✓ 8. Assignment cache miss populates Redis");

    // ---------------------------------------------------------
    // Verify assignment cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE branch_assignments
        SET role_id = $1
        WHERE membership_id = $2
          AND branch_id = $3;
      `,
      [secondRoleId, membershipId, branchId],
    );

    const assignmentCacheHit = await getAssignment(membershipId, branchId);

    assert.strictEqual(assignmentCacheHit.role_id, roleId);

    await pool.query(
      `
        UPDATE branch_assignments
        SET role_id = $1
        WHERE membership_id = $2
          AND branch_id = $3;
      `,
      [roleId, membershipId, branchId],
    );

    console.log("✓ 9. Assignment lookup uses Redis cache");

    // ---------------------------------------------------------
    // Membership assignments
    // ---------------------------------------------------------

    const membershipAssignments = await getMembershipAssignments(membershipId);

    assert.ok(Array.isArray(membershipAssignments));

    assert.strictEqual(membershipAssignments.length, 1);

    assert.strictEqual(membershipAssignments[0].branch_id, branchId);

    const cachedMembershipAssignments = await getCache(
      buildMembershipAssignmentsCacheKey(membershipId),
    );

    assert.ok(Array.isArray(cachedMembershipAssignments));

    console.log("✓ 10. Membership assignments cache works");

    // ---------------------------------------------------------
    // Branch members
    // ---------------------------------------------------------

    const branchMembers = await getBranchMembers(branchId);

    assert.ok(Array.isArray(branchMembers));

    assert.strictEqual(branchMembers.length, 1);

    assert.strictEqual(branchMembers[0].membership_id, membershipId);

    const cachedBranchMembers = await getCache(
      buildBranchMembersCacheKey(branchId),
    );

    assert.ok(Array.isArray(cachedBranchMembers));

    console.log("✓ 11. Branch members cache works");

    // ---------------------------------------------------------
    // Branch access
    // ---------------------------------------------------------

    const hasAccess = await isBranchAssigned(membershipId, branchId);

    assert.strictEqual(hasAccess, true);

    const cachedAccess = await getCache(
      buildBranchAccessCacheKey(membershipId, branchId),
    );

    assert.strictEqual(cachedAccess, true);

    console.log("✓ 12. Branch access cache works");

    // ---------------------------------------------------------
    // Recreate caches before update test
    // ---------------------------------------------------------

    await getAssignment(membershipId, branchId);

    await getMembershipAssignments(membershipId);

    await getBranchMembers(branchId);

    await isBranchAssigned(membershipId, branchId);

    // ---------------------------------------------------------
    // Update role
    // ---------------------------------------------------------

    const updatedAssignment = await updateBranchAssignmentRole(
      membershipId,
      branchId,
      secondRoleId,
    );

    assert.ok(updatedAssignment);
    assert.strictEqual(updatedAssignment.role_id, secondRoleId);

    assert.strictEqual(
      await getCache(buildAssignmentCacheKey(membershipId, branchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildMembershipAssignmentsCacheKey(membershipId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchMembersCacheKey(branchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchAccessCacheKey(membershipId, branchId)),
      null,
    );

    console.log("✓ 13. Role update invalidates related caches");

    // ---------------------------------------------------------
    // Fresh assignment after invalidation
    // ---------------------------------------------------------

    const freshAssignment = await getAssignment(membershipId, branchId);

    assert.strictEqual(freshAssignment.role_id, secondRoleId);

    console.log("✓ 14. Fresh assignment is returned after invalidation");

    // ---------------------------------------------------------
    // Add second branch assignment
    // ---------------------------------------------------------

    const secondAssignment = await assignBranchToMembership(
      membershipId,
      secondBranchId,
      roleId,
    );

    assert.ok(secondAssignment);

    assert.strictEqual(secondAssignment.branch_id, secondBranchId);

    // ---------------------------------------------------------
    // Verify membership now has two assignments
    // ---------------------------------------------------------

    const twoAssignments = await getMembershipAssignments(membershipId);

    assert.strictEqual(twoAssignments.length, 2);

    console.log("✓ 15. Multiple branch assignments are returned");

    // ---------------------------------------------------------
    // Remove one assignment
    // ---------------------------------------------------------

    const removed = await removeBranchAssignment(membershipId, branchId);

    assert.strictEqual(removed, true);

    assert.strictEqual(
      await getCache(buildAssignmentCacheKey(membershipId, branchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildMembershipAssignmentsCacheKey(membershipId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchMembersCacheKey(branchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchAccessCacheKey(membershipId, branchId)),
      null,
    );

    console.log("✓ 16. Removing assignment invalidates related caches");

    // ---------------------------------------------------------
    // Verify removed branch no longer has access
    // ---------------------------------------------------------

    const accessAfterRemoval = await isBranchAssigned(membershipId, branchId);

    assert.strictEqual(accessAfterRemoval, false);

    console.log("✓ 17. Removed branch no longer has access");

    // ---------------------------------------------------------
    // Recreate membership assignment list cache
    // ---------------------------------------------------------

    await getMembershipAssignments(membershipId);

    assert.ok(await getCache(buildMembershipAssignmentsCacheKey(membershipId)));

    // ---------------------------------------------------------
    // Remove all remaining assignments
    // ---------------------------------------------------------

    const removedCount = await removeAllBranchAssignments(membershipId);

    assert.strictEqual(removedCount, 1);

    assert.strictEqual(
      await getCache(buildMembershipAssignmentsCacheKey(membershipId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildAssignmentCacheKey(membershipId, secondBranchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchMembersCacheKey(secondBranchId)),
      null,
    );

    assert.strictEqual(
      await getCache(buildBranchAccessCacheKey(membershipId, secondBranchId)),
      null,
    );

    console.log("✓ 18. Removing all assignments invalidates affected caches");

    // ---------------------------------------------------------
    // Verify no assignments remain
    // ---------------------------------------------------------

    const finalAssignments = await getMembershipAssignments(membershipId);

    assert.strictEqual(finalAssignments.length, 0);

    console.log("✓ 19. All branch assignments removed successfully");

    // ---------------------------------------------------------
    // 20. Primary Branch Assignment Support (is_primary)
    // ---------------------------------------------------------
    const primaryAssign1 = await assignBranchToMembership(
      membershipId,
      branchId,
      roleId,
      true,
    );
    assert.ok(primaryAssign1);
    assert.strictEqual(primaryAssign1.is_primary, true);

    const primaryAssign2 = await assignBranchToMembership(
      membershipId,
      secondBranchId,
      secondRoleId,
      false,
    );
    assert.ok(primaryAssign2);
    assert.strictEqual(primaryAssign2.is_primary, false);

    const checkPrimary1 = await getAssignment(membershipId, branchId);
    assert.strictEqual(checkPrimary1.is_primary, true);

    const memberAssignments = await getMembershipAssignments(membershipId);
    assert.strictEqual(memberAssignments.length, 2);
    assert.strictEqual(memberAssignments[0].is_primary, true);
    assert.ok(memberAssignments[0].role_name);

    // Switch primary to second branch
    const switchedPrimary = await setPrimaryBranchAssignment(
      membershipId,
      secondBranchId,
    );
    assert.ok(switchedPrimary);
    assert.strictEqual(switchedPrimary.is_primary, true);

    const recheckBranch1 = await getAssignment(membershipId, branchId);
    assert.strictEqual(
      recheckBranch1.is_primary,
      false,
      "Previous primary should now be false",
    );

    const recheckBranch2 = await getAssignment(membershipId, secondBranchId);
    assert.strictEqual(
      recheckBranch2.is_primary,
      true,
      "New primary should now be true",
    );

    await removeAllBranchAssignments(membershipId);

    console.log(
      "✓ 20. Primary branch assignment verified with is_primary flag",
    );

    console.log("\n✓ All Branch Assignment Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ Branch Assignment Repository test failed.");
    console.error(error);

    throw error;
  } finally {
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

    if (roleId || secondRoleId || otherRoleId) {
      try {
        await pool.query(
          `
            DELETE FROM roles
            WHERE id = ANY($1::uuid[]);
          `,
          [[roleId, secondRoleId, otherRoleId].filter(Boolean)],
        );
      } catch (error) {
        console.error("Role cleanup failed:", error);
      }
    }

    if (branchId || secondBranchId || otherBranchId) {
      try {
        await pool.query(
          `
            DELETE FROM branches
            WHERE id = ANY($1::uuid[]);
          `,
          [[branchId, secondBranchId, otherBranchId].filter(Boolean)],
        );
      } catch (error) {
        console.error("Branch cleanup failed:", error);
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

    if (otherOrganisationId) {
      try {
        await pool.query(
          `DELETE FROM organisations WHERE id = $1;`,
          [otherOrganisationId],
        );
      } catch (error) {
        console.error("Other organisation cleanup failed:", error);
      }
    }

    if (memberId) {
      try {
        await pool.query("DELETE FROM users WHERE id = $1;", [memberId]);
      } catch (error) {
        console.error("Member cleanup failed:", error);
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
