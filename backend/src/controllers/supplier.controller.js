/**
 * Supplier Controller
 *
 * Request handlers for Supplier endpoints.
 */

const supplierService = require('../services/supplier.service');
const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  const orgRes = await pool.query('SELECT id FROM organisations LIMIT 1;');
  return orgRes.rows[0]?.id;
};

const getSuppliers = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
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

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplierStatus,
};
