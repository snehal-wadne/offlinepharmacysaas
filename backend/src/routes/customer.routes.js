/**
 * Customer Routes
 *
 * Base endpoint: /api/customers
 */

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');

// GET /api/customers/summary - Customer KPIs
router.get('/summary', customerController.getCustomersSummary);

// GET /api/customers - List customers
router.get('/', customerController.getCustomers);

// POST /api/customers - Create customer
router.post('/', customerController.createCustomer);

// PUT /api/customers/:id - Update customer
router.put('/:id', customerController.updateCustomer);

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;
