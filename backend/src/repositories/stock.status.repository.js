/**
 * Stock Status Repository
 *
 * Handles stock quantity changes for:
 * - Reorder
 * - Write-off
 *
 * Database table:
 * inventory_batches
 *
 * Important:
 * quantity is stored in inventory_batches.quantity.
 */

const { pool } = require("../db/connection");

/**
 * Find an inventory batch using organisation + SKU + batch number.
 *
 * products.sku identifies the product.
 * inventory_batches.batch_number identifies the physical batch.
 */
const findInventoryBatch = async ({
  organisationId,
  sku,
  batchNumber,
  inventoryBatchId,
}) => {
  let query;
  let values;

  if (inventoryBatchId) {
    query = `
      SELECT
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name,
        p.organisation_id
      FROM inventory_batches ib
      INNER JOIN products p
        ON p.id = ib.product_id
      WHERE ib.id = $1
        AND p.organisation_id = $2
      LIMIT 1
    `;

    values = [inventoryBatchId, organisationId];
  } else {
    query = `
      SELECT
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name,
        p.organisation_id
      FROM inventory_batches ib
      INNER JOIN products p
        ON p.id = ib.product_id
      WHERE p.organisation_id = $1
        AND p.sku = $2
        AND ib.batch_number = $3
      LIMIT 1
    `;

    values = [organisationId, sku, batchNumber];
  }

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Increase stock quantity by reorderLevel.
 *
 * Example:
 *
 * current quantity = 20
 * reorderLevel = 10
 *
 * new quantity = 30
 *
 * This is done directly in SQL:
 *
 * quantity = quantity + $value
 *
 * so we don't have a race condition caused by:
 *
 * SELECT quantity
 * UPDATE quantity
 */
const reorderStock = async ({
  organisationId,
  sku,
  batchNumber,
  inventoryBatchId,
  reorderLevel,
  updatedBy,
}) => {
  let query;
  let values;

  if (inventoryBatchId) {
    query = `
      UPDATE inventory_batches ib
      SET
        quantity = quantity + $1,
        updated_by = $2,
        updated_at = CURRENT_TIMESTAMP
      FROM products p
      WHERE ib.id = $3
        AND ib.product_id = p.id
        AND p.organisation_id = $4
      RETURNING
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name
    `;

    values = [
      reorderLevel,
      updatedBy || null,
      inventoryBatchId,
      organisationId,
    ];
  } else {
    query = `
      UPDATE inventory_batches ib
      SET
        quantity = quantity + $1,
        updated_by = $2,
        updated_at = CURRENT_TIMESTAMP
      FROM products p
      WHERE ib.product_id = p.id
        AND p.organisation_id = $3
        AND p.sku = $4
        AND ib.batch_number = $5
      RETURNING
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name
    `;

    values = [
      reorderLevel,
      updatedBy || null,
      organisationId,
      sku,
      batchNumber,
    ];
  }

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Write off stock.
 *
 * Quantity becomes exactly 0.
 */
const writeOffStock = async ({
  organisationId,
  sku,
  batchNumber,
  inventoryBatchId,
  updatedBy,
}) => {
  let query;
  let values;

  if (inventoryBatchId) {
    query = `
      UPDATE inventory_batches ib
      SET
        quantity = 0,
        updated_by = $1,
        updated_at = CURRENT_TIMESTAMP
      FROM products p
      WHERE ib.id = $2
        AND ib.product_id = p.id
        AND p.organisation_id = $3
      RETURNING
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name
    `;

    values = [
      updatedBy || null,
      inventoryBatchId,
      organisationId,
    ];
  } else {
    query = `
      UPDATE inventory_batches ib
      SET
        quantity = 0,
        updated_by = $1,
        updated_at = CURRENT_TIMESTAMP
      FROM products p
      WHERE ib.product_id = p.id
        AND p.organisation_id = $2
        AND p.sku = $3
        AND ib.batch_number = $4
      RETURNING
        ib.id,
        ib.product_id,
        ib.branch_id,
        ib.supplier_id,
        ib.batch_number,
        ib.quantity,
        ib.expiry_date,
        ib.mrp,
        p.sku,
        p.medicine_name,
        p.brand_name
    `;

    values = [
      updatedBy || null,
      organisationId,
      sku,
      batchNumber,
    ];
  }

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

module.exports = {
  findInventoryBatch,
  reorderStock,
  writeOffStock,
};