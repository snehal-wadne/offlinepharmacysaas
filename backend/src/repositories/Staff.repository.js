/**
 * Staff Repository
 *
 * Handles all direct database operations behind the "Invite Staff
 * Member" feature: users, organisation_memberships and
 * branch_assignments.
 */

const { pool } = require('../db/connection');

const findUserByEmail = async (email, client = pool) => {
  const result = await client.query(`SELECT * FROM users WHERE email = $1;`, [email]);
  return result.rows[0] || null;
};

/**
 * Creates a user record for someone who has been invited but has not
 * signed in yet. `passwordHash` is a random, unusable placeholder —
 * see utils/password.js — required to satisfy users_auth_method_check.
 */
const createInvitedUser = async (
  { email, name, phone, staffId, professionalRegistrationNumber, workingShift, passwordHash },
  client = pool,
) => {
  const query = `
        INSERT INTO users (
            email,
            password_hash,
            name,
            status,
            staff_id,
            phone,
            professional_registration_number,
            working_shift
        )
        VALUES ($1, $2, $3, 'INVITED', $4, $5, $6, $7)
        RETURNING *;
    `;

  const values = [email, passwordHash, name, staffId, phone, professionalRegistrationNumber, workingShift];

  const result = await client.query(query, values);
  return result.rows[0];
};

const getMembership = async (organisationId, userId, client = pool) => {
  const result = await client.query(
    `SELECT * FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2;`,
    [organisationId, userId],
  );
  return result.rows[0] || null;
};

const getMembershipById = async (organisationId, membershipId, client = pool) => {
  const result = await client.query(
    `SELECT * FROM organisation_memberships WHERE id = $1 AND organisation_id = $2;`,
    [membershipId, organisationId],
  );
  return result.rows[0] || null;
};

const createMembership = async ({ organisationId, userId, status = 'INVITED' }, client = pool) => {
  const query = `
        INSERT INTO organisation_memberships (organisation_id, user_id, status)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;

  const result = await client.query(query, [organisationId, userId, status]);
  return result.rows[0];
};

const activateMembership = async (membershipId, client = pool) => {
  const query = `
        UPDATE organisation_memberships
        SET status = 'ACTIVE', joined_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
    `;
  const result = await client.query(query, [membershipId]);
  return result.rows[0] || null;
};

const updateMembershipStatus = async (organisationId, membershipId, status, client = pool) => {
  const query = `
        UPDATE organisation_memberships
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
          AND organisation_id = $3
        RETURNING *;
    `;
  const result = await client.query(query, [status, membershipId, organisationId]);
  return result.rows[0] || null;
};

const createBranchAssignment = async (
  { membershipId, branchId, roleId, isPrimary = true },
  client = pool,
) => {
  const query = `
        INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

  const result = await client.query(query, [membershipId, branchId, roleId, isPrimary]);
  return result.rows[0];
};

/**
 * Confirms a branch belongs to the same organisation as the invite —
 * two IDs supplied independently by the client should never be
 * trusted to already agree (per the schema's own tenant-isolation
 * note on organisation_id / branch_id).
 */
const branchBelongsToOrganisation = async (organisationId, branchId, client = pool) => {
  const result = await client.query(
    `SELECT id FROM branches WHERE id = $1 AND organisation_id = $2;`,
    [branchId, organisationId],
  );
  return result.rows.length > 0;
};

const roleBelongsToOrganisation = async (organisationId, roleId, client = pool) => {
  const result = await client.query(
    `SELECT id FROM roles WHERE id = $1 AND organisation_id = $2;`,
    [roleId, organisationId],
  );
  return result.rows.length > 0;
};

/**
 * Full staff directory for an organisation: one row per membership +
 * branch assignment, with the user's and role's display details
 * joined in.
 */
const getStaffByOrganisation = async (organisationId) => {
  const query = `
        SELECT
            m.id AS membership_id,
            m.status AS membership_status,
            m.joined_at,
            u.id AS user_id,
            u.name,
            u.email,
            u.phone,
            u.staff_id,
            u.status AS user_status,
            ba.branch_id,
            b.name AS branch_name,
            ba.role_id,
            r.name AS role_name,
            r.clearance_level,
            ba.is_primary
        FROM organisation_memberships m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN branch_assignments ba ON ba.membership_id = m.id
        LEFT JOIN branches b ON b.id = ba.branch_id
        LEFT JOIN roles r ON r.id = ba.role_id
        WHERE m.organisation_id = $1
        ORDER BY u.name ASC;
    `;

  const result = await pool.query(query, [organisationId]);
  return result.rows;
};

const setUserPassword = async (userId, passwordHash, client = pool) => {
  const query = `
        UPDATE users
        SET password_hash = $1, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, email, name;
    `;
  const result = await client.query(query, [passwordHash, userId]);
  return result.rows[0] || null;
};

module.exports = {
  findUserByEmail,
  createInvitedUser,
  getMembership,
  getMembershipById,
  createMembership,
  activateMembership,
  updateMembershipStatus,
  createBranchAssignment,
  branchBelongsToOrganisation,
  roleBelongsToOrganisation,
  getStaffByOrganisation,
  setUserPassword,
};