/**
 * User Repository
 *
 * Purpose:
 * Handles direct database operations for user accounts.
 *
 * Authentication methods supported by the users table:
 *
 * 1. Local authentication
 *      password_hash is present
 *
 * 2. Google authentication
 *      google_sub is present
 *
 * 3. Both
 *      password_hash and google_sub are present
 *
 * The repository only handles persistence.
 * Authentication rules, password verification, Google token
 * verification, account linking decisions, and authorization
 * belong to the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a new user.
 *
 * This function can create:
 *
 * - A local user by providing passwordHash.
 * - A Google user by providing googleSub.
 * - A user supporting both methods by providing both.
 *
 * The password is expected to already be hashed by the
 * service layer before reaching the repository.
 *
 * @param {Object} data
 * @param {string} data.email
 * @param {string|null} data.passwordHash
 * @param {string|null} data.googleSub
 * @param {string} data.name
 * @param {string} data.status
 *
 * @returns {Object} Created user
 */
const createUser = async ({
  email,
  passwordHash = null,
  googleSub = null,
  name,
  status = "ACTIVE",
}) => {
  const query = `
        INSERT INTO users (
            email,
            password_hash,
            google_sub,
            name,
            status
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [
    email,
    passwordHash,
    googleSub,
    name,
    status,
  ]);

  return result.rows[0];
};

/**
 * Find a user by their unique ID.
 *
 * @param {string} userId
 *
 * @returns {Object|null} User or null if not found
 */
const getUserById = async (userId) => {
  const query = `
        SELECT
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at
        FROM users
        WHERE id = $1;
    `;

  const result = await pool.query(query, [userId]);

  return result.rows[0] || null;
};

/**
 * Find a user by email address.
 *
 * This is useful during:
 *
 * - Local login
 * - Signup checks
 * - Google account linking
 * - Password reset
 *
 * @param {string} email
 *
 * @returns {Object|null} User or null if not found
 */
const getUserByEmail = async (email) => {
  const query = `
        SELECT
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at
        FROM users
        WHERE email = $1;
    `;

  const result = await pool.query(query, [email]);

  return result.rows[0] || null;
};

/**
 * Find a user by their Google subject identifier.
 *
 * google_sub is the stable identifier assigned to the user's
 * Google account.
 *
 * It should be obtained from a verified Google identity token.
 *
 * @param {string} googleSub
 *
 * @returns {Object|null} User or null if not found
 */
const getUserByGoogleSub = async (googleSub) => {
  const query = `
        SELECT
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at
        FROM users
        WHERE google_sub = $1;
    `;

  const result = await pool.query(query, [googleSub]);

  return result.rows[0] || null;
};

/**
 * Update basic user profile information.
 *
 * Authentication credentials are intentionally not updated here.
 * Password and Google-account changes have their own functions.
 *
 * @param {string} userId
 * @param {Object} data
 * @param {string} data.name
 *
 * @returns {Object|null} Updated user
 */
const updateUser = async (userId, { name }) => {
  const query = `
        UPDATE users
        SET
            name = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [name, userId]);

  return result.rows[0] || null;
};

/**
 * Update the stored password hash.
 *
 * The service layer is responsible for hashing the password.
 *
 * @param {string} userId
 * @param {string} passwordHash
 *
 * @returns {Object|null} Updated user
 */
const updatePasswordHash = async (userId, passwordHash) => {
  const query = `
        UPDATE users
        SET
            password_hash = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [passwordHash, userId]);

  return result.rows[0] || null;
};

/**
 * Link a Google account to an existing user.
 *
 * This is used when an existing local user successfully
 * authenticates with Google and the application decides that
 * the Google identity should be linked to the same account.
 *
 * The function does not create another user.
 *
 * @param {string} userId
 * @param {string} googleSub
 *
 * @returns {Object|null} Updated user
 */
const linkGoogleAccount = async (userId, googleSub) => {
  const query = `
        UPDATE users
        SET
            google_sub = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [googleSub, userId]);

  return result.rows[0] || null;
};

/**
 * Remove Google login from a user account.
 *
 * The database constraint prevents the account from ending up
 * without any authentication method.
 *
 * Therefore this operation will fail if the user has no
 * password_hash either.
 *
 * @param {string} userId
 *
 * @returns {Object|null} Updated user
 */
const unlinkGoogleAccount = async (userId) => {
  const query = `
        UPDATE users
        SET
            google_sub = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [userId]);

  return result.rows[0] || null;
};

/**
 * Mark the user's email as verified.
 *
 * @param {string} userId
 *
 * @returns {Object|null} Updated user
 */
const markEmailAsVerified = async (userId) => {
  const query = `
        UPDATE users
        SET
            email_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [userId]);

  return result.rows[0] || null;
};

/**
 * Update the user's last login timestamp.
 *
 * This should be called after a successful authentication.
 *
 * @param {string} userId
 *
 * @returns {Object|null} Updated user
 */
const updateLastLogin = async (userId) => {
  const query = `
        UPDATE users
        SET
            last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [userId]);

  return result.rows[0] || null;
};

/**
 * Update the user's account status.
 *
 * Examples:
 *
 * ACTIVE
 * SUSPENDED
 * DISABLED
 *
 * The service layer should decide which status transitions
 * are allowed.
 *
 * @param {string} userId
 * @param {string} status
 *
 * @returns {Object|null} Updated user
 */
const updateUserStatus = async (userId, status) => {
  const query = `
        UPDATE users
        SET
            status = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
            id,
            email,
            password_hash,
            google_sub,
            name,
            status,
            email_verified_at,
            last_login_at,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [status, userId]);

  return result.rows[0] || null;
};

/**
 * Delete a user by ID.
 *
 * User deletion is intentionally kept as a repository operation
 * but should normally be controlled by service-level business
 * rules. For example, production systems may prefer disabling
 * an account instead of physically deleting it.
 *
 * @param {string} userId
 *
 * @returns {boolean} True if a user was deleted
 */
const deleteUser = async (userId) => {
  const query = `
        DELETE FROM users
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [userId]);

  return result.rowCount > 0;
};

/**
 * Export user repository functions.
 */
module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleSub,
  updateUser,
  updatePasswordHash,
  linkGoogleAccount,
  unlinkGoogleAccount,
  markEmailAsVerified,
  updateLastLogin,
  updateUserStatus,
  deleteUser,
};
