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
 * Transaction clients bypass the Redis cache to ensure read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const {
  invalidateBranchManagementDashboardCache,
} = require("./branch-management-dashboard.repository");
const {
  SYSTEM_ROLES,
  ROLE_DEFAULT_PERMISSIONS,
} = require("../db/permission-catalogue");

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
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object>} Created role
 */
const createRole = async (
  {
    organisationId,
    name,
    roleIdentifier = null,
    clearanceLevel = "STANDARD_POS",
    description = null,
    isSystemRole = false,
  },
  client = pool,
) => {
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

  const result = await client.query(query, [
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
    console.error(
      "Organisation roles cache invalidation failed:",
      error.message,
    );
  }

  return role;
};

/**
 * Get a role by its ID.
 *
 * @param {string} roleId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Role or null if not found
 */
const getRoleById = async (roleId, client = pool) => {
  const cacheKey = buildRoleCacheKey(roleId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedRole = await getCache(cacheKey);

      if (cachedRole !== null) {
        return cachedRole;
      }
    } catch (error) {
      console.error("Role cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE id = $1;
  `;

  const result = await client.query(query, [roleId]);

  const role = result.rows[0] || null;

  if (useCache && role) {
    try {
      await setCache(cacheKey, role, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Role cache write failed:", error.message);
    }
  }

  return role;
};

/**
 * Get a role by its identifier within an organisation.
 *
 * @param {string} organisationId
 * @param {string} roleIdentifier
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Role or null if not found
 */
const getRoleByIdentifier = async (
  organisationId,
  roleIdentifier,
  client = pool,
) => {
  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE organisation_id = $1
      AND role_identifier = $2;
  `;

  const result = await client.query(query, [organisationId, roleIdentifier]);
  return result.rows[0] || null;
};

/**
 * Get all roles belonging to an organisation.
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Organisation roles
 */
const getOrganisationRoles = async (organisationId, client = pool) => {
  const cacheKey = buildOrganisationRolesCacheKey(organisationId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedRoles = await getCache(cacheKey);

      if (cachedRoles !== null) {
        return cachedRoles;
      }
    } catch (error) {
      console.error("Organisation roles cache read failed:", error.message);
    }
  }

  const query = `
    SELECT
      ${ROLE_COLUMNS}
    FROM roles
    WHERE organisation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await client.query(query, [organisationId]);

  const roles = result.rows;

  if (useCache && roles) {
    try {
      await setCache(cacheKey, roles, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Organisation roles cache write failed:", error.message);
    }
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
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Updated role
 */
const updateRole = async (
  roleId,
  { name, description = null, roleIdentifier, clearanceLevel } = {},
  client = pool,
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

  const result = await client.query(query, [
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
      console.error("Role cache invalidation failed:", error.message);
    }
  }

  return role;
};

/**
 * Delete a role.
 *
 * @param {string} roleId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<boolean>} True if the role was deleted
 */
const deleteRole = async (roleId, client = pool) => {
  const existingRole = await getRoleById(roleId, client);

  const query = `
    DELETE FROM roles
    WHERE id = $1
    RETURNING id;
  `;

  const result = await client.query(query, [roleId]);

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
      console.error("Role cache invalidation failed:", error.message);
    }
  }

  return result.rowCount > 0;
};

/**
 * Assign a permission to a role.
 *
 * @param {string} roleId
 * @param {string} permissionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Created relationship
 */
const assignPermissionToRole = async (roleId, permissionId, client = pool) => {
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

  const result = await client.query(query, [roleId, permissionId]);

  const assignment = result.rows[0] || null;

  if (assignment) {
    try {
      await Promise.all([
        deleteCache(buildRolePermissionsCacheKey(roleId)),
        deleteCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
        deleteCache(buildPermissionRolesCacheKey(permissionId)),
      ]);
    } catch (error) {
      console.error(
        "Role permission cache invalidation failed:",
        error.message,
      );
    }
  }

  return assignment;
};

/**
 * Bulk assign multiple permissions to a role.
 *
 * @param {string} roleId
 * @param {Array<string>} permissionIds
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Created assignments
 */
const assignPermissionsToRole = async (
  roleId,
  permissionIds,
  client = pool,
) => {
  if (!permissionIds || permissionIds.length === 0) {
    return [];
  }

  const query = `
    INSERT INTO role_permissions (
      role_id,
      permission_id
    )
    SELECT $1, unnest($2::uuid[])
    ON CONFLICT (role_id, permission_id)
    DO NOTHING
    RETURNING
      role_id,
      permission_id;
  `;

  const result = await client.query(query, [roleId, permissionIds]);

  try {
    const invalidations = [
      deleteCache(buildRolePermissionsCacheKey(roleId)),
      ...permissionIds.map((pId) =>
        deleteCache(buildRolePermissionCheckCacheKey(roleId, pId)),
      ),
      ...permissionIds.map((pId) =>
        deleteCache(buildPermissionRolesCacheKey(pId)),
      ),
    ];
    await Promise.all(invalidations);
  } catch (error) {
    console.error(
      "Bulk role permission cache invalidation failed:",
      error.message,
    );
  }

  return result.rows;
};

/**
 * Synchronize permissions for a custom role.
 * Removes unlisted permissions and attaches new ones.
 *
 * @param {string} roleId
 * @param {Array<string>} permissionIds
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Current assigned permissions
 */
const syncRolePermissions = async (
  roleId,
  permissionIds = [],
  client = pool,
) => {
  if (!permissionIds || permissionIds.length === 0) {
    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [
      roleId,
    ]);
  } else {
    await client.query(
      `DELETE FROM role_permissions
       WHERE role_id = $1
         AND permission_id <> ALL($2::uuid[])`,
      [roleId, permissionIds],
    );

    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionIds],
    );
  }

  try {
    await deleteCache(buildRolePermissionsCacheKey(roleId));
  } catch (error) {
    console.error(
      "Sync role permissions cache invalidation failed:",
      error.message,
    );
  }

  return await getRolePermissions(roleId, client);
};

/**
 * Remove a permission from a role.
 *
 * @param {string} roleId
 * @param {string} permissionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<boolean>} True if the relationship was removed
 */
const removePermissionFromRole = async (
  roleId,
  permissionId,
  client = pool,
) => {
  const query = `
    DELETE FROM role_permissions
    WHERE role_id = $1
      AND permission_id = $2
    RETURNING
      role_id,
      permission_id;
  `;

  const result = await client.query(query, [roleId, permissionId]);

  if (result.rowCount > 0) {
    try {
      await Promise.all([
        deleteCache(buildRolePermissionsCacheKey(roleId)),
        deleteCache(buildRolePermissionCheckCacheKey(roleId, permissionId)),
        deleteCache(buildPermissionRolesCacheKey(permissionId)),
      ]);
    } catch (error) {
      console.error(
        "Role permission cache invalidation failed:",
        error.message,
      );
    }
  }

  return result.rowCount > 0;
};

/**
 * Get all permissions assigned to a role.
 *
 * @param {string} roleId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Permissions assigned to the role
 */
const getRolePermissions = async (roleId, client = pool) => {
  const cacheKey = buildRolePermissionsCacheKey(roleId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedPermissions = await getCache(cacheKey);

      if (cachedPermissions !== null) {
        return cachedPermissions;
      }
    } catch (error) {
      console.error("Role permissions cache read failed:", error.message);
    }
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

  const result = await client.query(query, [roleId]);

  const permissions = result.rows;

  if (useCache && permissions) {
    try {
      await setCache(cacheKey, permissions, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Role permissions cache write failed:", error.message);
    }
  }

  return permissions;
};

/**
 * Get a role with its full list of assigned permissions.
 *
 * @param {string} roleId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>} Role with permissions or null if not found
 */
const getRoleWithPermissions = async (roleId, client = pool) => {
  const role = await getRoleById(roleId, client);
  if (!role) {
    return null;
  }

  const permissions = await getRolePermissions(roleId, client);
  return {
    ...role,
    permissions,
    permission_count: permissions.length,
  };
};

/**
 * Get all roles that have a specific permission.
 *
 * @param {string} permissionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Roles having the permission
 */
const getRolesWithPermission = async (permissionId, client = pool) => {
  const cacheKey = buildPermissionRolesCacheKey(permissionId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedRoles = await getCache(cacheKey);

      if (cachedRoles !== null) {
        return cachedRoles;
      }
    } catch (error) {
      console.error("Permission roles cache read failed:", error.message);
    }
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

  const result = await client.query(query, [permissionId]);

  const roles = result.rows;

  if (useCache && roles) {
    try {
      await setCache(cacheKey, roles, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Permission roles cache write failed:", error.message);
    }
  }

  return roles;
};

/**
 * Check whether a role has a particular permission.
 *
 * @param {string} roleId
 * @param {string} permissionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<boolean>} True if the role has the permission
 */
const hasRolePermission = async (roleId, permissionId, client = pool) => {
  const cacheKey = buildRolePermissionCheckCacheKey(roleId, permissionId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cachedResult = await getCache(cacheKey);

      if (cachedResult !== null) {
        return cachedResult;
      }
    } catch (error) {
      console.error("Role permission check cache read failed:", error.message);
    }
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM role_permissions
      WHERE role_id = $1
        AND permission_id = $2
    ) AS has_permission;
  `;

  const result = await client.query(query, [roleId, permissionId]);

  const hasPermission = result.rows[0].has_permission;

  if (useCache) {
    try {
      await setCache(cacheKey, hasPermission, ROLE_CACHE_TTL);
    } catch (error) {
      console.error("Role permission check cache write failed:", error.message);
    }
  }

  return hasPermission;
};

/**
 * Provision / Seed the 6 authoritative system roles and their default permissions
 * for a specific organisation. Idempotent and safe to run multiple times.
 *
 * Reconciles legacy 'Billing / Cashier' role name to 'Cashier'.
 * Preserves custom roles and custom role permissions.
 *
 * @param {string} organisationId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} Seeded/updated system roles
 */
const seedOrganisationSystemRoles = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required for system role seeding.");
  }

  // 1. Fetch all permissions map: name -> id
  const permsRes = await client.query("SELECT id, name FROM permissions");
  const permMap = new Map(permsRes.rows.map((p) => [p.name, p.id]));

  const seededRoles = [];

  for (const sysRole of SYSTEM_ROLES) {
    let roleId = null;

    // 2a. Check if role exists by identifier in this organisation
    const existingById = await client.query(
      `SELECT id, name, role_identifier, clearance_level, is_system_role
       FROM roles
       WHERE organisation_id = $1 AND role_identifier = $2`,
      [organisationId, sysRole.identifier],
    );

    if (existingById.rows.length > 0) {
      const existing = existingById.rows[0];
      roleId = existing.id;

      // Update name if legacy (e.g. 'Billing / Cashier' -> 'Cashier') or if description/clearance needs refresh
      await client.query(
        `UPDATE roles
         SET name = $1,
             clearance_level = $2,
             description = $3,
             is_system_role = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [sysRole.name, sysRole.clearance, sysRole.description, roleId],
      );
    } else {
      // 2b. Check if role exists by name (e.g. un-identified legacy role or legacy 'Billing / Cashier')
      const legacyName =
        sysRole.identifier === "CASHIER" ? "Billing / Cashier" : sysRole.name;
      const existingByName = await client.query(
        `SELECT id, name, role_identifier, clearance_level, is_system_role
         FROM roles
         WHERE organisation_id = $1 AND name = ANY($2::varchar[])`,
        [organisationId, [sysRole.name, legacyName]],
      );

      if (existingByName.rows.length > 0) {
        const existing = existingByName.rows[0];
        roleId = existing.id;

        await client.query(
          `UPDATE roles
           SET name = $1,
               role_identifier = $2,
               clearance_level = $3,
               description = $4,
               is_system_role = TRUE,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            sysRole.name,
            sysRole.identifier,
            sysRole.clearance,
            sysRole.description,
            roleId,
          ],
        );
      } else {
        // 2c. Insert missing system role
        const inserted = await client.query(
          `INSERT INTO roles (
             organisation_id,
             name,
             role_identifier,
             clearance_level,
             description,
             is_system_role
           )
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING id`,
          [
            organisationId,
            sysRole.name,
            sysRole.identifier,
            sysRole.clearance,
            sysRole.description,
          ],
        );
        roleId = inserted.rows[0].id;
      }
    }

    // 3. Attach default permissions for this system role
    const defaultPermNames = ROLE_DEFAULT_PERMISSIONS[sysRole.identifier] || [];
    const targetPermIds = defaultPermNames
      .map((name) => permMap.get(name))
      .filter(Boolean);

    if (targetPermIds.length > 0) {
      // Ensure system role does not retain removed system permissions
      await client.query(
        `DELETE FROM role_permissions
         WHERE role_id = $1
           AND permission_id <> ALL($2::uuid[])`,
        [roleId, targetPermIds],
      );

      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, targetPermIds],
      );
    }

    seededRoles.push({
      id: roleId,
      name: sysRole.name,
      role_identifier: sysRole.identifier,
      clearance_level: sysRole.clearance,
      permission_count: targetPermIds.length,
    });
  }

  // Invalidate organisation role caches
  try {
    await Promise.all([
      deleteCache(buildOrganisationRolesCacheKey(organisationId)),
      invalidateBranchManagementDashboardCache(organisationId, {
        staff: true,
        role: true,
      }),
    ]);
  } catch (error) {
    console.error(
      "Seeded organisation roles cache invalidation failed:",
      error.message,
    );
  }

  return seededRoles;
};

module.exports = {
  createRole,
  getRoleById,
  getRoleByIdentifier,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  assignPermissionsToRole,
  syncRolePermissions,
  removePermissionFromRole,
  getRolePermissions,
  getRoleWithPermissions,
  getRolesWithPermission,
  hasRolePermission,
  seedOrganisationSystemRoles,
};
