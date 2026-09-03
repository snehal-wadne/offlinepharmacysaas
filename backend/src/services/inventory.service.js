/**
 * Inventory Service
 *
 * Business logic for inventory stock adjustments and batch management.
 */

const { pool } = require('../db/connection');
const inventoryRepo = require('../repositories/inventory.repository');
const productRepo = require('../repositories/product.repository');

const getInventory = async ({ organisationId, search, limit = 100, offset = 0 }) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  const query = `
    SELECT
      ib.id,
      ib.batch_number AS "batchNo",
      ib.quantity,
      ib.mrp,
      ib.shelf_location AS "shelfLocation",
      ib.created_at,
      ib.updated_at,
      p.id AS "productId",
      p.medicine_name AS "medicineName",
      p.brand_name AS "brandName",
      p.strength,
      p.pack_size AS "packSize",
      p.manufacturer,
      p.sku,
      s.name AS "supplierName",
      b.name AS "branchName",
      u.name AS "updatedBy"
    FROM inventory_batches ib
    INNER JOIN products p ON p.id = ib.product_id
    INNER JOIN branches b ON b.id = ib.branch_id
    INNER JOIN suppliers s ON s.id = ib.supplier_id
    LEFT JOIN users u ON u.id = ib.updated_by
    WHERE p.organisation_id = $1
      ${search ? `AND (p.medicine_name ILIKE $4 OR p.brand_name ILIKE $4 OR p.sku ILIKE $4 OR ib.batch_number ILIKE $4 OR s.name ILIKE $4)` : ''}
    ORDER BY ib.updated_at DESC, ib.created_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const values = search
    ? [organisationId, limit, offset, `%${search}%`]
    : [organisationId, limit, offset];

  const result = await pool.query(query, values);
  return result.rows;
};

const saveOrUpdateInventory = async (organisationId, itemData) => {
  const {
    id,
    medicineName,
    brandName,
    strength = '500mg',
    packSize = '15 Tablets',
    manufacturer = 'GSK',
    supplierName = 'GSK Pharmaceuticals',
    amount = '15.00',
    sku = 'SKU-001',
    batchNo = 'B-1001',
    quantity = 100,
    branchId = 'Main Branch',
    shelfLocation = 'A1-S1',
  } = itemData;

  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  const numMrp = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 15.0;
  const numQty = parseInt(quantity, 10) || 0;

  // 1. Resolve Product
  let productId;
  const pRes = await pool.query(
    `SELECT id FROM products WHERE organisation_id = $1 AND (LOWER(sku) = LOWER($2) OR LOWER(brand_name) = LOWER($3)) LIMIT 1;`,
    [organisationId, sku, brandName || medicineName]
  );

  if (pRes.rows.length > 0) {
    productId = pRes.rows[0].id;
    // Update product info
    await pool.query(
      `UPDATE products SET medicine_name = $1, brand_name = $2, strength = $3, pack_size = $4, manufacturer = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6;`,
      [medicineName || brandName, brandName || medicineName, strength, packSize, manufacturer, productId]
    );
  } else {
    const newP = await pool.query(
      `INSERT INTO products (organisation_id, medicine_name, brand_name, strength, pack_size, manufacturer, sku)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
      [organisationId, medicineName || brandName, brandName || medicineName, strength, packSize, manufacturer, sku]
    );
    productId = newP.rows[0].id;
  }

  // 2. Resolve Supplier
  let sId;
  const sRes = await pool.query(
    `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1;`,
    [organisationId, supplierName]
  );
  if (sRes.rows.length > 0) {
    sId = sRes.rows[0].id;
  } else {
    const newS = await pool.query(
      `INSERT INTO suppliers (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [organisationId, supplierName]
    );
    sId = newS.rows[0].id;
  }

  // 3. Resolve Branch
  let bId;
  const bRes = await pool.query(
    `SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1;`,
    [organisationId]
  );
  if (bRes.rows.length > 0) {
    bId = bRes.rows[0].id;
  } else {
    const newB = await pool.query(
      `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
      [organisationId, branchId || 'Main Branch']
    );
    bId = newB.rows[0].id;
  }

  // 4. Create or Update Inventory Batch
  let batchRecord;
  if (id) {
    const existing = await pool.query(
      `UPDATE inventory_batches
       SET product_id = $1, supplier_id = $2, batch_number = $3, mrp = $4, quantity = $5, shelf_location = $6, updated_at = CURRENT_TIMESTAMP
       WHERE (id::text = $7 OR batch_number = $7) RETURNING *;`,
      [productId, sId, batchNo, numMrp, numQty, shelfLocation, id]
    );
    if (existing.rows.length > 0) {
      batchRecord = existing.rows[0];
    }
  }

  if (!batchRecord) {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);

    const inserted = await pool.query(
      `INSERT INTO inventory_batches (product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, shelf_location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`,
      [productId, bId, sId, batchNo, expiryDate.toISOString().split('T')[0], numMrp, numQty, shelfLocation]
    );
    batchRecord = inserted.rows[0];
  }

  return {
    id: batchRecord.id,
    medicineName: medicineName || brandName,
    brandName,
    strength,
    packSize,
    manufacturer,
    supplierName,
    amount: `₹${numMrp.toFixed(2)}`,
    sku,
    batchNo,
    quantity: numQty,
    branchId,
    shelfLocation,
    updatedBy: 'Manager',
    lastUpdated: new Date().toISOString().split('T')[0],
  };
};

const deleteInventoryEntry = async (organisationId, batchId) => {
  if (!organisationId || !batchId) {
    throw new Error('organisationId and batchId are required');
  }

  const res = await pool.query(
    `DELETE FROM inventory_batches
     WHERE (id::text = $1 OR batch_number = $1)
     RETURNING id;`,
    [batchId]
  );

  return res.rowCount > 0;
};

module.exports = {
  getInventory,
  saveOrUpdateInventory,
  deleteInventoryEntry,
};
