/**
 * Membership Repository
 *
 * Purpose:
 * Handles direct database operations for organisation memberships.
 *
 * A membership connects a user to an organisation.
 *
 * The membership itself does not determine the user's role.
 * Roles are assigned at the branch level through branch_assignments.
 *
 * The repository handles database persistence and membership caching.
 * Authentication, authorization, invitation rules, and other
 * business rules belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const MEMBERSHIP_CACHE_TTL = 60;

/**
 * Build Redis cache keys.
 */
const buildMembershipCacheKey = (membershipId) => `membership:${membershipId}`;

const buildUserOrganisationMembershipCacheKey = (userId, organisationId) =>
  `membership:user:${userId}:organisation:${organisationId}`;

const buildUserMembershipsCacheKey = (userId) => `membership:user:${userId}`;

const buildOrganisationMembersCacheKey = (organisationId) =>
  `membership:organisation:${organisationId}`;

/**
 * Invalidate every cache entry affected by a membership.
 */
const invalidateMembershipCache = async (membership) => {
  await Promise.all([
    deleteCache(buildMembershipCacheKey(membership.id)),
    deleteCache(
      buildUserOrganisationMembershipCacheKey(
        membership.user_id,
        membership.organisation_id,
      ),
    ),
    deleteCache(buildUserMembershipsCacheKey(membership.user_id)),
    deleteCache(buildOrganisationMembersCacheKey(membership.organisation_id)),
  ]);
};

/**
 * Create a membership.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.userId
 * @param {string} data.status
 *
 * @returns {Object} Created membership
 */
const createMembership = async ({
  organisationId,
  userId,
  status = "ACTIVE",
}) => {
  const query = `
        INSERT INTO organisation_memberships (
            organisation_id,
            user_id,
            status,
            joined_at
        )
        VALUES (
            $1,
            $2,
            $3,
            CURRENT_TIMESTAMP
        )
        RETURNING
            id,
            organisation_id,
            user_id,
            status,
            joined_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [organisationId, userId, status]);

  const membership = result.rows[0];

  /**
   * There is no existing individual membership cache,
   * but both membership lists are now stale.
   */
  try {
    await Promise.all([
      deleteCache(
        buildUserOrganisationMembershipCacheKey(userId, organisationId),
      ),
      deleteCache(buildUserMembershipsCacheKey(userId)),
      deleteCache(buildOrganisationMembersCacheKey(organisationId)),
    ]);
  } catch (error) {
    console.error("Membership cache invalidation failed:", error);
  }

  return membership;
};

/**
 * Get a membership by its ID.
 *
 * @param {string} membershipId
 *
 * @returns {Object|null} Membership or null if not found
 */
const getMembershipById = async (membershipId) => {
  const cacheKey = buildMembershipCacheKey(membershipId);

  try {
    const cachedMembership = await getCache(cacheKey);

    if (cachedMembership !== null) {
      return cachedMembership;
    }
  } catch (error) {
    console.error("Membership cache read failed:", error);
  }

  const query = `
        SELECT
            id,
            organisation_id,
            user_id,
            status,
            joined_at,
            created_at,
            updated_at
        FROM organisation_memberships
        WHERE id = $1;
    `;

  const result = await pool.query(query, [membershipId]);
  const membership = result.rows[0] || null;

  if (membership) {
    try {
      await setCache(cacheKey, membership, MEMBERSHIP_CACHE_TTL);
    } catch (error) {
      console.error("Membership cache write failed:", error);
    }
  }

  return membership;
};

/**
 * Get a specific user's membership in a specific organisation.
 *
 * @param {string} userId
 * @param {string} organisationId
 *
 * @returns {Object|null} Membership or null if not found
 */
const getMembership = async (userId, organisationId) => {
  const cacheKey = buildUserOrganisationMembershipCacheKey(
    userId,
    organisationId,
  );

  try {
    const cachedMembership = await getCache(cacheKey);

    if (cachedMembership !== null) {
      return cachedMembership;
    }
  } catch (error) {
    console.error("User organisation membership cache read failed:", error);
  }

  const query = `
        SELECT
            id,
            organisation_id,
            user_id,
            status,
            joined_at,
            created_at,
            updated_at
        FROM organisation_memberships
        WHERE user_id = $1
          AND organisation_id = $2;
    `;

  const result = await pool.query(query, [userId, organisationId]);

  const membership = result.rows[0] || null;

  if (membership) {
    try {
      await setCache(cacheKey, membership, MEMBERSHIP_CACHE_TTL);
    } catch (error) {
      console.error("User organisation membership cache write failed:", error);
    }
  }

  return membership;
};

/**
 * Get all organisations to which a user belongs.
 *
 * @param {string} userId
 *
 * @returns {Array} User memberships
 */
const getUserMemberships = async (userId) => {
  const cacheKey = buildUserMembershipsCacheKey(userId);

  try {
    const cachedMemberships = await getCache(cacheKey);

    if (cachedMemberships !== null) {
      return cachedMemberships;
    }
  } catch (error) {
    console.error("User memberships cache read failed:", error);
  }

  const query = `
        SELECT
            om.id,
            om.organisation_id,
            o.name AS organisation_name,
            om.user_id,
            om.status,
            om.joined_at,
            om.created_at,
            om.updated_at
        FROM organisation_memberships om
        INNER JOIN organisations o
            ON o.id = om.organisation_id
        WHERE om.user_id = $1
        ORDER BY om.joined_at ASC;
    `;

  const result = await pool.query(query, [userId]);
  const memberships = result.rows;

  try {
    await setCache(cacheKey, memberships, MEMBERSHIP_CACHE_TTL);
  } catch (error) {
    console.error("User memberships cache write failed:", error);
  }

  return memberships;
};

/**
 * Get all members of an organisation.
 *
 * @param {string} organisationId
 *
 * @returns {Array} Organisation members
 */
const getOrganisationMembers = async (organisationId) => {
  const cacheKey = buildOrganisationMembersCacheKey(organisationId);

  try {
    const cachedMembers = await getCache(cacheKey);

    if (cachedMembers !== null) {
      return cachedMembers;
    }
  } catch (error) {
    console.error("Organisation members cache read failed:", error);
  }

  const query = `
        SELECT
            om.id,
            om.organisation_id,
            om.user_id,
            u.name AS user_name,
            u.email AS user_email,
            om.status,
            om.joined_at,
            om.created_at,
            om.updated_at
        FROM organisation_memberships om
        INNER JOIN users u
            ON u.id = om.user_id
        WHERE om.organisation_id = $1
        ORDER BY om.joined_at ASC;
    `;

  const result = await pool.query(query, [organisationId]);

  const members = result.rows;

  try {
    await setCache(cacheKey, members, MEMBERSHIP_CACHE_TTL);
  } catch (error) {
    console.error("Organisation members cache write failed:", error);
  }

  return members;
};

/**
 * Update the status of a membership.
 *
 * @param {string} membershipId
 * @param {string} status
 *
 * @returns {Object|null} Updated membership
 */
const updateMembershipStatus = async (membershipId, status) => {
  const query = `
        UPDATE organisation_memberships
        SET
            status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            organisation_id,
            user_id,
            status,
            joined_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [status, membershipId]);

  const membership = result.rows[0] || null;

  if (membership) {
    try {
      await invalidateMembershipCache(membership);
    } catch (error) {
      console.error("Membership cache invalidation failed:", error);
    }
  }

  return membership;
};

/**
 * Delete a membership.
 *
 * The membership is loaded before deletion so all affected
 * cache keys can be invalidated after the database deletion.
 *
 * @param {string} membershipId
 *
 * @returns {boolean} True if the membership was deleted
 */
const deleteMembership = async (membershipId) => {
  const existingMembership = await getMembershipById(membershipId);

  const query = `
        DELETE FROM organisation_memberships
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [membershipId]);

  if (result.rowCount > 0 && existingMembership) {
    try {
      await invalidateMembershipCache(existingMembership);
    } catch (error) {
      console.error("Membership cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

/**
 * Export membership repository functions.
 */
module.exports = {
  createMembership,
  getMembershipById,
  getMembership,
  getUserMemberships,
  getOrganisationMembers,
  updateMembershipStatus,
  deleteMembership,
};
