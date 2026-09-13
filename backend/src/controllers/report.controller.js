/**
 * Reports & Analytics Controller
 *
 * Exposes endpoints for financial metrics, GSTR-1 data, and inventory analytics.
 */

const reportService = require('../services/report.service');

class ReportController {
  async getSalesSummary(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId, startDate, endDate } = req.query;

      const report = await reportService.getSalesSummary({
        organisationId,
        branchId,
        startDate,
        endDate,
      });

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      console.error('Error generating sales report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getGstReport(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId, month, year } = req.query;

      const report = await reportService.getGstReport({
        organisationId,
        branchId,
        month: month ? parseInt(month, 10) : undefined,
        year: year ? parseInt(year, 10) : undefined,
      });

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      console.error('Error generating GST report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getCashierReconciliation(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId, limit } = req.query;

      const report = await reportService.getCashierReconciliationReport({
        organisationId,
        branchId,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      return res.status(200).json({
        success: true,
        count: report.length,
        data: report,
      });
    } catch (err) {
      console.error('Error generating cashier reconciliation report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getExpiryReport(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId } = req.query;

      const report = await reportService.getExpiryReport({
        organisationId,
        branchId,
      });

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      console.error('Error generating expiry report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getFastMoving(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId, limit } = req.query;

      const report = await reportService.getFastMovingReport({
        organisationId,
        branchId,
        limit: limit ? parseInt(limit, 10) : 10,
      });

      return res.status(200).json({
        success: true,
        count: report.length,
        data: report,
      });
    } catch (err) {
      console.error('Error generating fast-moving report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getInventoryReport(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId || (await reportService.pool?.query('SELECT id FROM organisations LIMIT 1;'))?.rows[0]?.id;
      const { branchId } = req.query;

      const report = await reportService.getInventoryReport({
        organisationId: organisationId || '389edc41-8dca-4b2e-bade-981c496ca0ae',
        branchId,
      });

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      console.error('Error generating inventory report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getProfitLossReport(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId || (await reportService.pool?.query('SELECT id FROM organisations LIMIT 1;'))?.rows[0]?.id;
      const { branchId, startDate, endDate } = req.query;

      const report = await reportService.getProfitLossReport({
        organisationId: organisationId || '389edc41-8dca-4b2e-bade-981c496ca0ae',
        branchId,
        startDate,
        endDate,
      });

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      console.error('Error generating profit-loss report:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ReportController();
