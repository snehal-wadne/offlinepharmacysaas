/**
 * Stock Transfer Controller
 *
 * Handles HTTP requests for inter-branch inventory transfer workflows.
 */

const stockTransferService = require('../services/stock-transfer.service');

class StockTransferController {
  async createTransfer(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const transfer = await stockTransferService.createTransfer({
        ...req.body,
        organisationId,
        createdBy: req.user?.id,
      });

      return res.status(201).json({
        success: true,
        message: 'Stock transfer requested successfully',
        data: transfer,
      });
    } catch (err) {
      console.error('Error creating stock transfer:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getTransfers(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { branchId, limit, offset } = req.query;

      const transfers = await stockTransferService.getTransfers({
        organisationId,
        branchId,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      return res.status(200).json({
        success: true,
        count: transfers.length,
        data: transfers,
      });
    } catch (err) {
      console.error('Error fetching stock transfers:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getTransferById(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.query.organisationId;
      const { id } = req.params;

      const transfer = await stockTransferService.getTransferById(organisationId, id);
      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: 'Stock transfer not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: transfer,
      });
    } catch (err) {
      console.error('Error fetching stock transfer details:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateTransferStatus(req, res) {
    try {
      const organisationId = req.user?.organisationId || req.body.organisationId;
      const { id } = req.params;
      const { status } = req.body;

      const updated = await stockTransferService.updateTransferStatus(
        organisationId,
        id,
        status,
        req.user?.id
      );

      return res.status(200).json({
        success: true,
        message: `Stock transfer status updated to ${status}`,
        data: updated,
      });
    } catch (err) {
      console.error('Error updating stock transfer status:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new StockTransferController();
