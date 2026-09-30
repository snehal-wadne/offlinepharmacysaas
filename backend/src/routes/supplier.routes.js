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

// --- Dedicated Supplier Portal Endpoints ---
// GET /api/suppliers/portal/dashboard - Metrics for logged-in supplier
router.get('/portal/dashboard', supplierController.getSupplierDashboard);

// GET /api/suppliers/portal/notifications - Reorder requests directed to this supplier
router.get('/portal/notifications', supplierController.getSupplierPortalNotifications);

// PATCH /api/suppliers/portal/notifications/:id/status - Acknowledge, dispatch, or deliver reorder
router.patch('/portal/notifications/:id/status', supplierController.updateNotificationStatus);

// GET /api/suppliers/portal/catalog - Products catalog associated with this supplier
router.get('/portal/catalog', supplierController.getSupplierCatalog);

// POST /api/suppliers/notify - Send stock alert to supplier
router.post('/notify', supplierController.notifySupplier);

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
