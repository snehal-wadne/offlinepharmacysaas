/**
 * Superadmin API Routes
 *
 * Base Route: /api/superadmin
 */

const express = require("express");
const router = express.Router();
const superadminController = require("../controllers/superadmin.controller");
const {
  requirePlatformSuperadmin,
} = require("../middleware/superadmin-auth.middleware");

// ============================================================
// PUBLIC PLATFORM & ONBOARDING ENDPOINTS
// ============================================================
router.post("/auth/login", (req, res) => superadminController.login(req, res));
router.post("/onboarding/provision", (req, res) =>
  superadminController.provisionPharmacy(req, res),
);
router.post("/payments/create-order", (req, res) =>
  superadminController.createPaymentOrder(req, res),
);
router.post("/payments/verify", (req, res) =>
  superadminController.verifyPayment(req, res),
);
router.post("/payments/webhook", (req, res) =>
  superadminController.handleWebhook(req, res),
);
router.get("/public/plans", (req, res) =>
  superadminController.listPlans(req, res),
);

// ============================================================
// SUPERADMIN PROTECTED ENDPOINTS
// ============================================================
router.use(requirePlatformSuperadmin);

// Profile
router.get("/auth/me", (req, res) => superadminController.getMe(req, res));

// Dashboard
router.get("/dashboard/metrics", (req, res) =>
  superadminController.getDashboardMetrics(req, res),
);
router.get("/dashboard/charts", (req, res) =>
  superadminController.getDashboardCharts(req, res),
);
router.get("/dashboard/activity", (req, res) =>
  superadminController.getDashboardActivity(req, res),
);

// Pharmacies
router.get("/pharmacies", (req, res) =>
  superadminController.listPharmacies(req, res),
);
router.get("/pharmacies/:id", (req, res) =>
  superadminController.getPharmacyDetail(req, res),
);
router.post("/pharmacies", (req, res) =>
  superadminController.provisionPharmacy(req, res),
);
router.patch("/pharmacies/:id/status", (req, res) =>
  superadminController.updatePharmacyStatus(req, res),
);
router.post("/pharmacies/:id/renew", (req, res) =>
  superadminController.renewPharmacySubscription(req, res),
);
router.post("/pharmacies/:id/upgrade-plan", (req, res) =>
  superadminController.upgradePharmacyPlan(req, res),
);

// Plans
router.get("/plans", (req, res) => superadminController.listPlans(req, res));
router.get("/plans/:id", (req, res) => superadminController.getPlan(req, res));
router.post("/plans", (req, res) => superadminController.createPlan(req, res));
router.put("/plans/:id", (req, res) =>
  superadminController.updatePlan(req, res),
);

// Payments & Refunds
router.get("/payments", (req, res) =>
  superadminController.listPayments(req, res),
);
router.post("/payments/:id/refund", (req, res) =>
  superadminController.processRefund(req, res),
);

// Configurations
router.get("/config/business", (req, res) =>
  superadminController.getBusinessConfig(req, res),
);
router.put("/config/business", (req, res) =>
  superadminController.updateBusinessConfig(req, res),
);
router.get("/config/tax", (req, res) =>
  superadminController.getTaxConfig(req, res),
);
router.post("/config/tax", (req, res) =>
  superadminController.createTaxConfig(req, res),
);

module.exports = router;
