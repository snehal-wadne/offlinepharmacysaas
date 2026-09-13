/**
 * Supplier Controller
 *
 * Request handlers for Supplier endpoints.
 */

const supplierService = require('../services/supplier.service');
const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.user && req.user.organisationId) return req.user.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  return null;
};

const getSuppliers = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { search, limit, offset } = req.query;

    const suppliers = await supplierService.getSuppliers({
      organisationId,
      search,
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers,
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch suppliers',
    });
  }
};

const getSupplierById = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const supplier = await supplierService.getSupplierById(organisationId, id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: `Supplier ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    console.error(`Error fetching supplier ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch supplier',
    });
  }
};

const createSupplier = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const supplierData = {
      ...req.body,
      organisationId,
    };

    const newSupplier = await supplierService.createSupplier(supplierData);

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: newSupplier,
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to create supplier',
    });
  }
};

const updateSupplierStatus = async (req, res) => {
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
        error: 'Status is required',
      });
    }

    const updatedSupplier = await supplierService.updateSupplierStatus({
      organisationId,
      supplierId: id,
      status,
    });

    res.status(200).json({
      success: true,
      message: 'Supplier status updated successfully',
      data: updatedSupplier,
    });
  } catch (error) {
    console.error(`Error updating status for supplier ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update supplier status',
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const updatedSupplier = await supplierService.updateSupplier(organisationId, id, req.body);

    res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      data: updatedSupplier,
    });
  } catch (error) {
    console.error(`Error updating supplier ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update supplier',
    });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const deleted = await supplierService.deleteSupplier(organisationId, id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Supplier ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting supplier ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to delete supplier',
    });
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplierStatus,
  updateSupplier,
  deleteSupplier,
};
