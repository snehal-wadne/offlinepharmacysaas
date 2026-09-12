/**
 * Stock Transfer Routes
 *
 * Base endpoint: /api/stock-transfers
 */

const express = require('express');
const router = express.Router();
const stockTransferController = require('../controllers/stock-transfer.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/stock-transfers - List stock transfers
router.get('/', stockTransferController.getTransfers);

// GET /api/stock-transfers/:id - Detailed transfer with items
router.get('/:id', stockTransferController.getTransferById);

// POST /api/stock-transfers - Request stock transfer
router.post('/', stockTransferController.createTransfer);

// PATCH /api/stock-transfers/:id/status - Status transition (REQUESTED / APPROVED / IN_TRANSIT / COMPLETED / CANCELLED)
router.patch('/:id/status', stockTransferController.updateTransferStatus);

module.exports = router;
