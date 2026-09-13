/**
 * Inventory Controller
 *
 * Request handlers for inventory management and stock adjustments.
 */

const inventoryService = require('../services/inventory.service');
const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.user && req.user.organisationId) return req.user.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  return null;
};

const getInventory = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { search, limit, offset, branchId: queryBranchId } = req.query;
    const branchId = queryBranchId || req.headers['x-branch-id'] || req.tenant?.branchId || null;

    const inventory = await inventoryService.getInventory({
      organisationId,
      search,
      branchId,
      limit: Number(limit) || 100,
      offset: Number(offset) || 0,
    });

    res.status(200).json({
      success: true,
      count: inventory.length,
      data: inventory,
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch inventory',
    });
  }
};

const saveInventory = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const itemData = req.body;

    const saved = await inventoryService.saveOrUpdateInventory(organisationId, itemData);

    res.status(201).json({
      success: true,
      message: 'Inventory item saved successfully',
      data: saved,
    });
  } catch (error) {
    console.error('Error saving inventory item:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to save inventory item',
    });
  }
};

const updateInventory = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;
    const itemData = { ...req.body, id };

    const updated = await inventoryService.saveOrUpdateInventory(organisationId, itemData);

    res.status(200).json({
      success: true,
      message: 'Inventory item updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error(`Error updating inventory item ${req.params.id}:`, error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to update inventory item',
    });
  }
};

const deleteInventory = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const deleted = await inventoryService.deleteInventoryEntry(organisationId, id);

    res.status(200).json({
      success: true,
      message: deleted ? 'Inventory item deleted successfully' : 'Item not found or already deleted',
    });
  } catch (error) {
    console.error(`Error deleting inventory item ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete inventory item',
    });
  }
};

const getInventorySummary = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const branchId = req.query.branchId || req.headers['x-branch-id'] || req.tenant?.branchId || null;
    const summary = await inventoryService.getInventorySummary(organisationId, branchId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch inventory summary',
    });
  }
};

const getRecentStockMovements = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const limit = Number(req.query.limit) || 10;
    const branchId = req.query.branchId || req.headers['x-branch-id'] || req.tenant?.branchId || null;
    const movements = await inventoryService.getStockMovements(organisationId, limit, branchId);

    res.status(200).json({
      success: true,
      data: movements,
    });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stock movements',
    });
  }
};

const recordMovement = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { branchName, type, item, quantity, reference, status } = req.body;

    await inventoryService.recordStockMovement(organisationId, {
      branchName,
      type,
      item,
      quantity,
      reference,
      status,
    });

    res.status(201).json({
      success: true,
      message: 'Stock movement recorded successfully',
    });
  } catch (error) {
    console.error('Error recording stock movement:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record stock movement',
    });
  }
};

const getItemBarcode = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const barcodeData = await inventoryService.getItemBarcodeData(organisationId, id);

    res.status(200).json({
      success: true,
      data: barcodeData,
    });
  } catch (error) {
    console.error(`Error fetching barcode for item ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate barcode data',
    });
  }
};

module.exports = {
  getInventory,
  getInventorySummary,
  getRecentStockMovements,
  recordMovement,
  saveInventory,
  updateInventory,
  deleteInventory,
  getItemBarcode,
};
