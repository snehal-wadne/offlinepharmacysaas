/**
 * Branch Controller
 *
 * Purpose:
 * HTTP request handlers for branch endpoints.
 */

const branchService = require("../services/branch.service");
const {
  getAuthorizedOrgId,
  sanitizeTenantPayload,
} = require("../utils/tenant-context");

const getBranches = async (req, res) => {
  try {
    const organisationId = await getAuthorizedOrgId(req);
    const branches = await branchService.getBranches(organisationId);
    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches,
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
