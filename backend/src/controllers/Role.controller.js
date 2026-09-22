/**
 * Role Controller
 *
 * Request handlers for role endpoints, including "Create New Role".
 */

const roleService = require('../services/Roleservice');
const {
  getAuthorizedOrgId,
  sanitizeTenantPayload,
} = require('../utils/tenant-context');

const createRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const roleData = sanitizeTenantPayload(req.body, { organisationId });

    const role = await roleService.createRole(roleData);

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role,
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to create role',
    });
  }
};

const getRoles = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const roles = await roleService.getRoles(organisationId);

    res.status(200).json({ success: true, count: roles.length, data: roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to fetch roles',
    });
  }
};

const getRoleById = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { id } = req.params;

    const role = await roleService.getRoleById(organisationId, id);

    res.status(200).json({ success: true, data: role });
  } catch (error) {
    console.error(`Error fetching role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to fetch role',
    });
  }
};

const updateRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { id } = req.params;
    const updateData = sanitizeTenantPayload(req.body);

    const role = await roleService.updateRole(organisationId, id, updateData);

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: role,
    });
  } catch (error) {
    console.error(`Error updating role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update role',
    });
  }
};

const deleteRole = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const { id } = req.params;

    await roleService.deleteRole(organisationId, id);

    res.status(200).json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    console.error(`Error deleting role ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to delete role',
    });
  }
};

module.exports = {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
};