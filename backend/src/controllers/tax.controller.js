/**
 * Tax & GST Controller
 *
 * Exposes endpoints for managing tax slabs and branch GST parameters.
 */

const taxService = require('../services/tax.service');

class TaxController {
  async getTaxes(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const taxes = await taxService.getTaxes(organisationId);

      return res.status(200).json({
        success: true,
        count: taxes.length,
        data: taxes,
      });
    } catch (err) {
      console.error('Error fetching taxes:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async createTax(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const tax = await taxService.createTax({
        ...req.body,
        organisationId,
      });

      return res.status(201).json({
        success: true,
        message: 'Tax rate slab created successfully',
        data: tax,
      });
    } catch (err) {
      console.error('Error creating tax:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getBranchGst(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId } = req.params;

      const settings = await taxService.getBranchGstSettings(organisationId, branchId);
      return res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (err) {
      console.error('Error fetching branch GST settings:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateBranchGst(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { branchId } = req.params;

      const updated = await taxService.updateBranchGstSettings({
        ...req.body,
        organisationId,
        branchId,
      });

      return res.status(200).json({
        success: true,
        message: 'Branch GST settings updated successfully',
        data: updated,
      });
    } catch (err) {
      console.error('Error updating branch GST settings:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateTax(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { id } = req.params;
      const updated = await taxService.updateTax(organisationId, id, req.body);

      return res.status(200).json({
        success: true,
        message: 'Tax rate updated successfully',
        data: updated,
      });
    } catch (err) {
      console.error('Error updating tax:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async setTaxStatus(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { id } = req.params;
      const { isActive, isApplied } = req.body;
      const statusToSet = isActive !== undefined ? isActive : isApplied;
      const updated = await taxService.setTaxStatus(organisationId, id, statusToSet);

      return res.status(200).json({
        success: true,
        message: 'Tax status updated successfully',
        data: updated,
      });
    } catch (err) {
      console.error('Error setting tax status:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteTax(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { id } = req.params;
      const deleted = await taxService.deleteTax(organisationId, id);

      return res.status(200).json({
        success: true,
        message: 'Tax rate deleted successfully',
        data: deleted,
      });
    } catch (err) {
      console.error('Error deleting tax:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new TaxController();
