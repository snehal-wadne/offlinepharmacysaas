/**
 * Supplier Service
 *
 * Business logic for Supplier operations.
 */

const supplierRepo = require('../repositories/supplier.repository');
const { pool } = require('../db/connection');

const normalizeSupplierStatus = (s) => {
  if (!s) return 'ACTIVE';
  const upper = String(s).toUpperCase().trim();
  if (upper === 'PENDING') return 'PENDING';
  if (upper === 'INACTIVE') return 'INACTIVE';
  return 'ACTIVE';
};

const getSuppliers = async ({ organisationId, search, limit = 50, offset = 0 }) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  if (search) {
    return await supplierRepo.searchSuppliers(organisationId, search, limit, offset);
  }

  return await supplierRepo.getSuppliersByOrganisation(organisationId, limit, offset);
};

const getSupplierById = async (organisationId, supplierId) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  return await supplierRepo.getSupplierById(organisationId, supplierId);
};

const createSupplier = async (supplierData) => {
  const {
    organisationId,
    name,
    contactPerson = null,
    phone = null,
    email = null,
    city = null,
    gstin = null,
    status = 'ACTIVE',
  } = supplierData;

  if (!organisationId || !name) {
    throw new Error('organisationId and name are required');
  }

  const supplier = await supplierRepo.createSupplier({
    organisationId,
    name,
    contactPerson,
    phone,
    email,
    city,
    gstin,
    status: normalizeSupplierStatus(status),
  });

  return supplier;
};

const updateSupplierStatus = async ({ organisationId, supplierId, status }) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const dbStatus = normalizeSupplierStatus(status);

  const res = await pool.query(
    `UPDATE suppliers
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $2 OR LOWER(name) = LOWER($2))
       AND organisation_id = $3
     RETURNING *;`,
    [dbStatus, supplierId, organisationId]
  );

  if (res.rows.length === 0) {
    const error = new Error(`Supplier ${supplierId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplierStatus,
};
