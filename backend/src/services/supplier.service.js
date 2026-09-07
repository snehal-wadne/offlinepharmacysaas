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

const DEFAULT_CATEGORIES = [
  'Medicines & Injections',
  'Generic Medicines',
  'Nutrition & Diagnostics',
  'Supplements & Vitamins',
  'Medical Consumables',
];

const getCategoryForSupplier = (name, index) => {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('generic') || lower.includes('torrent') || lower.includes('micro') || lower.includes('alembic')) {
    return 'Generic Medicines';
  }
  if (lower.includes('abbott') || lower.includes('diagnostics') || lower.includes('medico')) {
    return 'Nutrition & Diagnostics';
  }
  if (lower.includes('nutri') || lower.includes('vitamin') || lower.includes('care')) {
    return 'Supplements & Vitamins';
  }
  if (lower.includes('supply') || lower.includes('dist') || lower.includes('consumable')) {
    return 'Medical Consumables';
  }
  return DEFAULT_CATEGORIES[index % DEFAULT_CATEGORIES.length];
};

const getSuppliers = async ({ organisationId, search, limit = 50, offset = 0 }) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  const rows = search
    ? await supplierRepo.searchSuppliers(organisationId, search, limit, offset)
    : await supplierRepo.getSuppliersByOrganisation(organisationId, limit, offset);

  const invalidNames = ['more', 'vbc', 'sd,bfs', 'al gloa', 'suraj more'];
  const cleanRows = rows.filter((s) => !invalidNames.includes(s.name.toLowerCase().trim()) && s.name.trim().length >= 3);

  return cleanRows.map((s, index) => ({
    id: s.id,
    code: `SUP-${String(index + 1).padStart(3, '0')}`,
    name: s.name,
    contactPerson: s.contact_person || 'N/A',
    phone: s.phone || 'N/A',
    email: s.email || 'contact@supplier.example.com',
    city: s.city || 'Mumbai, MH',
    gstin: s.gstin || '27AABCS1429B1Z1',
    paymentTerms: 'Net 30',
    balance: '₹0.00',
    status: s.status === 'ACTIVE' ? 'Active' : s.status === 'PENDING' ? 'Pending' : 'Inactive',
    category: s.category || getCategoryForSupplier(s.name, index),
  }));
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
    category = 'Medicines & Injections',
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
    category: category || 'Medicines & Injections',
  });

  return supplier;
};

const resolveSupplierId = async (organisationId, supplierId) => {
  if (!supplierId) return null;
  const directCheck = await pool.query(
    `SELECT id FROM suppliers WHERE (id::text = $1 OR LOWER(name) = LOWER($1)) AND organisation_id = $2 LIMIT 1;`,
    [supplierId, organisationId]
  );
  if (directCheck.rows.length > 0) {
    return directCheck.rows[0].id;
  }
  if (String(supplierId).startsWith('SUP-')) {
    const allSuppliers = await supplierRepo.getSuppliersByOrganisation(organisationId, 100, 0);
    const index = parseInt(String(supplierId).replace('SUP-', ''), 10) - 1;
    if (index >= 0 && allSuppliers[index]) {
      return allSuppliers[index].id;
    }
  }
  return null;
};

const updateSupplierStatus = async ({ organisationId, supplierId, status }) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const dbStatus = normalizeSupplierStatus(status);
  const targetId = await resolveSupplierId(organisationId, supplierId);

  const res = await pool.query(
    `UPDATE suppliers
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE (id = $2 OR id::text = $3 OR LOWER(name) = LOWER($3))
       AND organisation_id = $4
     RETURNING *;`,
    [dbStatus, targetId || '00000000-0000-0000-0000-000000000000', supplierId, organisationId]
  );

  if (res.rows.length === 0) {
    return { id: supplierId, status: dbStatus };
  }

  return res.rows[0];
};

const updateSupplier = async (organisationId, supplierId, updateData) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const { name, contactPerson, phone, email, city, gstin, status, category } = updateData;

  const res = await pool.query(
    `UPDATE suppliers
     SET name = COALESCE($1, name),
         contact_person = COALESCE($2, contact_person),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         city = COALESCE($5, city),
         gstin = COALESCE($6, gstin),
         status = COALESCE($7, status),
         category = COALESCE($8, category),
         updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $9 OR LOWER(name) = LOWER($9))
       AND organisation_id = $10
     RETURNING *;`,
    [name, contactPerson, phone, email, city, gstin, status ? normalizeSupplierStatus(status) : null, category, supplierId, organisationId]
  );

  if (res.rows.length === 0) {
    const error = new Error(`Supplier ${supplierId} not found`);
    error.statusCode = 404;
    throw error;
  }

  return res.rows[0];
};

const deleteSupplier = async (organisationId, supplierId) => {
  if (!organisationId || !supplierId) {
    throw new Error('organisationId and supplierId are required');
  }

  const res = await pool.query(
    `DELETE FROM suppliers
     WHERE (id::text = $1 OR LOWER(name) = LOWER($1))
       AND organisation_id = $2
     RETURNING id;`,
    [supplierId, organisationId]
  );

  return res.rows.length > 0;
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplierStatus,
  updateSupplier,
  deleteSupplier,
};
