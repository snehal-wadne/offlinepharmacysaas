/**
 * Organisation Subscription Routes
 *
 * Base endpoint: /api/subscriptions
 */

const express = require("express");
const router = express.Router();
const subscriptionController = require("../controllers/subscription.controller");
const { authenticate } = require("../middlewares/auth.middleware");

router.use(authenticate);

// GET /api/subscriptions/current - The authenticated organisation's active/pending subscription
router.get("/current", subscriptionController.getCurrentSubscription);

module.exports = router;
