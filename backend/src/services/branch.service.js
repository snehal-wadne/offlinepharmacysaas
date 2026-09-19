/**
 * Branch Service
 *
 * Purpose:
 * Business logic for fetching and managing branches.
 */

const branchRepository = require("../repositories/branch.repository");

const getBranches = async (organisationId) => {
  if (!organisationId) {
    throw new Error("organisationId is required");
  }
  return await branchRepository.getBranchesByOrganisation(organisationId);
};

const getBranchById = async (branchId, organisationId) => {
  if (!organisationId || !branchId) {
    throw new Error("organisationId and branchId are required");
  }
  const branch = await branchRepository.getBranchById(branchId, organisationId);
  if (!branch) {
    const err = new Error(`Branch with ID ${branchId} not found.`);
    err.statusCode = 404;
    throw err;
  }
  return branch;
};

const createBranch = async (branchData) => {
  if (!branchData.organisationId) {
    throw new Error("organisationId is required");
  }
  return await branchRepository.createBranch(branchData);
};

const updateBranch = async (branchId, updates, organisationId) => {
  if (!organisationId || !branchId) {
    throw new Error("organisationId and branchId are required");
  }
  const updated = await branchRepository.updateBranch(
    branchId,
    organisationId,
    updates,
  );
  if (!updated) {
    const err = new Error(
      `Branch with ID ${branchId} not found or update failed.`,
    );
    err.statusCode = 404;
    throw err;
  }
  return updated;
};

const deleteBranch = async (branchId, organisationId) => {
  if (!organisationId || !branchId) {
    throw new Error("organisationId and branchId are required");
  }
  const deleted = await branchRepository.deleteBranch(branchId, organisationId);
  if (!deleted) {
    const err = new Error(
      `Branch with ID ${branchId} not found or delete failed.`,
    );
    err.statusCode = 404;
    throw err;
  }
  return deleted;
};

module.exports = {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};
