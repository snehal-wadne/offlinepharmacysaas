/**
 * Sync Routes
 *
 * Base endpoint: /api/sync
 */

const express = require("express");
const router = express.Router();
const syncController = require("../controllers/sync.controller");
const { requireSyncAuth } = require("../middleware/sync-auth.middleware");

// Protected sync routes
router.get("/status", requireSyncAuth, syncController.getStatus);
router.post("/push", requireSyncAuth, syncController.pushMutations);
router.get("/pull", requireSyncAuth, syncController.pullChanges);

// Connectivity probe (unauthenticated health check)
router.post("/check", syncController.testConnection);

module.exports = router;
