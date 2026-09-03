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
 *
 * Example:
 *
 * Rahul
 *   |
 *   +-- Falah Pharmacy
 *          |
 *          +-- Main Branch ---- Cashier
 *          |
 *          +-- City Branch ---- Accountant
 *
 * This repository only manages branch assignment persistence.
 * Permission and authorization decisions belong in the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Assign a branch to an organisation membership.
 *
 * The database uses (membership_id, branch_id) as the primary
 * key, so the same branch cannot be assigned to the same
 * membership more than once.
 *
 * @param {string} membershipId
 * @param {string} branchId
 * @param {string} roleId
 *
 * @returns {Object} Created branch assignment
 */
const assignBranchToMembership = async (membershipId, branchId, roleId) => {
  const query = `
    INSERT INTO branch_assignments (
        membership_id,
        branch_id,
        role_id
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (membership_id, branch_id)
    DO NOTHING
    RETURNING
        membership_id,
        branch_id,
        role_id;
`;

  const result = await pool.query(query, [membershipId, branchId, roleId]);

  return result.rows[0] || null;
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
  const query = `
        SELECT
            membership_id,
            branch_id,
            role_id
        FROM branch_assignments
        WHERE membership_id = $1
          AND branch_id = $2;
    `;

  const result = await pool.query(query, [membershipId, branchId]);

  return result.rows[0] || null;
};

/**
 * Update the role for a branch assignment.
 *
 * @param {string} membershipId
 * @param {string} branchId
 * @param {string} roleId
 *
 * @returns {Object|null} Updated branch assignment or null if not found
 */
const updateBranchAssignmentRole = async (membershipId, branchId, roleId) => {
  const query = `
        UPDATE branch_assignments
        SET role_id = $3
        WHERE membership_id = $1
          AND branch_id = $2
        RETURNING
            membership_id,
            branch_id,
            role_id;
    `;

  const result = await pool.query(query, [membershipId, branchId, roleId]);

  return result.rows[0] || null;
};

/**
 * Get all branches assigned to a membership.
 *
 * The branch information is included because callers usually
 * need the branch details rather than only the branch UUID.
 *
 * @param {string} membershipId
 *
 * @returns {Array} Assigned branches
 */
const getMembershipAssignments = async (membershipId) => {
  const query = `
        SELECT
            ba.membership_id,
            ba.branch_id,
            ba.role_id,
            r.name AS role_name,
            b.organisation_id,
            b.name,
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
        ORDER BY b.name ASC;
    `;

  const result = await pool.query(query, [membershipId]);
  return result.rows;
};

/**
 * Get all memberships assigned to a branch.
 *
 * This is useful for branch-level employee management.
 *
 * The query also returns user and role information so the
 * service layer does not need to perform separate lookups.
 *
 * @param {string} branchId
 *
 * @returns {Array} Members assigned to the branch
 */
const getBranchMembers = async (branchId) => {
  const query = `
        SELECT
            ba.membership_id,
            ba.branch_id,
            ba.role_id,
            r.name AS role_name,
            om.organisation_id,
            om.user_id,
            u.name AS user_name,
            u.email AS user_email,
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
        ORDER BY u.name ASC;
    `;

  const result = await pool.query(query, [branchId]);
  return result.rows;
};

/**
 * Check whether a membership has access to a branch.
 *
 * This is intentionally a small existence query because this
 * check will eventually be useful during authorization.
 *
 * @param {string} membershipId
 * @param {string} branchId
 *
 * @returns {boolean} True when the assignment exists
 */
const isBranchAssigned = async (membershipId, branchId) => {
  const query = `
        SELECT 1
        FROM branch_assignments
        WHERE membership_id = $1
          AND branch_id = $2
        LIMIT 1;
    `;

  const result = await pool.query(query, [membershipId, branchId]);

  return result.rowCount > 0;
};

/**
 * Remove one branch assignment.
 *
 * Removing the assignment does not delete the membership
 * or the branch.
 *
 * It only removes the relationship between them.
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

  return result.rowCount > 0;
};

/**
 * Remove all branch assignments for a membership.
 *
 * This is useful when a member is being removed from an
 * organisation or when their branch access needs to be reset.
 *
 * @param {string} membershipId
 *
 * @returns {number} Number of assignments removed
 */
const removeAllBranchAssignments = async (membershipId) => {
  const query = `
        DELETE FROM branch_assignments
        WHERE membership_id = $1;
    `;

  const result = await pool.query(query, [membershipId]);

  return result.rowCount;
};

module.exports = {
  assignBranchToMembership,
  getAssignment,
  getMembershipAssignments,
  getBranchMembers,
  updateBranchAssignmentRole,
  isBranchAssigned,
  removeBranchAssignment,
  removeAllBranchAssignments,
};
