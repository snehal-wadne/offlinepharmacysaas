/**
 * Invoice Repository
 *
 * Purpose:
 * Handles direct PostgreSQL operations related to invoices.
 *
 * Responsibilities:
 * - Invoice header CRUD/read operations
 * - Tenant-safe invoice access
 * - Branch ownership validation
 * - Customer ownership validation
 * - Optional prescription ownership validation
 * - Branch-scoped invoice-number generation
 * - Redis caching for individual invoice reads
 *
 * The repository does NOT:
 * - Calculate invoice totals
 * - Create invoice items
 * - Deduct inventory
 * - Create customer-ledger entries
 * - Allocate payments
 * - Handle HTTP logic
 * - Perform authorization
 *
 * Those responsibilities belong to the service/domain layer
 * and the repositories for the corresponding entities.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const { getNextBusinessNumber } = require("./number-sequence.repository");

/**
 * Individual invoice cache TTL.
 *
 * Redis is only a temporary read cache.
 * PostgreSQL remains the source of truth.
 */
const INVOICE_CACHE_TTL = 60;

/**
 * Builds the tenant-safe invoice cache key.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {string}
 */
const buildInvoiceCacheKey = (organisationId, invoiceId) =>
  `organisation:${organisationId}:invoice:${invoiceId}`;

/**
 * Explicit invoice columns.
 */
const INVOICE_COLUMNS = `
    id,
    organisation_id,
    branch_id,
    customer_id,
    prescription_id,
    invoice_number,
    invoice_date,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    status,
    notes,
    created_by,
    created_at,
    updated_at
`;

/**
 * Create a new invoice.
 *
 * Invoice numbers are branch-scoped.
 *
 * The following operations happen inside the same transaction:
 *
 *     generate INV number
 *              ↓
 *     insert invoice
 *
 * If the invoice insertion fails, the generated number is
 * rolled back as well.
 *
 * Branch, customer, prescription and creator are all validated
 * against the supplied organisation.
 *
 * IMPORTANT:
 * This function creates only the invoice header.
 * Invoice items, inventory changes and ledger entries are
 * handled elsewhere.
 *
 * @param {Object} invoice
 * @param {string} invoice.organisationId
 * @param {string} invoice.branchId
 * @param {string} invoice.customerId
 * @param {string|null} invoice.prescriptionId
 * @param {string} invoice.invoiceDate
 * @param {number|string} invoice.subtotal
 * @param {number|string} invoice.discountAmount
 * @param {number|string} invoice.taxAmount
 * @param {number|string} invoice.totalAmount
 * @param {string} invoice.status
 * @param {string|null} invoice.notes
 * @param {string|null} invoice.createdBy
 * @param {Object|null} client PostgreSQL transaction client
 *
 * @returns {Promise<Object>}
 */
const createInvoice = async ({
  organisationId,
  branchId,
  customerId,
  prescriptionId = null,
  invoiceDate = null,
  subtotal,
  discountAmount = 0,
  taxAmount = 0,
  totalAmount,
  status = "DRAFT",
  notes = null,
  createdBy = null,
  client = null,
}) => {
  let dbClient = client;
  let ownsTransaction = false;

  try {
    /**
     * Create a transaction when the caller did not provide one.
     */
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;

      await dbClient.query("BEGIN");
    }

    /**
     * Generate branch-scoped invoice number.
     */
    const invoiceNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "INVOICE",
      client: dbClient,
    });

    /**
     * Validate the branch and customer against the same
     * organisation.
     *
     * A plain FK check would not be sufficient because a UUID
     * belonging to another organisation would still satisfy
     * the foreign key.
     */
    const validationQuery = `
        SELECT
            EXISTS (
                SELECT 1
                FROM branches
                WHERE id = $1
                  AND organisation_id = $3
            ) AS branch_exists,

            EXISTS (
                SELECT 1
                FROM customers
                WHERE id = $2
                  AND organisation_id = $3
            ) AS customer_exists,

            CASE
                WHEN $4::UUID IS NULL THEN TRUE
                ELSE EXISTS (
                    SELECT 1
                    FROM prescriptions
                    WHERE id = $4
                      AND organisation_id = $3
                )
            END AS prescription_exists,

            CASE
                WHEN $5::UUID IS NULL THEN TRUE
                ELSE EXISTS (
                    SELECT 1
                    FROM users
                    WHERE id = $5
                )
            END AS creator_exists;
    `;

    const validationResult = await dbClient.query(validationQuery, [
      branchId,
      customerId,
      organisationId,
      prescriptionId,
      createdBy,
    ]);

    const validation = validationResult.rows[0];

    if (!validation.branch_exists) {
      throw new Error("Branch not found in the specified organisation.");
    }

    if (!validation.customer_exists) {
      throw new Error("Customer not found in the specified organisation.");
    }

    if (!validation.prescription_exists) {
      throw new Error("Prescription not found in the specified organisation.");
    }

    if (!validation.creator_exists) {
      throw new Error("Creating user not found.");
    }

    /**
     * If a prescription is supplied, ensure it belongs to the
     * same customer as the invoice.
     *
     * This prevents:
     *
     * Customer A
     * Invoice A
     * Prescription belonging to Customer B
     */
    if (prescriptionId) {
      const prescriptionCustomerResult = await dbClient.query(
        `
            SELECT 1
            FROM prescriptions
            WHERE id = $1
              AND organisation_id = $2
              AND customer_id = $3;
          `,
        [prescriptionId, organisationId, customerId],
      );

      if (prescriptionCustomerResult.rowCount === 0) {
        throw new Error(
          "Prescription does not belong to the specified customer.",
        );
      }
    }

    /**
     * If createdBy is supplied, ensure the user belongs to the
     * organisation.
     *
     * The users table represents identity, so organisation
     * membership is checked through organisation_memberships.
     */
    if (createdBy) {
      const membershipResult = await dbClient.query(
        `
            SELECT 1
            FROM organisation_memberships
            WHERE organisation_id = $1
              AND user_id = $2
              AND status = 'ACTIVE';
          `,
        [organisationId, createdBy],
      );

      if (membershipResult.rowCount === 0) {
        throw new Error(
          "Creating user is not an active member of the specified organisation.",
        );
      }
    }

    const query = `
        INSERT INTO invoices (
            organisation_id,
            branch_id,
            customer_id,
            prescription_id,
            invoice_number,
            invoice_date,
            subtotal,
            discount_amount,
            tax_amount,
            total_amount,
            status,
            notes,
            created_by
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            COALESCE($6::TIMESTAMPTZ, CURRENT_TIMESTAMP),
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13
        )
        RETURNING
            ${INVOICE_COLUMNS};
    `;

    const values = [
      organisationId,
      branchId,
      customerId,
      prescriptionId,
      invoiceNumber,
      invoiceDate,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      status,
      notes,
      createdBy,
    ];

    const result = await dbClient.query(query, values);

    const invoice = result.rows[0];

    /**
     * Commit only when this repository created the
     * transaction.
     */
    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return invoice;
  } catch (error) {
    /**
     * Roll back only transactions owned by this repository.
     */
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Invoice transaction rollback failed:",
          rollbackError.message,
        );
      }
    }

    throw error;
  } finally {
    /**
     * Do not release a transaction client supplied by the
     * caller.
     */
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * Get an invoice by ID within a specific organisation.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object|null>}
 */
const getInvoiceById = async (organisationId, invoiceId) => {
  const cacheKey = buildInvoiceCacheKey(organisationId, invoiceId);

  /**
   * Cache-aside read.
   */
  try {
    const cachedInvoice = await getCache(cacheKey);

    if (cachedInvoice) {
      return cachedInvoice;
    }
  } catch (cacheError) {
    console.error("Cache read failed for getInvoiceById:", cacheError.message);
  }

  const query = `
        SELECT
            ${INVOICE_COLUMNS}
        FROM invoices
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const result = await pool.query(query, [invoiceId, organisationId]);

  const invoice = result.rows[0] || null;

  if (invoice) {
    try {
      await setCache(cacheKey, invoice, INVOICE_CACHE_TTL);
    } catch (cacheError) {
      console.error(
        "Cache write failed for getInvoiceById:",
        cacheError.message,
      );
    }
  }

  return invoice;
};

/**
 * Get an invoice by its branch-scoped business number.
 *
 * Because invoice numbers are branch-scoped, both branch_id
 * and organisation_id are required.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} invoiceNumber
 *
 * @returns {Promise<Object|null>}
 */
const getInvoiceByNumber = async (organisationId, branchId, invoiceNumber) => {
  const query = `
        SELECT
            ${INVOICE_COLUMNS}
        FROM invoices
        WHERE organisation_id = $1
          AND branch_id = $2
          AND invoice_number = $3;
    `;

  const result = await pool.query(query, [
    organisationId,
    branchId,
    invoiceNumber,
  ]);

  return result.rows[0] || null;
};

/**
 * Get invoices belonging to a customer.
 *
 * This supports customer purchase history.
 *
 * @param {string} organisationId
 * @param {string} customerId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getInvoicesByCustomer = async (
  organisationId,
  customerId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${INVOICE_COLUMNS}
        FROM invoices
        WHERE organisation_id = $1
          AND customer_id = $2
        ORDER BY invoice_date DESC, created_at DESC, id DESC
        LIMIT $3
        OFFSET $4;
    `;

  const result = await pool.query(query, [
    organisationId,
    customerId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Get invoices belonging to a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getInvoicesByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${INVOICE_COLUMNS}
        FROM invoices
        WHERE organisation_id = $1
          AND branch_id = $2
        ORDER BY invoice_date DESC, created_at DESC, id DESC
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
 * Get invoices belonging to an organisation.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getInvoicesByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${INVOICE_COLUMNS}
        FROM invoices
        WHERE organisation_id = $1
        ORDER BY invoice_date DESC, created_at DESC, id DESC
        LIMIT $2
        OFFSET $3;
    `;

  const result = await pool.query(query, [organisationId, limit, offset]);

  return result.rows;
};

/**
 * Search invoices within an organisation.
 *
 * Search supports:
 * - invoice number
 * - customer name
 * - customer phone
 *
 * The customer fields are joined only for search.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchInvoices = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            i.id,
            i.organisation_id,
            i.branch_id,
            i.customer_id,
            i.prescription_id,
            i.invoice_number,
            i.invoice_date,
            i.subtotal,
            i.discount_amount,
            i.tax_amount,
            i.total_amount,
            i.status,
            i.notes,
            i.created_by,
            i.created_at,
            i.updated_at
        FROM invoices i
        JOIN customers c
          ON c.id = i.customer_id
         AND c.organisation_id = i.organisation_id
        WHERE i.organisation_id = $1
          AND (
                i.invoice_number ILIKE $2
                OR c.full_name ILIKE $2
                OR c.phone ILIKE $2
          )
        ORDER BY
            i.invoice_date DESC,
            i.created_at DESC,
            i.id DESC
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
 * Update an invoice header.
 *
 * This function intentionally does NOT allow:
 * - invoice_number changes
 * - organisation changes
 * - branch changes
 * - customer changes
 * - prescription changes
 * - created_by changes
 *
 * Those fields form the identity/context of the original
 * transaction.
 *
 * The service layer should additionally restrict which statuses
 * are allowed to be edited.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 * @param {Object} invoice
 *
 * @returns {Promise<Object|null>}
 */
const updateInvoice = async (
  organisationId,
  invoiceId,
  {
    invoiceDate,
    subtotal,
    discountAmount = 0,
    taxAmount = 0,
    totalAmount,
    status,
    notes = null,
  },
) => {
  const query = `
        UPDATE invoices
        SET
            invoice_date = $1,
            subtotal = $2,
            discount_amount = $3,
            tax_amount = $4,
            total_amount = $5,
            status = $6,
            notes = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
          AND organisation_id = $9
        RETURNING
            ${INVOICE_COLUMNS};
    `;

  const result = await pool.query(query, [
    invoiceDate,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    status,
    notes,
    invoiceId,
    organisationId,
  ]);

  const updatedInvoice = result.rows[0] || null;

  /**
   * Invalidate the individual invoice cache only after the
   * PostgreSQL update succeeds.
   */
  if (updatedInvoice) {
    const cacheKey = buildInvoiceCacheKey(organisationId, invoiceId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updateInvoice:",
        cacheError.message,
      );
    }
  }

  return updatedInvoice;
};

/**
 * Delete an invoice.
 *
 * Physical deletion is intentionally a controlled operation.
 *
 * In the final application, completed/financial invoices should
 * normally be voided/cancelled rather than physically deleted.
 *
 * PostgreSQL foreign keys will also prevent deletion when
 * dependent records such as invoice items or payment
 * allocations exist.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {Promise<boolean>}
 */
const deleteInvoice = async (organisationId, invoiceId) => {
  const query = `
        DELETE FROM invoices
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const result = await pool.query(query, [invoiceId, organisationId]);

  const deleted = result.rowCount > 0;

  if (deleted) {
    const cacheKey = buildInvoiceCacheKey(organisationId, invoiceId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deleteInvoice:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

module.exports = {
  createInvoice,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoicesByCustomer,
  getInvoicesByBranch,
  getInvoicesByOrganisation,
  searchInvoices,
  updateInvoice,
  deleteInvoice,
};
