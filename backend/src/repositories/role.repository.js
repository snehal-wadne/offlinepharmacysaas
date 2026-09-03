/**
 * Role Repository
 *
 * Purpose:
 * Handles direct database operations related to organisation roles
 * and the permissions assigned to those roles.
 *
 * A role belongs to an organisation.
 *
 * Example:
 *
 * Organisation
 *      |
 *      +--- Manager
 *      |      |
 *      |      +--- CREATE_INVOICE
 *      |      +--- VIEW_INVENTORY
 *      |
 *      +--- Cashier
 *             |
 *             +--- CREATE_INVOICE
 *
 * The roles table stores the role itself.
 *
 * The role_permissions table connects roles with permissions.
 * It is a junction table because one role can have many
 * permissions and one permission can belong to many roles.
 *
 * This repository handles database persistence only.
 * Authorization decisions and business rules belong in the
 * service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a role for an organisation.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.name
 * @param {string|null} data.description
 * @param {boolean} data.isSystemRole
 *
 * @returns {Object} Created role
 */
const createRole = async ({
  organisationId,
  name,
  description = null,
  isSystemRole = false,
}) => {
  const query = `
        INSERT INTO roles (
            organisation_id,
            name,
            description,
            is_system_role
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            organisation_id,
            name,
            description,
            is_system_role,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [
    organisationId,
    name,
    description,
    isSystemRole,
  ]);

  return result.rows[0];
};

/**
 * Get a role by its ID.
 *
 * @param {string} roleId
 *
 * @returns {Object|null} Role or null if not found
 */
const getRoleById = async (roleId) => {
  const query = `
        SELECT
            id,
            organisation_id,
            name,
            description,
            is_system_role,
            created_at,
            updated_at
        FROM roles
        WHERE id = $1;
    `;

  const result = await pool.query(query, [roleId]);

  return result.rows[0] || null;
};

/**
 * Get all roles belonging to an organisation.
 *
 * The organisation ID is deliberately required so that this
 * query cannot accidentally return roles belonging to another
 * tenant.
 *
 * @param {string} organisationId
 *
 * @returns {Array} Organisation roles
 */
const getOrganisationRoles = async (organisationId) => {
  const query = `
        SELECT
            id,
            organisation_id,
            name,
            description,
            is_system_role,
            created_at,
            updated_at
        FROM roles
        WHERE organisation_id = $1
        ORDER BY created_at ASC;
    `;

  const result = await pool.query(query, [organisationId]);

  return result.rows;
};

/**
 * Update a role's name and description.
 *
 * The service layer should decide whether the current user
 * is allowed to modify the role.
 *
 * @param {string} roleId
 * @param {Object} data
 * @param {string} data.name
 * @param {string|null} data.description
 *
 * @returns {Object|null} Updated role
 */
const updateRole = async (roleId, { name, description = null }) => {
  const query = `
        UPDATE roles
        SET
            name = $1,
            description = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING
            id,
            organisation_id,
            name,
            description,
            is_system_role,
            created_at,
            updated_at;
    `;

  const result = await pool.query(query, [name, description, roleId]);

  return result.rows[0] || null;
};

/**
 * Delete a role.
 *
 * role_permissions records referencing this role are removed
 * automatically because the schema uses ON DELETE CASCADE.
 *
 * The service layer should determine whether deletion is allowed.
 *
 * @param {string} roleId
 *
 * @returns {boolean} True if the role was deleted
 */
const deleteRole = async (roleId) => {
  const query = `
        DELETE FROM roles
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [roleId]);

  return result.rowCount > 0;
};

/**
 * Assign a permission to a role.
 *
 * role_permissions has a composite primary key:
 *
 *     (role_id, permission_id)
 *
 * Therefore the same permission cannot be assigned to the
 * same role more than once.
 *
 * ON CONFLICT DO NOTHING makes this operation idempotent.
 * Calling it twice produces the same final relationship.
 *
 * @param {string} roleId
 * @param {string} permissionId
 *
 * @returns {Object|null} Created relationship or null if it already exists
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

  return result.rows[0] || null;
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

  return result.rowCount > 0;
};

/**
 * Get all permissions assigned to a role.
 *
 * This joins role_permissions with permissions because the
 * junction table only stores the relationship IDs.
 *
 * @param {string} roleId
 *
 * @returns {Array} Permissions assigned to the role
 */
const getRolePermissions = async (roleId) => {
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

  return result.rows;
};

/**
 * Get all roles that have a specific permission.
 *
 * Example:
 *
 * If CREATE_INVOICE is assigned to:
 *
 *     Manager
 *     Cashier
 *
 * this function returns both roles.
 *
 * @param {string} permissionId
 *
 * @returns {Array} Roles having the permission
 */
const getRolesWithPermission = async (permissionId) => {
  const query = `
        SELECT
            r.id,
            r.organisation_id,
            r.name,
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

  return result.rows;
};

/**
 * Check whether a role has a particular permission.
 *
 * This returns a boolean instead of the permission record
 * because the main purpose of this function is authorization
 * checks.
 *
 * @param {string} roleId
 * @param {string} permissionId
 *
 * @returns {boolean} True if the role has the permission
 */
const hasRolePermission = async (roleId, permissionId) => {
  const query = `
        SELECT EXISTS (
            SELECT 1
            FROM role_permissions
            WHERE role_id = $1
              AND permission_id = $2
        ) AS has_permission;
    `;

  const result = await pool.query(query, [roleId, permissionId]);

  return result.rows[0].has_permission;
};

/**
 * Export role repository functions.
 */
module.exports = {
  createRole,
  getRoleById,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  removePermissionFromRole,
  getRolePermissions,
  getRolesWithPermission,
  hasRolePermission,
};
