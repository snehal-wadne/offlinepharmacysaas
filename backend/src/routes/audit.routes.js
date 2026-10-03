/**
 * Audit Log Routes
 *
 * Base endpoint: /api/audit-logs
 */

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// GET /api/audit-logs - Query audit trail with branch/search filtering
router.get('/', authenticate, auditController.getAuditLogs);

// POST /api/audit-logs - Record an audit log entry
router.post('/', authenticate, auditController.createAuditLog);

module.exports = router;

