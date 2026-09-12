/**
 * Prescription Controller
 *
 * Exposes endpoints for managing prescriptions and clinical patient linkages.
 */

const prescriptionService = require('../services/prescription.service');

class PrescriptionController {
  async createPrescription(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const prescription = await prescriptionService.createPrescription({
        ...req.body,
        organisationId,
      });

      return res.status(201).json({
        success: true,
        message: 'Prescription created successfully',
        data: prescription,
      });
    } catch (err) {
      console.error('Error creating prescription:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getPrescriptions(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { customerId, search, status, limit, offset } = req.query;

      const prescriptions = await prescriptionService.getPrescriptions({
        organisationId,
        customerId,
        search,
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      return res.status(200).json({
        success: true,
        count: prescriptions.length,
        data: prescriptions,
      });
    } catch (err) {
      console.error('Error fetching prescriptions:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getPrescriptionById(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { id } = req.params;

      const prescription = await prescriptionService.getPrescriptionById(organisationId, id);
      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: 'Prescription not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: prescription,
      });
    } catch (err) {
      console.error('Error fetching prescription details:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updatePrescriptionStatus(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prescriptionService.updatePrescriptionStatus(organisationId, id, status);
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Prescription not found to update',
        });
      }

      return res.status(200).json({
        success: true,
        message: `Prescription status updated to ${status}`,
        data: updated,
      });
    } catch (err) {
      console.error('Error updating prescription status:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new PrescriptionController();
