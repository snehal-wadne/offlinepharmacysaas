/**
 * Role & Permission Controller
 *
 * HTTP request handlers for organisation roles, the global
 * permission catalogue, and role<->permission assignment.
 */

const roleRepository = require("../repositories/role.repository");
const permissionRepository = require("../repositories/permission.repository");
const { getAuthorizedOrgId } = require("../utils/tenant-context");

const isAdmin = (req) =>
  Boolean(req.user?.isPlatformSuperadmin) ||
  ["OWNER", "ADMIN"].includes(req.user?.role);

const requireAdmin = (req, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({
      success: false,
      error: "Only administrators can manage roles and permissions.",
    });
    return false;
  }
  return true;
};

const getRoles = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const roles = await roleRepository.getOrganisationRoles(organisationId);

    const rolesWithPermissions = await Promise.all(
      roles.map((role) => roleRepository.getRoleWithPermissions(role.id)),
    );

    res.status(200).json({
      success: true,
      count: rolesWithPermissions.length,
      data: rolesWithPermissions,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch roles",
    });
  }
};

const getRoleById = async (req, res) => {
  try {
    await getAuthorizedOrgId(req);
    const role = await roleRepository.getRoleWithPermissions(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }
    res.status(200).json({ success: true, data: role });
  } catch (error) {
    console.error(`Error fetching role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch role",
    });
  }
};

const createRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    if (!requireAdmin(req, res)) return;

    const { name, roleIdentifier, clearanceLevel, description, permissionIds } =
      req.body;

    if (!name || !String(name).trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Role name is required." });
    }

    const role = await roleRepository.createRole({
      organisationId,
      name: String(name).trim(),
      roleIdentifier,
      clearanceLevel,
      description,
    });

    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      await roleRepository.assignPermissionsToRole(role.id, permissionIds);
    }

    const roleWithPermissions = await roleRepository.getRoleWithPermissions(
      role.id,
    );

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || "Failed to create role",
    });
  }
};

const updateRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    if (!requireAdmin(req, res)) return;

    const existing = await roleRepository.getRoleById(req.params.id);
    if (!existing || existing.organisation_id !== organisationId) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }

    const { name, roleIdentifier, clearanceLevel, description, permissionIds } =
      req.body;

    const updated = await roleRepository.updateRole(req.params.id, {
      name,
      roleIdentifier,
      clearanceLevel,
      description,
    });

    if (Array.isArray(permissionIds)) {
      await roleRepository.syncRolePermissions(req.params.id, permissionIds);
    }

    const roleWithPermissions = await roleRepository.getRoleWithPermissions(
      updated.id,
    );

    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error(`Error updating role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to update role",
    });
  }
};

const deleteRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    if (!requireAdmin(req, res)) return;

    const existing = await roleRepository.getRoleById(req.params.id);
    if (!existing || existing.organisation_id !== organisationId) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }

    if (existing.is_system_role) {
      return res.status(400).json({
        success: false,
        error: "System roles cannot be deleted.",
      });
    }

    const deleted = await roleRepository.deleteRole(req.params.id);
    res.status(200).json({
      success: deleted,
      message: deleted ? "Role deleted successfully" : "Role not found",
    });
  } catch (error) {
    console.error(`Error deleting role ${req.params.id}:`, error);
    // Foreign key restriction: role still assigned to staff via branch_assignments
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        error:
          "This role is still assigned to one or more staff members. Reassign them before deleting the role.",
      });
    }
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to delete role",
    });
  }
};

const updateRolePermissions = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    if (!requireAdmin(req, res)) return;

    const existing = await roleRepository.getRoleById(req.params.id);
    if (!existing || existing.organisation_id !== organisationId) {
      return res.status(404).json({ success: false, error: "Role not found" });
    }

    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({
        success: false,
        error: "permissionIds must be an array of permission UUIDs.",
      });
    }

    const permissions = await roleRepository.syncRolePermissions(
      req.params.id,
      permissionIds,
    );

    res.status(200).json({
      success: true,
      message: "Role permissions updated successfully",
      data: permissions,
    });
  } catch (error) {
    console.error(`Error updating permissions for role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to update role permissions",
    });
  }
};

const getPermissions = async (req, res) => {
  try {
    await getAuthorizedOrgId(req);
    const grouped = await permissionRepository.getPermissionsGrouped();
    res.status(200).json({ success: true, data: grouped });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to fetch permissions",
    });
  }
};

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  updateRolePermissions,
  getPermissions,
};
