/**
 * Goods Receipt Repository
 *
 * Purpose:
 * Handles direct database operations related to goods receipts
 * and goods receipt items.
 *
 * A goods receipt records goods that have physically arrived
 * against a purchase.
 *
 * Structure:
 *
 *     purchases
 *          ↓
 *     goods_receipts
 *          ↓
 *     goods_receipt_items
 *          ↓
 *     purchase_items
 *
 * Example:
 *
 *     Purchase PO-0001
 *          │
 *          └── Goods Receipt GR-0001
 *                  │
 *                  ├── Paracetamol → 80 received
 *                  └── Amoxicillin → 40 received
 *
 * IMPORTANT:
 *
 * Creating a goods receipt does not automatically modify
 * inventory in this repository.
 *
 * The service layer will later coordinate:
 *
 *     Goods Receipt
 *          +
 *     Inventory
 *
 * inside the appropriate business transaction.
 */

const { pool } = require("../db/connection");

/**
 * Create a goods receipt together with its receipt items.
 *
 * The receipt header and all receipt items are created inside
 * one PostgreSQL transaction.
 *
 * This guarantees that a receipt cannot be partially saved.
 *
 * @param {Object} receipt
 * @param {string} receipt.organisationId
 * @param {string} receipt.purchaseId
 * @param {string} receipt.receiptNumber
 * @param {string} receipt.receivedDate
 * @param {string} receipt.receivedBy
 * @param {string|null} receipt.supplierInvoiceNumber
 * @param {number|null} receipt.packageCount
 * @param {string} receipt.status
 * @param {string|null} receipt.notes
 * @param {Array<Object>} receipt.items
 *
 * @returns {Object} Created goods receipt with its items
 */
const createGoodsReceipt = async ({
  organisationId,
  purchaseId,
  receiptNumber,
  receivedDate,
  receivedBy,
  supplierInvoiceNumber = null,
  packageCount = null,
  status = "RECEIVED",
  notes = null,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create the goods receipt header.
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
     * Insert every received item.
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
     * If any part of the receipt fails, roll back the
     * complete receipt and all of its items.
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
 * The organisation ID is required to maintain tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {Object|null} Goods receipt or null if not found
 */
const getGoodsReceiptById = async (organisationId, receiptId) => {
  const query = `
        SELECT
            gr.id,
            gr.organisation_id,
            gr.purchase_id,
            p.purchase_number,
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
        LEFT JOIN users u
            ON u.id = gr.received_by
        WHERE gr.id = $1
          AND gr.organisation_id = $2;
    `;

  const result = await pool.query(query, [receiptId, organisationId]);

  return result.rows[0] || null;
};

/**
 * Get all items belonging to a goods receipt.
 *
 * Purchase item and product information are included so the
 * caller can display what was ordered and what was actually
 * received.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {Object[]} Goods receipt items
 */
const getGoodsReceiptItems = async (organisationId, receiptId) => {
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

  const result = await pool.query(query, [receiptId, organisationId]);

  return result.rows;
};

/**
 * Get all goods receipts belonging to a purchase.
 *
 * A purchase may be received in multiple deliveries.
 *
 * Example:
 *
 *     Purchase PO-0001
 *          │
 *          ├── GR-0001 → 50 units
 *          ├── GR-0002 → 30 units
 *          └── GR-0003 → 20 units
 *
 * This allows partial deliveries to be represented correctly.
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
        LEFT JOIN users u
            ON u.id = gr.received_by
        WHERE gr.organisation_id = $1
          AND gr.purchase_id = $2
        ORDER BY gr.received_date DESC, gr.created_at DESC
        LIMIT $3
        OFFSET $4;
    `;

  const result = await pool.query(query, [
    organisationId,
    purchaseId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Get goods receipts for an organisation.
 *
 * This is useful for the main goods receiving list.
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

  const result = await pool.query(query, [organisationId, limit, offset]);

  return result.rows;
};

/**
 * Get goods receipts for a branch.
 *
 * The branch is obtained through the related purchase.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Object[]} Goods receipts for the branch
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

  const result = await pool.query(query, [
    organisationId,
    branchId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Search goods receipts.
 *
 * Searches against:
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

  const result = await pool.query(query, [
    organisationId,
    searchPattern,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Update the status of a goods receipt.
 *
 * The service layer decides whether a status transition is
 * valid.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 * @param {string} status
 *
 * @returns {Object|null} Updated goods receipt
 */
const updateGoodsReceiptStatus = async (organisationId, receiptId, status) => {
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

  const result = await pool.query(query, [status, receiptId, organisationId]);

  return result.rows[0] || null;
};

/**
 * Delete a goods receipt.
 *
 * Because goods_receipt_items references the receipt with
 * ON DELETE CASCADE, its items will also be removed.
 *
 * The service layer should normally prevent deletion after
 * inventory has been updated from the receipt.
 *
 * @param {string} organisationId
 * @param {string} receiptId
 *
 * @returns {boolean} True if the receipt was deleted
 */
const deleteGoodsReceipt = async (organisationId, receiptId) => {
  const query = `
        DELETE FROM goods_receipts
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const result = await pool.query(query, [receiptId, organisationId]);

  return result.rowCount > 0;
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
