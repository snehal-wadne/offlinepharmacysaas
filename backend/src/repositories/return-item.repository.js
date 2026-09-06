/**
 * Return Item Repository
 *
 * Purpose:
 * Handles direct PostgreSQL operations for return_items.
 *
 * Relationship:
 *
 * Return
 *   |
 *   +── Return Item
 *          |
 *          +── Invoice Item
 *
 * Important:
 * - return_items does not contain organisation_id.
 * - Tenant scope is therefore derived through:
 *
 *      return_items
 *          → returns
 *          → invoices
 *          → organisation
 *
 * The repository:
 * - persists return items
 * - validates tenant ownership
 * - validates that the invoice item belongs to the
 *   original invoice of the return
 * - retrieves return items
 * - updates return item fields
 * - deletes return items
 *
 * The repository does NOT:
 * - calculate refund amounts
 * - modify inventory
 * - create ledger entries
 * - process payments/refunds
 * - decide return approval rules
 *
 * Those responsibilities belong to the service layer.
 */

const { pool } = require("../db/connection");

/**
 * Create a return item.
 *
 * The supplied refund amount is persisted as-is.
 * The service layer is responsible for calculating it from
 * the historical invoice item amount.
 *
 * The invoice item must belong to the same invoice referenced
 * by the return.
 *
 * @param {Object} options
 * @param {string} options.organisationId
 * @param {string} options.returnId
 * @param {string} options.invoiceItemId
 * @param {number} options.quantityReturned
 * @param {number} options.refundAmount
 * @param {string} options.returnCondition
 * @param {number} options.restockQuantity
 * @param {string|null} options.notes
 * @param {Object} options.client
 *
 * @returns {Object} Created return item
 */
const createReturnItem = async ({
  organisationId,
  returnId,
  invoiceItemId,
  quantityReturned,
  refundAmount,
  returnCondition,
  restockQuantity = 0,
  notes = null,
  client = pool,
}) => {
  /**
   * Validate that:
   *
   * 1. The return belongs to the organisation.
   * 2. The invoice item belongs to the original invoice
   *    referenced by that return.
   *
   * This prevents a return from Organisation A from referencing
   * an invoice item belonging to another organisation or another
   * invoice.
   */
  const ownershipQuery = `
        SELECT
            r.id AS return_id,
            r.invoice_id,
            ii.id AS invoice_item_id
        FROM returns r
        INNER JOIN invoices i
            ON i.id = r.invoice_id
           AND i.organisation_id = r.organisation_id
        INNER JOIN invoice_items ii
            ON ii.invoice_id = i.id
        WHERE r.id = $1
          AND r.organisation_id = $2
          AND ii.id = $3;
    `;

  const ownershipResult = await client.query(ownershipQuery, [
    returnId,
    organisationId,
    invoiceItemId,
  ]);

  if (ownershipResult.rowCount === 0) {
    throw new Error(
      "Return and invoice item must belong to the same organisation and original invoice.",
    );
  }

  const query = `
        INSERT INTO return_items (
            return_id,
            invoice_item_id,
            quantity_returned,
            refund_amount,
            return_condition,
            restock_quantity,
            notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
            id,
            return_id,
            invoice_item_id,
            quantity_returned,
            refund_amount,
            return_condition,
            restock_quantity,
            notes,
            created_at,
            updated_at;
    `;

  const values = [
    returnId,
    invoiceItemId,
    quantityReturned,
    refundAmount,
    returnCondition,
    restockQuantity,
    notes,
  ];

  const result = await client.query(query, values);

  return result.rows[0];
};

/**
 * Get a return item by ID.
 *
 * Tenant scope is derived through the parent return.
 *
 * The query also returns historical invoice-item information
 * useful to the service/API layer.
 *
 * @param {string} organisationId
 * @param {string} returnItemId
 * @param {Object} client
 *
 * @returns {Object|null}
 */
const getReturnItemById = async (
  organisationId,
  returnItemId,
  client = pool,
) => {
  const query = `
        SELECT
            ri.id,
            ri.return_id,
            ri.invoice_item_id,

            ri.quantity_returned,
            ri.refund_amount,
            ri.return_condition,
            ri.restock_quantity,
            ri.notes,

            ri.created_at,
            ri.updated_at,

            r.return_number,
            r.return_date,
            r.status AS return_status,
            r.refund_method,
            r.reason AS return_reason,

            r.invoice_id,
            i.invoice_number,

            ii.product_id,
            ii.product_name,
            ii.batch_number,
            ii.quantity AS original_quantity,
            ii.unit_price,
            ii.discount_amount,
            ii.tax_amount,
            ii.line_total

        FROM return_items ri

        INNER JOIN returns r
            ON r.id = ri.return_id

        INNER JOIN invoices i
            ON i.id = r.invoice_id
           AND i.organisation_id = r.organisation_id

        INNER JOIN invoice_items ii
            ON ii.id = ri.invoice_item_id
           AND ii.invoice_id = i.id

        WHERE ri.id = $1
          AND r.organisation_id = $2;
    `;

  const result = await client.query(query, [returnItemId, organisationId]);

  return result.rows[0] || null;
};

/**
 * Get all return items belonging to a return.
 *
 * Results include historical invoice item information so the
 * API does not need a separate query for every returned item.
 *
 * @param {string} organisationId
 * @param {string} returnId
 * @param {Object} client
 *
 * @returns {Object[]}
 */
const getReturnItemsByReturn = async (
  organisationId,
  returnId,
  client = pool,
) => {
  const query = `
        SELECT
            ri.id,
            ri.return_id,
            ri.invoice_item_id,

            ri.quantity_returned,
            ri.refund_amount,
            ri.return_condition,
            ri.restock_quantity,
            ri.notes,

            ri.created_at,
            ri.updated_at,

            ii.product_id,
            ii.product_name,
            ii.batch_number,
            ii.quantity AS original_quantity,
            ii.unit_price,
            ii.discount_amount,
            ii.tax_amount,
            ii.line_total

        FROM return_items ri

        INNER JOIN returns r
            ON r.id = ri.return_id

        INNER JOIN invoices i
            ON i.id = r.invoice_id
           AND i.organisation_id = r.organisation_id

        INNER JOIN invoice_items ii
            ON ii.id = ri.invoice_item_id
           AND ii.invoice_id = i.id

        WHERE ri.return_id = $1
          AND r.organisation_id = $2

        ORDER BY ri.created_at ASC, ri.id ASC;
    `;

  const result = await client.query(query, [returnId, organisationId]);

  return result.rows;
};

/**
 * Get return history for a particular invoice item.
 *
 * This is useful for determining how much of an invoice item
 * has already been returned.
 *
 * IMPORTANT:
 * The repository only reports persisted return quantities.
 * The service layer decides whether another return is allowed.
 *
 * @param {string} organisationId
 * @param {string} invoiceItemId
 * @param {Object} client
 *
 * @returns {Object[]}
 */
const getReturnItemsByInvoiceItem = async (
  organisationId,
  invoiceItemId,
  client = pool,
) => {
  const query = `
        SELECT
            ri.id AS id,
            ri.return_id AS return_id,
            ri.invoice_item_id AS invoice_item_id,

            ri.quantity_returned,
            ri.refund_amount,
            ri.return_condition,
            ri.restock_quantity,
            ri.notes,

            ri.created_at,
            ri.updated_at,

            r.return_number,
            r.return_date,
            r.status AS return_status,
            r.refund_method,

            i.id AS invoice_id,
            i.invoice_number

        FROM return_items ri

        INNER JOIN returns r
            ON r.id = ri.return_id

        INNER JOIN invoices i
            ON i.id = r.invoice_id
           AND i.organisation_id = r.organisation_id

        INNER JOIN invoice_items ii
            ON ii.id = ri.invoice_item_id
           AND ii.invoice_id = i.id

        WHERE ri.invoice_item_id = $1
          AND r.organisation_id = $2

        ORDER BY r.return_date DESC, ri.created_at DESC;
    `;

  const result = await client.query(query, [invoiceItemId, organisationId]);

  return result.rows;
};

/**
 * Update a return item.
 *
 * Parent relationships are immutable:
 * - return_id cannot change
 * - invoice_item_id cannot change
 *
 * The service layer controls whether an item is still editable.
 *
 * @param {string} organisationId
 * @param {string} returnItemId
 * @param {Object} updates
 * @param {number} updates.quantityReturned
 * @param {number} updates.refundAmount
 * @param {string} updates.returnCondition
 * @param {number} updates.restockQuantity
 * @param {string|null} updates.notes
 * @param {Object} client
 *
 * @returns {Object|null}
 */
const updateReturnItem = async (
  organisationId,
  returnItemId,
  updates = {},
  client = pool,
) => {
  const allowedFields = [
    ["quantityReturned", "quantity_returned"],
    ["refundAmount", "refund_amount"],
    ["returnCondition", "return_condition"],
    ["restockQuantity", "restock_quantity"],
    ["notes", "notes"],
  ];

  const setClauses = [];
  const values = [];

  for (const [propertyName, columnName] of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, propertyName)) {
      values.push(updates[propertyName]);
      setClauses.push(`${columnName} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) {
    return getReturnItemById(organisationId, returnItemId, client);
  }

  values.push(returnItemId);
  values.push(organisationId);

  const query = `
        UPDATE return_items ri
        SET
            ${setClauses.join(", ")},
            updated_at = CURRENT_TIMESTAMP
        FROM returns r
        WHERE ri.id = $${values.length - 1}
          AND r.id = ri.return_id
          AND r.organisation_id = $${values.length}

        RETURNING
            ri.id,
            ri.return_id,
            ri.invoice_item_id,
            ri.quantity_returned,
            ri.refund_amount,
            ri.return_condition,
            ri.restock_quantity,
            ri.notes,
            ri.created_at,
            ri.updated_at;
    `;

  const result = await client.query(query, values);

  return result.rows[0] || null;
};

/**
 * Delete a return item.
 *
 * The service layer should determine whether deletion is allowed.
 *
 * @param {string} organisationId
 * @param {string} returnItemId
 * @param {Object} client
 *
 * @returns {boolean}
 */
const deleteReturnItem = async (
  organisationId,
  returnItemId,
  client = pool,
) => {
  const query = `
        DELETE FROM return_items ri
        USING returns r
        WHERE ri.id = $1
          AND r.id = ri.return_id
          AND r.organisation_id = $2
        RETURNING ri.id;
    `;

  const result = await client.query(query, [returnItemId, organisationId]);

  return result.rowCount > 0;
};

module.exports = {
  createReturnItem,
  getReturnItemById,
  getReturnItemsByReturn,
  getReturnItemsByInvoiceItem,
  updateReturnItem,
  deleteReturnItem,
};
