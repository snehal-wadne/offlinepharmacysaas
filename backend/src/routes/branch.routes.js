const express = require('express');
const branchController = require('../controllers/branch.controller');
// Adjust this import path to match your project's real auth middleware.
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.post('/', branchController.createBranch); // Add Branch
router.get('/', branchController.getBranches);
router.get('/:id', branchController.getBranchById);
router.patch('/:id', branchController.updateBranch);
router.put('/:id', branchController.updateBranch); // alias for clients using PUT
// router.patch('/:id/status', branchController.updateBranchStatus);
// router.put('/:id/status', branchController.updateBranchStatus); // alias for clients using PUT

module.exports = router;