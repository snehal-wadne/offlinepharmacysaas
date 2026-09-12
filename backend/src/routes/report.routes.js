/**
 * Reports & Analytics Routes
 *
 * Base endpoint: /api/reports
 */

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/reports/sales - Financial & sales summary
router.get('/sales', reportController.getSalesSummary);

// GET /api/reports/inventory - Complete inventory valuation and stock health report
router.get('/inventory', reportController.getInventoryReport);

// GET /api/reports/profit-loss - Profit & loss revenue breakdown
router.get('/profit-loss', reportController.getProfitLossReport);

// GET /api/reports/gst - GSTR-1 tax compliance summary
router.get('/gst', reportController.getGstReport);

// GET /api/reports/reconciliation - Cash register shifts reconciliation
router.get('/reconciliation', reportController.getCashierReconciliation);

// GET /api/reports/expiry - Batches nearing expiration
router.get('/expiry', reportController.getExpiryReport);

// GET /api/reports/fast-moving - Top selling medicines analysis
router.get('/fast-moving', reportController.getFastMoving);

module.exports = router;
