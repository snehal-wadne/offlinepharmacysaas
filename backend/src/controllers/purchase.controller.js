/**
 * Purchase Controller
 *
 * Exposes Express request handlers for purchase endpoints.
 */

const purchaseService = require('../services/purchase.service');

const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.user && req.user.organisationId) return req.user.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  return null;
};

/**
 * GET /api/purchases
 * Query params: status, search, branchId, supplierId, limit, offset
 */
const getPurchases = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { status, search, branchId, supplierId, limit, offset } = req.query;

    const purchases = await purchaseService.getPurchases({
      organisationId,
      status,
      search,
      branchId,
      supplierId,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      count: purchases.length,
      data: purchases,
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to fetch purchases',
    });
  }
};

/**
 * GET /api/purchases/:id
 */
const getPurchaseById = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const purchase = await purchaseService.getPurchaseById(organisationId, id);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: `Purchase order ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    console.error(`Error fetching purchase ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to fetch purchase order',
    });
  }
};

/**
 * POST /api/purchases
 */
const createPurchase = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const purchaseData = {
      ...req.body,
      organisationId,
    };

    const newPO = await purchaseService.createPurchase(purchaseData);

    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: newPO,
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to create purchase order',
    });
  }
};

/**
 * PATCH /api/purchases/:id/status
 * Action: Update status (e.g. APPROVED, CANCELLED, PENDING)
 */
const updatePurchaseStatus = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required in request body',
      });
    }

    const updatedPO = await purchaseService.updatePurchaseStatus(organisationId, id, status);

    res.status(200).json({
      success: true,
      message: `Purchase Order ${id} status updated to ${updatedPO.status}`,
      data: updatedPO,
    });
  } catch (error) {
    console.error(`Error updating status for PO ${req.params.id}:`, error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to update purchase status',
    });
  }
};

/**
 * POST /api/purchases/:id/receive
 * Action button: Receive stock for PO (creates Goods Receipt and updates PO status to RECEIVED)
 */
const receivePurchase = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;
    const receiveData = req.body || {};

    const result = await purchaseService.receivePurchaseStock(organisationId, id, receiveData);

    res.status(200).json({
      success: true,
      message: `Received stock for PO ${id}. PO Status is now ${result.purchase.status}`,
      data: result,
    });
  } catch (error) {
    console.error(`Error receiving stock for PO ${req.params.id}:`, error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to receive purchase stock',
    });
  }
};

const getPurchaseSummary = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const summary = await purchaseService.getPurchaseSummary(organisationId);
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching purchase summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch purchase summary',
    });
  }
};

module.exports = {
  getPurchases,
  getPurchaseById,
  getPurchaseSummary,
  createPurchase,
  updatePurchaseStatus,
  receivePurchase,
};
