/**
 * Sync Routes
 *
 * Base endpoint: /api/sync and /sync
 */

const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const { requireSyncAuth } = require("../middleware/sync-auth.middleware");

// Status probe (Authenticated)
router.get("/status", requireSyncAuth, syncController.getStatus);

// Direct batch processing for offline frontend (Authenticated)
router.post("/batch", requireSyncAuth, syncController.processBatch);

// Push mutations (Authenticated)
router.post("/push", requireSyncAuth, syncController.pushMutations);

// Pull changes (Authenticated)
router.get("/pull", requireSyncAuth, syncController.pullChanges);

// Bootstrap tenant master data (Authenticated)
router.get("/bootstrap", requireSyncAuth, syncController.bootstrap);

// Connectivity probe (unauthenticated health check)
router.post("/check", syncController.testConnection);

module.exports = router;
