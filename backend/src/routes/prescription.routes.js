/**
 * Prescription Routes
 *
 * Base endpoint: /api/prescriptions
 */

const express = require('express');
const router = express.Router();
const prescriptionController = require('../controllers/prescription.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// All prescription routes use authentication middleware
router.use(authenticate);

// GET /api/prescriptions - List & filter prescriptions
router.get('/', prescriptionController.getPrescriptions);

// GET /api/prescriptions/:id - Single prescription details
router.get('/:id', prescriptionController.getPrescriptionById);

// POST /api/prescriptions - Create a new prescription
router.post('/', prescriptionController.createPrescription);

// PATCH /api/prescriptions/:id/status - Update prescription status (ACTIVE / DISPENSED / EXPIRED)
router.patch('/:id/status', prescriptionController.updatePrescriptionStatus);

module.exports = router;
