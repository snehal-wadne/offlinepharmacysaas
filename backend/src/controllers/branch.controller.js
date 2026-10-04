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

    // Check if organisation has this user as owner_id or admin_name
    let isOrgAdmin = false;
    if (organisationId && user) {
      const orgRes = await pool.query(
        "SELECT owner_id, admin_name FROM organisations WHERE id = $1 LIMIT 1;",
        [organisationId],
      );
      const org = orgRes.rows[0];
      if (org) {
        if (org.owner_id === user.id) isOrgAdmin = true;
        if (
          org.admin_name &&
          user.name &&
          org.admin_name.trim().toLowerCase() === user.name.trim().toLowerCase()
        ) {
          isOrgAdmin = true;
        }
      }
    }

    // Determine if the user is an owner or admin (can see all branches)
    const isOwnerOrAdmin =
      isOrgAdmin ||
      user.isOwner ||
      user.isPlatformSuperadmin ||
      (user.role || "").toUpperCase() === "OWNER" ||
      (user.role || "").toUpperCase() === "ADMIN" ||
      (user.role || "").toLowerCase().includes("admin") ||
      (user.role || "").toLowerCase().includes("owner");

    // Optional adminName filter from query parameter
    const queryAdminName = req.query?.adminName?.trim()?.toLowerCase();

    if (isOwnerOrAdmin) {
      // Admin / Owner: return all branches for the organisation
      let branches = await branchService.getBranches(organisationId);
      if (queryAdminName) {
        branches = branches.filter(
          (b) =>
            (b.admin_name && b.admin_name.toLowerCase().includes(queryAdminName)) ||
            (b.contact_person && b.contact_person.toLowerCase().includes(queryAdminName)),
        );
      }
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
              b.admin_name, b.contact_person, b.contact_phone, b.contact_email, b.address, b.city,
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

    if (queryAdminName) {
      branchList = branchList.filter(
        (b) =>
          (b.admin_name && b.admin_name.toLowerCase().includes(queryAdminName)) ||
          (b.contact_person && b.contact_person.toLowerCase().includes(queryAdminName)),
      );
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

    // Explicitly capture adminName / contactPerson
    const adminName = (
      branchData.adminName ||
      branchData.contactPerson ||
      req.user?.name ||
      ""
    ).trim();
    branchData.adminName = adminName;
    branchData.contactPerson = branchData.contactPerson || adminName;

    const newBranch = await branchService.createBranch(branchData);

    // Auto-assign creating admin user to this new branch so they have immediate access
    if (req.user?.id) {
      const memRes = await pool.query(
        "SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'ACTIVE' LIMIT 1;",
        [organisationId, req.user.id],
      );
      const memId = memRes.rows[0]?.id;
      if (memId && newBranch?.id) {
        const roleRes = await pool.query(
          "SELECT id FROM roles WHERE organisation_id = $1 AND (role_identifier = 'ADMIN' OR name = 'Administrator') LIMIT 1;",
          [organisationId],
        );
        const adminRoleId = roleRes.rows[0]?.id;
        if (adminRoleId) {
          await pool
            .query(
              `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
               VALUES ($1, $2, $3, FALSE)
               ON CONFLICT (membership_id, branch_id) DO NOTHING;`,
              [memId, newBranch.id, adminRoleId],
            )
            .catch((e) => console.warn("Auto-assignment notice:", e.message));
        }
      }
    }

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

    if (updateData.adminName || updateData.contactPerson) {
      const adminName = (
        updateData.adminName ||
        updateData.contactPerson ||
        ""
      ).trim();
      updateData.adminName = adminName;
      if (!updateData.contactPerson) {
        updateData.contactPerson = adminName;
      }
    }

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
