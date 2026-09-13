/**
 * Sync Routes
 *
 * Base endpoint: /api/sync and /sync
 */

const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const {
  requireSyncAuth,
  optionalSyncAuth,
} = require("../middleware/sync-auth.middleware");

// Status probe
router.get("/status", syncController.getStatus);

// Direct batch processing for offline frontend
router.post("/batch", syncController.processBatch);

// Push mutations (supports authenticated engine and direct batch)
router.post("/push", optionalSyncAuth, syncController.pushMutations);

// Pull changes
router.get("/pull", optionalSyncAuth, syncController.pullChanges);

// Bootstrap tenant master data
router.get("/bootstrap", requireSyncAuth, syncController.bootstrap);

// Connectivity probe (unauthenticated health check)
router.post("/check", syncController.testConnection);

module.exports = router;
