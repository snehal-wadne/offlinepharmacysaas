/**
 * Branch Assignment Repository
 *
 * Purpose:
 * Handles database operations for assigning organisation
 * memberships to branches and defining the role they have
 * at each assigned branch.
 *
 * An organisation membership determines which organisation
 * the user belongs to.
 *
 * A branch assignment determines:
 *   1. Which branch the member can access.
 *   2. Which role the member has at that branch.
 *   3. Whether this branch is their primary designated branch (is_primary).
 *
 * This repository only manages branch assignment persistence
 * and cache access. Permission and authorization decisions
 * belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const {
  invalidateBranchManagementDashboardCache,
} = require("./branch-management-dashboard.repository");

const BRANCH_ASSIGNMENT_CACHE_TTL = 60;

/**
 * Build Redis cache keys.
 */
const buildAssignmentCacheKey = (membershipId, branchId) =>
  `branch-assignment:${membershipId}:${branchId}`;

const buildMembershipAssignmentsCacheKey = (membershipId) =>
  `branch-assignment:membership:${membershipId}`;

const buildBranchMembersCacheKey = (branchId) =>
  `branch-assignment:branch:${branchId}`;

const buildBranchAccessCacheKey = (membershipId, branchId) =>
  `branch-assignment:access:${membershipId}:${branchId}`;

/**
 * Invalidate all caches affected by one branch assignment.
 */
const invalidateAssignmentCache = async (assignment) => {
  const membershipId = assignment.membershipId || assignment.membership_id;
  const branchId = assignment.branchId || assignment.branch_id;

  if (!membershipId || !branchId) {
    return;
  }

  await Promise.all([
    deleteCache(buildAssignmentCacheKey(membershipId, branchId)),
    deleteCache(buildMembershipAssignmentsCacheKey(membershipId)),
    deleteCache(buildBranchMembersCacheKey(branchId)),
    deleteCache(buildBranchAccessCacheKey(membershipId, branchId)),
  ]);

  // Branch-assignment writes alter all three cached dashboard aggregates.
  // Look up the tenant from the membership/branch pair rather than trusting
  // caller input, because this repository's public API is ID based.
  try {
    const organisationResult = await pool.query(
      `
        SELECT om.organisation_id
        FROM organisation_memberships om
        INNER JOIN branches b
          ON b.id = $2
         AND b.organisation_id = om.organisation_id
        WHERE om.id = $1;
      `,
      [membershipId, branchId],
    );

    const organisationId = organisationResult.rows[0]?.organisation_id;
    if (organisationId) {
      await invalidateBranchManagementDashboardCache(organisationId, {
        branch: true,
        staff: true,
        role: true,
      });
    }
  } catch (error) {
    console.error("Branch assignment dashboard cache invalidation failed:", error);
  }
};

/**
 * Assign a branch to an organisation membership.
 *
 * The database uses (membership_id, branch_id) as the primary key.
 * If isPrimary is true, clears any existing primary assignment for this membership
 * to preserve the partial unique index.
 *
 * @param {string} membershipId
 * @param {string} branchId
 * @param {string} roleId
 * @param {boolean} [isPrimary=false]
 *
 * @returns {Object|null} Created or updated branch assignment
 */
const assignBranchToMembership = async (
  membershipId,
  branchId,
  roleId,
  isPrimary = false,
) => {
  if (isPrimary) {
    const prevPrimary = await pool.query(
      `
        SELECT branch_id
        FROM branch_assignments
        WHERE membership_id = $1
          AND is_primary = TRUE;
      `,
      [membershipId],
    );

    await pool.query(
      `
        UPDATE branch_assignments
        SET is_primary = FALSE
        WHERE membership_id = $1
          AND is_primary = TRUE;
      `,
      [membershipId],
    );

    for (const row of prevPrimary.rows) {
      if (row.branch_id !== branchId) {
        await invalidateAssignmentCache({
          membershipId,
          branchId: row.branch_id,
        });
      }
    }
  }

  const query = `
    INSERT INTO branch_assignments (
      membership_id,
      branch_id,
      role_id,
      is_primary
    )
    SELECT
      om.id,
      b.id,
      r.id,
      $4
    FROM organisation_memberships om
    INNER JOIN branches b
      ON b.id = $2
     AND b.organisation_id = om.organisation_id
    INNER JOIN roles r
      ON r.id = $3
     AND r.organisation_id = om.organisation_id
    WHERE om.id = $1
    ON CONFLICT (membership_id, branch_id)
    DO UPDATE SET
      role_id = EXCLUDED.role_id,
      is_primary = EXCLUDED.is_primary
    RETURNING
      membership_id,
      branch_id,
      role_id,
      is_primary;
  `;

  const result = await pool.query(query, [
    membershipId,
    branchId,
    roleId,
    isPrimary,
  ]);

  const assignment = result.rows[0] || null;

  if (assignment) {
    try {
      await invalidateAssignmentCache(assignment);
    } catch (error) {
      console.error("Branch assignment cache invalidation failed:", error);
    }
  }

  return assignment;
};

/**
 * Set a specific branch as the primary branch for a membership.
 * Clears any existing primary assignment for the membership and invalidates caches.
 *
 * @param {string} membershipId
 * @param {string} branchId
 *
 * @returns {Object|null} Updated branch assignment
 */
const setPrimaryBranchAssignment = async (membershipId, branchId) => {
  const prevPrimary = await pool.query(
    `
      SELECT branch_id
      FROM branch_assignments
      WHERE membership_id = $1
        AND is_primary = TRUE;
    `,
    [membershipId],
  );

  await pool.query(
    `
      UPDATE branch_assignments
      SET is_primary = FALSE
      WHERE membership_id = $1
        AND is_primary = TRUE;
    `,
    [membershipId],
  );

  const query = `
    UPDATE branch_assignments
    SET is_primary = TRUE
    WHERE membership_id = $1
      AND branch_id = $2
    RETURNING
      membership_id,
      branch_id,
      role_id,
      is_primary;
  `;

  const result = await pool.query(query, [membershipId, branchId]);
  const assignment = result.rows[0] || null;

  if (assignment) {
    try {
      await invalidateAssignmentCache(assignment);
      for (const row of prevPrimary.rows) {
        if (row.branch_id !== branchId) {
          await invalidateAssignmentCache({
            membershipId,
            branchId: row.branch_id,
          });
        }
      }
    } catch (error) {
      console.error("Branch assignment cache invalidation failed:", error);
    }
  }

  return assignment;
};

/**
 * Get a branch assignment by membership and branch.
 *
 * @param {string} membershipId
 * @param {string} branchId
 *
 * @returns {Object|null} Assignment or null if not found
 */
const getAssignment = async (membershipId, branchId) => {
  const cacheKey = buildAssignmentCacheKey(membershipId, branchId);

  try {
    const cachedAssignment = await getCache(cacheKey);

    if (cachedAssignment !== null) {
      return cachedAssignment;
    }
  } catch (error) {
    console.error("Branch assignment cache read failed:", error);
  }

  const query = `
    SELECT
      membership_id,
      branch_id,
      role_id,
      is_primary
    FROM branch_assignments
    WHERE membership_id = $1
      AND branch_id = $2;
  `;

  const result = await pool.query(query, [membershipId, branchId]);

  const assignment = result.rows[0] || null;

  if (assignment) {
    try {
      await setCache(cacheKey, assignment, BRANCH_ASSIGNMENT_CACHE_TTL);
    } catch (error) {
      console.error("Branch assignment cache write failed:", error);
    }
  }

  return assignment;
};

/**
 * Update the role for a branch assignment.
 *
 * @param {string} membershipId
 * @param {string} branchId
 * @param {string} roleId
 *
 * @returns {Object|null} Updated branch assignment
 */
const updateBranchAssignmentRole = async (membershipId, branchId, roleId) => {
  const query = `
        UPDATE branch_assignments
        SET role_id = $1
        WHERE membership_id = $2
          AND branch_id = $3
        RETURNING *;
    `;

  const result = await pool.query(query, [roleId, membershipId, branchId]);

  if (result.rows.length === 0) {
    return null;
  }

  await invalidateAssignmentCache({ membershipId, branchId });

  return result.rows[0];
};

/**
 * Get all branches assigned to a membership.
 *
 * @param {string} membershipId
 *
 * @returns {Array} Assigned branches
 */
const getMembershipAssignments = async (membershipId) => {
  const cacheKey = buildMembershipAssignmentsCacheKey(membershipId);

  try {
    const cachedAssignments = await getCache(cacheKey);

    if (cachedAssignments !== null) {
      return cachedAssignments;
    }
  } catch (error) {
    console.error("Membership assignments cache read failed:", error);
  }

  const query = `
    SELECT
      ba.membership_id,
      ba.branch_id,
      ba.role_id,
      ba.is_primary,
      r.name AS role_name,
      r.role_identifier,
      r.clearance_level,
      b.organisation_id,
      b.name,
      b.branch_code,
      b.facility_type,
      b.status AS branch_status,
      b.address,
      b.city,
      b.state,
      b.postal_code,
      b.phone,
      b.created_at,
      b.updated_at
    FROM branch_assignments ba
    INNER JOIN branches b
      ON b.id = ba.branch_id
    INNER JOIN roles r
      ON r.id = ba.role_id
    WHERE ba.membership_id = $1
    ORDER BY ba.is_primary DESC, b.name ASC;
  `;

  const result = await pool.query(query, [membershipId]);

  const assignments = result.rows;

  try {
    await setCache(cacheKey, assignments, BRANCH_ASSIGNMENT_CACHE_TTL);
  } catch (error) {
    console.error("Membership assignments cache write failed:", error);
  }

  return assignments;
};

/**
 * Get all memberships assigned to a branch.
 *
 * @param {string} branchId
 *
 * @returns {Array} Members assigned to the branch
 */
const getBranchMembers = async (branchId) => {
  const cacheKey = buildBranchMembersCacheKey(branchId);

  try {
    const cachedMembers = await getCache(cacheKey);

    if (cachedMembers !== null) {
      return cachedMembers;
    }
  } catch (error) {
    console.error("Branch members cache read failed:", error);
  }

  const query = `
    SELECT
      ba.membership_id,
      ba.branch_id,
      ba.role_id,
      ba.is_primary,
      r.name AS role_name,
      r.role_identifier,
      r.clearance_level,
      om.organisation_id,
      om.user_id,
      u.name AS user_name,
      u.email AS user_email,
      u.staff_id,
      u.phone AS user_phone,
      u.professional_registration_number,
      u.working_shift,
      om.status AS membership_status,
      om.joined_at
    FROM branch_assignments ba
    INNER JOIN organisation_memberships om
      ON om.id = ba.membership_id
    INNER JOIN users u
      ON u.id = om.user_id
    INNER JOIN roles r
      ON r.id = ba.role_id
    WHERE ba.branch_id = $1
    ORDER BY ba.is_primary DESC, u.name ASC;
  `;

  const result = await pool.query(query, [branchId]);

  const members = result.rows;

  try {
    await setCache(cacheKey, members, BRANCH_ASSIGNMENT_CACHE_TTL);
  } catch (error) {
    console.error("Branch members cache write failed:", error);
  }

  return members;
};

/**
 * Check whether a membership has access to a branch.
 *
 * @param {string} membershipId
 * @param {string} branchId
 *
 * @returns {boolean} True when the assignment exists
 */
const isBranchAssigned = async (membershipId, branchId) => {
  const cacheKey = buildBranchAccessCacheKey(membershipId, branchId);

  try {
    const cachedAccess = await getCache(cacheKey);

    if (cachedAccess !== null) {
      return cachedAccess;
    }
  } catch (error) {
    console.error("Branch access cache read failed:", error);
  }

  const query = `
    SELECT 1
    FROM branch_assignments
    WHERE membership_id = $1
      AND branch_id = $2
    LIMIT 1;
  `;

  const result = await pool.query(query, [membershipId, branchId]);

  const hasAccess = result.rowCount > 0;

  try {
    await setCache(cacheKey, hasAccess, BRANCH_ASSIGNMENT_CACHE_TTL);
  } catch (error) {
    console.error("Branch access cache write failed:", error);
  }

  return hasAccess;
};

/**
 * Remove one branch assignment.
 *
 * @param {string} membershipId
 * @param {string} branchId
 *
 * @returns {boolean} True if an assignment was removed
 */
const removeBranchAssignment = async (membershipId, branchId) => {
  const query = `
    DELETE FROM branch_assignments
    WHERE membership_id = $1
      AND branch_id = $2
    RETURNING
      membership_id,
      branch_id;
  `;

  const result = await pool.query(query, [membershipId, branchId]);

  if (result.rowCount > 0) {
    try {
      await invalidateAssignmentCache({
        membershipId,
        branchId,
      });
    } catch (error) {
      console.error("Branch assignment cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

/**
 * Remove all branch assignments for a membership.
 *
 * @param {string} membershipId
 *
 * @returns {number} Number of assignments removed
 */
const removeAllBranchAssignments = async (membershipId) => {
  const existingAssignments = await pool.query(
    `
        SELECT branch_id
        FROM branch_assignments
        WHERE membership_id = $1;
      `,
    [membershipId],
  );

  const query = `
    DELETE FROM branch_assignments
    WHERE membership_id = $1;
  `;

  const result = await pool.query(query, [membershipId]);

  if (result.rowCount > 0) {
    try {
      await Promise.all([
        deleteCache(buildMembershipAssignmentsCacheKey(membershipId)),
        ...existingAssignments.rows.map(({ branch_id }) =>
          deleteCache(buildBranchMembersCacheKey(branch_id)),
        ),
        ...existingAssignments.rows.map(({ branch_id }) =>
          deleteCache(buildAssignmentCacheKey(membershipId, branch_id)),
        ),
        ...existingAssignments.rows.map(({ branch_id }) =>
          deleteCache(buildBranchAccessCacheKey(membershipId, branch_id)),
        ),
        ...existingAssignments.rows.map(({ branch_id }) =>
          invalidateAssignmentCache({ membershipId, branchId: branch_id }),
        ),
      ]);
    } catch (error) {
      console.error("Branch assignment cache invalidation failed:", error);
    }
  }

  return result.rowCount;
};

module.exports = {
  assignBranchToMembership,
  setPrimaryBranchAssignment,
  getAssignment,
  getMembershipAssignments,
  getBranchMembers,
  updateBranchAssignmentRole,
  isBranchAssigned,
  removeBranchAssignment,
  removeAllBranchAssignments,
};
