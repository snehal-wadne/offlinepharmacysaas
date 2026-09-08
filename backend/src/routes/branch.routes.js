/**
 * Branch Routes
 *
 * Purpose:
 * Defines API routes for branch resource management.
 */

const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branch.controller');

router.get('/', branchController.getBranches);
router.get('/:id', branchController.getBranchById);
router.post('/', branchController.createBranch);
router.put('/:id', branchController.updateBranch);
router.delete('/:id', branchController.deleteBranch);

module.exports = router;
