// routes/mainDashboard.routes.js

const express = require("express");

const router = express.Router();

const {
  getMainDashboard,
  getMetrics,
  getCharts,
  getRecentActivity,
  getDashboardOverview,
} = require("../controllers/mainDashboard.controller");

const {
  authenticate,
} = require("../middlewares/auth.middleware");

// ============================================================
// AUTHENTICATION
// ============================================================

router.use(authenticate);


// ============================================================
// MAIN DASHBOARD
// ============================================================

// GET /api/dashboard
// GET /api/dashboard?branchId=<uuid>

router.get(
  "/",
  getMainDashboard
);


// ============================================================
// SUPERADMIN DASHBOARD
// ============================================================

// GET /api/v1/superadmin/dashboard/metrics

router.get(
  "/metrics",
  getMetrics
);


// GET /api/v1/superadmin/dashboard/charts

router.get(
  "/charts",
  getCharts
);


// GET /api/v1/superadmin/dashboard/recent-activity

router.get(
  "/recent-activity",
  getRecentActivity
);


// GET /api/v1/superadmin/dashboard/overview

router.get(
  "/overview",
  getDashboardOverview
);


module.exports = router;