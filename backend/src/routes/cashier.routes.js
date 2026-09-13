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
const { requireSyncAuth, optionalSyncAuth } = require('../middleware/sync-auth.middleware');

// --- Base Cashier Directory Route ---
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'Cashier POS & Register API',
    status: 'ONLINE',
    endpoints: {
      products: '/api/cashier/products',
      registers: '/api/cashier/registers',
      currentRegister: '/api/cashier/register/current',
      recentSales: '/api/cashier/sales/recent',
      heldBills: '/api/cashier/held-bills',
    },
  });
});

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
router.get('/products', optionalSyncAuth, cashierController.searchProducts);

// --- POS Sales ---
router.post('/sales', requireSyncAuth, cashierController.createSale);
router.get('/sales/recent', requireSyncAuth, cashierController.getRecentSales);
router.get('/sales/:invoiceNo', requireSyncAuth, cashierController.getSaleByInvoiceNo);

// --- Held Bills ---
router.get('/held-bills', requireSyncAuth, cashierController.getHeldBills);
router.post('/held-bills', requireSyncAuth, cashierController.saveHeldBill);
router.delete('/held-bills/:holdId', requireSyncAuth, cashierController.deleteHeldBill);

// --- Sales Returns ---
router.get('/returns/search', requireSyncAuth, cashierController.searchReturnInvoice);
router.post('/returns', requireSyncAuth, cashierController.processReturn);
router.get('/returns/history', requireSyncAuth, cashierController.getReturnHistory);

module.exports = router;
