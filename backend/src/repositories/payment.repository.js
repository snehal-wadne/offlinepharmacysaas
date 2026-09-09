/**
 * Payment Repository
 *
 * Purpose:
 * Handles direct PostgreSQL persistence for payments.
 *
 * A payment represents the complete amount of money received
 * from a customer.
 *
 * Payment methods are NOT stored directly on this table.
 * Split payment methods are represented separately by
 * payment_transactions.
 *
 * The repository is responsible for:
 * - payment creation
 * - receipt-number generation
 * - tenant-safe payment reads
 * - branch/customer ownership validation
 * - received-by user validation
 * - payment updates
 * - payment deletion
 * - Redis cache-aside reads
 * - Redis cache invalidation after writes
 *
 * The repository does NOT:
 * - create payment transactions
 * - allocate payments to invoices
 * - calculate customer outstanding
 * - create ledger entries
 * - validate application permissions
 * - decide financial workflow permissions
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Payment Repository
 *     ↓
 * PostgreSQL
 *
 * Redis is used as a server-side read cache.
 *
 * PostgreSQL remains the source of truth.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const { getNextBusinessNumber } = require("./number-sequence.repository");
const { invalidateSessionReconciliationCache } = require("./cash-register-dashboard.repository");

/**
 * Branch-scoped sequence used by payments.
 *
 * Payment receipts are human-readable business numbers such as:
 *
 *     REC-1001
 *     REC-1002
 */
const PAYMENT_SEQUENCE_TYPE = "RECEIPT";

/**
 * Redis cache TTL in seconds.
 *
 * Redis is only a temporary cache. The TTL also provides
 * fallback protection if an invalidation is ever missed.
 */
const PAYMENT_CACHE_TTL = 60;

/**
 * Tenant-safe payment cache key.
 *
 * The organisation ID is deliberately part of the key so that
 * cached data from one organisation can never be returned when
 * another organisation requests the same payment UUID.
 */
const buildPaymentCacheKey = (organisationId, paymentId) =>
  `organisation:${organisationId}:payment:${paymentId}`;

/**
 * Columns returned by payment queries.
 */
const PAYMENT_COLUMNS = `
    id,
    organisation_id,
    branch_id,
    customer_id,
    receipt_number,
    payment_date,
    total_amount,
    status,
    notes,
    received_by,
    cash_register_session_id,
    created_at,
    updated_at
`;

/**
 * Validate branch ownership.
 *
 * The branch must belong to the specified organisation.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} branchId
 *
 * @returns {Promise<Object>}
 */
const validateBranch = async (db, organisationId, branchId) => {
  const result = await db.query(
    `
      SELECT
          b.id,
          b.organisation_id
      FROM branches b
      WHERE b.id = $1
        AND b.organisation_id = $2;
    `,
    [branchId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error("Branch does not belong to the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Validate customer ownership.
 *
 * Customers belong to an organisation, not a branch.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} customerId
 *
 * @returns {Promise<Object>}
 */
const validateCustomer = async (db, organisationId, customerId) => {
  const result = await db.query(
    `
      SELECT
          c.id,
          c.organisation_id
      FROM customers c
      WHERE c.id = $1
        AND c.organisation_id = $2;
    `,
    [customerId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error("Customer does not belong to the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Validate the user who received the payment.
 *
 * received_by is nullable because the database permits the
 * referenced user to be removed later.
 *
 * When supplied during creation/update, however, the user
 * must exist and be an ACTIVE member of the organisation.
 *
 * Note:
 * organisation_memberships does not contain role_id.
 * Branch-specific roles are handled by branch_assignments.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string|null} receivedBy
 */
const validateReceivedBy = async (db, organisationId, receivedBy) => {
  if (!receivedBy) {
    return;
  }

  const result = await db.query(
    `
      SELECT
          u.id
      FROM users u
      INNER JOIN organisation_memberships om
          ON om.user_id = u.id
      WHERE u.id = $1
        AND om.organisation_id = $2
        AND om.status = 'ACTIVE';
    `,
    [receivedBy, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Receiving user is not an active member of the specified organisation.",
    );
  }
};

/**
 * Validate that the session exists and belongs to the specified organisation and branch.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string|null} sessionId
 */
const validateSession = async (db, organisationId, branchId, sessionId) => {
  if (!sessionId) {
    return;
  }

  const result = await db.query(
    `
      SELECT
          id
      FROM cash_register_sessions
      WHERE id = $1
        AND organisation_id = $2
        AND branch_id = $3;
    `,
    [sessionId, organisationId, branchId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Cash register session not found in the specified organisation and branch.",
    );
  }
};

/**
 * Validate all payment parent references.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} customerId
 * @param {string|null} receivedBy
 * @param {string|null} cashRegisterSessionId
 */
const validatePaymentContext = async (
  db,
  organisationId,
  branchId,
  customerId,
  receivedBy,
  cashRegisterSessionId = null,
) => {
  await validateBranch(db, organisationId, branchId);

  await validateCustomer(db, organisationId, customerId);

  await validateReceivedBy(db, organisationId, receivedBy);

  await validateSession(db, organisationId, branchId, cashRegisterSessionId);
};

/**
 * Create a payment.
 *
 * Receipt numbers are generated using the branch-scoped
 * RECEIPT number sequence.
 *
 * If a PostgreSQL client is supplied, the caller owns the
 * transaction.
 *
 * Otherwise this repository creates its own transaction.
 *
 * The receipt number and payment row are therefore created
 * atomically.
 *
 * Redis is NOT written here because the newly created payment
 * is not necessarily going to be read immediately and the
 * first individual read can populate the cache naturally.
 *
 * @param {Object} payment
 * @param {string} payment.organisationId
 * @param {string} payment.branchId
 * @param {string} payment.customerId
 * @param {string} [payment.paymentDate]
 * @param {number} payment.totalAmount
 * @param {string} [payment.status="COMPLETED"]
 * @param {string|null} [payment.notes=null]
 * @param {string|null} [payment.receivedBy=null]
 * @param {string|null} [payment.cashRegisterSessionId=null]
 * @param {Object} [payment.client]
 *
 * @returns {Promise<Object>}
 */
const createPayment = async ({
  organisationId,
  branchId,
  customerId,
  paymentDate = null,
  totalAmount,
  status = "COMPLETED",
  notes = null,
  receivedBy = null,
  cashRegisterSessionId = null,
  client = null,
}) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    await validatePaymentContext(
      dbClient,
      organisationId,
      branchId,
      customerId,
      receivedBy,
      cashRegisterSessionId,
    );

    const receiptNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: PAYMENT_SEQUENCE_TYPE,
      client: dbClient,
    });

    const result = await dbClient.query(
      `
        INSERT INTO payments (
            organisation_id,
            branch_id,
            customer_id,
            receipt_number,
            payment_date,
            total_amount,
            status,
            notes,
            received_by,
            cash_register_session_id
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            COALESCE($5, CURRENT_TIMESTAMP),
            $6,
            $7,
            $8,
            $9,
            $10
        )
        RETURNING
            ${PAYMENT_COLUMNS};
      `,
      [
        organisationId,
        branchId,
        customerId,
        receiptNumber,
        paymentDate,
        totalAmount,
        status,
        notes,
        receivedBy,
        cashRegisterSessionId,
      ],
    );

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    const createdPayment = result.rows[0];

    if (createdPayment && createdPayment.cash_register_session_id) {
      await invalidateSessionReconciliationCache(
        organisationId,
        createdPayment.cash_register_session_id,
        ownsTransaction ? null : dbClient,
      );
    }

    return createdPayment;
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
 * Get a payment by technical ID within an organisation.
 *
 * Cache strategy:
 *
 *     Redis
 *       ↓ miss
 *     PostgreSQL
 *       ↓
 *     Redis
 *
 * Redis failures are deliberately non-fatal.
 *
 * PostgreSQL remains the source of truth.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 *
 * @returns {Promise<Object|null>}
 */
const getPaymentById = async (organisationId, paymentId) => {
  const cacheKey = buildPaymentCacheKey(organisationId, paymentId);

  /**
   * CACHE-ASIDE READ
   *
   * Try Redis before PostgreSQL.
   */
  try {
    const cachedPayment = await getCache(cacheKey);

    if (cachedPayment) {
      return cachedPayment;
    }
  } catch (cacheError) {
    /**
     * Redis is an optimisation, not a dependency.
     *
     * A cache failure must never prevent a valid
     * PostgreSQL read.
     */
    console.error("Cache read failed for getPaymentById:", cacheError.message);
  }

  const result = await pool.query(
    `
      SELECT
          ${PAYMENT_COLUMNS}
      FROM payments
      WHERE id = $1
        AND organisation_id = $2;
    `,
    [paymentId, organisationId],
  );

  const payment = result.rows[0] || null;

  /**
   * Only cache positive results.
   *
   * We deliberately do not cache null/not-found results.
   */
  if (payment) {
    try {
      await setCache(cacheKey, payment, PAYMENT_CACHE_TTL);
    } catch (cacheError) {
      /**
       * A failed cache write is non-fatal because
       * PostgreSQL already returned the authoritative data.
       */
      console.error(
        "Cache write failed for getPaymentById:",
        cacheError.message,
      );
    }
  }

  return payment;
};

/**
 * Get a payment by receipt number.
 *
 * Receipt numbers are only unique within a branch.
 *
 * Therefore both organisation_id and branch_id are required
 * to safely identify the receipt.
 *
 * This lookup intentionally remains PostgreSQL-backed.
 * The primary cache strategy for payments is individual
 * technical-ID reads, matching the established repository
 * pattern used for other entities.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} receiptNumber
 *
 * @returns {Promise<Object|null>}
 */
const getPaymentByReceiptNumber = async (
  organisationId,
  branchId,
  receiptNumber,
) => {
  const result = await pool.query(
    `
      SELECT
          ${PAYMENT_COLUMNS}
      FROM payments
      WHERE organisation_id = $1
        AND branch_id = $2
        AND receipt_number = $3;
    `,
    [organisationId, branchId, receiptNumber],
  );

  return result.rows[0] || null;
};

/**
 * Get payments belonging to a customer.
 *
 * List queries are intentionally not cached.
 *
 * Payment creation/update/delete can affect several related
 * views and maintaining list-cache invalidation would create
 * unnecessary complexity.
 *
 * @param {string} organisationId
 * @param {string} customerId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentsByCustomer = async (
  organisationId,
  customerId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          p.id,
          p.organisation_id,
          p.branch_id,
          p.customer_id,
          p.receipt_number,
          p.payment_date,
          p.total_amount,
          p.status,
          p.notes,
          p.received_by,
          p.created_at,
          p.updated_at
      FROM payments p
      WHERE p.organisation_id = $1
        AND p.customer_id = $2
      ORDER BY
          p.payment_date DESC,
          p.created_at DESC,
          p.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, customerId, limit, offset],
  );

  return result.rows;
};

/**
 * Get payments belonging to a branch.
 *
 * List queries are intentionally not cached.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentsByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          p.id,
          p.organisation_id,
          p.branch_id,
          p.customer_id,
          p.receipt_number,
          p.payment_date,
          p.total_amount,
          p.status,
          p.notes,
          p.received_by,
          p.created_at,
          p.updated_at
      FROM payments p
      WHERE p.organisation_id = $1
        AND p.branch_id = $2
      ORDER BY
          p.payment_date DESC,
          p.created_at DESC,
          p.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, branchId, limit, offset],
  );

  return result.rows;
};

/**
 * Get all payments belonging to an organisation.
 *
 * List queries are intentionally not cached.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPaymentsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ${PAYMENT_COLUMNS}
      FROM payments
      WHERE organisation_id = $1
      ORDER BY
          payment_date DESC,
          created_at DESC,
          id DESC
      LIMIT $2
      OFFSET $3;
    `,
    [organisationId, limit, offset],
  );

  return result.rows;
};

/**
 * Search payments.
 *
 * Searches by:
 * - receipt number
 * - customer name
 * - customer phone
 *
 * Search results are intentionally not cached because payment
 * records can change through financial workflows and search
 * invalidation would be unnecessarily expensive.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchPayments = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          p.id,
          p.organisation_id,
          p.branch_id,
          p.customer_id,
          p.receipt_number,
          p.payment_date,
          p.total_amount,
          p.status,
          p.notes,
          p.received_by,
          p.created_at,
          p.updated_at,
          c.full_name AS customer_name,
          c.phone AS customer_phone
      FROM payments p
      INNER JOIN customers c
          ON c.id = p.customer_id
      WHERE p.organisation_id = $1
        AND (
            p.receipt_number ILIKE '%' || $2 || '%'
            OR c.full_name ILIKE '%' || $2 || '%'
            OR COALESCE(c.phone, '') ILIKE '%' || $2 || '%'
        )
      ORDER BY
          p.payment_date DESC,
          p.created_at DESC,
          p.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, searchTerm, limit, offset],
  );

  return result.rows;
};

/**
 * Update a payment.
 *
 * Identity fields are immutable:
 * - id
 * - organisation_id
 * - branch_id
 * - customer_id
 * - receipt_number
 *
 * The repository permits updates to mutable payment fields,
 * while the service layer is responsible for deciding whether
 * the current payment state is actually editable.
 *
 * PostgreSQL is updated first.
 *
 * After a successful update, the individual payment cache is
 * invalidated so that the next getPaymentById() call retrieves
 * the fresh PostgreSQL record.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 * @param {Object} updates
 * @param {Object} [client]
 *
 * @returns {Promise<Object|null>}
 */
const updatePayment = async (
  organisationId,
  paymentId,
  updates = {},
  client = null,
) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  const allowedFields = {
    paymentDate: "payment_date",
    totalAmount: "total_amount",
    status: "status",
    notes: "notes",
    receivedBy: "received_by",
  };

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const currentResult = await dbClient.query(
      `
          SELECT
              id,
              organisation_id,
              cash_register_session_id
          FROM payments
          WHERE id = $1
            AND organisation_id = $2
          FOR UPDATE;
        `,
      [paymentId, organisationId],
    );

    if (currentResult.rowCount === 0) {
      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return null;
    }

    if (updates.receivedBy !== undefined) {
      await validateReceivedBy(dbClient, organisationId, updates.receivedBy);
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

    /*
     * updated_at is explicitly changed because this schema
     * does not define an automatic database trigger for it.
     */
    setClauses.push("updated_at = CURRENT_TIMESTAMP");

    /**
     * Empty update.
     *
     * The row was locked above, but no actual mutable fields
     * were supplied.
     */
    if (values.length === 0) {
      const currentPayment = await dbClient.query(
        `
            SELECT
                ${PAYMENT_COLUMNS}
            FROM payments
            WHERE id = $1
              AND organisation_id = $2;
          `,
        [paymentId, organisationId],
      );

      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return currentPayment.rows[0] || null;
    }

    values.push(paymentId);

    const paymentIdParameter = parameterIndex;

    parameterIndex += 1;

    values.push(organisationId);

    const organisationParameter = parameterIndex;

    const result = await dbClient.query(
      `
          UPDATE payments
          SET
              ${setClauses.join(",\n              ")}
          WHERE id = $${paymentIdParameter}
            AND organisation_id = $${organisationParameter}
          RETURNING
              ${PAYMENT_COLUMNS};
        `,
      values,
    );

    const updatedPayment = result.rows[0] || null;

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    /**
     * Invalidate only after PostgreSQL has successfully
     * completed the update.
     *
     * Redis failure must not turn a successful database
     * update into a failed application operation.
     */
    if (updatedPayment) {
      const cacheKey = buildPaymentCacheKey(organisationId, paymentId);

      try {
        await deleteCache(cacheKey);
      } catch (cacheError) {
        console.error(
          "Cache invalidation failed for updatePayment:",
          cacheError.message,
        );
      }

      const oldSessionId = currentResult.rows[0] && currentResult.rows[0].cash_register_session_id;
      const newSessionId = updatedPayment.cash_register_session_id;
      if (oldSessionId) {
        await invalidateSessionReconciliationCache(organisationId, oldSessionId, ownsTransaction ? null : dbClient);
      }
      if (newSessionId && newSessionId !== oldSessionId) {
        await invalidateSessionReconciliationCache(organisationId, newSessionId, ownsTransaction ? null : dbClient);
      }
    }

    return updatedPayment;
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
 * Delete a payment by ID within an organisation.
 *
 * IMPORTANT:
 *
 * In the final application, deleting a payment that has
 * payment_transactions, payment_allocations, or ledger entries
 * will normally be prevented by those relationships/business
 * rules.
 *
 * This repository method is therefore primarily useful for
 * deleting a payment that has not yet acquired dependent
 * financial records, such as a test/draft payment.
 *
 * Financially finalized payments should normally be transitioned
 * to VOID or REFUNDED rather than physically deleted.
 *
 * PostgreSQL is updated first.
 *
 * After a successful deletion, the corresponding Redis cache
 * entry is invalidated.
 *
 * @param {string} organisationId
 * @param {string} paymentId
 * @param {Object} [client]
 *
 * @returns {Promise<boolean>}
 */
const deletePayment = async (organisationId, paymentId, client = null) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const result = await dbClient.query(
      `
          DELETE FROM payments
          WHERE id = $1
            AND organisation_id = $2
          RETURNING id, cash_register_session_id;
        `,
      [paymentId, organisationId],
    );

    const deleted = result.rowCount === 1;

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    /**
     * Invalidate the cache only when PostgreSQL actually
     * deleted a payment.
     */
    if (deleted) {
      const cacheKey = buildPaymentCacheKey(organisationId, paymentId);

      try {
        await deleteCache(cacheKey);
      } catch (cacheError) {
        console.error(
          "Cache invalidation failed for deletePayment:",
          cacheError.message,
        );
      }

      const deletedRow = result.rows[0];
      if (deletedRow && deletedRow.cash_register_session_id) {
        await invalidateSessionReconciliationCache(
          organisationId,
          deletedRow.cash_register_session_id,
          ownsTransaction ? null : dbClient,
        );
      }
    }

    return deleted;
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
 * List payments associated with a cash register session.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.sessionId
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Array<Object>>}
 */
const listPaymentsBySession = async ({
  organisationId,
  branchId,
  sessionId,
  limit = 50,
  offset = 0,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!sessionId) throw new Error("sessionId is required.");

  const dbClient = client || pool;

  const query = `
    SELECT
      ${PAYMENT_COLUMNS}
    FROM payments
    WHERE organisation_id = $1
      AND branch_id = $2
      AND cash_register_session_id = $3
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5;
  `;

  const result = await dbClient.query(query, [
    organisationId,
    branchId,
    sessionId,
    limit,
    offset,
  ]);

  return result.rows;
};

/**
 * Export repository functions.
 */
module.exports = {
  createPayment,
  getPaymentById,
  getPaymentByReceiptNumber,
  getPaymentsByCustomer,
  getPaymentsByBranch,
  getPaymentsByOrganisation,
  listPaymentsBySession,
  searchPayments,
  updatePayment,
  deletePayment,
};
