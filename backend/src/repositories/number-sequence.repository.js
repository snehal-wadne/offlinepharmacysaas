/**
 * Number Sequence Repository
 *
 * Purpose:
 * Handles generation and retrieval of human-readable business
 * numbers used throughout the pharmacy application.
 *
 * Examples:
 *
 *     CUSTOMER     → CUST-1001
 *     PRESCRIPTION → RX-1001
 *     INVOICE      → INV-1001
 *     RECEIPT      → REC-1001
 *     RETURN       → RET-1001
 *
 * PostgreSQL UUIDs remain the technical primary keys.
 * These business numbers are generated independently.
 *
 * IMPORTANT:
 *
 * Number generation must happen inside the same PostgreSQL
 * transaction as the business record being created.
 *
 * Example:
 *
 *     BEGIN
 *
 *     const invoiceNumber = await getNextBusinessNumber(client, {
 *         organisationId,
 *         branchId,
 *         sequenceType: "INVOICE",
 *     });
 *
 *     INSERT INTO invoices (..., invoice_number)
 *     VALUES (..., invoiceNumber);
 *
 *     COMMIT;
 *
 * The caller therefore owns the transaction.
 *
 * The repository does NOT use Redis for number sequences.
 * Redis is a cache and must never become the source of truth
 * for financial/business identifiers.
 */

const { pool } = require("../db/connection");

/**
 * First number issued by a new sequence.
 *
 * The database also uses 1001 as its default next_number.
 */
const INITIAL_SEQUENCE_NUMBER = 1001;

/**
 * Supported business number types and their prefixes.
 *
 * The prefixes correspond to the human-readable identifiers
 * used throughout the customer and billing workflows.
 */
const NUMBER_PREFIXES = {
  CUSTOMER: "CUST",
  PRESCRIPTION: "RX",
  INVOICE: "INV",
  RECEIPT: "REC",
  RETURN: "RET",
  BRANCH: "BR",
  STAFF: "EMP",
};

/**
 * Organisation-scoped sequence types.
 *
 * These sequences have:
 *
 *     branch_id = NULL
 *
 * in number_sequences.
 */
const ORGANISATION_SCOPED_TYPES = new Set([
  "CUSTOMER",
  "PRESCRIPTION",
  "BRANCH",
  "STAFF",
]);

/**
 * Branch-scoped sequence types.
 *
 * These sequences have a branch_id.
 */
const BRANCH_SCOPED_TYPES = new Set(["INVOICE", "RECEIPT", "RETURN"]);

/**
 * Validate sequence scope.
 *
 * The schema allows branch_id to be NULL, but the meaning of
 * that NULL depends on the sequence type.
 *
 * CUSTOMER/PRESCRIPTION:
 *
 *     organisationId required
 *     branchId must be null
 *
 * INVOICE/RECEIPT:
 *
 *     organisationId required
 *     branchId required
 *
 * @param {string} organisationId
 * @param {string|null} branchId
 * @param {string} sequenceType
 */
const validateSequenceScope = (organisationId, branchId, sequenceType) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!sequenceType || !NUMBER_PREFIXES[sequenceType]) {
    throw new Error(`Unsupported sequence type: ${sequenceType}.`);
  }

  if (ORGANISATION_SCOPED_TYPES.has(sequenceType)) {
    if (branchId !== null && branchId !== undefined) {
      throw new Error(
        `${sequenceType} sequences are organisation-scoped and must not have a branchId.`,
      );
    }

    return;
  }

  if (BRANCH_SCOPED_TYPES.has(sequenceType)) {
    if (!branchId) {
      throw new Error(`${sequenceType} sequences require a branchId.`);
    }

    return;
  }

  throw new Error(`Invalid sequence configuration for type: ${sequenceType}.`);
};

/**
 * Get an existing number sequence.
 *
 * This function does not create a sequence.
 *
 * It is mainly useful for administrative/debugging purposes.
 *
 * @param {Object} options
 * @param {string} options.organisationId
 * @param {string|null} [options.branchId]
 * @param {string} options.sequenceType
 * @param {Object} [options.client]
 *
 * @returns {Object|null} Number sequence or null if not found
 */
const getNumberSequence = async ({
  organisationId,
  branchId = null,
  sequenceType,
  client = pool,
}) => {
  validateSequenceScope(organisationId, branchId, sequenceType);

  const query = `
        SELECT
            id,
            organisation_id,
            branch_id,
            sequence_type,
            next_number,
            created_at,
            updated_at
        FROM number_sequences
        WHERE organisation_id = $1
          AND branch_id IS NOT DISTINCT FROM $2
          AND sequence_type = $3;
    `;

  const values = [organisationId, branchId, sequenceType];

  const result = await client.query(query, values);

  return result.rows[0] || null;
};

/**
 * Get the next business number for a sequence.
 *
 * This function:
 *
 * 1. Creates the sequence row if it does not exist.
 * 2. Locks the sequence row using PostgreSQL row-level locking.
 * 3. Reads the current next_number.
 * 4. Increments next_number.
 * 5. Returns the formatted business identifier.
 *
 * Example:
 *
 *     next_number = 1001
 *
 *     returned → CUST-1001
 *
 *     next_number becomes 1002.
 *
 * IMPORTANT:
 *
 * The supplied client should normally be a PostgreSQL transaction
 * client obtained from pool.connect().
 *
 * The caller should:
 *
 *     BEGIN
 *     getNextBusinessNumber(client, ...)
 *     create the related record
 *     COMMIT
 *
 * If the transaction rolls back, the sequence increment also
 * rolls back.
 *
 * @param {Object} options
 * @param {string} options.organisationId
 * @param {string|null} [options.branchId]
 * @param {string} options.sequenceType
 * @param {Object} options.client PostgreSQL client
 *
 * @returns {string} Human-readable business number
 */
const getNextBusinessNumber = async ({
  organisationId,
  branchId = null,
  sequenceType,
  client,
}) => {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "A PostgreSQL transaction client is required for business number generation.",
    );
  }

  validateSequenceScope(organisationId, branchId, sequenceType);

  const prefix = NUMBER_PREFIXES[sequenceType];

  /**
   * Create the sequence row if it does not already exist.
   *
   * The conflict target deliberately matches the partial unique
   * indexes defined in schema.sql.
   *
   * Organisation-scoped:
   *
   *     UNIQUE (organisation_id, sequence_type)
   *     WHERE branch_id IS NULL
   *
   * Branch-scoped:
   *
   *     UNIQUE (organisation_id, branch_id, sequence_type)
   *     WHERE branch_id IS NOT NULL
   *
   * PostgreSQL supports partial-index inference through the
   * WHERE predicate in ON CONFLICT.
   */
  let insertQuery;
  let insertValues;

  if (branchId === null || branchId === undefined) {
    insertQuery = `
            INSERT INTO number_sequences (
                organisation_id,
                branch_id,
                sequence_type,
                next_number
            )
            VALUES ($1, NULL, $2, $3)
            ON CONFLICT (
                organisation_id,
                sequence_type
            )
            WHERE branch_id IS NULL
            DO NOTHING;
        `;

    insertValues = [organisationId, sequenceType, INITIAL_SEQUENCE_NUMBER];
  } else {
    insertQuery = `
            INSERT INTO number_sequences (
                organisation_id,
                branch_id,
                sequence_type,
                next_number
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (
                organisation_id,
                branch_id,
                sequence_type
            )
            WHERE branch_id IS NOT NULL
            DO NOTHING;
        `;

    insertValues = [
      organisationId,
      branchId,
      sequenceType,
      INITIAL_SEQUENCE_NUMBER,
    ];
  }

  await client.query(insertQuery, insertValues);

  /**
   * Lock the sequence row.
   *
   * SELECT ... FOR UPDATE ensures that concurrent transactions
   * requesting the same organisation/branch sequence cannot
   * receive the same business number.
   */
  const lockQuery = `
        SELECT
            id,
            next_number
        FROM number_sequences
        WHERE organisation_id = $1
          AND branch_id IS NOT DISTINCT FROM $2
          AND sequence_type = $3
        FOR UPDATE;
    `;

  const lockValues = [organisationId, branchId, sequenceType];

  const sequenceResult = await client.query(lockQuery, lockValues);

  if (sequenceResult.rowCount === 0) {
    throw new Error(
      `Number sequence could not be created or found for ${sequenceType}.`,
    );
  }

  const sequence = sequenceResult.rows[0];

  const issuedNumber = Number(sequence.next_number);

  /**
   * Increment the sequence only after successfully locking
   * and reading the current value.
   */
  const updateQuery = `
        UPDATE number_sequences
        SET
            next_number = next_number + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
    `;

  await client.query(updateQuery, [sequence.id]);

  return `${prefix}-${issuedNumber}`;
};

/**
 * Initialise a number sequence explicitly.
 *
 * Normally getNextBusinessNumber() can create the sequence
 * automatically. This helper is useful when a new organisation
 * or branch is created and the application wants to initialise
 * its sequences ahead of time.
 *
 * If the sequence already exists, no duplicate row is created.
 *
 * @param {Object} options
 * @param {string} options.organisationId
 * @param {string|null} [options.branchId]
 * @param {string} options.sequenceType
 * @param {Object} [options.client]
 *
 * @returns {Object} Created/existing sequence
 */
const createNumberSequence = async ({
  organisationId,
  branchId = null,
  sequenceType,
  client = pool,
}) => {
  validateSequenceScope(organisationId, branchId, sequenceType);

  let query;
  let values;

  if (branchId === null || branchId === undefined) {
    query = `
            INSERT INTO number_sequences (
                organisation_id,
                branch_id,
                sequence_type,
                next_number
            )
            VALUES ($1, NULL, $2, $3)
            ON CONFLICT (
                organisation_id,
                sequence_type
            )
            WHERE branch_id IS NULL
            DO NOTHING
            RETURNING
                id,
                organisation_id,
                branch_id,
                sequence_type,
                next_number,
                created_at,
                updated_at;
        `;

    values = [organisationId, sequenceType, INITIAL_SEQUENCE_NUMBER];
  } else {
    query = `
            INSERT INTO number_sequences (
                organisation_id,
                branch_id,
                sequence_type,
                next_number
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (
                organisation_id,
                branch_id,
                sequence_type
            )
            WHERE branch_id IS NOT NULL
            DO NOTHING
            RETURNING
                id,
                organisation_id,
                branch_id,
                sequence_type,
                next_number,
                created_at,
                updated_at;
        `;

    values = [organisationId, branchId, sequenceType, INITIAL_SEQUENCE_NUMBER];
  }

  const result = await client.query(query, values);

  /**
   * If the row already existed, RETURNING produces no rows.
   * Fetch the existing row so the function always returns the
   * resulting sequence.
   */
  if (result.rows[0]) {
    return result.rows[0];
  }

  return getNumberSequence({
    organisationId,
    branchId,
    sequenceType,
    client,
  });
};

/**
 * Export repository functions.
 */
module.exports = {
  createNumberSequence,
  getNumberSequence,
  getNextBusinessNumber,
};
