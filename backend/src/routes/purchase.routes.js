/**
 * Purchase Routes
 *
 * Base endpoint: /api/purchases
 */

const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');

// GET /api/purchases - List purchase orders (supports status, search, limit, offset filters)
router.get('/', purchaseController.getPurchases);

// GET /api/purchases/:id - Get PO details by ID
router.get('/:id', purchaseController.getPurchaseById);

// POST /api/purchases - Create a new Purchase Order
router.post('/', purchaseController.createPurchase);

// PATCH /api/purchases/:id/status - Action button handler to update status (APPROVED, CANCELLED, PENDING)
router.patch('/:id/status', purchaseController.updatePurchaseStatus);

// POST /api/purchases/:id/receive - Action button handler to receive stock against PO
router.post('/:id/receive', purchaseController.receivePurchase);

module.exports = router;
