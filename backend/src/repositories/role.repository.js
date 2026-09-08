/**
 * Role Repository
 *
 * Purpose:
 * Handles direct database operations related to organisation roles
 * and the permissions assigned to those roles.
 *
 * A role belongs to an organisation.
 *
 * This repository handles database persistence and cache access.
 * Authorization decisions and business rules belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const {
  invalidateBranchManagementDashboardCache,
} = require("./branch-management-dashboard.repository");

const ROLE_CACHE_TTL = 60;

/**
 * Columns returned by role queries.
 * Explicitly includes role_identifier and clearance_level.
 */
const ROLE_COLUMNS = `
  id,
  organisation_id,
  name,
  role_identifier,
  clearance_level,
  description,
  is_system_role,
  created_at,
  updated_at
`;

/**
 * Build Redis cache keys.
 */
const buildRoleCacheKey = (roleId) => `role:${roleId}`;

const buildOrganisationRolesCacheKey = (organisationId) =>
  `role:organisation:${organisationId}`;

const buildRolePermissionsCacheKey = (roleId) => `role:permissions:${roleId}`;

const buildPermissionRolesCacheKey = (permissionId) =>
  `role:permission:${permissionId}`;

const buildRolePermissionCheckCacheKey = (roleId, permissionId) =>
  `role:has-permission:${roleId}:${permissionId}`;

/**
 * Create a role for an organisation.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.name
 * @param {string|null} [data.roleIdentifier]
 * @param {string} [data.clearanceLevel]
 * @param {string|null} [data.description]
 * @param {boolean} [data.isSystemRole]
 *
 * @returns {Object} Created role
 */
const createRole = async ({
  organisationId,
  name,
  roleIdentifier = null,
  clearanceLevel = "STANDARD_POS",
  description = null,
  isSystemRole = false,
}) => {
  const identifier =
    roleIdentifier ||
    name
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]+/g, "_");

  const query = `
    INSERT INTO roles (
      organisation_id,
      name,
      role_identifier,
      clearance_level,
      description,
      is_system_role
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      ${ROLE_COLUMNS};
  `;

  const result = await pool.query(query, [
    organisationId,
    name,
    identifier,
    clearanceLevel,
    description,
    isSystemRole,
  ]);

  const role = result.rows[0];

  try {
    await Promise.all([
      deleteCache(buildOrganisationRolesCacheKey(organisationId)),
      invalidateBranchManagementDashboardCache(organisationId, {
        staff: true,
        role: true,
      }),
    ]);
  } catch (error) {
    console.error("Organisation roles cache invalidation failed:", error);
  }

  return role;
};

/**
 * Get a role by its ID.
 *
 * @param {string} roleId
 *
 * @returns {Object|null} Role or null if not found
 */
const getRoleById = async (roleId) => {
  const cacheKey = buildRoleCacheKey(roleId);

  try {
    const cachedRole = await getCache(cacheKey);

    if (cachedRole !== null) {
      return cachedRole;
    }
  } catch (error) {
    console.error("Role cache read failed:", error);
  }

  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE id = $1;
  `;

  const result = await pool.query(query, [roleId]);

  const role = result.rows[0] || null;

  if (role) {
    try {
      await setCache(cacheKey, role, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Role cache write failed:", error);
    }
  }

  return role;
};

/**
 * Get a role by its identifier within an organisation.
 *
 * @param {string} organisationId
 * @param {string} roleIdentifier
 *
 * @returns {Object|null} Role or null if not found
 */
const getRoleByIdentifier = async (organisationId, roleIdentifier) => {
  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE organisation_id = $1
      AND role_identifier = $2;
  `;

  const result = await pool.query(query, [organisationId, roleIdentifier]);
  return result.rows[0] || null;
};

/**
 * Get all roles belonging to an organisation.
 *
 * @param {string} organisationId
 *
 * @returns {Array} Organisation roles
 */
const getOrganisationRoles = async (organisationId) => {
  const cacheKey = buildOrganisationRolesCacheKey(organisationId);

  try {
    const cachedRoles = await getCache(cacheKey);

    if (cachedRoles !== null) {
      return cachedRoles;
    }
  } catch (error) {
    console.error("Organisation roles cache read failed:", error);
  }

  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE organisation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await pool.query(query, [organisationId]);

  const roles = result.rows;

  try {
    await setCache(cacheKey, roles, ROLE_CACHE_TTL);
  } catch (error) {
    console.error("Organisation roles cache write failed:", error);
  }

  return roles;
};

/**
 * Update a role's information.
 *
 * @param {string} roleId
 * @param {Object} data
 * @param {string} [data.name]
 * @param {string|null} [data.description]
 * @param {string|null} [data.roleIdentifier]
 * @param {string|null} [data.clearanceLevel]
 *
 * @returns {Object|null} Updated role
 */
const updateRole = async (
  roleId,
  { name, description = null, roleIdentifier, clearanceLevel } = {},
) => {
  const query = `
    UPDATE roles
    SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      role_identifier = COALESCE($3, role_identifier),
      clearance_level = COALESCE($4, clearance_level),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING
      ${ROLE_COLUMNS};
  `;

  const result = await pool.query(query, [
    name !== undefined ? name : null,
    description !== undefined ? description : null,
    roleIdentifier !== undefined ? roleIdentifier : null,
    clearanceLevel !== undefined ? clearanceLevel : null,
    roleId,
  ]);

  const role = result.rows[0] || null;

  if (role) {
    try {
      await deleteCache(buildRoleCacheKey(role.id));

      await deleteCache(buildOrganisationRolesCacheKey(role.organisation_id));
      await invalidateBranchManagementDashboardCache(role.organisation_id, {
        staff: true,
        role: true,
      });
    } catch (error) {
      console.error("Role cache invalidation failed:", error);
    }
  }

  return role;
};

/**
 * Delete a role.
 *
 * @param {string} roleId
 *
 * @returns {boolean} True if the role was deleted
 */
const deleteRole = async (roleId) => {
  const existingRole = await getRoleById(roleId);

  const query = `
    DELETE FROM roles
    WHERE id = $1
    RETURNING id;
  `;

  const result = await pool.query(query, [roleId]);

  if (result.rowCount > 0 && existingRole) {
    try {
      await Promise.all([
        deleteCache(buildRoleCacheKey(existingRole.id)),
        deleteCache(
          buildOrganisationRolesCacheKey(existingRole.organisation_id),
        ),
        deleteCache(buildRolePermissionsCacheKey(existingRole.id)),
        invalidateBranchManagementDashboardCache(existingRole.organisation_id, {
          staff: true,
          role: true,
        }),
      ]);
    } catch (error) {
      console.error("Role cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

/**
 * Assign a permission to a role.
 *
 * @param {string} roleId
 * @param {string} permissionId
 *
 * @returns {Object|null} Created relationship
 */
const assignPermissionToRole = async (roleId, permissionId) => {
  const query = `
    INSERT INTO role_permissions (
      role_id,
      permission_id
    )
    VALUES ($1, $2)
    ON CONFLICT (role_id, permission_id)
    DO NOTHING
    RETURNING
      role_id,
      permission_id;
  `;

  const result = await pool.query(query, [roleId, permissionId]);

  const assignment = result.rows[0] || null;

  if (assignment) {
    try {
      await Promise.all([
        deleteCache(buildRolePermissionsCacheKey(roleId)),
        deleteCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
        deleteCache(buildPermissionRolesCacheKey(permissionId)),
      ]);
    } catch (error) {
      console.error("Role permission cache invalidation failed:", error);
    }
  }

  return assignment;
};

/**
 * Remove a permission from a role.
 *
 * @param {string} roleId
 * @param {string} permissionId
 *
 * @returns {boolean} True if the relationship was removed
 */
const removePermissionFromRole = async (roleId, permissionId) => {
  const query = `
    DELETE FROM role_permissions
    WHERE role_id = $1
      AND permission_id = $2
    RETURNING
      role_id,
      permission_id;
  `;

  const result = await pool.query(query, [roleId, permissionId]);

  if (result.rowCount > 0) {
    try {
      await Promise.all([
        deleteCache(buildRolePermissionsCacheKey(roleId)),
        deleteCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
        deleteCache(buildPermissionRolesCacheKey(permissionId)),
      ]);
    } catch (error) {
      console.error("Role permission cache invalidation failed:", error);
    }
  }

  return result.rowCount > 0;
};

/**
 * Get all permissions assigned to a role.
 *
 * @param {string} roleId
 *
 * @returns {Array} Permissions assigned to the role
 */
const getRolePermissions = async (roleId) => {
  const cacheKey = buildRolePermissionsCacheKey(roleId);

  try {
    const cachedPermissions = await getCache(cacheKey);

    if (cachedPermissions !== null) {
      return cachedPermissions;
    }
  } catch (error) {
    console.error("Role permissions cache read failed:", error);
  }

  const query = `
    SELECT
      p.id,
      p.name,
      p.description,
      p.created_at,
      p.updated_at
    FROM role_permissions rp
    INNER JOIN permissions p
      ON p.id = rp.permission_id
    WHERE rp.role_id = $1
    ORDER BY p.name ASC;
  `;

  const result = await pool.query(query, [roleId]);

  const permissions = result.rows;

  try {
    await setCache(cacheKey, permissions, ROLE_CACHE_TTL);
  } catch (error) {
    console.error("Role permissions cache write failed:", error);
  }

  return permissions;
};

/**
 * Get all roles that have a specific permission.
 *
 * @param {string} permissionId
 *
 * @returns {Array} Roles having the permission
 */
const getRolesWithPermission = async (permissionId) => {
  const cacheKey = buildPermissionRolesCacheKey(permissionId);

  try {
    const cachedRoles = await getCache(cacheKey);

    if (cachedRoles !== null) {
      return cachedRoles;
    }
  } catch (error) {
    console.error("Permission roles cache read failed:", error);
  }

  const query = `
    SELECT
      r.id,
      r.organisation_id,
      r.name,
      r.role_identifier,
      r.clearance_level,
      r.description,
      r.is_system_role,
      r.created_at,
      r.updated_at
    FROM role_permissions rp
    INNER JOIN roles r
      ON r.id = rp.role_id
    WHERE rp.permission_id = $1
    ORDER BY r.name ASC;
  `;

  const result = await pool.query(query, [permissionId]);

  const roles = result.rows;

  try {
    await setCache(cacheKey, roles, ROLE_CACHE_TTL);
  } catch (error) {
    console.error("Permission roles cache write failed:", error);
  }

  return roles;
};

/**
 * Check whether a role has a particular permission.
 *
 * @param {string} roleId
 * @param {string} permissionId
 *
 * @returns {boolean} True if the role has the permission
 */
const hasRolePermission = async (roleId, permissionId) => {
  const cacheKey = buildRolePermissionCheckCacheKey(roleId, permissionId);

  try {
    const cachedResult = await getCache(cacheKey);

    if (cachedResult !== null) {
      return cachedResult;
    }
  } catch (error) {
    console.error("Role permission check cache read failed:", error);
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM role_permissions
      WHERE role_id = $1
        AND permission_id = $2
    ) AS has_permission;
  `;

  const result = await pool.query(query, [roleId, permissionId]);

  const hasPermission = result.rows[0].has_permission;

  try {
    await setCache(cacheKey, hasPermission, ROLE_CACHE_TTL);
  } catch (error) {
    console.error("Role permission check cache write failed:", error);
  }

  return hasPermission;
};

module.exports = {
  createRole,
  getRoleById,
  getRoleByIdentifier,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  removePermissionFromRole,
  getRolePermissions,
  getRolesWithPermission,
  hasRolePermission,
};
