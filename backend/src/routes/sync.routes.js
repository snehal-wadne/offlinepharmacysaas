/**
 * Sync Routes
 *
 * Base endpoint: /api/sync
 */

const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');

router.get('/status', syncController.getStatus);
router.post('/batch', syncController.processBatch);
router.post('/push', syncController.processBatch);
router.post('/check', syncController.testConnection);

module.exports = router;

