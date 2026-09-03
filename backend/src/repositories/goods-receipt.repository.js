/**
 * Goods Receipt Repository
 *
 * Purpose:
 * Handles direct database operations related to goods receipts
 * and their receipt items.
 *
 * A goods receipt represents one physical shipment received
 * against a purchase order.
 *
 * Structure:
 *
 *     goods_receipts
 *          ↓
 *     goods_receipt_items
 *
 * The repository handles persistence only.
 *
 * Business rules such as:
 *
 * - whether the user can receive goods
 * - whether the receipt belongs to the purchase
 * - whether received quantity exceeds ordered quantity
 * - whether rejected quantity is valid
 * - when inventory should be increased
 * - how purchase status should change
 *
 * belong in the service layer.
 *
 * PostgreSQL remains the source of truth.
 * Redis is used only as a short-lived read cache.
 */

const { pool } = require("../db/connection");

const {
  getCache,
  setCache,
  deleteCache,
} = require("../cache/cache");

const GOODS_RECEIPT_CACHE_TTL = 60;

/**
 * Build the Redis key for a goods receipt.
 *
 * Organisation ID is included so that cached data remains
 * tenant-safe.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {string} Redis cache key
 */
const buildGoodsReceiptCacheKey = (
  organisationId,
  receiptId,
) =>
  `organisation:${organisationId}:goods-receipt:${receiptId}`;

/**
 * Create a goods receipt together with all receipt items.
 *
 * The receipt header and receipt items are inserted inside one
 * PostgreSQL transaction.
 *
 * Either the complete receipt is committed or the entire
 * operation is rolled back.
 *
 * @param {Object} receipt
 * @param {string} receipt.organisationId
 * @param {string} receipt.purchaseId
 * @param {string} receipt.receiptNumber
 * @param {string} receipt.receivedDate
 * @param {string|null} receipt.receivedBy
 * @param {string|null} receipt.supplierInvoiceNumber
 * @param {number} receipt.packageCount
 * @param {string} receipt.status
 * @param {string|null} receipt.notes
 * @param {Array<Object>} receipt.items
 *
 * @returns {Object} Created goods receipt with items
 */
const createGoodsReceipt = async ({
  organisationId,
  purchaseId,
  receiptNumber,
  receivedDate,
  receivedBy = null,
  supplierInvoiceNumber = null,
  packageCount = 0,
  status = "PENDING_INSPECTION",
  notes = null,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create the goods receipt header first.
     */
    const receiptResult = await client.query(
      `
        INSERT INTO goods_receipts (
            organisation_id,
            purchase_id,
            receipt_number,
            received_date,
            received_by,
            supplier_invoice_number,
            package_count,
            status,
            notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
            id,
            organisation_id,
            purchase_id,
            receipt_number,
            received_date,
            received_by,
            supplier_invoice_number,
            package_count,
            status,
            notes,
            created_at,
            updated_at;
      `,
      [
        organisationId,
        purchaseId,
        receiptNumber,
        receivedDate,
        receivedBy,
        supplierInvoiceNumber,
        packageCount,
        status,
        notes,
      ],
    );

    const receipt = receiptResult.rows[0];

    /*
     * Insert every received purchase item.
     */
    const createdItems = [];

    for (const item of items) {
      const itemResult = await client.query(
        `
          INSERT INTO goods_receipt_items (
              goods_receipt_id,
              purchase_item_id,
              received_quantity,
              rejected_quantity
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
              id,
              goods_receipt_id,
              purchase_item_id,
              received_quantity,
              rejected_quantity,
              created_at,
              updated_at;
        `,
        [
          receipt.id,
          item.purchaseItemId,
          item.receivedQuantity,
          item.rejectedQuantity ?? 0,
        ],
      );

      createdItems.push(itemResult.rows[0]);
    }

    await client.query("COMMIT");

    return {
      ...receipt,
      items: createdItems,
    };
  } catch (error) {
    /*
     * If any part of the receipt fails, roll back the complete
     * receipt and all of its items.
     */
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a goods receipt by ID.
 *
 * Redis is checked first. PostgreSQL is queried on a cache miss.
 *
 * The organisation ID is included in both the Redis key and
 * PostgreSQL query to maintain tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {Object|null} Goods receipt or null
 */
const getGoodsReceiptById = async (
  organisationId,
  receiptId,
) => {
  const cacheKey = buildGoodsReceiptCacheKey(
    organisationId,
    receiptId,
  );

  /*
   * Redis is an optimization only.
   * If Redis fails, continue with PostgreSQL.
   */
  try {
    const cachedReceipt = await getCache(cacheKey);

    if (cachedReceipt !== null) {
      return cachedReceipt;
    }
  } catch (cacheError) {
    console.error(
      "Cache read failed for getGoodsReceiptById:",
      cacheError.message,
    );
  }

  const query = `
    SELECT
        gr.id,
        gr.organisation_id,
        gr.purchase_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        gr.receipt_number,
        gr.received_date,
        gr.received_by,
        u.name AS received_by_name,
        gr.supplier_invoice_number,
        gr.package_count,
        gr.status,
        gr.notes,
        gr.created_at,
        gr.updated_at
    FROM goods_receipts gr
    INNER JOIN purchases p
        ON p.id = gr.purchase_id
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = gr.received_by
    WHERE gr.id = $1
      AND gr.organisation_id = $2;
  `;

  const result = await pool.query(
    query,
    [receiptId, organisationId],
  );

  const receipt = result.rows[0] || null;

  /*
   * Cache only existing receipts.
   */
  if (receipt) {
    try {
      await setCache(
        cacheKey,
        receipt,
        GOODS_RECEIPT_CACHE_TTL,
      );
    } catch (cacheError) {
      console.error(
        "Cache write failed for getGoodsReceiptById:",
        cacheError.message,
      );
    }
  }

  return receipt;
};

/**
 * Get all items belonging to a goods receipt.
 *
 * The query joins purchase_items and products so that callers
 * receive both the original ordered quantity and the actual
 * received/rejected quantities.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {Object[]} Goods receipt items
 */
const getGoodsReceiptItems = async (
  organisationId,
  receiptId,
) => {
  const query = `
    SELECT
        gri.id,
        gri.goods_receipt_id,
        gri.purchase_item_id,
        pi.product_id,
        p.medicine_name,
        p.brand_name,
        p.strength,
        p.pack_size,
        p.manufacturer,
        p.sku,
        pi.ordered_quantity,
        pi.unit_cost,
        pi.tax_amount,
        pi.discount_amount,
        gri.received_quantity,
        gri.rejected_quantity,
        gri.created_at,
        gri.updated_at
    FROM goods_receipt_items gri
    INNER JOIN goods_receipts gr
        ON gr.id = gri.goods_receipt_id
    INNER JOIN purchase_items pi
        ON pi.id = gri.purchase_item_id
    INNER JOIN products p
        ON p.id = pi.product_id
    WHERE gri.goods_receipt_id = $1
      AND gr.organisation_id = $2
    ORDER BY p.medicine_name ASC, gri.id ASC;
  `;

  const result = await pool.query(
    query,
    [receiptId, organisationId],
  );

  return result.rows;
};

/**
 * Get goods receipts belonging to a purchase.
 *
 * This method remains PostgreSQL-backed because list cache
 * invalidation becomes more complicated when multiple receipts
 * can belong to the same purchase.
 *
 * @param {string} organisationId
 * @param {string} purchaseId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Goods receipts
 */
const getGoodsReceiptsByPurchase = async (
  organisationId,
  purchaseId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        gr.id,
        gr.organisation_id,
        gr.purchase_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        gr.receipt_number,
        gr.received_date,
        gr.received_by,
        u.name AS received_by_name,
        gr.supplier_invoice_number,
        gr.package_count,
        gr.status,
        gr.notes,
        gr.created_at,
        gr.updated_at
    FROM goods_receipts gr
    INNER JOIN purchases p
        ON p.id = gr.purchase_id
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = gr.received_by
    WHERE gr.organisation_id = $1
      AND gr.purchase_id = $2
    ORDER BY gr.received_date DESC, gr.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const result = await pool.query(
    query,
    [
      organisationId,
      purchaseId,
      limit,
      offset,
    ],
  );

  return result.rows;
};

/**
 * Get goods receipts belonging to an organisation.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Goods receipts
 */
const getGoodsReceiptsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        gr.id,
        gr.organisation_id,
        gr.purchase_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        gr.receipt_number,
        gr.received_date,
        gr.received_by,
        u.name AS received_by_name,
        gr.supplier_invoice_number,
        gr.package_count,
        gr.status,
        gr.notes,
        gr.created_at,
        gr.updated_at
    FROM goods_receipts gr
    INNER JOIN purchases p
        ON p.id = gr.purchase_id
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = gr.received_by
    WHERE gr.organisation_id = $1
    ORDER BY gr.received_date DESC, gr.created_at DESC
    LIMIT $2
    OFFSET $3;
  `;

  const result = await pool.query(
    query,
    [
      organisationId,
      limit,
      offset,
    ],
  );

  return result.rows;
};

/**
 * Get goods receipts associated with a branch.
 *
 * The branch comes from the purchase associated with the
 * goods receipt.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Goods receipts
 */
const getGoodsReceiptsByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        gr.id,
        gr.organisation_id,
        gr.purchase_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        gr.receipt_number,
        gr.received_date,
        gr.received_by,
        u.name AS received_by_name,
        gr.supplier_invoice_number,
        gr.package_count,
        gr.status,
        gr.notes,
        gr.created_at,
        gr.updated_at
    FROM goods_receipts gr
    INNER JOIN purchases p
        ON p.id = gr.purchase_id
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = gr.received_by
    WHERE gr.organisation_id = $1
      AND p.branch_id = $2
    ORDER BY gr.received_date DESC, gr.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const result = await pool.query(
    query,
    [
      organisationId,
      branchId,
      limit,
      offset,
    ],
  );

  return result.rows;
};

/**
 * Search goods receipts.
 *
 * Searches:
 *
 * - receipt number
 * - purchase number
 * - supplier invoice number
 * - supplier name
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Matching goods receipts
 */
const searchGoodsReceipts = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
    SELECT
        gr.id,
        gr.organisation_id,
        gr.purchase_id,
        p.purchase_number,
        p.supplier_id,
        s.name AS supplier_name,
        p.branch_id,
        b.name AS branch_name,
        gr.receipt_number,
        gr.received_date,
        gr.received_by,
        u.name AS received_by_name,
        gr.supplier_invoice_number,
        gr.package_count,
        gr.status,
        gr.notes,
        gr.created_at,
        gr.updated_at
    FROM goods_receipts gr
    INNER JOIN purchases p
        ON p.id = gr.purchase_id
    INNER JOIN suppliers s
        ON s.id = p.supplier_id
    INNER JOIN branches b
        ON b.id = p.branch_id
    LEFT JOIN users u
        ON u.id = gr.received_by
    WHERE gr.organisation_id = $1
      AND (
            gr.receipt_number ILIKE $2
            OR p.purchase_number ILIKE $2
            OR gr.supplier_invoice_number ILIKE $2
            OR s.name ILIKE $2
      )
    ORDER BY gr.received_date DESC, gr.created_at DESC
    LIMIT $3
    OFFSET $4;
  `;

  const searchPattern = `%${searchTerm}%`;

  const result = await pool.query(
    query,
    [
      organisationId,
      searchPattern,
      limit,
      offset,
    ],
  );

  return result.rows;
};

/**
 * Update the status of a goods receipt.
 *
 * The service layer decides whether the requested status
 * transition is valid.
 *
 * After PostgreSQL is successfully updated, the individual
 * Redis cache entry is invalidated.
 *
 * Valid statuses are:
 *
 * - PENDING_INSPECTION
 * - VERIFIED
 * - DISCREPANCY
 *
 * @param {string} organisationId
 * @param {string} receiptId
 * @param {string} status
 *
 * @returns {Object|null} Updated goods receipt
 */
const updateGoodsReceiptStatus = async (
  organisationId,
  receiptId,
  status,
) => {
  const query = `
    UPDATE goods_receipts
    SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
      AND organisation_id = $3
    RETURNING
        id,
        organisation_id,
        purchase_id,
        receipt_number,
        received_date,
        received_by,
        supplier_invoice_number,
        package_count,
        status,
        notes,
        created_at,
        updated_at;
  `;

  const result = await pool.query(
    query,
    [
      status,
      receiptId,
      organisationId,
    ],
  );

  const updatedReceipt =
    result.rows[0] || null;

  /*
   * Invalidate the old cached receipt only after the database
   * update succeeds.
   */
  if (updatedReceipt) {
    const cacheKey =
      buildGoodsReceiptCacheKey(
        organisationId,
        receiptId,
      );

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateGoodsReceiptStatus:",
        cacheError.message,
      );
    }
  }

  return updatedReceipt;
};

/**
 * Delete a goods receipt.
 *
 * Because goods_receipt_items references the receipt with
 * ON DELETE CASCADE, all receipt items are automatically
 * removed when the parent receipt is deleted.
 *
 * The service layer should normally prevent deletion after
 * receipt processing has affected inventory.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {boolean} True if deleted
 */
const deleteGoodsReceipt = async (
  organisationId,
  receiptId,
) => {
  const query = `
    DELETE FROM goods_receipts
    WHERE id = $1
      AND organisation_id = $2
    RETURNING id;
  `;

  const result = await pool.query(
    query,
    [
      receiptId,
      organisationId,
    ],
  );

  const deleted =
    result.rowCount > 0;

  /*
   * Remove the cached representation only when PostgreSQL
   * actually deleted the receipt.
   */
  if (deleted) {
    const cacheKey =
      buildGoodsReceiptCacheKey(
        organisationId,
        receiptId,
      );

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteGoodsReceipt:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

/**
 * Export goods receipt repository functions.
 */
module.exports = {
  createGoodsReceipt,
  getGoodsReceiptById,
  getGoodsReceiptItems,
  getGoodsReceiptsByPurchase,
  getGoodsReceiptsByOrganisation,
  getGoodsReceiptsByBranch,
  searchGoodsReceipts,
  updateGoodsReceiptStatus,
  deleteGoodsReceipt,
};