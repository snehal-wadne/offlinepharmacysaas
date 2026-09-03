/**
 * Inventory Repository
 *
 * Purpose:
 * Handles direct database operations related to inventory
 * batches and stock quantities.
 *
 * Inventory is maintained at branch level. Each inventory
 * record represents a particular product batch stored at a
 * particular branch.
 *
 * Product information such as category belongs to the products
 * table and is retrieved through the product relationship.
 *
 * The repository is responsible only for database operations.
 * Business rules such as stock validation, FEFO selection,
 * permissions, and stock-transfer rules belong to the service
 * layer.
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Inventory Repository
 *     ↓
 * PostgreSQL
 */

const { pool } = require("../db/connection");

/**
 * Create a new inventory batch.
 *
 * A batch belongs to:
 *
 * - a product
 * - a branch
 * - a supplier
 *
 * Product category is stored on the product itself and is
 * therefore not duplicated in inventory_batches.
 *
 * @param {Object} inventory
 * @param {string} inventory.productId
 * @param {string} inventory.branchId
 * @param {string} inventory.supplierId
 * @param {string} inventory.batchNumber
 * @param {string} inventory.expiryDate
 * @param {number} inventory.mrp
 * @param {number} inventory.quantity
 * @param {string} inventory.shelfLocation
 * @param {string} inventory.updatedBy
 *
 * @returns {Object} Newly created inventory batch
 */
const createInventoryBatch = async ({
  productId,
  branchId,
  supplierId,
  batchNumber,
  expiryDate,
  mrp,
  quantity,
  shelfLocation = null,
  updatedBy = null,
}) => {
  const query = `
        INSERT INTO inventory_batches (
            product_id,
            branch_id,
            supplier_id,
            batch_number,
            expiry_date,
            mrp,
            quantity,
            shelf_location,
            updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
            id,
            product_id,
            branch_id,
            supplier_id,
            batch_number,
            expiry_date,
            mrp,
            quantity,
            shelf_location,
            updated_by,
            created_at,
            updated_at;
    `;

  const values = [
    productId,
    branchId,
    supplierId,
    batchNumber,
    expiryDate,
    mrp,
    quantity,
    shelfLocation,
    updatedBy,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
};

/**
 * Get a single inventory batch by ID.
 *
 * The branch ID is also required so that the caller cannot
 * accidentally retrieve inventory belonging to another branch.
 *
 * @param {string} branchId
 * @param {string} inventoryBatchId
 *
 * @returns {Object|null} Inventory batch or null if not found
 */
const getInventoryBatchById = async (branchId, inventoryBatchId) => {
  const query = `
        SELECT
            ib.id,
            ib.product_id,
            p.category,
            ib.branch_id,
            ib.supplier_id,
            ib.batch_number,
            ib.expiry_date,
            ib.mrp,
            ib.quantity,
            ib.shelf_location,
            ib.updated_by,
            ib.created_at,
            ib.updated_at
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        WHERE ib.id = $1
          AND ib.branch_id = $2;
    `;

  const values = [inventoryBatchId, branchId];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Get all inventory batches belonging to a branch.
 *
 * Product and supplier information are joined so the frontend
 * can display useful inventory information without requiring
 * separate requests for every row.
 *
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Inventory batches
 */
const getInventoryByBranch = async (branchId, limit = 50, offset = 0) => {
  const query = `
        SELECT
            ib.id,
            ib.product_id,
            p.category,
            p.medicine_name,
            p.brand_name,
            p.strength,
            p.pack_size,
            ib.branch_id,
            ib.supplier_id,
            s.name AS supplier_name,
            ib.batch_number,
            ib.expiry_date,
            ib.mrp,
            ib.quantity,
            ib.shelf_location,
            ib.updated_by,
            ib.created_at,
            ib.updated_at
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        INNER JOIN suppliers s
            ON s.id = ib.supplier_id
        WHERE ib.branch_id = $1
        ORDER BY ib.expiry_date ASC, p.medicine_name ASC, ib.id ASC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [branchId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Get all inventory batches for a specific product at a branch.
 *
 * A product can have multiple batches at the same branch.
 *
 * @param {string} branchId
 * @param {string} productId
 *
 * @returns {Object[]} Product batches at the branch
 */
const getProductBatchesAtBranch = async (branchId, productId) => {
  const query = `
        SELECT
            ib.id,
            ib.product_id,
            p.category,
            p.medicine_name,
            p.brand_name,
            p.strength,
            p.pack_size,
            ib.branch_id,
            ib.supplier_id,
            s.name AS supplier_name,
            ib.batch_number,
            ib.expiry_date,
            ib.mrp,
            ib.quantity,
            ib.shelf_location,
            ib.updated_by,
            ib.created_at,
            ib.updated_at
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        INNER JOIN suppliers s
            ON s.id = ib.supplier_id
        WHERE ib.branch_id = $1
          AND ib.product_id = $2
        ORDER BY ib.expiry_date ASC, ib.id ASC;
    `;

  const values = [branchId, productId];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Search inventory within a branch.
 *
 * The search covers:
 *
 * - category
 * - medicine name
 * - brand name
 * - manufacturer
 * - SKU
 * - batch number
 * - supplier name
 * - shelf location
 *
 * @param {string} branchId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Matching inventory batches
 */
const searchInventory = async (
  branchId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ib.id,
            ib.product_id,
            p.category,
            p.medicine_name,
            p.brand_name,
            p.strength,
            p.pack_size,
            p.manufacturer,
            p.sku,
            ib.branch_id,
            ib.supplier_id,
            s.name AS supplier_name,
            ib.batch_number,
            ib.expiry_date,
            ib.mrp,
            ib.quantity,
            ib.shelf_location,
            ib.updated_by,
            ib.created_at,
            ib.updated_at
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        INNER JOIN suppliers s
            ON s.id = ib.supplier_id
        WHERE ib.branch_id = $1
          AND (
                p.category ILIKE $2
                OR p.medicine_name ILIKE $2
                OR p.brand_name ILIKE $2
                OR p.manufacturer ILIKE $2
                OR p.sku ILIKE $2
                OR ib.batch_number ILIKE $2
                OR s.name ILIKE $2
                OR ib.shelf_location ILIKE $2
          )
        ORDER BY ib.expiry_date ASC, p.medicine_name ASC, ib.id ASC
        LIMIT $3
        OFFSET $4;
    `;

  const searchPattern = `%${searchTerm}%`;

  const values = [branchId, searchPattern, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Get batches that are approaching expiry.
 *
 * This is useful for the batch-expiry section of the inventory
 * portal.
 *
 * @param {string} branchId
 * @param {number} days
 *
 * @returns {Object[]} Batches expiring within the given period
 */
const getExpiringBatches = async (branchId, days = 90) => {
  const query = `
        SELECT
            ib.id,
            ib.product_id,
            p.category,
            p.medicine_name,
            p.brand_name,
            p.strength,
            ib.branch_id,
            ib.supplier_id,
            s.name AS supplier_name,
            ib.batch_number,
            ib.expiry_date,
            ib.mrp,
            ib.quantity,
            ib.shelf_location
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        INNER JOIN suppliers s
            ON s.id = ib.supplier_id
        WHERE ib.branch_id = $1
          AND ib.expiry_date <= CURRENT_DATE + ($2 * INTERVAL '1 day')
          AND ib.expiry_date >= CURRENT_DATE
          AND ib.quantity > 0
        ORDER BY ib.expiry_date ASC, p.medicine_name ASC;
    `;

  const values = [branchId, days];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Get all product categories currently represented in a branch's
 * inventory.
 *
 * Category belongs to the product, so inventory_batches is joined
 * with products to obtain the category.
 *
 * Only categories with inventory records in the specified branch
 * are returned.
 *
 * @param {string} branchId
 *
 * @returns {string[]} Available inventory categories
 */
const getInventoryCategories = async (branchId) => {
  const query = `
        SELECT DISTINCT
            p.category
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        WHERE ib.branch_id = $1
        ORDER BY p.category ASC;
    `;

  const values = [branchId];

  const result = await pool.query(query, values);

  return result.rows.map((row) => row.category);
};

/**
 * Get inventory summary grouped by product category.
 *
 * This query is intended for inventory dashboard/reporting
 * screens.
 *
 * For each category it returns:
 *
 * - total_products:
 *     Number of distinct products in the category.
 *
 * - total_items:
 *     Total quantity of all inventory batches in the category.
 *
 * - total_valuation:
 *     Total stock value calculated as quantity × MRP.
 *
 * Category belongs to products, while quantity and MRP belong
 * to inventory batches, so the aggregation is performed by
 * joining both tables.
 *
 * @param {string} branchId
 *
 * @returns {Object[]} Category-level inventory summary
 */
const getInventoryCategorySummary = async (branchId) => {
  const query = `
        SELECT
            p.category,
            COUNT(DISTINCT ib.product_id) AS total_products,
            COALESCE(SUM(ib.quantity), 0) AS total_items,
            COALESCE(
                SUM(ib.quantity * ib.mrp),
                0
            ) AS total_valuation
        FROM inventory_batches ib
        INNER JOIN products p
            ON p.id = ib.product_id
        WHERE ib.branch_id = $1
        GROUP BY p.category
        ORDER BY p.category ASC;
    `;

  const values = [branchId];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update inventory batch information.
 *
 * This updates descriptive/batch information but deliberately
 * does not modify quantity.
 *
 * Product category is not updated here because category belongs
 * to products, not inventory batches.
 *
 * @param {string} branchId
 * @param {string} inventoryBatchId
 * @param {Object} inventory
 *
 * @returns {Object|null} Updated inventory batch
 */
const updateInventoryBatch = async (
  branchId,
  inventoryBatchId,
  {
    batchNumber,
    expiryDate,
    mrp,
    shelfLocation = null,
    supplierId,
    updatedBy = null,
  },
) => {
  const query = `
        UPDATE inventory_batches
        SET
            batch_number = $1,
            expiry_date = $2,
            mrp = $3,
            shelf_location = $4,
            supplier_id = $5,
            updated_by = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
          AND branch_id = $8
        RETURNING
            id,
            product_id,
            branch_id,
            supplier_id,
            batch_number,
            expiry_date,
            mrp,
            quantity,
            shelf_location,
            updated_by,
            created_at,
            updated_at;
    `;

  const values = [
    batchNumber,
    expiryDate,
    mrp,
    shelfLocation,
    supplierId,
    updatedBy,
    inventoryBatchId,
    branchId,
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Update the quantity of an inventory batch.
 *
 * @param {string} branchId
 * @param {string} inventoryBatchId
 * @param {number} quantity
 * @param {string|null} updatedBy
 *
 * @returns {Object|null} Updated inventory batch
 */
const updateInventoryQuantity = async (
  branchId,
  inventoryBatchId,
  quantity,
  updatedBy = null,
) => {
  const query = `
        UPDATE inventory_batches
        SET
            quantity = $1,
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND branch_id = $4
        RETURNING
            id,
            product_id,
            branch_id,
            supplier_id,
            batch_number,
            expiry_date,
            mrp,
            quantity,
            shelf_location,
            updated_by,
            created_at,
            updated_at;
    `;

  const values = [quantity, updatedBy, inventoryBatchId, branchId];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
};

/**
 * Delete an inventory batch.
 *
 * Physical deletion should normally be restricted by the
 * service layer because inventory records may be referenced
 * by stock transfers or other historical transactions.
 *
 * @param {string} branchId
 * @param {string} inventoryBatchId
 *
 * @returns {boolean} True if the batch was deleted
 */
const deleteInventoryBatch = async (branchId, inventoryBatchId) => {
  const query = `
        DELETE FROM inventory_batches
        WHERE id = $1
          AND branch_id = $2
        RETURNING id;
    `;

  const values = [inventoryBatchId, branchId];

  const result = await pool.query(query, values);

  return result.rowCount > 0;
};

/**
 * Export inventory repository functions.
 */
module.exports = {
  createInventoryBatch,
  getInventoryBatchById,
  getInventoryByBranch,
  getProductBatchesAtBranch,
  searchInventory,
  getExpiringBatches,
  getInventoryCategories,
  getInventoryCategorySummary,
  updateInventoryBatch,
  updateInventoryQuantity,
  deleteInventoryBatch,
};
