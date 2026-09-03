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
 * The repository only handles persistence and cache access.
 * Authentication rules, password verification, Google token
 * verification, account linking decisions, and authorization
 * belong to the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const USER_CACHE_TTL = 60;

/**
 * Build Redis keys for the different ways a user can be found.
 */
const buildUserIdCacheKey = (userId) => `user:${userId}`;

const buildUserEmailCacheKey = (email) => `user:email:${email}`;

const buildUserGoogleCacheKey = (googleSub) => `user:google:${googleSub}`;

/**
 * Invalidate every cache key that can reference a user.
 *
 * The values from the database result are used so that old
 * email/google keys are also removed when those values change.
 */
const invalidateUserCache = async (user) => {
  const keys = [buildUserIdCacheKey(user.id)];

  if (user.email) {
    keys.push(buildUserEmailCacheKey(user.email));
  }

  if (user.google_sub) {
    keys.push(buildUserGoogleCacheKey(user.google_sub));
  }

  await Promise.all(keys.map((key) => deleteCache(key)));
};

/**
 * Cache a user under all supported lookup keys.
 */
const cacheUser = async (user) => {
  const cacheOperations = [
    setCache(buildUserIdCacheKey(user.id), user, USER_CACHE_TTL),
  ];

  if (user.email) {
    cacheOperations.push(
      setCache(buildUserEmailCacheKey(user.email), user, USER_CACHE_TTL),
    );
  }

  if (user.google_sub) {
    cacheOperations.push(
      setCache(buildUserGoogleCacheKey(user.google_sub), user, USER_CACHE_TTL),
    );
  }

  await Promise.all(cacheOperations);
};

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
 * Redis is checked first. PostgreSQL is used when the cache
 * does not contain the user.
 *
 * @param {string} userId
 *
 * @returns {Object|null} User or null if not found
 */
const getUserById = async (userId) => {
  const cacheKey = buildUserIdCacheKey(userId);

  try {
    const cachedUser = await getCache(cacheKey);

    if (cachedUser !== null) {
      return cachedUser;
    }
  } catch (error) {
    console.error("User cache read failed:", error);
  }

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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await cacheUser(user);
    } catch (error) {
      console.error("User cache write failed:", error);
    }
  }

  return user;
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
  const cacheKey = buildUserEmailCacheKey(email);

  try {
    const cachedUser = await getCache(cacheKey);

    if (cachedUser !== null) {
      return cachedUser;
    }
  } catch (error) {
    console.error("User email cache read failed:", error);
  }

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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await cacheUser(user);
    } catch (error) {
      console.error("User email cache write failed:", error);
    }
  }

  return user;
};

/**
 * Find a user by their Google subject identifier.
 *
 * google_sub is the stable identifier assigned to the user's
 * Google account.
 *
 * @param {string} googleSub
 *
 * @returns {Object|null} User or null if not found
 */
const getUserByGoogleSub = async (googleSub) => {
  const cacheKey = buildUserGoogleCacheKey(googleSub);

  try {
    const cachedUser = await getCache(cacheKey);

    if (cachedUser !== null) {
      return cachedUser;
    }
  } catch (error) {
    console.error("User Google cache read failed:", error);
  }

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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await cacheUser(user);
    } catch (error) {
      console.error("User Google cache write failed:", error);
    }
  }

  return user;
};

/**
 * Update basic user profile information.
 *
 * Authentication credentials are intentionally not updated here.
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
};

/**
 * Link a Google account to an existing user.
 *
 * The old user cache is invalidated after the database update.
 * The next lookup will repopulate Redis with the new google_sub.
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
};

/**
 * Remove Google login from a user account.
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
};

/**
 * Update the user's last login timestamp.
 *
 * This changes the cached user object, so the old cache must
 * be invalidated after the database update.
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
};

/**
 * Update the user's account status.
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
  const user = result.rows[0] || null;

  if (user) {
    try {
      await invalidateUserCache(user);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

  return user;
};

/**
 * Delete a user by ID.
 *
 * The user is loaded before deletion so all lookup keys can
 * be invalidated after the database deletion succeeds.
 *
 * @param {string} userId
 *
 * @returns {boolean} True if a user was deleted
 */
const deleteUser = async (userId) => {
  const existingUser = await getUserById(userId);

  const query = `
        DELETE FROM users
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [userId]);

  if (result.rowCount > 0 && existingUser) {
    try {
      await invalidateUserCache(existingUser);
    } catch (error) {
      console.error("User cache invalidation failed:", error);
    }
  }

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
