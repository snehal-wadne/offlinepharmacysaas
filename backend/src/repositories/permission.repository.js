/**
 * Permission Repository
 *
 * Purpose:
 * Handles direct database operations for permissions.
 *
 * Permissions represent individual capabilities available
 * inside the application.
 *
 * Examples:
 *
 * CREATE_INVOICE
 * VIEW_INVENTORY
 * ALLOW_REFUND
 * CREATE_PURCHASE
 *
 * Permissions are global definitions. They are not owned by
 * a particular organisation.
 *
 * Roles receive permissions through the role_permissions
 * junction table.
 *
 * This repository handles persistence only.
 * Authorization and business rules belong in the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a permission.
 *
 * Permission names must be unique according to the database
 * constraint on the permissions table.
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

  return result.rows[0];
};

/**
 * Get a permission by its ID.
 *
 * @param {string} permissionId
 *
 * @returns {Object|null} Permission or null if not found
 */
const getPermissionById = async (permissionId) => {
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

  return result.rows[0] || null;
};

/**
 * Get a permission by its unique name.
 *
 * Example:
 *
 *     CREATE_INVOICE
 *
 * This is useful when application code needs to resolve a
 * permission before assigning it to a role.
 *
 * @param {string} name
 *
 * @returns {Object|null} Permission or null if not found
 */
const getPermissionByName = async (name) => {
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

  return result.rows[0] || null;
};

/**
 * Get all permissions.
 *
 * Permissions are global, so no organisation ID is required.
 *
 * @returns {Array} All permissions
 */
const getAllPermissions = async () => {
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

  return result.rows;
};

/**
 * Update a permission.
 *
 * In production, permissions are normally treated as
 * controlled system definitions rather than user-editable data.
 *
 * This repository operation exists so the service layer can
 * decide whether a particular update is allowed.
 *
 * @param {string} permissionId
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.description
 *
 * @returns {Object|null} Updated permission
 */
const updatePermission = async (permissionId, { name, description }) => {
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

  return result.rows[0] || null;
};

/**
 * Delete a permission.
 *
 * Any role_permissions records referencing this permission
 * will be removed automatically when the database foreign-key
 * relationship uses ON DELETE CASCADE.
 *
 * The service layer should normally restrict deletion of
 * permissions that are part of the application's standard
 * permission set.
 *
 * @param {string} permissionId
 *
 * @returns {boolean} True if the permission was deleted
 */
const deletePermission = async (permissionId) => {
  const query = `
        DELETE FROM permissions
        WHERE id = $1
        RETURNING id;
    `;

  const result = await pool.query(query, [permissionId]);

  return result.rowCount > 0;
};

/**
 * Export permission repository functions.
 */
module.exports = {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
  updatePermission,
  deletePermission,
};
