/**
 * Role Service
 *
 * Business logic for the "Create New Role" feature and general role
 * management.
 */

const roleRepo = require('../repositories/role.repository');
const { pool } = require('../db/connection');

const CLEARANCE_LEVELS = ['ADMIN', 'CLINICAL_DISPENSING', 'MANAGEMENT', 'STANDARD_POS', 'AUDIT'];

const normalizeClearanceLevel = (value) => {
  const upper = String(value || 'STANDARD_POS').toUpperCase().trim();
  return CLEARANCE_LEVELS.includes(upper) ? upper : 'STANDARD_POS';
};

/**
 * Turns "Senior Pharmacist" into "SENIOR_PHARMACIST" so it can be
 * used as the organisation-unique role_identifier.
 */
const slugifyRoleIdentifier = (name) =>
  String(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * "Create New Role" — creates a role scoped to the organisation and,
 * optionally, attaches a starting set of permissions to it by name.
 */
const createRole = async ({ organisationId, name, clearanceLevel, description, permissionNames }) => {
  if (!organisationId || !name) {
    const error = new Error('organisationId and name are required');
    error.statusCode = 400;
    throw error;
  }

  const roleIdentifier = slugifyRoleIdentifier(name);

  if (!roleIdentifier) {
    const error = new Error('name must contain at least one letter or number');
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const role = await roleRepo.createRole(
      {
        organisationId,
        name: name.trim(),
        roleIdentifier,
        clearanceLevel: normalizeClearanceLevel(clearanceLevel),
        description: description || null,
        isSystemRole: false,
      },
      client,
    );

    let attachedPermissions = [];
    if (Array.isArray(permissionNames) && permissionNames.length > 0) {
      attachedPermissions = await roleRepo.getPermissionIdsByNames(permissionNames, client);
      await roleRepo.assignPermissionsToRole(
        role.id,
        attachedPermissions.map((p) => p.id),
        client,
      );
    }

    await client.query('COMMIT');

    const skippedPermissions = (permissionNames || []).filter(
      (n) => !attachedPermissions.some((p) => p.name === n),
    );

    return { ...role, permissions: attachedPermissions, skippedPermissions };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const friendly = new Error('A role with this name already exists for this organisation');
      friendly.statusCode = 409;
      throw friendly;
    }

    throw error;
  } finally {
    client.release();
  }
};

const getRoles = async (organisationId) => {
  if (!organisationId) {
    const error = new Error('organisationId is required');
    error.statusCode = 400;
    throw error;
  }

  return roleRepo.getRolesByOrganisation(organisationId);
};

const getRoleById = async (organisationId, roleId) => {
  const role = await roleRepo.getRoleById(organisationId, roleId);

  if (!role) {
    const error = new Error(`Role ${roleId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return role;
};

const updateRole = async (organisationId, roleId, { name, clearanceLevel, description, permissionNames }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const role = await roleRepo.updateRole(organisationId, roleId, {
      name: name ? name.trim() : null,
      clearanceLevel: clearanceLevel ? normalizeClearanceLevel(clearanceLevel) : null,
      description,
    });

    if (!role) {
      const error = new Error(`Role ${roleId} not found or is a protected system role`);
      error.statusCode = 404;
      throw error;
    }

    if (Array.isArray(permissionNames)) {
      const permissions = await roleRepo.getPermissionIdsByNames(permissionNames, client);
      await roleRepo.replaceRolePermissions(role.id, permissions.map((p) => p.id), client);
    }

    await client.query('COMMIT');
    return roleRepo.getRoleById(organisationId, roleId);
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const friendly = new Error('A role with this name already exists for this organisation');
      friendly.statusCode = 409;
      throw friendly;
    }

    throw error;
  } finally {
    client.release();
  }
};

const deleteRole = async (organisationId, roleId) => {
  try {
    const deleted = await roleRepo.deleteRole(organisationId, roleId);

    if (!deleted) {
      const error = new Error(`Role ${roleId} not found or is a protected system role`);
      error.statusCode = 404;
      throw error;
    }

    return true;
  } catch (error) {
    // branch_assignments.role_id references roles(id) ON DELETE RESTRICT
    if (error.code === '23503') {
      const friendly = new Error(
        'This role is currently assigned to one or more staff members and cannot be deleted',
      );
      friendly.statusCode = 409;
      throw friendly;
    }

    throw error;
  }
};

module.exports = {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
};