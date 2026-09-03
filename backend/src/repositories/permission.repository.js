/**
 * Permission Repository
 *
 * Purpose:
 * Handles direct database operations for permissions.
 *
 * Permissions represent individual capabilities available
 * inside the application.
 *
 * Permissions are global definitions and are not owned by
 * a particular organisation.
 *
 * This repository handles persistence and cache access.
 * Authorization and business rules belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const PERMISSION_CACHE_TTL = 60;

/**
 * Build Redis cache keys.
 */
const buildPermissionCacheKey = (permissionId) => `permission:${permissionId}`;

const buildPermissionNameCacheKey = (name) => `permission:name:${name}`;

const PERMISSION_ALL_CACHE_KEY = "permission:all";

/**
 * Create a permission.
 *
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.description
 *
 * @returns {Object} Created permission
 */
const createPermission = async ({ name, description }) => {
  const query = `
    INSERT INTO permissions (
      name,
      description
    )
    VALUES ($1, $2)
    RETURNING
      id,
      name,
      description,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, [name, description]);

  const permission = result.rows[0];

  try {
    await deleteCache(PERMISSION_ALL_CACHE_KEY);
  } catch (error) {
    console.error("Permission list cache invalidation failed:", error);
  }

  return permission;
};

/**
 * Get a permission by its ID.
 *
 * @param {string} permissionId
 *
 * @returns {Object|null} Permission or null if not found
 */
const getPermissionById = async (permissionId) => {
  const cacheKey = buildPermissionCacheKey(permissionId);

  try {
    const cachedPermission = await getCache(cacheKey);

    if (cachedPermission !== null) {
      return cachedPermission;
    }
  } catch (error) {
    console.error("Permission cache read failed:", error);
  }

  const query = `
    SELECT
      id,
      name,
      description,
      created_at,
      updated_at
    FROM permissions
    WHERE id = $1;
  `;

  const result = await pool.query(query, [permissionId]);

  const permission = result.rows[0] || null;

  if (permission) {
    try {
      await setCache(cacheKey, permission, PERMISSION_CACHE_TTL);
    } catch (error) {
      console.error("Permission cache write failed:", error);
    }
  }

  return permission;
};

/**
 * Get a permission by its unique name.
 *
 * @param {string} name
 *
 * @returns {Object|null} Permission or null if not found
 */
const getPermissionByName = async (name) => {
  const cacheKey = buildPermissionNameCacheKey(name);

  try {
    const cachedPermission = await getCache(cacheKey);

    if (cachedPermission !== null) {
      return cachedPermission;
    }
  } catch (error) {
    console.error("Permission name cache read failed:", error);
  }

  const query = `
    SELECT
      id,
      name,
      description,
      created_at,
      updated_at
    FROM permissions
    WHERE name = $1;
  `;

  const result = await pool.query(query, [name]);

  const permission = result.rows[0] || null;

  if (permission) {
    try {
      await setCache(cacheKey, permission, PERMISSION_CACHE_TTL);
    } catch (error) {
      console.error("Permission name cache write failed:", error);
    }
  }

  return permission;
};

/**
 * Get all permissions.
 *
 * Permissions are global, so no organisation ID is required.
 *
 * @returns {Array} All permissions
 */
const getAllPermissions = async () => {
  try {
    const cachedPermissions = await getCache(PERMISSION_ALL_CACHE_KEY);

    if (cachedPermissions !== null) {
      return cachedPermissions;
    }
  } catch (error) {
    console.error("All permissions cache read failed:", error);
  }

  const query = `
    SELECT
      id,
      name,
      description,
      created_at,
      updated_at
    FROM permissions
    ORDER BY name ASC;
  `;

  const result = await pool.query(query);

  const permissions = result.rows;

  try {
    await setCache(PERMISSION_ALL_CACHE_KEY, permissions, PERMISSION_CACHE_TTL);
  } catch (error) {
    console.error("All permissions cache write failed:", error);
  }

  return permissions;
};

/**
 * Update a permission.
 *
 * The old permission is loaded first because its old name
 * may have an existing Redis lookup key.
 *
 * @param {string} permissionId
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.description
 *
 * @returns {Object|null} Updated permission
 */
const updatePermission = async (permissionId, { name, description }) => {
  const existingPermission = await getPermissionById(permissionId);

  const query = `
    UPDATE permissions
    SET
      name = $1,
      description = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING
      id,
      name,
      description,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, [name, description, permissionId]);

  const permission = result.rows[0] || null;

  if (permission) {
    try {
      const keys = [
        deleteCache(buildPermissionCacheKey(permission.id)),
        deleteCache(buildPermissionNameCacheKey(permission.name)),
        deleteCache(PERMISSION_ALL_CACHE_KEY),
      ];

      if (existingPermission && existingPermission.name !== permission.name) {
        keys.push(
          deleteCache(buildPermissionNameCacheKey(existingPermission.name)),
        );
      }

      await Promise.all(keys);
    } catch (error) {
      console.error("Permission cache invalidation failed:", error);
    }
  }

  return permission;
};

/**
 * Delete a permission.
 *
 * The permission is loaded first so both ID and name based
 * cache entries can be invalidated after deletion.
 *
 * @param {string} permissionId
 *
 * @returns {boolean} True if the permission was deleted
 */
const deletePermission = async (permissionId) => {
  const existingPermission = await getPermissionById(permissionId);

  const query = `
    DELETE FROM permissions
    WHERE id = $1
    RETURNING id;
  `;

  const result = await pool.query(query, [permissionId]);

  if (result.rowCount > 0 && existingPermission) {
    try {
      await Promise.all([
        deleteCache(buildPermissionCacheKey(existingPermission.id)),
        deleteCache(buildPermissionNameCacheKey(existingPermission.name)),
        deleteCache(PERMISSION_ALL_CACHE_KEY),
      ]);
    } catch (error) {
      console.error("Permission cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

module.exports = {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
  updatePermission,
  deletePermission,
};
