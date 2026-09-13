/**
 * Supplier Routes
 *
 * Base endpoint: /api/suppliers
 */

const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplier.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/suppliers - List suppliers
router.get('/', supplierController.getSuppliers);

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', supplierController.getSupplierById);

// POST /api/suppliers - Create supplier
router.post('/', supplierController.createSupplier);

// PUT /api/suppliers/:id - Update supplier details
router.put('/:id', supplierController.updateSupplier);

// PATCH /api/suppliers/:id/status - Update supplier status
router.patch('/:id/status', supplierController.updateSupplierStatus);

// DELETE /api/suppliers/:id - Delete supplier
router.delete('/:id', supplierController.deleteSupplier);

module.exports = router;
