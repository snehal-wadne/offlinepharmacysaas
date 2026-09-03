/**
 * Supplier Routes
 *
 * Base endpoint: /api/suppliers
 */

const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplier.controller');

// GET /api/suppliers - List suppliers
router.get('/', supplierController.getSuppliers);

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', supplierController.getSupplierById);

// POST /api/suppliers - Create supplier
router.post('/', supplierController.createSupplier);

// PATCH /api/suppliers/:id/status - Update supplier status
router.patch('/:id/status', supplierController.updateSupplierStatus);

module.exports = router;
