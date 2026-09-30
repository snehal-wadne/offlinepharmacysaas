/**
 * Branch Controller
 *
 * Purpose:
 * HTTP request handlers for branch endpoints.
 */

const branchService = require("../services/branch.service");
const { pool } = require("../db/connection");
const {
  getAuthorizedOrgId,
  sanitizeTenantPayload,
} = require("../utils/tenant-context");

const getBranches = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const user = req.user;

    // Determine if the user is an owner or admin (can see all branches)
    const isOwnerOrAdmin =
      user.isOwner ||
      user.isPlatformSuperadmin ||
      (user.role || "").toUpperCase() === "OWNER" ||
      (user.role || "").toUpperCase() === "ADMIN" ||
      (user.role || "").toLowerCase().includes("admin") ||
      (user.role || "").toLowerCase().includes("owner");

    if (isOwnerOrAdmin) {
      // Admin / Owner: return all branches for the organisation
      const branches = await branchService.getBranches(organisationId);
      return res.status(200).json({
        success: true,
        count: branches.length,
        data: branches,
      });
    }

    // Non-admin user (branch manager, pharmacist, cashier, etc.):
    // Must ONLY see the branch(es) they are assigned to.
    const assignedRes = await pool.query(
      `SELECT DISTINCT b.id, b.organisation_id, b.branch_code, b.name, b.facility_type,
              b.contact_person, b.contact_phone, b.contact_email, b.address, b.city,
              b.state, b.postal_code, b.phone, b.operating_hours, b.drug_license_number,
              b.invoice_prefix, b.status, b.created_at, b.updated_at
       FROM branch_assignments ba
       JOIN organisation_memberships om ON om.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE om.user_id = $1 AND om.organisation_id = $2 AND b.status = 'ACTIVE'
       ORDER BY b.name ASC;`,
      [user.id, organisationId],
    );

    let branchList = assignedRes.rows;

    if (branchList.length === 0 && user.branchId) {
      const singleBranch = await branchService
        .getBranchById(user.branchId, organisationId)
        .catch(() => null);
      if (singleBranch) {
        branchList = [singleBranch];
      }
    }

    return res.status(200).json({
      success: true,
      count: branchList.length,
      data: branchList,
    });
  } catch (error) {
    console.error("Error fetching branches:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch branches",
    });
  }
};

const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = await getAuthorizedOrgId(req);
    const branch = await branchService.getBranchById(id, organisationId);
    res.status(200).json({
      success: true,
      data: branch,
    });
  } catch (error) {
    console.error(`Error fetching branch ${req.params.id}:`, error);
    const statusCode = error.message.includes("not found")
      ? 404
      : error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to fetch branch",
    });
  }
};

const createBranch = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const branchData = sanitizeTenantPayload(req.body, { organisationId });
    const newBranch = await branchService.createBranch(branchData);
    res.status(201).json({
      success: true,
      data: newBranch,
    });
  } catch (error) {
    console.error("Error creating branch:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to create branch",
    });
  }
};

const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = await getAuthorizedOrgId(req);
    const updateData = sanitizeTenantPayload(req.body);
    const updatedBranch = await branchService.updateBranch(
      id,
      updateData,
      organisationId,
    );
    res.status(200).json({
      success: true,
      data: updatedBranch,
    });
  } catch (error) {
    console.error(`Error updating branch ${req.params.id}:`, error);
    const statusCode = error.message.includes("not found")
      ? 404
      : error.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update branch",
    });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = await getAuthorizedOrgId(req);
    const deletedBranch = await branchService.deleteBranch(id, organisationId);
    res.status(200).json({
      success: true,
      message: "Branch deleted successfully",
      data: deletedBranch,
    });
  } catch (error) {
    console.error(`Error deleting branch ${req.params.id}:`, error);
    const statusCode = error.message.includes("not found")
      ? 404
      : error.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete branch",
    });
  }
};

module.exports = {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};
