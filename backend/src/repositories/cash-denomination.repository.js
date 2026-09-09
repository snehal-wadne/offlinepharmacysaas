/**
 * Cash Denomination Repository
 *
 * Purpose:
 * Provides PostgreSQL persistence for the `cash_denominations` table.
 * Stores physical currency denomination counts entered during register closing reconciliation.
 *
 * Constraints & Invariants:
 * - `denomination_value` must be > 0.
 * - `denomination_count` must be >= 0.
 * - Unique constraint on `(cash_register_session_id, denomination_value)`.
 * - Multi-tenant isolation: all operations are strictly scoped by `organisation_id`.
 * - Transaction client support: callers can include denomination persistence in a closing transaction.
 */

const { pool } = require("../db/connection");

const CASH_DENOMINATION_COLUMNS = `
  id,
  organisation_id,
  cash_register_session_id,
  denomination_value,
  denomination_count,
  created_at
`;

/**
 * Validate that the session exists and belongs to the given organisation.
 */
const validateSessionContext = async (db, organisationId, sessionId) => {
  const result = await db.query(
    `SELECT id, organisation_id, branch_id, status
       FROM cash_register_sessions
       WHERE id = $1 AND organisation_id = $2;`,
    [sessionId, organisationId]
  );

  if (result.rowCount === 0) {
    throw new Error("Cash register session not found in the specified organisation.");
  }

  return result.rows[0];
};

/**
 * Save / replace cash denomination counts for a register session.
 *
 * Replaces any existing denomination records for the session inside a transaction.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.sessionId
 * @param {Array<{ denominationValue: number, denominationCount: number }>} params.denominations
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Array<Object>>} Saved denomination records
 */
const saveDenominations = async ({
  organisationId,
  sessionId,
  denominations,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!sessionId) throw new Error("sessionId is required.");
  if (!Array.isArray(denominations) || denominations.length === 0) {
    throw new Error("denominations must be a non-empty array.");
  }

  // Validate each item
  const validatedItems = [];
  const seenValues = new Set();

  for (const item of denominations) {
    const val = Number(item.denominationValue);
    const count = Number(item.denominationCount);

    if (isNaN(val) || val <= 0) {
      throw new Error("denominationValue must be a positive number greater than 0.");
    }

    if (isNaN(count) || count < 0 || !Number.isInteger(count)) {
      throw new Error("denominationCount must be a non-negative integer (>= 0).");
    }

    if (seenValues.has(val)) {
      throw new Error(`Duplicate denominationValue ${val} in payload.`);
    }
    seenValues.add(val);

    validatedItems.push({ denominationValue: val, denominationCount: count });
  }

  let dbClient = client;
  let ownsTransaction = false;

  try {
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;
      await dbClient.query("BEGIN");
    }

    // Validate session
    await validateSessionContext(dbClient, organisationId, sessionId);

    // Delete existing denominations for this session to cleanly overwrite
    await dbClient.query(
      `DELETE FROM cash_denominations
         WHERE organisation_id = $1 AND cash_register_session_id = $2;`,
      [organisationId, sessionId]
    );

    // Build multi-row INSERT
    const valuePlaceholders = [];
    const queryParams = [organisationId, sessionId];
    let paramIndex = 3;

    for (const item of validatedItems) {
      valuePlaceholders.push(
        `($1, $2, $${paramIndex}, $${paramIndex + 1})`
      );
      queryParams.push(item.denominationValue, item.denominationCount);
      paramIndex += 2;
    }

    const insertQuery = `
      INSERT INTO cash_denominations (
        organisation_id,
        cash_register_session_id,
        denomination_value,
        denomination_count
      )
      VALUES ${valuePlaceholders.join(", ")}
      RETURNING
        ${CASH_DENOMINATION_COLUMNS};
    `;

    const result = await dbClient.query(insertQuery, queryParams);

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return result.rows;
  } catch (error) {
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rbErr) {
        console.error("Rollback error in saveDenominations:", rbErr.message);
      }
    }
    throw error;
  } finally {
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * Get all denominations recorded for a register session.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.sessionId
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Array<Object>>}
 */
const getDenominationsBySession = async ({
  organisationId,
  sessionId,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!sessionId) throw new Error("sessionId is required.");

  const dbClient = client || pool;

  // Validate session
  await validateSessionContext(dbClient, organisationId, sessionId);

  const query = `
    SELECT
      ${CASH_DENOMINATION_COLUMNS}
    FROM cash_denominations
    WHERE organisation_id = $1
      AND cash_register_session_id = $2
    ORDER BY denomination_value DESC;
  `;

  const result = await dbClient.query(query, [organisationId, sessionId]);
  return result.rows;
};

module.exports = {
  saveDenominations,
  getDenominationsBySession,
};
