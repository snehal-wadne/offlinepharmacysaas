/**
 * Goods Receipt Controller
 *
 * Request handlers for Goods Receipts.
 */

const goodsReceiptService = require('../services/goods-receipt.service');

const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  const orgRes = await pool.query('SELECT id FROM organisations LIMIT 1;');
  return orgRes.rows[0]?.id;
};

const getGoodsReceipts = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    const { purchaseId, limit, offset } = req.query;

    const receipts = await goodsReceiptService.getGoodsReceipts({
      organisationId,
      purchaseId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      count: receipts.length,
      data: receipts,
    });
  } catch (error) {
    console.error('Error fetching goods receipts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch goods receipts',
    });
  }
};

const getGoodsReceiptById = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    const { id } = req.params;

    const receipt = await goodsReceiptService.getGoodsReceiptById(organisationId, id);
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: `Goods receipt ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    console.error(`Error fetching goods receipt ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch goods receipt',
    });
  }
};

const createGoodsReceipt = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    const receiptData = {
      ...req.body,
      organisationId,
    };

    const newReceipt = await goodsReceiptService.createGoodsReceipt(receiptData);

    res.status(201).json({
      success: true,
      message: 'Goods receipt created successfully',
      data: newReceipt,
    });
  } catch (error) {
    console.error('Error creating goods receipt:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to create goods receipt',
    });
  }
};

const updateGoodsReceiptStatus = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const updatedReceipt = await goodsReceiptService.updateGoodsReceiptStatus({
      organisationId,
      receiptId: id,
      status,
    });

    res.status(200).json({
      success: true,
      message: 'Goods receipt status updated successfully',
      data: updatedReceipt,
    });
  } catch (error) {
    console.error(`Error updating status for goods receipt ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update goods receipt status',
    });
  }
};

module.exports = {
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt,
  updateGoodsReceiptStatus,
};
