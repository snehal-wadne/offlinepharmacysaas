/**
 * Tax & GST Routes
 *
 * Base endpoint: /api/taxes
 */

const express = require('express');
const router = express.Router();
const taxController = require('../controllers/tax.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/taxes - List tax slabs
router.get('/', taxController.getTaxes);

// POST /api/taxes - Create new tax slab
router.post('/', taxController.createTax);

// PUT /api/taxes/:id - Update existing tax slab
router.put('/:id', taxController.updateTax);

// PATCH /api/taxes/:id/status - Toggle tax slab active/applied status
router.patch('/:id/status', taxController.setTaxStatus);

// DELETE /api/taxes/:id - Delete tax slab
router.delete('/:id', taxController.deleteTax);

// GET /api/taxes/branch-gst/:branchId - Get branch GST details
router.get('/branch-gst/:branchId', taxController.getBranchGst);

// PUT /api/taxes/branch-gst/:branchId - Save branch GST details
router.put('/branch-gst/:branchId', taxController.updateBranchGst);

module.exports = router;
