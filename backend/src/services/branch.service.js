/**
 * Branch Service
 *
 * Purpose:
 * Business logic for fetching and managing branches.
 */

const branchRepository = require('../repositories/branch.repository');
const { pool } = require('../db/connection');

/**
 * Get default organization ID if not explicitly passed.
 */
const getDefaultOrganisationId = async () => {
  const result = await pool.query('SELECT id FROM organisations LIMIT 1;');
  if (result.rows.length === 0) {
    throw new Error('No organisation found in database.');
  }
  return result.rows[0].id;
};

const getBranches = async (organisationId = null) => {
  const targetOrgId = organisationId || (await getDefaultOrganisationId());
  return await branchRepository.getBranchesByOrganisation(targetOrgId);
};

const getBranchById = async (branchId, organisationId = null) => {
  const targetOrgId = organisationId || (await getDefaultOrganisationId());
  const branch = await branchRepository.getBranchById(branchId, targetOrgId);
  if (!branch) {
    throw new Error(`Branch with ID ${branchId} not found.`);
  }
  return branch;
};

const createBranch = async (branchData) => {
  const targetOrgId = branchData.organisationId || (await getDefaultOrganisationId());
  return await branchRepository.createBranch({
    ...branchData,
    organisationId: targetOrgId,
  });
};

const updateBranch = async (branchId, updates, organisationId = null) => {
  const targetOrgId = organisationId || (await getDefaultOrganisationId());
  const updated = await branchRepository.updateBranch(branchId, targetOrgId, updates);
  if (!updated) {
    throw new Error(`Branch with ID ${branchId} not found or update failed.`);
  }
  return updated;
};

const deleteBranch = async (branchId, organisationId = null) => {
  const targetOrgId = organisationId || (await getDefaultOrganisationId());
  const deleted = await branchRepository.deleteBranch(branchId, targetOrgId);
  if (!deleted) {
    throw new Error(`Branch with ID ${branchId} not found or delete failed.`);
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
