/**
 * Payment Transaction Repository
 *
 * Purpose:
 * Handles direct PostgreSQL persistence for payment_transactions.
 *
 * A payment transaction represents one payment-method component
 * of a payment.
 *
 * Example:
 *
 * Payment REC-1001
 * Total = ₹5,000
 *
 *     CASH          ₹2,000
 *     UPI           ₹3,000
 *
 * Another payment may contain:
 *
 *     CASH          ₹1,000
 *     UPI           ₹2,000
 *     BANK_TRANSFER ₹2,000
 *
 * Important:
 *
 * payment_transactions does NOT contain organisation_id.
 * Tenant ownership is therefore derived through the parent
 * payments row.
 *
 * The repository is responsible for:
 * - payment transaction creation
 * - tenant-safe transaction reads
 * - validating payment ownership
 * - validating payment-method values through the database
 * - transaction amount persistence
 * - transaction-reference persistence
 * - transaction updates
 * - transaction deletion
 *
 * The repository does NOT:
 * - create the parent payment
 * - calculate the parent payment total
 * - decide whether transaction amounts equal payment.total_amount
 * - allocate payments to invoices
 * - create ledger entries
 * - validate application permissions
 * - decide financial workflow permissions
 *
 * Business validation involving the total of all payment
 * transactions belongs in the payment service/workflow layer.
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Payment Transaction Repository
 *     ↓
 * PostgreSQL
 *
 * Redis:
 *
 * Individual payment transactions are deliberately NOT cached.
 *
 * Reason:
 * payment_transactions are tightly coupled child financial
 * records. The parent payment can be deleted with ON DELETE
 * CASCADE, and independently caching child rows would create
 * an unnecessary invalidation problem.
 *
 * PostgreSQL remains the source of truth.
 */

const { pool } = require("../db/connection");
const {
  invalidateSessionReconciliationCache,
} = require("./cash-register-dashboard.repository");

/**
 * Columns returned by payment transaction queries.
 */
const PAYMENT_TRANSACTION_COLUMNS = `
    id,
    payment_id,
    payment_method,
    amount,
    transaction_reference,
    created_at
`;

/**
 * Validate that a payment belongs to the specified organisation.
 *
 * payment_transactions does not contain organisation_id.
 *
 * Therefore tenant ownership must be established by joining
 * payment_transactions → payments.
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
          p.cash_register_session_id
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
 * Validate that a payment transaction belongs to the specified
 * organisation.
 *
 * This is required for reads, updates and deletes because the
 * transaction table itself has no organisation_id.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} paymentTransactionId
 *
 * @returns {Promise<Object>}
 */
const validatePaymentTransactionOwnership = async (
  db,
  organisationId,
  paymentTransactionId,
) => {
  const result = await db.query(
    `
      SELECT
          pt.id,
          pt.payment_id,
          pt.payment_method,
          pt.amount,
          pt.transaction_reference,
          pt.created_at
      FROM payment_transactions pt
      INNER JOIN payments p
          ON p.id = pt.payment_id
      WHERE pt.id = $1
        AND p.organisation_id = $2;
    `,
    [paymentTransactionId, organisationId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
};

/**
 * Create a payment transaction.
 *
 * The parent payment must belong to the specified organisation.
 *
 * The database remains responsible for enforcing:
 * - supported payment methods
 * - amount > 0
 *
 * The service layer is responsible for higher-level financial
 * rules such as:
 *
 *     SUM(payment_transactions.amount)
 *         === payments.total_amount
 *
 * @param {Object} transaction
 * @param {string} transaction.organisationId
 * @param {string} transaction.paymentId
 * @param {string} transaction.paymentMethod
 * @param {number} transaction.amount
 * @param {string|null} transaction.transactionReference
 * @param {Object} [transaction.client]
 *
 * @returns {Promise<Object>}
 */
const createPaymentTransaction = async ({
  organisationId,
  paymentId,
  paymentMethod,
  amount,
  transactionReference = null,
  client = null,
}) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    /**
     * Validate parent payment ownership before inserting
     * the child record.
     */
    const parentPayment = await validatePaymentOwnership(
      dbClient,
      organisationId,
      paymentId,
    );

    const result = await dbClient.query(
      `
          INSERT INTO payment_transactions (
              payment_id,
              payment_method,
              amount,
              transaction_reference
          )
          VALUES (
              $1,
              $2,
              $3,
              $4
          )
          RETURNING
              ${PAYMENT_TRANSACTION_COLUMNS};
        `,
      [paymentId, paymentMethod, amount, transactionReference],
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    const createdTx = result.rows[0];
    if (parentPayment && parentPayment.cash_register_session_id) {
      await invalidateSessionReconciliationCache(
        organisationId,
        parentPayment.cash_register_session_id,
        ownsTransaction ? null : dbClient,
      );
    }

    return createdTx;
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
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
 * Get one payment transaction by ID within an organisation.
 *
 * Tenant scope is enforced through the parent payment.
 *
 * This method intentionally uses PostgreSQL directly rather than
 * Redis because payment transactions are tightly coupled child
 * financial records.
 *
 * @param {string} organisationId
 * @param {string} paymentTransactionId
 *
 * @returns {Promise<Object|null>}
 */
const getPaymentTransactionById = async (
  organisationId,
  paymentTransactionId,
) => {
  return validatePaymentTransactionOwnership(
    pool,
    organisationId,
    paymentTransactionId,
  );
};

/**
 * Get all payment transactions belonging to one payment.
 *
 * The payment itself must belong to the specified organisation.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentTransactionsByPayment = async (organisationId, paymentId) => {
  await validatePaymentOwnership(pool, organisationId, paymentId);

  const result = await pool.query(
    `
        SELECT
            ${PAYMENT_TRANSACTION_COLUMNS}
        FROM payment_transactions
        WHERE payment_id = $1
        ORDER BY
            created_at ASC,
            id ASC;
      `,
    [paymentId],
  );

  return result.rows;
};

/**
 * Get payment transactions by payment method within an
 * organisation.
 *
 * This is useful for reporting such as:
 *
 * - all UPI components
 * - all CASH components
 * - all CARD components
 *
 * @param {string} organisationId
 * @param {string} paymentMethod
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentTransactionsByMethod = async (
  organisationId,
  paymentMethod,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
        SELECT
            pt.id,
            pt.payment_id,
            pt.payment_method,
            pt.amount,
            pt.transaction_reference,
            pt.created_at
        FROM payment_transactions pt
        INNER JOIN payments p
            ON p.id = pt.payment_id
        WHERE p.organisation_id = $1
          AND pt.payment_method = $2
        ORDER BY
            pt.created_at DESC,
            pt.id DESC
        LIMIT $3
        OFFSET $4;
      `,
    [organisationId, paymentMethod, limit, offset],
  );

  return result.rows;
};

/**
 * Search payment transactions by external transaction
 * reference.
 *
 * Examples:
 *
 * - UPI transaction ID
 * - Bank UTR
 * - Card reference
 *
 * Search is always tenant restricted through the parent
 * payment.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchPaymentTransactions = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
        SELECT
            pt.id,
            pt.payment_id,
            pt.payment_method,
            pt.amount,
            pt.transaction_reference,
            pt.created_at,
            p.receipt_number
        FROM payment_transactions pt
        INNER JOIN payments p
            ON p.id = pt.payment_id
        WHERE p.organisation_id = $1
          AND COALESCE(
                pt.transaction_reference,
                ''
              ) ILIKE '%' || $2 || '%'
        ORDER BY
            pt.created_at DESC,
            pt.id DESC
        LIMIT $3
        OFFSET $4;
      `,
    [organisationId, searchTerm, limit, offset],
  );

  return result.rows;
};

/**
 * Update a payment transaction.
 *
 * Identity fields are immutable:
 * - id
 * - payment_id
 *
 * The payment relationship cannot be moved to another payment.
 *
 * Mutable fields:
 * - payment_method
 * - amount
 * - transaction_reference
 *
 * The service layer controls whether a financially finalized
 * payment transaction may actually be modified.
 *
 * @param {string} organisationId
 * @param {string} paymentTransactionId
 * @param {Object} updates
 * @param {Object} [client]
 *
 * @returns {Promise<Object|null>}
 */
const updatePaymentTransaction = async (
  organisationId,
  paymentTransactionId,
  updates = {},
  client = null,
) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  const allowedFields = {
    paymentMethod: "payment_method",

    amount: "amount",

    transactionReference: "transaction_reference",
  };

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    /**
     * Lock the transaction while checking ownership.
     *
     * This prevents the row from being changed concurrently
     * while the update is being prepared.
     */
    const currentResult = await dbClient.query(
      `
          SELECT
              pt.id,
              pt.payment_id,
              p.organisation_id,
              p.cash_register_session_id
          FROM payment_transactions pt
          INNER JOIN payments p
              ON p.id = pt.payment_id
          WHERE pt.id = $1
            AND p.organisation_id = $2
          FOR UPDATE OF pt;
        `,
      [paymentTransactionId, organisationId],
    );

    if (currentResult.rowCount === 0) {
      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return null;
    }

    const setClauses = [];
    const values = [];

    let parameterIndex = 1;

    for (const [inputField, columnName] of Object.entries(allowedFields)) {
      if (updates[inputField] !== undefined) {
        setClauses.push(`${columnName} = $${parameterIndex}`);

        values.push(updates[inputField]);

        parameterIndex += 1;
      }
    }

    /**
     * Empty update:
     *
     * Return the current transaction without issuing
     * an UPDATE.
     */
    if (values.length === 0) {
      const currentTransaction = await dbClient.query(
        `
            SELECT
                pt.id,
                pt.payment_id,
                pt.payment_method,
                pt.amount,
                pt.transaction_reference,
                pt.created_at
            FROM payment_transactions pt
            INNER JOIN payments p
                ON p.id = pt.payment_id
            WHERE pt.id = $1
              AND p.organisation_id = $2;
          `,
        [paymentTransactionId, organisationId],
      );

      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return currentTransaction.rows[0] || null;
    }

    values.push(paymentTransactionId);

    const transactionIdParameter = parameterIndex;

    parameterIndex += 1;

    /**
     * Tenant condition remains in the UPDATE itself.
     *
     * This prevents accidental cross-tenant updates even if
     * the SELECT/locking query is ever changed later.
     */
    values.push(organisationId);

    const organisationParameter = parameterIndex;

    const result = await dbClient.query(
      `
          UPDATE payment_transactions pt
          SET
              ${setClauses.join(",\n              ")}
          FROM payments p
          WHERE pt.id = $${transactionIdParameter}
            AND pt.payment_id = p.id
            AND p.organisation_id = $${organisationParameter}
          RETURNING
              pt.id,
              pt.payment_id,
              pt.payment_method,
              pt.amount,
              pt.transaction_reference,
              pt.created_at;
        `,
      values,
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    const updatedTx = result.rows[0] || null;
    if (
      currentResult.rows[0] &&
      currentResult.rows[0].cash_register_session_id
    ) {
      await invalidateSessionReconciliationCache(
        organisationId,
        currentResult.rows[0].cash_register_session_id,
        ownsTransaction ? null : dbClient,
      );
    }

    return updatedTx;
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
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
 * Delete a payment transaction by ID within an organisation.
 *
 * Tenant ownership is derived through the parent payment.
 *
 * The repository only performs the requested database
 * operation. The service layer decides whether deletion is
 * financially allowed.
 *
 * @param {string} organisationId
 * @param {string} paymentTransactionId
 * @param {Object} [client]
 *
 * @returns {Promise<boolean>}
 */
const deletePaymentTransaction = async (
  organisationId,
  paymentTransactionId,
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
          DELETE FROM payment_transactions pt
          USING payments p
          WHERE pt.id = $1
            AND pt.payment_id = p.id
            AND p.organisation_id = $2
          RETURNING pt.id, p.cash_register_session_id;
        `,
      [paymentTransactionId, organisationId],
    );

    const deletedRow = result.rows[0];

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    if (deletedRow && deletedRow.cash_register_session_id) {
      await invalidateSessionReconciliationCache(
        organisationId,
        deletedRow.cash_register_session_id,
        ownsTransaction ? null : dbClient,
      );
    }

    return result.rowCount === 1;
  } catch (error) {
    if (ownsTransaction) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the original error.
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
 * Export repository functions.
 */
module.exports = {
  createPaymentTransaction,
  getPaymentTransactionById,
  getPaymentTransactionsByPayment,
  getPaymentTransactionsByMethod,
  searchPaymentTransactions,
  updatePaymentTransaction,
  deletePaymentTransaction,
};
