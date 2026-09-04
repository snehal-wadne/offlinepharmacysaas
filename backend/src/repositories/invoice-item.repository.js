/**
 * Invoice Item Repository
 *
 * Purpose:
 * Handles direct PostgreSQL persistence for invoice_items.
 *
 * The repository is responsible for:
 * - invoice-item CRUD
 * - tenant-safe invoice-item reads
 * - validating parent/foreign-key ownership before writes
 * - preserving invoice-item snapshot data
 *
 * The repository does NOT:
 * - calculate invoice totals
 * - deduct inventory
 * - validate user permissions
 * - decide whether an invoice is financially editable
 * - create ledger/payment records
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Invoice Item Repository
 *     ↓
 * PostgreSQL
 *
 * Important:
 * invoice_items does not contain organisation_id or branch_id.
 * Tenant and branch scope are therefore derived through the
 * parent invoice and, when applicable, the inventory batch.
 */

const { pool } = require("../db/connection");

const INVOICE_ITEM_COLUMNS = `
    id,
    invoice_id,
    product_id,
    inventory_batch_id,
    product_name,
    batch_number,
    quantity,
    unit_price,
    discount_amount,
    tax_amount,
    line_total,
    created_at
`;

/**
 * Validate that an invoice belongs to the organisation and that
 * the referenced product belongs to the same organisation.
 */
const validateInvoiceAndProduct = async (
  db,
  organisationId,
  invoiceId,
  productId,
) => {
  const result = await db.query(
    `
      SELECT
          i.id,
          i.branch_id,
          p.id AS product_id
      FROM invoices i
      CROSS JOIN products p
      WHERE i.id = $1
        AND i.organisation_id = $2
        AND p.id = $3
        AND p.organisation_id = $2;
    `,
    [invoiceId, organisationId, productId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Invoice and product must belong to the specified organisation.",
    );
  }

  return {
    invoiceId: result.rows[0].id,
    branchId: result.rows[0].branch_id,
    productId: result.rows[0].product_id,
  };
};

/**
 * Validate an optional inventory batch.
 *
 * The batch must:
 * - exist
 * - belong to the same organisation through its product/branch
 * - belong to the same product as the invoice item
 * - belong to the same branch as the invoice
 */
const validateInventoryBatch = async (
  db,
  organisationId,
  inventoryBatchId,
  productId,
  branchId,
) => {
  const result = await db.query(
    `
      SELECT
          ib.id
      FROM inventory_batches ib
      INNER JOIN products p
          ON p.id = ib.product_id
      INNER JOIN branches b
          ON b.id = ib.branch_id
      WHERE ib.id = $1
        AND ib.product_id = $2
        AND ib.branch_id = $3
        AND p.organisation_id = $4
        AND b.organisation_id = $4;
    `,
    [inventoryBatchId, productId, branchId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Inventory batch must belong to the specified organisation, product, and invoice branch.",
    );
  }
};

/**
 * Create a new invoice item.
 *
 * If a PostgreSQL client is supplied, the caller owns the
 * transaction. Otherwise this function creates its own
 * transaction.
 *
 * @param {Object} item
 * @param {string} item.organisationId
 * @param {string} item.invoiceId
 * @param {string} item.productId
 * @param {string|null} item.inventoryBatchId
 * @param {string} item.productName
 * @param {string|null} item.batchNumber
 * @param {number} item.quantity
 * @param {number} item.unitPrice
 * @param {number} item.discountAmount
 * @param {number} item.taxAmount
 * @param {number} item.lineTotal
 * @param {Object} [item.client]
 *
 * @returns {Promise<Object>}
 */
const createInvoiceItem = async ({
  organisationId,
  invoiceId,
  productId,
  inventoryBatchId = null,
  productName,
  batchNumber = null,
  quantity,
  unitPrice,
  discountAmount = 0,
  taxAmount = 0,
  lineTotal,
  client = null,
}) => {
  const dbClient = client || (await pool.connect());
  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const invoiceContext = await validateInvoiceAndProduct(
      dbClient,
      organisationId,
      invoiceId,
      productId,
    );

    if (inventoryBatchId) {
      await validateInventoryBatch(
        dbClient,
        organisationId,
        inventoryBatchId,
        productId,
        invoiceContext.branchId,
      );
    }

    const result = await dbClient.query(
      `
        INSERT INTO invoice_items (
            invoice_id,
            product_id,
            inventory_batch_id,
            product_name,
            batch_number,
            quantity,
            unit_price,
            discount_amount,
            tax_amount,
            line_total
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
        )
        RETURNING
            ${INVOICE_ITEM_COLUMNS};
      `,
      [
        invoiceId,
        productId,
        inventoryBatchId,
        productName,
        batchNumber,
        quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        lineTotal,
      ],
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return result.rows[0];
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve original error.
      }
    }

    throw error;
  } finally {
    if (ownsTransaction) {
      dbClient.release();
    }
  }
};

/**
 * Get one invoice item by ID within an organisation.
 *
 * Tenant scope is enforced through the parent invoice.
 *
 * Invoice items deliberately do not use Redis caching.
 * They are child records whose lifecycle is tightly coupled
 * to the invoice.
 *
 * @param {string} organisationId
 * @param {string} invoiceItemId
 *
 * @returns {Promise<Object|null>}
 */
const getInvoiceItemById = async (organisationId, invoiceItemId) => {
  const result = await pool.query(
    `
      SELECT
          ii.id,
          ii.invoice_id,
          ii.product_id,
          ii.inventory_batch_id,
          ii.product_name,
          ii.batch_number,
          ii.quantity,
          ii.unit_price,
          ii.discount_amount,
          ii.tax_amount,
          ii.line_total,
          ii.created_at
      FROM invoice_items ii
      INNER JOIN invoices i
          ON i.id = ii.invoice_id
      WHERE ii.id = $1
        AND i.organisation_id = $2;
    `,
    [invoiceItemId, organisationId],
  );

  return result.rows[0] || null;
};

/**
 * Get all items belonging to one invoice.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object[]>}
 */
const getInvoiceItemsByInvoice = async (organisationId, invoiceId) => {
  const result = await pool.query(
    `
      SELECT
          ii.id,
          ii.invoice_id,
          ii.product_id,
          ii.inventory_batch_id,
          ii.product_name,
          ii.batch_number,
          ii.quantity,
          ii.unit_price,
          ii.discount_amount,
          ii.tax_amount,
          ii.line_total,
          ii.created_at
      FROM invoice_items ii
      INNER JOIN invoices i
          ON i.id = ii.invoice_id
      WHERE ii.invoice_id = $1
        AND i.organisation_id = $2
      ORDER BY
          ii.created_at ASC,
          ii.id ASC;
    `,
    [invoiceId, organisationId],
  );

  return result.rows;
};

/**
 * Get invoice items for a product within an organisation.
 *
 * @param {string} organisationId
 * @param {string} productId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getInvoiceItemsByProduct = async (
  organisationId,
  productId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ii.id,
          ii.invoice_id,
          ii.product_id,
          ii.inventory_batch_id,
          ii.product_name,
          ii.batch_number,
          ii.quantity,
          ii.unit_price,
          ii.discount_amount,
          ii.tax_amount,
          ii.line_total,
          ii.created_at
      FROM invoice_items ii
      INNER JOIN invoices i
          ON i.id = ii.invoice_id
      WHERE ii.product_id = $1
        AND i.organisation_id = $2
      ORDER BY
          i.invoice_date DESC,
          ii.created_at DESC,
          ii.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [productId, organisationId, limit, offset],
  );

  return result.rows;
};

/**
 * Update an invoice item.
 *
 * Identity fields are deliberately immutable:
 * - id
 * - invoice_id
 *
 * product_id and inventory_batch_id may be changed at the
 * repository level because a DRAFT invoice may need correction.
 * The service layer must prevent edits to finalized invoices.
 *
 * @param {string} organisationId
 * @param {string} invoiceItemId
 * @param {Object} updates
 * @param {Object} [client]
 *
 * @returns {Promise<Object|null>}
 */
const updateInvoiceItem = async (
  organisationId,
  invoiceItemId,
  updates = {},
  client = null,
) => {
  const dbClient = client || (await pool.connect());
  const ownsTransaction = !client;

  const allowedFields = {
    productId: "product_id",
    inventoryBatchId: "inventory_batch_id",
    productName: "product_name",
    batchNumber: "batch_number",
    quantity: "quantity",
    unitPrice: "unit_price",
    discountAmount: "discount_amount",
    taxAmount: "tax_amount",
    lineTotal: "line_total",
  };

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const currentResult = await dbClient.query(
      `
        SELECT
            ii.id,
            ii.invoice_id,
            ii.product_id,
            ii.inventory_batch_id,
            i.branch_id
        FROM invoice_items ii
        INNER JOIN invoices i
            ON i.id = ii.invoice_id
        WHERE ii.id = $1
          AND i.organisation_id = $2
        FOR UPDATE OF ii;
      `,
      [invoiceItemId, organisationId],
    );

    if (currentResult.rowCount === 0) {
      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return null;
    }

    const current = currentResult.rows[0];

    const nextProductId =
      updates.productId !== undefined ? updates.productId : current.product_id;

    const nextInventoryBatchId =
      updates.inventoryBatchId !== undefined
        ? updates.inventoryBatchId
        : current.inventory_batch_id;

    const invoiceContext = await validateInvoiceAndProduct(
      dbClient,
      organisationId,
      current.invoice_id,
      nextProductId,
    );

    if (nextInventoryBatchId) {
      await validateInventoryBatch(
        dbClient,
        organisationId,
        nextInventoryBatchId,
        nextProductId,
        invoiceContext.branchId,
      );
    }

    const setClauses = [];
    const values = [];
    let parameterIndex = 1;

    setClauses.push(`product_id = $${parameterIndex}`);

    values.push(nextProductId);
    parameterIndex += 1;

    setClauses.push(`inventory_batch_id = $${parameterIndex}`);

    values.push(nextInventoryBatchId);
    parameterIndex += 1;

    for (const [inputField, columnName] of Object.entries(allowedFields)) {
      if (
        inputField !== "productId" &&
        inputField !== "inventoryBatchId" &&
        updates[inputField] !== undefined
      ) {
        setClauses.push(`${columnName} = $${parameterIndex}`);

        values.push(updates[inputField]);
        parameterIndex += 1;
      }
    }

    values.push(invoiceItemId);

    const itemIdParameter = parameterIndex;

    parameterIndex += 1;

    values.push(organisationId);

    const organisationParameter = parameterIndex;

    const result = await dbClient.query(
      `
        UPDATE invoice_items ii
        SET
            ${setClauses.join(",\n            ")}
        FROM invoices i
        WHERE ii.id = $${itemIdParameter}
          AND i.id = ii.invoice_id
          AND i.organisation_id = $${organisationParameter}
        RETURNING
            ii.id,
            ii.invoice_id,
            ii.product_id,
            ii.inventory_batch_id,
            ii.product_name,
            ii.batch_number,
            ii.quantity,
            ii.unit_price,
            ii.discount_amount,
            ii.tax_amount,
            ii.line_total,
            ii.created_at;
      `,
      values,
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return result.rows[0] || null;
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve original error.
      }
    }

    throw error;
  } finally {
    if (ownsTransaction) {
      dbClient.release();
    }
  }
};

/**
 * Delete an invoice item by ID within an organisation.
 *
 * The service layer should normally permit deletion only while
 * the parent invoice is editable, for example while DRAFT.
 *
 * @param {string} organisationId
 * @param {string} invoiceItemId
 * @param {Object} [client]
 *
 * @returns {Promise<boolean>}
 */
const deleteInvoiceItem = async (
  organisationId,
  invoiceItemId,
  client = null,
) => {
  const dbClient = client || (await pool.connect());
  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const result = await dbClient.query(
      `
        DELETE FROM invoice_items ii
        USING invoices i
        WHERE ii.id = $1
          AND i.id = ii.invoice_id
          AND i.organisation_id = $2
        RETURNING ii.id;
      `,
      [invoiceItemId, organisationId],
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return result.rowCount === 1;
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve original error.
      }
    }

    throw error;
  } finally {
    if (ownsTransaction) {
      dbClient.release();
    }
  }
};

module.exports = {
  createInvoiceItem,
  getInvoiceItemById,
  getInvoiceItemsByInvoice,
  getInvoiceItemsByProduct,
  updateInvoiceItem,
  deleteInvoiceItem,
};
