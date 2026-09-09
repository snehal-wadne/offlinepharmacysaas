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
 * Transaction clients bypass the Redis cache to ensure read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const { PERMISSION_DOMAINS } = require("../db/permission-catalogue");

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
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Created permission
 */
const createPermission = async ({ name, description }, client = pool) => {
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

  const result = await client.query(query, [name, description]);

  const permission = result.rows[0];

  try {
    await deleteCache(PERMISSION_ALL_CACHE_KEY);
  } catch (error) {
    console.error("Permission list cache invalidation failed:", error.message);
  }

  return permission;
};

/**
 * Get a permission by its ID.
 *
 * @param {string} permissionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Permission or null if not found
 */
const getPermissionById = async (permissionId, client = pool) => {
  const cacheKey = buildPermissionCacheKey(permissionId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedPermission = await getCache(cacheKey);

      if (cachedPermission !== null) {
        return cachedPermission;
      }
    } catch (error) {
      console.error("Permission cache read failed:", error.message);
    }
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

  const result = await client.query(query, [permissionId]);

  const permission = result.rows[0] || null;

  if (useCache && permission) {
    try {
      await setCache(cacheKey, permission, PERMISSION_CACHE_TTL);
    } catch (error) {
      console.error("Permission cache write failed:", error.message);
    }
  }

  return permission;
};

/**
 * Get a permission by its unique name.
 *
 * @param {string} name
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Permission or null if not found
 */
const getPermissionByName = async (name, client = pool) => {
  const cacheKey = buildPermissionNameCacheKey(name);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedPermission = await getCache(cacheKey);

      if (cachedPermission !== null) {
        return cachedPermission;
      }
    } catch (error) {
      console.error("Permission name cache read failed:", error.message);
    }
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

  const result = await client.query(query, [name]);

  const permission = result.rows[0] || null;

  if (useCache && permission) {
    try {
      await setCache(cacheKey, permission, PERMISSION_CACHE_TTL);
    } catch (error) {
      console.error("Permission name cache write failed:", error.message);
    }
  }

  return permission;
};

/**
 * Get all permissions.
 *
 * Permissions are global, so no organisation ID is required.
 *
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} All permissions
 */
const getAllPermissions = async (client = pool) => {
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedPermissions = await getCache(PERMISSION_ALL_CACHE_KEY);

      if (cachedPermissions !== null) {
        return cachedPermissions;
      }
    } catch (error) {
      console.error("All permissions cache read failed:", error.message);
    }
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

  const result = await client.query(query);

  const permissions = result.rows;

  if (useCache && permissions) {
    try {
      await setCache(
        PERMISSION_ALL_CACHE_KEY,
        permissions,
        PERMISSION_CACHE_TTL,
      );
    } catch (error) {
      console.error("All permissions cache write failed:", error.message);
    }
  }

  return permissions;
};

/**
 * Get permissions matching a list of unique names.
 *
 * @param {Array<string>} names
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Matching permissions
 */
const getPermissionsByNames = async (names, client = pool) => {
  if (!names || names.length === 0) {
    return [];
  }

  const query = `
    SELECT
      id,
      name,
      description,
      created_at,
      updated_at
    FROM permissions
    WHERE name = ANY($1::varchar[])
    ORDER BY name ASC;
  `;

  const result = await client.query(query, [names]);
  return result.rows;
};

/**
 * Get permissions grouped by their functional domain for dashboard UI display.
 *
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Object whose keys are domain names and values are permission arrays
 */
const getPermissionsGrouped = async (client = pool) => {
  const allPermissions = await getAllPermissions(client);
  const permMap = new Map(allPermissions.map((p) => [p.name, p]));

  const grouped = {};
  for (const [domain, permNames] of Object.entries(PERMISSION_DOMAINS)) {
    grouped[domain] = permNames
      .map((name) => {
        const found = permMap.get(name);
        return found ? { ...found, domain } : null;
      })
      .filter(Boolean);
  }

  return grouped;
};

/**
 * Get permissions filtered by a specific domain.
 *
 * @param {string} domain
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Array of permissions in the given domain
 */
const getPermissionsByDomain = async (domain, client = pool) => {
  const domainPermNames = PERMISSION_DOMAINS[domain];
  if (!domainPermNames || domainPermNames.length === 0) {
    return [];
  }

  return await getPermissionsByNames(domainPermNames, client);
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
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Updated permission
 */
const updatePermission = async (
  permissionId,
  { name, description },
  client = pool,
) => {
  const existingPermission = await getPermissionById(permissionId, client);

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

  const result = await client.query(query, [name, description, permissionId]);

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
      console.error("Permission cache invalidation failed:", error.message);
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
 * @param {Object} [client=pool]
 *
 * @returns {Promise<boolean>} True if the permission was deleted
 */
const deletePermission = async (permissionId, client = pool) => {
  const existingPermission = await getPermissionById(permissionId, client);

  const query = `
    DELETE FROM permissions
    WHERE id = $1
    RETURNING id;
  `;

  const result = await client.query(query, [permissionId]);

  if (result.rowCount > 0 && existingPermission) {
    try {
      await Promise.all([
        deleteCache(buildPermissionCacheKey(existingPermission.id)),
        deleteCache(buildPermissionNameCacheKey(existingPermission.name)),
        deleteCache(PERMISSION_ALL_CACHE_KEY),
      ]);
    } catch (error) {
      console.error("Permission cache invalidation failed:", error.message);
    }
  }

  return result.rowCount > 0;
};

module.exports = {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
  getPermissionsByNames,
  getPermissionsGrouped,
  getPermissionsByDomain,
  updatePermission,
  deletePermission,
};
