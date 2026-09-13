/**
 * Cashier Routes
 *
 * Base endpoint: /api/cashier
 * Handles:
 * - Cash Register shifts & reconciliations
 * - POS Sale creation & invoice fetching
 * - Barcode & medicine searches
 * - Parked / held bills
 * - Returns & refunds
 */

const express = require('express');
const router = express.Router();
const cashierController = require('../controllers/cashier.controller');
const { requireSyncAuth } = require('../middleware/sync-auth.middleware');

// --- Register Management & Sessions (Strict Multi-Tenant Auth) ---
router.get('/registers', requireSyncAuth, cashierController.getBranchRegisters);
router.get('/register/registers', requireSyncAuth, cashierController.getBranchRegisters);
router.get('/register/current', requireSyncAuth, cashierController.getCurrentSession);
router.post('/register/open', requireSyncAuth, cashierController.openSession);
router.post('/register/close', requireSyncAuth, cashierController.closeSession);
router.get('/register/history', requireSyncAuth, cashierController.getSessionHistory);
router.post('/register/movement', requireSyncAuth, cashierController.recordCashMovement);
router.get('/register/movements', requireSyncAuth, cashierController.getCashMovements);
router.get('/register/summary', requireSyncAuth, cashierController.getSessionSummary);

// --- Products & Barcode Search ---
router.get('/products', cashierController.searchProducts);

// --- POS Sales ---
router.post('/sales', cashierController.createSale);
router.get('/sales/recent', cashierController.getRecentSales);
router.get('/sales/:invoiceNo', cashierController.getSaleByInvoiceNo);

// --- Held Bills ---
router.get('/held-bills', cashierController.getHeldBills);
router.post('/held-bills', cashierController.saveHeldBill);
router.delete('/held-bills/:holdId', cashierController.deleteHeldBill);

// --- Sales Returns ---
router.get('/returns/search', cashierController.searchReturnInvoice);
router.post('/returns', cashierController.processReturn);
router.get('/returns/history', cashierController.getReturnHistory);

module.exports = router;
