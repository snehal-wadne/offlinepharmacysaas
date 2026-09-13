/**
 * Customer Controller
 *
 * Request handlers for Customer API endpoints.
 */

const customerService = require('../services/customer.service');
const { pool } = require('../db/connection');

const getOrgId = async (req) => {
  if (req.user && req.user.organisationId) return req.user.organisationId;
  if (req.headers['x-organisation-id']) return req.headers['x-organisation-id'];
  if (req.query && req.query.organisationId) return req.query.organisationId;
  if (req.body && req.body.organisationId) return req.body.organisationId;

  return null;
};

const getCustomers = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { search, category, limit, offset } = req.query;

    const customers = await customerService.getCustomers({
      organisationId,
      search,
      category,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch customers',
    });
  }
};

const getCustomersSummary = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const summary = await customerService.getCustomersSummary(organisationId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching customer summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch customer summary',
    });
  }
};

const createCustomer = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const customerData = {
      ...req.body,
      organisationId,
    };

    const newCustomer = await customerService.createCustomer(customerData);

    res.status(201).json({
      success: true,
      message: 'Customer profile created successfully',
      data: newCustomer,
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Failed to create customer',
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const updatedCustomer = await customerService.updateCustomer(organisationId, id, req.body);

    res.status(200).json({
      success: true,
      message: 'Customer information updated successfully',
      data: updatedCustomer,
    });
  } catch (error) {
    console.error(`Error updating customer ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to update customer',
    });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const organisationId = await getOrgId(req);
    if (!organisationId) {
      return res.status(400).json({ error: 'Organisation ID is required' });
    }
    const { id } = req.params;

    const deleted = await customerService.deleteCustomer(organisationId, id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Customer ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer profile deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting customer ${req.params.id}:`, error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Failed to delete customer',
    });
  }
};

module.exports = {
  getCustomers,
  getCustomersSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
