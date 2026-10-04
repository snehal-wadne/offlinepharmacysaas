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

const FACILITY_TYPE_MAP = {
  "Hospital Pharmacy": "HOSPITAL_PHARMACY",
  "Retail Dispensary": "RETAIL_DISPENSARY",
  "Central Warehouse": "CENTRAL_WAREHOUSE",

  // Also accept already-normalized DB values
  HOSPITAL_PHARMACY: "HOSPITAL_PHARMACY",
  RETAIL_DISPENSARY: "RETAIL_DISPENSARY",
  CENTRAL_WAREHOUSE: "CENTRAL_WAREHOUSE",
};

const createBranch = async (branchData) => {
  if (!branchData.organisationId) {
    throw new Error("organisationId is required");
  }

  const normalizedFacilityType =
    FACILITY_TYPE_MAP[branchData.facilityType] ||
    FACILITY_TYPE_MAP[branchData.type] ||
    "RETAIL_DISPENSARY";

  const normalizedBranchData = {
    ...branchData,
    facilityType: normalizedFacilityType,
  };

  return await branchRepository.createBranch(normalizedBranchData);
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
