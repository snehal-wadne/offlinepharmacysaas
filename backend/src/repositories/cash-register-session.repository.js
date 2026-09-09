/**
 * Cash Register Session Repository
 *
 * Purpose:
 * Provides database persistence and cache access for the `cash_register_sessions` table.
 * Tracks shift lifecycle: open register with float, active session monitoring, and closing reconciliation snapshots.
 *
 * Concurrency & Safety:
 * - Only one OPEN session is allowed per physical cash register, guaranteed by the database partial unique index.
 * - Sequence generation uses centralized number_sequences (REG-1001).
 * - All reads/writes enforce strict multi-tenant and branch boundaries.
 * - Transaction clients bypass Redis to guarantee read-your-own-writes consistency.
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");
const { getNextBusinessNumber } = require("./number-sequence.repository");
const {
  invalidateSessionReconciliationCache,
  registerAfterCommit,
} = require("./cash-register-dashboard.repository");

const SESSION_CACHE_TTL = 60;

const CASH_REGISTER_SESSION_COLUMNS = `
  id,
  organisation_id,
  branch_id,
  cash_register_id,
  cashier_id,
  session_number,
  shift_name,
  opened_at,
  closed_at,
  opening_balance,
  counted_cash,
  expected_cash,
  variance,
  status,
  variance_status,
  opening_notes,
  closing_notes,
  created_at,
  updated_at
`;

/**
 * Cache key helpers.
 */
const buildActiveSessionCacheKey = (organisationId, branchId, registerId) =>
  `organisation:${organisationId}:branch:${branchId}:register:${registerId}:active-session`;

const buildSessionCacheKey = (organisationId, sessionId) =>
  `organisation:${organisationId}:session:${sessionId}`;

/**
 * Invalidate session cache entries.
 */
const invalidateSessionCache = async (
  organisationId,
  branchId = null,
  registerId = null,
  sessionId = null,
) => {
  const operations = [];

  if (branchId && registerId) {
    operations.push(
      deleteCache(
        buildActiveSessionCacheKey(organisationId, branchId, registerId),
      ),
    );
  }

  if (sessionId) {
    operations.push(
      deleteCache(buildSessionCacheKey(organisationId, sessionId)),
    );
  }

  try {
    await Promise.all(operations);
  } catch (error) {
    console.error(
      "Cash register session cache invalidation error:",
      error.message,
    );
  }
};

/**
 * Open a new cash register shift session.
 *
 * Transactional:
 * - Validates branch, cash register, and cashier relationships.
 * - Issues a branch-scoped REGISTER_SESSION number (e.g. REG-1001).
 * - Relies on the partial unique index on (cash_register_id) WHERE status = 'OPEN' to prevent duplicate opens.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.branchId
 * @param {string} data.cashRegisterId
 * @param {string} data.cashierId
 * @param {number|string} [data.openingBalance=0]
 * @param {string} [data.shiftName='Day Shift']
 * @param {string|null} [data.openingNotes=null]
 * @param {Object|null} [data.client=null]
 *
 * @returns {Promise<Object>} Created cash register session
 */
const openSession = async ({
  organisationId,
  branchId,
  cashRegisterId,
  cashierId,
  openingBalance = 0,
  shiftName = "Day Shift",
  openingNotes = null,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!cashRegisterId) throw new Error("cashRegisterId is required.");
  if (!cashierId) throw new Error("cashierId is required.");

  const balanceNum = Number(openingBalance) || 0;
  if (balanceNum < 0) {
    throw new Error("openingBalance cannot be negative.");
  }

  let dbClient = client;
  let ownsTransaction = false;

  try {
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;
      await dbClient.query("BEGIN");
    }

    // Validate relationships in a single tenant-safe check
    const validationQuery = `
      SELECT
        EXISTS (
          SELECT 1 FROM branches
          WHERE id = $1 AND organisation_id = $2
        ) AS branch_exists,
        EXISTS (
          SELECT 1 FROM cash_registers
          WHERE id = $3 AND organisation_id = $2 AND branch_id = $1
        ) AS register_exists,
        EXISTS (
          SELECT 1 FROM organisation_memberships
          WHERE user_id = $4 AND organisation_id = $2 AND status = 'ACTIVE'
        ) AS cashier_exists;
    `;

    const validationResult = await dbClient.query(validationQuery, [
      branchId,
      organisationId,
      cashRegisterId,
      cashierId,
    ]);

    const val = validationResult.rows[0];
    if (!val.branch_exists) {
      throw new Error("Branch not found in the specified organisation.");
    }
    if (!val.register_exists) {
      throw new Error("Cash register not found in the specified branch.");
    }
    if (!val.cashier_exists) {
      throw new Error(
        "Cashier is not an active member of the specified organisation.",
      );
    }

    // Generate branch-scoped session number (REG-1001)
    const sessionNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "REGISTER_SESSION",
      client: dbClient,
    });

    const insertQuery = `
      INSERT INTO cash_register_sessions (
        organisation_id,
        branch_id,
        cash_register_id,
        cashier_id,
        session_number,
        shift_name,
        opening_balance,
        status,
        opening_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)
      RETURNING ${CASH_REGISTER_SESSION_COLUMNS};
    `;

    const values = [
      organisationId,
      branchId,
      cashRegisterId,
      cashierId,
      sessionNumber,
      shiftName || "Day Shift",
      balanceNum,
      openingNotes || null,
    ];

    const result = await dbClient.query(insertQuery, values);
    const session = result.rows[0];

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    await invalidateSessionCache(
      organisationId,
      branchId,
      cashRegisterId,
      session.id,
    );

    return session;
  } catch (error) {
    if (ownsTransaction) {
      await dbClient.query("ROLLBACK").catch(() => {});
    }
    // Check for unique open session violation
    if (
      error.code === "23505" &&
      error.constraint === "idx_unique_open_session_per_register"
    ) {
      throw new Error(
        "A session is already open on this cash register. Close it before opening a new one.",
      );
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      dbClient.release();
    }
  }
};

/**
 * Get current open session for a cash register or branch.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {string|null} [cashRegisterId=null]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getCurrentSession = async (
  organisationId,
  branchId,
  cashRegisterId = null,
  client = pool,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");

  const cacheKey = cashRegisterId
    ? buildActiveSessionCacheKey(organisationId, branchId, cashRegisterId)
    : null;
  const useCache = client === pool && cacheKey !== null;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Active session cache read failed:", error.message);
    }
  }

  let query = `
    SELECT ${CASH_REGISTER_SESSION_COLUMNS}
    FROM cash_register_sessions
    WHERE organisation_id = $1
      AND branch_id = $2
      AND status = 'OPEN'
  `;
  const params = [organisationId, branchId];

  if (cashRegisterId) {
    params.push(cashRegisterId);
    query += ` AND cash_register_id = $3`;
  }

  query += ` ORDER BY opened_at DESC LIMIT 1;`;

  const result = await client.query(query, params);
  const session = result.rows[0] || null;

  if (useCache && session) {
    try {
      await setCache(cacheKey, session, SESSION_CACHE_TTL);
    } catch (error) {
      console.error("Active session cache write failed:", error.message);
    }
  }

  return session;
};

/**
 * Get session by ID.
 *
 * @param {string} organisationId
 * @param {string} sessionId
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Object|null>}
 */
const getSessionById = async (organisationId, sessionId, client = pool) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!sessionId) throw new Error("sessionId is required.");

  const cacheKey = buildSessionCacheKey(organisationId, sessionId);
  const useCache = client === pool;

  if (useCache) {
    try {
      const cached = await getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      console.error("Session cache read failed:", error.message);
    }
  }

  const query = `
    SELECT ${CASH_REGISTER_SESSION_COLUMNS}
    FROM cash_register_sessions
    WHERE id = $1 AND organisation_id = $2;
  `;

  const result = await client.query(query, [sessionId, organisationId]);
  const session = result.rows[0] || null;

  if (useCache && session) {
    try {
      await setCache(cacheKey, session, SESSION_CACHE_TTL);
    } catch (error) {
      console.error("Session cache write failed:", error.message);
    }
  }

  return session;
};

/**
 * Close a cash register session and record final reconciliation snapshot.
 *
 * Concurrency & Integrity:
 * - Runs in a database transaction with SELECT ... FOR UPDATE row locking.
 * - Only an OPEN session may be closed; concurrent close attempts fail cleanly.
 * - Authoritatively derives expected cash from database transactions:
 *   opening_balance + cash_sales - cash_refunds + cash_in - cash_out.
 * - Derives variance: counted_cash - expected_cash.
 * - Invalidates active session cache AND reconciliation dashboard cache after commit.
 *
 * @param {Object} data
 * @param {string} data.organisationId
 * @param {string} data.sessionId
 * @param {number|string} data.countedCash
 * @param {string|null} [data.closingNotes=null]
 * @param {number|string} [data.expectedCash] Optional/caller-supplied, overridden by DB derivation
 * @param {number|string} [data.variance] Optional/caller-supplied, overridden by DB derivation
 * @param {string} [data.varianceStatus='BALANCED'] Optional/fallback
 * @param {Object|null} [client=null]
 *
 * @returns {Promise<Object>} Closed session record
 */
const closeSession = async (
  {
    organisationId,
    sessionId,
    countedCash,
    closingNotes = null,
    expectedCash = null,
    variance = null,
    varianceStatus = "BALANCED",
  },
  client = null,
) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!sessionId) throw new Error("sessionId is required.");
  if (countedCash === undefined || countedCash === null) {
    throw new Error("countedCash is required.");
  }

  let dbClient = client;
  let ownsTransaction = false;

  try {
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;
      await dbClient.query("BEGIN");
    }

    // 1. Lock the session row inside the transaction with FOR UPDATE
    const selectQuery = `
      SELECT id, branch_id, cash_register_id, opening_balance, status
      FROM cash_register_sessions
      WHERE id = $1 AND organisation_id = $2
      FOR UPDATE;
    `;
    const sessionRes = await dbClient.query(selectQuery, [
      sessionId,
      organisationId,
    ]);

    if (sessionRes.rowCount === 0) {
      throw new Error("Session not found in the specified organisation.");
    }

    const session = sessionRes.rows[0];
    if (session.status !== "OPEN") {
      throw new Error("Session is already closed.");
    }

    const branchId = session.branch_id;
    const openingBalance = Number(session.opening_balance) || 0;

    // 2. Authoritatively derive cash_sales, cash_refunds, cash_in, cash_out using DB data within this transaction
    const salesRes = await dbClient.query(
      `
      SELECT COALESCE(SUM(pt.amount), 0) AS cash_sales
      FROM payments p
      INNER JOIN payment_transactions pt ON pt.payment_id = p.id
      WHERE p.organisation_id = $1
        AND p.branch_id = $2
        AND p.cash_register_session_id = $3
        AND p.status = 'COMPLETED'
        AND pt.payment_method = 'CASH';
    `,
      [organisationId, branchId, sessionId],
    );
    const cashSales = Number(salesRes.rows[0]?.cash_sales) || 0;

    const refundsRes = await dbClient.query(
      `
      SELECT COALESCE(SUM(r.refund_amount), 0) AS cash_refunds
      FROM returns r
      WHERE r.organisation_id = $1
        AND r.branch_id = $2
        AND r.cash_register_session_id = $3
        AND r.status = 'PROCESSED'
        AND r.refund_method = 'CASH';
    `,
      [organisationId, branchId, sessionId],
    );
    const cashRefunds = Number(refundsRes.rows[0]?.cash_refunds) || 0;

    const movementsRes = await dbClient.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN cm.movement_type = 'IN' THEN cm.amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN cm.movement_type = 'OUT' THEN cm.amount ELSE 0 END), 0) AS cash_out
      FROM cash_movements cm
      WHERE cm.organisation_id = $1
        AND cm.branch_id = $2
        AND cm.cash_register_session_id = $3;
    `,
      [organisationId, branchId, sessionId],
    );
    const cashIn = Number(movementsRes.rows[0]?.cash_in) || 0;
    const cashOut = Number(movementsRes.rows[0]?.cash_out) || 0;

    // 3. Authoritatively compute expected cash, counted cash, variance & status
    const derivedExpectedCash = Number(
      (openingBalance + cashSales - cashRefunds + cashIn - cashOut).toFixed(2),
    );
    const parsedCountedCash = Number(Number(countedCash).toFixed(2));
    const derivedVariance = Number(
      (parsedCountedCash - derivedExpectedCash).toFixed(2),
    );
    const finalVarianceStatus =
      derivedVariance < 0
        ? "SHORTAGE"
        : derivedVariance > 0
          ? "OVERAGE"
          : "BALANCED";

    // 4. Atomic conditional update requiring status = 'OPEN'
    const query = `
      UPDATE cash_register_sessions
      SET
        status = 'CLOSED',
        closed_at = CURRENT_TIMESTAMP,
        counted_cash = $1,
        expected_cash = $2,
        variance = $3,
        variance_status = $4,
        closing_notes = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND organisation_id = $7 AND status = 'OPEN'
      RETURNING ${CASH_REGISTER_SESSION_COLUMNS};
    `;

    const values = [
      parsedCountedCash,
      derivedExpectedCash,
      derivedVariance,
      finalVarianceStatus,
      closingNotes || null,
      sessionId,
      organisationId,
    ];

    const result = await dbClient.query(query, values);
    if (result.rowCount === 0) {
      throw new Error("Session is already closed.");
    }

    const closedSession = result.rows[0];

    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    // 5. Invalidate active-session cache AND reconciliation cache strictly after commit
    if (ownsTransaction) {
      await invalidateSessionCache(
        organisationId,
        session.branch_id,
        session.cash_register_id,
        sessionId,
      );
      await invalidateSessionReconciliationCache(organisationId, sessionId);
    } else {
      registerAfterCommit(dbClient, async () => {
        await invalidateSessionCache(
          organisationId,
          session.branch_id,
          session.cash_register_id,
          sessionId,
        );
        await invalidateSessionReconciliationCache(organisationId, sessionId);
      });
    }

    return closedSession;
  } catch (error) {
    if (ownsTransaction && dbClient) {
      await dbClient.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * List session history for a branch with optional filters.
 *
 * @param {string} organisationId
 * @param {string} branchId
 * @param {Object} [filters={}]
 * @param {number} [filters.limit=20]
 * @param {number} [filters.offset=0]
 * @param {string|null} [filters.cashierId=null]
 * @param {string|null} [filters.dateFrom=null]
 * @param {string|null} [filters.dateTo=null]
 * @param {Object} [client=pool]
 *
 * @returns {Promise<Array>} List of session records
 */
const listSessionHistory = async (
  organisationIdOrParams,
  branchIdParam = null,
  filtersParam = {},
  clientParam = pool,
) => {
  let organisationId;
  let branchId;
  let filters;
  let client;

  if (
    typeof organisationIdOrParams === "object" &&
    organisationIdOrParams !== null &&
    !branchIdParam
  ) {
    organisationId = organisationIdOrParams.organisationId;
    branchId = organisationIdOrParams.branchId;
    filters = organisationIdOrParams;
    client = organisationIdOrParams.client || clientParam;
  } else {
    organisationId = organisationIdOrParams;
    branchId = branchIdParam;
    filters = filtersParam || {};
    client = clientParam;
  }

  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");

  const {
    limit = 20,
    offset = 0,
    cashierId = null,
    cashRegisterId = null,
    dateFrom = null,
    dateTo = null,
  } = filters;

  let query = `
    SELECT ${CASH_REGISTER_SESSION_COLUMNS}
    FROM cash_register_sessions
    WHERE organisation_id = $1 AND branch_id = $2
  `;
  const params = [organisationId, branchId];
  let paramIdx = 3;

  if (cashRegisterId) {
    query += ` AND cash_register_id = $${paramIdx++}`;
    params.push(cashRegisterId);
  }

  if (cashierId) {
    query += ` AND cashier_id = $${paramIdx++}`;
    params.push(cashierId);
  }

  if (dateFrom) {
    query += ` AND opened_at >= $${paramIdx++}`;
    params.push(dateFrom);
  }

  if (dateTo) {
    query += ` AND opened_at <= $${paramIdx++}`;
    params.push(dateTo);
  }

  query += ` ORDER BY opened_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++};`;
  params.push(Math.max(1, Number(limit) || 20));
  params.push(Math.max(0, Number(offset) || 0));

  const result = await client.query(query, params);
  return result.rows;
};

module.exports = {
  openSession,
  getCurrentSession,
  getSessionById,
  closeSession,
  listSessionHistory,
  invalidateSessionCache,
  buildActiveSessionCacheKey,
  buildSessionCacheKey,
};
