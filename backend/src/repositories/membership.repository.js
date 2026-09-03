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
 * Example:
 *
 * User
 *   |
 *   +---- Falah Pharmacy
 *   |        |
 *   |        +---- Main Branch ---- Cashier
 *   |        |
 *   |        +---- City Branch ---- Accountant
 *   |
 *   +---- Apollo Pharmacy
 *            |
 *            +---- Central Branch ---- Manager
 *
 * The same user can therefore belong to multiple organisations,
 * work at multiple branches, and have different roles at
 * different branches.
 *
 * The repository handles database persistence only.
 * Authentication, authorization, invitation rules, and other
 * business rules belong in the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a membership.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.userId
 * @param {string|null} data.roleId
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

  return result.rows[0];
};

/**
 * Get a membership by its ID.
 *
 * @param {string} membershipId
 *
 * @returns {Object|null} Membership or null if not found
 */
const getMembershipById = async (membershipId) => {
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

  return result.rows[0] || null;
};

/**
 * Get a specific user's membership in a specific organisation.
 *
 * This is one of the most important membership queries.
 *
 * It answers:
 *
 * "Does this user belong to this organisation, and if so,
 * what is their role and membership status?"
 *
 * @param {string} userId
 * @param {string} organisationId
 *
 * @returns {Object|null} Membership or null if not found
 */
const getMembership = async (userId, organisationId) => {
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

  return result.rows[0] || null;
};

/**
 * Get all organisations to which a user belongs.
 *
 * The result includes organisation and role information because
 * this is commonly needed when a user logs into the application
 * and needs to select an organisation.
 *
 * @param {string} userId
 *
 * @returns {Array} User memberships
 */
const getUserMemberships = async (userId) => {
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
  return result.rows;
};

/**
 * Get all members of an organisation.
 *
 * The result includes user and role information because this
 * is what an organisation's employee/member management screen
 * generally needs.
 *
 * @param {string} organisationId
 *
 * @returns {Array} Organisation members
 */
const getOrganisationMembers = async (organisationId) => {
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
  return result.rows;
};

/**
 * Update the status of a membership.
 *
 * Examples:
 *
 * ACTIVE
 * INVITED
 * SUSPENDED
 * REMOVED
 *
 * The service layer should decide which status transitions
 * are allowed.
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

  return result.rows[0] || null;
};

/**
 * Delete a membership.
 *
 * Deleting a membership removes the user's relationship with
 * the organisation. It does not delete the user account itself.
 *
 * The service layer should determine whether a membership can
 * actually be removed.
 *
 * @param {string} membershipId
 *
 * @returns {boolean} True if the membership was deleted
 */
const deleteMembership = async (membershipId) => {
  const query = `
        DELETE FROM organisation_memberships
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [membershipId]);

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
