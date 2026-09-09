/**
 * Auth Routes
 *
 * Endpoints:
 * - POST /api/auth/login
 * - POST /api/auth/pin-login
 * - POST /api/auth/register
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/pin-login', authController.pinLogin);
router.post('/register', authController.register);

module.exports = router;
