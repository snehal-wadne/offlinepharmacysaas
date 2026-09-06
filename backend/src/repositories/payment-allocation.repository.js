/**
 * Payment Allocation Repository
 *
 * Purpose:
 * Handles direct PostgreSQL persistence for payment_allocations.
 *
 * A payment allocation connects a payment to an invoice and
 * records how much of that payment was applied to that invoice.
 *
 * Example:
 *
 *     Payment REC-1001 = ₹7,000
 *
 *     INV-1001 → ₹5,000
 *     INV-1002 → ₹2,000
 *
 * Therefore:
 *
 *     payments N : M invoices
 *
 * through payment_allocations.
 *
 * Important:
 *
 * payment_allocations does NOT contain organisation_id.
 *
 * Tenant ownership must therefore be derived through:
 *
 *     payment_allocations
 *             ↓
 *        payments / invoices
 *
 * The repository is responsible for:
 * - payment allocation creation
 * - tenant-safe allocation reads
 * - validating payment ownership
 * - validating invoice ownership
 * - validating payment/invoice tenant consistency
 * - allocation updates
 * - allocation deletion
 *
 * The repository does NOT:
 * - calculate payment remaining balance
 * - calculate invoice outstanding balance
 * - decide whether an allocation is financially allowed
 * - update payment totals
 * - update invoice totals
 * - create ledger entries
 * - validate application permissions
 * - decide financial workflow permissions
 *
 * Those responsibilities belong to the service/business layer.
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Payment Allocation Repository
 *     ↓
 * PostgreSQL
 *
 * Redis:
 *
 * Payment allocations deliberately do NOT use Redis caching.
 *
 * They are tightly coupled financial junction records.
 * Their parent payment and invoice can change their meaning,
 * and payment deletion cascades to allocations.
 *
 * PostgreSQL remains the source of truth.
 */

const { pool } = require("../db/connection");

/**
 * Columns returned by payment allocation queries.
 */
const PAYMENT_ALLOCATION_COLUMNS = `
    id,
    payment_id,
    invoice_id,
    allocated_amount,
    created_at
`;

/**
 * Validate that the payment belongs to the specified
 * organisation.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} paymentId
 *
 * @returns {Promise<Object>}
 */
const validatePaymentOwnership = async (db, organisationId, paymentId) => {
  const result = await db.query(
    `
        SELECT
            p.id,
            p.organisation_id,
            p.branch_id,
            p.customer_id,
            p.receipt_number,
            p.total_amount,
            p.status
        FROM payments p
        WHERE p.id = $1
          AND p.organisation_id = $2;
      `,
    [paymentId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error("Payment does not belong to the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Validate that the invoice belongs to the specified
 * organisation.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object>}
 */
const validateInvoiceOwnership = async (db, organisationId, invoiceId) => {
  const result = await db.query(
    `
        SELECT
            i.id,
            i.organisation_id,
            i.branch_id,
            i.customer_id,
            i.invoice_number,
            i.total_amount,
            i.status
        FROM invoices i
        WHERE i.id = $1
          AND i.organisation_id = $2;
      `,
    [invoiceId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error("Invoice does not belong to the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Validate that both payment and invoice belong to the same
 * organisation.
 *
 * This is intentionally handled in the repository because
 * payment_id and invoice_id are supplied independently.
 *
 * The database foreign keys only guarantee that both records
 * exist; they do not guarantee that they belong to the same
 * organisation.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} paymentId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object>}
 */
const validateAllocationContext = async (
  db,
  organisationId,
  paymentId,
  invoiceId,
) => {
  const result = await db.query(
    `
        SELECT
            p.id AS payment_id,
            p.organisation_id AS payment_organisation_id,
            p.branch_id AS payment_branch_id,
            p.customer_id AS payment_customer_id,
            i.id AS invoice_id,
            i.organisation_id AS invoice_organisation_id,
            i.branch_id AS invoice_branch_id,
            i.customer_id AS invoice_customer_id
        FROM payments p
        CROSS JOIN invoices i
        WHERE p.id = $1
          AND i.id = $2
          AND p.organisation_id = $3
          AND i.organisation_id = $3;
      `,
    [paymentId, invoiceId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Payment and invoice must belong to the specified organisation.",
    );
  }

  return result.rows[0];
};

/**
 * Create a payment allocation.
 *
 * The repository validates that:
 *
 *     payment → organisation
 *     invoice → organisation
 *
 * both belong to the requested tenant.
 *
 * PostgreSQL is responsible for enforcing:
 *
 *     allocated_amount > 0
 *
 * and:
 *
 *     UNIQUE(payment_id, invoice_id)
 *
 * The service layer is responsible for financial validation such
 * as:
 *
 *     allocation <= payment remaining amount
 *
 * and:
 *
 *     allocation <= invoice outstanding amount
 *
 * @param {Object} allocation
 * @param {string} allocation.organisationId
 * @param {string} allocation.paymentId
 * @param {string} allocation.invoiceId
 * @param {number} allocation.allocatedAmount
 * @param {Object} [allocation.client]
 *
 * @returns {Promise<Object>}
 */
const createPaymentAllocation = async ({
  organisationId,
  paymentId,
  invoiceId,
  allocatedAmount,
  client = null,
}) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    await validateAllocationContext(
      dbClient,
      organisationId,
      paymentId,
      invoiceId,
    );

    const result = await dbClient.query(
      `
          INSERT INTO payment_allocations (
              payment_id,
              invoice_id,
              allocated_amount
          )
          VALUES (
              $1,
              $2,
              $3
          )
          RETURNING
              ${PAYMENT_ALLOCATION_COLUMNS};
        `,
      [paymentId, invoiceId, allocatedAmount],
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
 * Get a payment allocation by ID within an organisation.
 *
 * Tenant ownership is derived through BOTH parent entities.
 *
 * @param {string} organisationId
 * @param {string} paymentAllocationId
 *
 * @returns {Promise<Object|null>}
 */
const getPaymentAllocationById = async (
  organisationId,
  paymentAllocationId,
) => {
  const result = await pool.query(
    `
        SELECT
            pa.id,
            pa.payment_id,
            pa.invoice_id,
            pa.allocated_amount
        FROM payment_allocations pa
        JOIN payments p
            ON p.id = pa.payment_id
        JOIN invoices i
            ON i.id = pa.invoice_id
        WHERE p.organisation_id = $1
        AND pa.id = $2
      `,
    [organisationId, paymentAllocationId],
  );

  return result.rows[0] || null;
};

/**
 * Get all allocations belonging to a payment.
 *
 * The payment must belong to the specified organisation.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentAllocationsByPayment = async (organisationId, paymentId) => {
  await validatePaymentOwnership(pool, organisationId, paymentId);

  const result = await pool.query(
    `
        SELECT
            pa.id,
            pa.payment_id,
            pa.invoice_id,
            pa.allocated_amount,
            pa.created_at
        FROM payment_allocations pa
        INNER JOIN invoices i
            ON i.id = pa.invoice_id
        WHERE pa.payment_id = $1
          AND i.organisation_id = $2
        ORDER BY
            pa.created_at ASC,
            pa.id ASC;
      `,
    [paymentId, organisationId],
  );

  return result.rows;
};

/**
 * Get all allocations belonging to an invoice.
 *
 * The invoice must belong to the specified organisation.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentAllocationsByInvoice = async (organisationId, invoiceId) => {
  await validateInvoiceOwnership(pool, organisationId, invoiceId);

  const result = await pool.query(
    `
        SELECT
            pa.id,
            pa.payment_id,
            pa.invoice_id,
            pa.allocated_amount,
            pa.created_at
        FROM payment_allocations pa
        INNER JOIN payments p
            ON p.id = pa.payment_id
        WHERE pa.invoice_id = $1
          AND p.organisation_id = $2
        ORDER BY
            pa.created_at ASC,
            pa.id ASC;
      `,
    [invoiceId, organisationId],
  );

  return result.rows;
};

/**
 * Get allocations for a payment with invoice details.
 *
 * This is useful for payment settlement views such as:
 *
 *     REC-1001
 *       INV-1001 → ₹5,000
 *       INV-1002 → ₹2,000
 *
 * The query remains tenant restricted.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentAllocationDetailsByPayment = async (
  organisationId,
  paymentId,
) => {
  await validatePaymentOwnership(pool, organisationId, paymentId);

  const result = await pool.query(
    `
        SELECT
            pa.id,
            pa.payment_id,
            pa.invoice_id,
            pa.allocated_amount,
            pa.created_at,
            i.invoice_number,
            i.customer_id,
            i.invoice_date,
            i.total_amount AS invoice_total_amount,
            i.status AS invoice_status
        FROM payment_allocations pa
        INNER JOIN invoices i
            ON i.id = pa.invoice_id
        WHERE pa.payment_id = $1
          AND i.organisation_id = $2
        ORDER BY
            pa.created_at ASC,
            pa.id ASC;
      `,
    [paymentId, organisationId],
  );

  return result.rows;
};

/**
 * Update a payment allocation.
 *
 * Identity fields are immutable:
 *
 * - id
 * - payment_id
 * - invoice_id
 *
 * Only allocated_amount can be changed.
 *
 * The service layer decides whether changing an existing
 * allocation is financially permitted.
 *
 * @param {string} organisationId
 * @param {string} paymentAllocationId
 * @param {Object} updates
 * @param {number} [updates.allocatedAmount]
 * @param {Object} [client]
 *
 * @returns {Promise<Object|null>}
 */
const updatePaymentAllocation = async (
  organisationId,
  paymentAllocationId,
  updates = {},
  client = null,
) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    /**
     * Lock the allocation while checking tenant ownership.
     *
     * Both parent entities are checked because both foreign-key
     * relationships participate in tenant isolation.
     */
    const currentResult = await dbClient.query(
      `
          SELECT
              pa.id,
              pa.payment_id,
              pa.invoice_id
          FROM payment_allocations pa
          INNER JOIN payments p
              ON p.id = pa.payment_id
          INNER JOIN invoices i
              ON i.id = pa.invoice_id
          WHERE pa.id = $1
            AND p.organisation_id = $2
            AND i.organisation_id = $2
          FOR UPDATE OF pa;
        `,
      [paymentAllocationId, organisationId],
    );

    if (currentResult.rowCount === 0) {
      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return null;
    }

    /**
     * Only allocatedAmount is mutable.
     *
     * paymentId and invoiceId are intentionally ignored.
     */
    if (updates.allocatedAmount === undefined) {
      const currentAllocation = await dbClient.query(
        `
            SELECT
                pa.id,
                pa.payment_id,
                pa.invoice_id,
                pa.allocated_amount,
                pa.created_at
            FROM payment_allocations pa
            INNER JOIN payments p
                ON p.id = pa.payment_id
            INNER JOIN invoices i
                ON i.id = pa.invoice_id
            WHERE pa.id = $1
              AND p.organisation_id = $2
              AND i.organisation_id = $2;
          `,
        [paymentAllocationId, organisationId],
      );

      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return currentAllocation.rows[0] || null;
    }

    const result = await dbClient.query(
      `
          UPDATE payment_allocations pa
          SET
              allocated_amount = $1
          FROM payments p, invoices i
          WHERE pa.id = $2
            AND pa.payment_id = p.id
            AND pa.invoice_id = i.id
            AND p.organisation_id = $3
            AND i.organisation_id = $3
          RETURNING
              pa.id,
              pa.payment_id,
              pa.invoice_id,
              pa.allocated_amount,
              pa.created_at;
        `,
      [updates.allocatedAmount, paymentAllocationId, organisationId],
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
 * Delete a payment allocation by ID within an organisation.
 *
 * Tenant ownership is derived through both parent records.
 *
 * The service layer decides whether the allocation is
 * financially safe to remove.
 *
 * @param {string} organisationId
 * @param {string} paymentAllocationId
 * @param {Object} [client]
 *
 * @returns {Promise<boolean>}
 */
const deletePaymentAllocation = async (
  organisationId,
  paymentAllocationId,
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
          DELETE FROM payment_allocations pa
          USING payments p, invoices i
          WHERE pa.id = $1
            AND pa.payment_id = p.id
            AND pa.invoice_id = i.id
            AND p.organisation_id = $2
            AND i.organisation_id = $2
          RETURNING pa.id;
        `,
      [paymentAllocationId, organisationId],
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
  createPaymentAllocation,
  getPaymentAllocationById,
  getPaymentAllocationsByPayment,
  getPaymentAllocationsByInvoice,
  getPaymentAllocationDetailsByPayment,
  updatePaymentAllocation,
  deletePaymentAllocation,
};
