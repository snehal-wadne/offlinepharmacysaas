/**
 * Audit Log Routes
 *
 * Base endpoint: /api/audit-logs
 */

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { requireSyncAuth } = require('../middleware/sync-auth.middleware');

// GET /api/audit-logs - Query audit trail with branch/search filtering
router.get('/', requireSyncAuth, auditController.getAuditLogs);

module.exports = router;
