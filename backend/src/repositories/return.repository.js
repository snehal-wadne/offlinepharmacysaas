/**
 * Return Repository
 *
 * Purpose:
 * Handles direct PostgreSQL persistence for customer returns.
 *
 * A return represents a customer's return transaction against
 * an existing invoice.
 *
 * The return header stores:
 *
 * - customer
 * - original invoice
 * - branch
 * - return number
 * - return date
 * - refund amount
 * - refund method
 * - status
 * - reason
 * - notes
 * - recording/processing users
 *
 * Individual returned products are stored separately in
 * return_items.
 *
 * IMPORTANT:
 *
 * This repository does NOT:
 *
 * - calculate item-level refund amounts
 * - calculate remaining returnable quantity
 * - modify inventory
 * - create customer ledger entries
 * - validate application permissions
 * - orchestrate the complete return workflow
 *
 * Those responsibilities belong to the service layer.
 *
 * The refund amount stored here is the total refund amount
 * for the return. Item-level refund calculation will be
 * handled when return_items are processed.
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Return Repository
 *     ↓
 * PostgreSQL
 */

const { pool } = require("../db/connection");

const { getNextBusinessNumber } = require("./number-sequence.repository");

/**
 * Return business-number sequence type.
 *
 * Returns are branch-scoped according to the current schema.
 */
const RETURN_SEQUENCE_TYPE = "RETURN";

/**
 * Columns returned by the repository.
 *
 * Keeping the column list explicit prevents accidental
 * SELECT * usage and makes returned objects predictable.
 */
const RETURN_COLUMNS = `
    id,
    organisation_id,
    branch_id,
    customer_id,
    invoice_id,
    return_number,
    return_date,
    status,
    refund_amount,
    refund_method,
    reason,
    notes,
    created_by,
    processed_by,
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
 * Validate the original invoice.
 *
 * A return must point to an invoice belonging to:
 *
 * - the specified organisation
 * - the specified branch
 * - the specified customer
 *
 * This prevents a caller from combining separately supplied
 * organisation/branch/customer/invoice IDs from different
 * tenants or contexts.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} customerId
 * @param {string} invoiceId
 *
 * @returns {Promise<Object>}
 */
const validateInvoice = async (
  db,
  organisationId,
  branchId,
  customerId,
  invoiceId,
) => {
  const result = await db.query(
    `
      SELECT
          i.id,
          i.organisation_id,
          i.branch_id,
          i.customer_id,
          i.invoice_number
      FROM invoices i
      WHERE i.id = $1
        AND i.organisation_id = $2;
    `,
    [invoiceId, organisationId],
  );

  if (result.rowCount === 0) {
    throw new Error("Invoice does not belong to the specified organisation.");
  }

  const invoice = result.rows[0];

  if (invoice.branch_id !== branchId) {
    throw new Error("Invoice does not belong to the specified branch.");
  }

  if (invoice.customer_id !== customerId) {
    throw new Error("Invoice does not belong to the specified customer.");
  }

  return invoice;
};

/**
 * Validate a user belongs to the organisation and is active.
 *
 * The database allows created_by / processed_by to become NULL
 * later if the user is deleted.
 *
 * When supplied during create/update, however, the user must
 * currently be an ACTIVE organisation member.
 *
 * Branch-specific role/access is intentionally not checked here.
 * Permission and branch-assignment checks belong to the service
 * layer.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} userId
 * @param {string} fieldName
 *
 * @returns {Promise<Object>}
 */
const validateOrganisationUser = async (
  db,
  organisationId,
  userId,
  fieldName,
) => {
  if (userId === null || userId === undefined) {
    return null;
  }

  const result = await db.query(
    `
      SELECT
          u.id,
          u.name,
          om.status AS membership_status
      FROM users u
      INNER JOIN organisation_memberships om
          ON om.user_id = u.id
         AND om.organisation_id = $1
      WHERE u.id = $2
        AND om.status = 'ACTIVE';
    `,
    [organisationId, userId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `${fieldName} user is not an active member of the specified organisation.`,
    );
  }

  return result.rows[0];
};

/**
 * Validate the complete return context.
 *
 * @param {Object} db
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} customerId
 * @param {string} invoiceId
 * @param {string|null} createdBy
 * @param {string|null} processedBy
 */
const validateReturnContext = async (
  db,
  organisationId,
  branchId,
  customerId,
  invoiceId,
  createdBy,
  processedBy,
) => {
  await validateBranch(db, organisationId, branchId);

  await validateCustomer(db, organisationId, customerId);

  await validateInvoice(db, organisationId, branchId, customerId, invoiceId);

  await validateOrganisationUser(db, organisationId, createdBy, "Created-by");

  await validateOrganisationUser(
    db,
    organisationId,
    processedBy,
    "Processed-by",
  );
};

/**
 * Create a return.
 *
 * Return-number generation and return insertion occur inside
 * the same PostgreSQL transaction.
 *
 * This guarantees that a failed return creation does not
 * permanently consume a return number.
 *
 * @param {Object} returnData
 * @param {string} returnData.organisationId
 * @param {string} returnData.branchId
 * @param {string} returnData.customerId
 * @param {string} returnData.invoiceId
 * @param {string} [returnData.returnDate]
 * @param {string} [returnData.status="PROCESSED"]
 * @param {number} [returnData.refundAmount=0]
 * @param {string} returnData.refundMethod
 * @param {string|null} [returnData.reason=null]
 * @param {string|null} [returnData.notes=null]
 * @param {string|null} [returnData.createdBy=null]
 * @param {string|null} [returnData.processedBy=null]
 * @param {Object} [returnData.client]
 *
 * @returns {Promise<Object>}
 */
const createReturn = async ({
  organisationId,
  branchId,
  customerId,
  invoiceId,
  returnDate = null,
  status = "PROCESSED",
  refundAmount = 0,
  refundMethod,
  reason = null,
  notes = null,
  createdBy = null,
  processedBy = null,
  client = null,
}) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    await validateReturnContext(
      dbClient,
      organisationId,
      branchId,
      customerId,
      invoiceId,
      createdBy,
      processedBy,
    );

    /**
     * Return numbers are branch-scoped.
     *
     * Example:
     *
     * Branch A → RET-1001
     * Branch A → RET-1002
     * Branch B → RET-1001
     */
    const returnNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: RETURN_SEQUENCE_TYPE,
      client: dbClient,
    });

    const result = await dbClient.query(
      `
          INSERT INTO returns (
              organisation_id,
              branch_id,
              customer_id,
              invoice_id,
              return_number,
              return_date,
              status,
              refund_amount,
              refund_method,
              reason,
              notes,
              created_by,
              processed_by
          )
          VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              COALESCE($6, CURRENT_TIMESTAMP),
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13
          )
          RETURNING
              ${RETURN_COLUMNS};
        `,
      [
        organisationId,
        branchId,
        customerId,
        invoiceId,
        returnNumber,
        returnDate,
        status,
        refundAmount,
        refundMethod,
        reason,
        notes,
        createdBy,
        processedBy,
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
 * Get a return by technical ID within an organisation.
 *
 * Tenant isolation is enforced through organisation_id.
 *
 * @param {string} organisationId
 * @param {string} returnId
 *
 * @returns {Promise<Object|null>}
 */
const getReturnById = async (organisationId, returnId) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE id = $1
        AND organisation_id = $2;
    `,
    [returnId, organisationId],
  );

  return result.rows[0] || null;
};

/**
 * Get a return by branch-scoped return number.
 *
 * Both organisation_id and branch_id are required because
 * return numbers are unique only within a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string} returnNumber
 *
 * @returns {Promise<Object|null>}
 */
const getReturnByNumber = async (organisationId, branchId, returnNumber) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE organisation_id = $1
        AND branch_id = $2
        AND return_number = $3;
    `,
    [organisationId, branchId, returnNumber],
  );

  return result.rows[0] || null;
};

/**
 * Get returns belonging to a customer.
 *
 * Customers are organisation-owned, so the organisation_id
 * condition is still required for tenant isolation.
 *
 * @param {string} organisationId
 * @param {string} customerId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getReturnsByCustomer = async (
  organisationId,
  customerId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE organisation_id = $1
        AND customer_id = $2
      ORDER BY return_date DESC, id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, customerId, limit, offset],
  );

  return result.rows;
};

/**
 * Get returns associated with an invoice.
 *
 * @param {string} organisationId
 * @param {string} invoiceId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getReturnsByInvoice = async (
  organisationId,
  invoiceId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE organisation_id = $1
        AND invoice_id = $2
      ORDER BY return_date DESC, id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, invoiceId, limit, offset],
  );

  return result.rows;
};

/**
 * Get returns belonging to a branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getReturnsByBranch = async (
  organisationId,
  branchId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE organisation_id = $1
        AND branch_id = $2
      ORDER BY return_date DESC, id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, branchId, limit, offset],
  );

  return result.rows;
};

/**
 * Get all returns for an organisation.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getReturnsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const result = await pool.query(
    `
      SELECT
          ${RETURN_COLUMNS}
      FROM returns
      WHERE organisation_id = $1
      ORDER BY return_date DESC, id DESC
      LIMIT $2
      OFFSET $3;
    `,
    [organisationId, limit, offset],
  );

  return result.rows;
};

/**
 * Search returns within an organisation.
 *
 * Search fields:
 *
 * - return number
 * - original invoice number
 * - customer name
 * - customer phone
 * - reason
 *
 * This is intentionally a read/query responsibility.
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchReturns = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const searchPattern = `%${searchTerm}%`;

  const result = await pool.query(
    `
      SELECT
          r.id,
          r.organisation_id,
          r.branch_id,
          r.customer_id,
          r.invoice_id,
          r.return_number,
          r.return_date,
          r.status,
          r.refund_amount,
          r.refund_method,
          r.reason,
          r.notes,
          r.created_by,
          r.processed_by,
          r.created_at,
          r.updated_at
      FROM returns r
      INNER JOIN customers c
          ON c.id = r.customer_id
      INNER JOIN invoices i
          ON i.id = r.invoice_id
      WHERE r.organisation_id = $1
        AND (
              r.return_number ILIKE $2
              OR i.invoice_number ILIKE $2
              OR c.full_name ILIKE $2
              OR c.phone ILIKE $2
              OR r.reason ILIKE $2
        )
      ORDER BY
          r.return_date DESC,
          r.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, searchPattern, limit, offset],
  );

  return result.rows;
};

/**
 * Update an existing return.
 *
 * Identity fields are intentionally immutable:
 *
 * - organisation_id
 * - branch_id
 * - customer_id
 * - invoice_id
 * - return_number
 * - created_by
 *
 * The service layer is responsible for deciding whether a
 * particular status transition or financial edit is allowed.
 *
 * @param {string} organisationId
 * @param {string} returnId
 * @param {Object} updates
 * @param {Object} [client]
 *
 * @returns {Promise<Object|null>}
 */
const updateReturn = async (
  organisationId,
  returnId,
  updates = {},
  client = null,
) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  const allowedFields = {
    returnDate: "return_date",
    status: "status",
    refundAmount: "refund_amount",
    refundMethod: "refund_method",
    reason: "reason",
    notes: "notes",
    processedBy: "processed_by",
  };

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    /**
     * Lock the current return row.
     *
     * This is useful because a financial return can be subject
     * to concurrent workflow operations.
     */
    const currentResult = await dbClient.query(
      `
          SELECT
              id,
              organisation_id,
              branch_id,
              customer_id,
              invoice_id,
              return_number,
              created_by
          FROM returns
          WHERE id = $1
            AND organisation_id = $2
          FOR UPDATE;
        `,
      [returnId, organisationId],
    );

    if (currentResult.rowCount === 0) {
      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return null;
    }

    /**
     * processed_by is an organisation-owned user and therefore
     * must be validated when supplied.
     */
    if (updates.processedBy !== undefined) {
      await validateOrganisationUser(
        dbClient,
        organisationId,
        updates.processedBy,
        "Processed-by",
      );
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
     * Even an empty update should return the current row.
     */
    if (values.length === 0) {
      const currentReturn = await dbClient.query(
        `
            SELECT
                ${RETURN_COLUMNS}
            FROM returns
            WHERE id = $1
              AND organisation_id = $2;
          `,
        [returnId, organisationId],
      );

      if (ownsTransaction) {
        await dbClient.query("COMMIT");
      }

      return currentReturn.rows[0] || null;
    }

    setClauses.push("updated_at = CURRENT_TIMESTAMP");

    values.push(returnId);

    const returnIdParameter = parameterIndex;

    parameterIndex += 1;

    values.push(organisationId);

    const organisationParameter = parameterIndex;

    const result = await dbClient.query(
      `
          UPDATE returns
          SET
              ${setClauses.join(",\n              ")}
          WHERE id = $${returnIdParameter}
            AND organisation_id = $${organisationParameter}
          RETURNING
              ${RETURN_COLUMNS};
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
 * Delete a return by ID within an organisation.
 *
 * IMPORTANT:
 *
 * The final application should normally not physically delete
 * a processed financial return. Status transitions such as
 * CANCELLED should be used according to the business workflow.
 *
 * This repository method exists for controlled persistence use
 * and test cleanup.
 *
 * return_items uses ON DELETE CASCADE, so deleting a return
 * also removes its return items.
 *
 * @param {string} organisationId
 * @param {string} returnId
 * @param {Object} [client]
 *
 * @returns {Promise<boolean>}
 */
const deleteReturn = async (organisationId, returnId, client = null) => {
  const dbClient = client || (await pool.connect());

  const ownsTransaction = !client;

  try {
    if (ownsTransaction) {
      await dbClient.query("BEGIN");
    }

    const result = await dbClient.query(
      `
          DELETE FROM returns
          WHERE id = $1
            AND organisation_id = $2
          RETURNING id;
        `,
      [returnId, organisationId],
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
  createReturn,
  getReturnById,
  getReturnByNumber,
  getReturnsByCustomer,
  getReturnsByInvoice,
  getReturnsByBranch,
  getReturnsByOrganisation,
  searchReturns,
  updateReturn,
  deleteReturn,
};
