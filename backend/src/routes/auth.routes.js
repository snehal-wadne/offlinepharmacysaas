/**
 * Auth Routes
 *
 * Endpoints:
 * - POST /api/auth/login
 * - POST /api/auth/register
 * - POST /api/auth/google
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 * - POST /api/auth/pin-login (Fails closed)
 */

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares/auth.middleware");

router.get("/me", authenticate, authController.getMe);
router.get("/users", authenticate, authController.getUsers);
router.post("/users", authenticate, authController.createStaffUser);
router.put("/users/:id", authenticate, authController.updateStaffUser);
router.patch("/users/:id/status", authenticate, authController.updateStaffStatus);
router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/google", authController.googleLogin);
router.post("/google-onboard", authController.googleOnboard);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/pin-login", authController.pinLogin);

module.exports = router;
