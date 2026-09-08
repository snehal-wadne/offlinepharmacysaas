/**
 * Branch Controller
 *
 * Purpose:
 * HTTP request handlers for branch endpoints.
 */

const branchService = require('../services/branch.service');

const getBranches = async (req, res) => {
  try {
    const organisationId = req.query.organisationId || null;
    const branches = await branchService.getBranches(organisationId);
    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches,
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch branches',
    });
  }
};

const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = req.query.organisationId || null;
    const branch = await branchService.getBranchById(id, organisationId);
    res.status(200).json({
      success: true,
      data: branch,
    });
  } catch (error) {
    console.error(`Error fetching branch ${req.params.id}:`, error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to fetch branch',
    });
  }
};

const createBranch = async (req, res) => {
  try {
    const newBranch = await branchService.createBranch(req.body);
    res.status(201).json({
      success: true,
      data: newBranch,
    });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create branch',
    });
  }
};

const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = req.query.organisationId || null;
    const updatedBranch = await branchService.updateBranch(id, req.body, organisationId);
    res.status(200).json({
      success: true,
      data: updatedBranch,
    });
  } catch (error) {
    console.error(`Error updating branch ${req.params.id}:`, error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to update branch',
    });
  }
};

const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const organisationId = req.query.organisationId || null;
    const deletedBranch = await branchService.deleteBranch(id, organisationId);
    res.status(200).json({
      success: true,
      message: 'Branch deleted successfully',
      data: deletedBranch,
    });
  } catch (error) {
    console.error(`Error deleting branch ${req.params.id}:`, error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to delete branch',
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
