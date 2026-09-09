/**
 * Inventory Routes
 *
 * Base endpoint: /api/inventory
 */

const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');

// GET /api/inventory - List inventory
router.get('/', inventoryController.getInventory);

// GET /api/inventory/summary - Inventory KPI summary
router.get('/summary', inventoryController.getInventorySummary);

// GET /api/inventory/movements - Recent stock movements
router.get('/movements', inventoryController.getRecentStockMovements);

// POST /api/inventory/movements - Record stock movement
router.post('/movements', inventoryController.recordMovement);

// POST /api/inventory - Create inventory entry
router.post('/', inventoryController.saveInventory);

// PUT /api/inventory/:id - Update inventory entry
router.put('/:id', inventoryController.updateInventory);

// DELETE /api/inventory/:id - Delete inventory entry
router.delete('/:id', inventoryController.deleteInventory);

module.exports = router;
