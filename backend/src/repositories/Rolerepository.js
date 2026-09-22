/**
 * Role Repository
 *
 * Handles all direct database operations related to roles and the
 * role -> permission junction table. Roles are organisation-scoped.
 */

const { pool } = require('../db/connection');

const createRole = async (
  { organisationId, name, roleIdentifier, clearanceLevel, description, isSystemRole = false },
  client = pool,
) => {
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
        RETURNING *;
    `;

  const values = [organisationId, name, roleIdentifier, clearanceLevel, description, isSystemRole];

  const result = await client.query(query, values);
  return result.rows[0];
};

const getPermissionIdsByNames = async (names, client = pool) => {
  if (!names || names.length === 0) return [];

  const query = `SELECT id, name FROM permissions WHERE name = ANY($1::text[]);`;
  const result = await client.query(query, [names]);
  return result.rows;
};

const assignPermissionsToRole = async (roleId, permissionIds, client = pool) => {
  if (!permissionIds || permissionIds.length === 0) return;

  const values = [];
  const placeholders = permissionIds
    .map((permissionId, index) => {
      values.push(roleId, permissionId);
      return `($${index * 2 + 1}, $${index * 2 + 2})`;
    })
    .join(', ');

  const query = `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING;
    `;

  await client.query(query, values);
};

const replaceRolePermissions = async (roleId, permissionIds, client = pool) => {
  await client.query(`DELETE FROM role_permissions WHERE role_id = $1;`, [roleId]);
  await assignPermissionsToRole(roleId, permissionIds, client);
};

const getRoleById = async (organisationId, roleId) => {
  const roleQuery = `
        SELECT *
        FROM roles
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const roleResult = await pool.query(roleQuery, [roleId, organisationId]);
  const role = roleResult.rows[0] || null;

  if (!role) return null;

  const permissionsQuery = `
        SELECT p.id, p.name, p.description
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.name ASC;
    `;

  const permissionsResult = await pool.query(permissionsQuery, [roleId]);

  return { ...role, permissions: permissionsResult.rows };
};

const getRolesByOrganisation = async (organisationId) => {
  const query = `
        SELECT
            r.*,
            COALESCE(
                json_agg(
                    json_build_object('id', p.id, 'name', p.name)
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'
            ) AS permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE r.organisation_id = $1
        GROUP BY r.id
        ORDER BY r.name ASC;
    `;

  const result = await pool.query(query, [organisationId]);
  return result.rows;
};

const updateRole = async (organisationId, roleId, { name, clearanceLevel, description }) => {
  const query = `
        UPDATE roles
        SET
            name = COALESCE($1, name),
            clearance_level = COALESCE($2, clearance_level),
            description = COALESCE($3, description),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
          AND organisation_id = $5
          AND is_system_role = FALSE
        RETURNING *;
    `;

  const result = await pool.query(query, [name, clearanceLevel, description, roleId, organisationId]);
  return result.rows[0] || null;
};

const deleteRole = async (organisationId, roleId) => {
  const query = `
        DELETE FROM roles
        WHERE id = $1
          AND organisation_id = $2
          AND is_system_role = FALSE
        RETURNING id;
    `;

  const result = await pool.query(query, [roleId, organisationId]);
  return result.rowCount > 0;
};

module.exports = {
  createRole,
  getPermissionIdsByNames,
  assignPermissionsToRole,
  replaceRolePermissions,
  getRoleById,
  getRolesByOrganisation,
  updateRole,
  deleteRole,
};