/**
 * Goods Receipt Routes
 *
 * Base endpoint: /api/goods-receipts
 */

const express = require('express');
const router = express.Router();
const goodsReceiptController = require('../controllers/goods-receipt.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/goods-receipts - List goods receipts
router.get('/', goodsReceiptController.getGoodsReceipts);

// GET /api/goods-receipts/:id - Get GR details by ID
router.get('/:id', goodsReceiptController.getGoodsReceiptById);

// POST /api/goods-receipts - Create goods receipt
router.post('/', goodsReceiptController.createGoodsReceipt);

// PATCH /api/goods-receipts/:id/status - Update GR status
router.patch('/:id/status', goodsReceiptController.updateGoodsReceiptStatus);

module.exports = router;
