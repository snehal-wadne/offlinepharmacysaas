/**
 * Cash Register Dashboard Repository
 *
 * Purpose:
 * Provides cross-table aggregation queries for Cash Register shift reconciliation and dashboard views.
 *
 * Strictly Read-Only / Aggregates:
 * - Aggregates cash sales, digital sales (UPI, Card), cash refunds, and petty cash movements.
 * - Computes real-time expected cash drawer balances.
 * - Redis cache-aside with 60-second TTL.
 * - When a transaction client is passed, bypasses Redis for immediate consistency.
 * - Multi-tenant and branch/session isolated.
 *
 * Authoritative Formula:
 * Expected Cash = Opening Balance + Cash Sales - Cash Refunds + Cash In - Cash Out
 */

const { pool } = require("../db/connection");
const { getCache, setCache, deleteCache } = require("../cache/cache");

const RECONCILIATION_CACHE_TTL = 60;

/**
 * Cache key helpers.
 */
const buildReconciliationCacheKey = (organisationId, sessionId) =>
  `organisation:${organisationId}:session:${sessionId}:reconciliation`;

/**
 * Register a callback to be executed strictly after an external transaction successfully commits.
 * If the transaction is rolled back or aborted, the callback is discarded.
 * If no transaction client is provided, executes the callback immediately.
 */
const registerAfterCommit = (client, callback) => {
  if (!client || typeof client.query !== "function") {
    Promise.resolve().then(callback).catch((err) => {
      console.error("Cache invalidation error:", err.message);
    });
    return;
  }

  if (!client.__postCommitHooks) {
    client.__postCommitHooks = [];

    const originalQuery = client.query.bind(client);

    client.query = function (...args) {
      if (typeof args[args.length - 1] === "function") {
        return originalQuery(...args);
      }

      return (async () => {
        const result = await originalQuery(...args);

        const queryText =
          typeof args[0] === "string"
            ? args[0]
            : args[0] && typeof args[0].text === "string"
            ? args[0].text
            : "";

        const trimmed = queryText.trim().toUpperCase();

        if (
          trimmed === "COMMIT" ||
          trimmed.startsWith("COMMIT ") ||
          trimmed.startsWith("COMMIT;")
        ) {
          const hooks = client.__postCommitHooks
            ? client.__postCommitHooks.splice(0)
            : [];
          for (const hook of hooks) {
            try {
              await hook();
            } catch (hookErr) {
              console.error("Post-commit hook error:", hookErr.message);
            }
          }
        } else if (
          trimmed === "ROLLBACK" ||
          trimmed.startsWith("ROLLBACK ") ||
          trimmed.startsWith("ROLLBACK;")
        ) {
          if (client.__postCommitHooks) {
            client.__postCommitHooks = [];
          }
        }

        return result;
      })();
    };

    if (typeof client.release === "function" && !client.__originalRelease) {
      client.__originalRelease = client.release.bind(client);
      client.release = function (...releaseArgs) {
        client.__postCommitHooks = [];
        return client.__originalRelease(...releaseArgs);
      };
    }
  }

  client.__postCommitHooks.push(callback);
};

/**
 * Invalidate reconciliation cache for a session.
 * If an uncommitted client is provided, defers invalidation until successful COMMIT.
 * If client is null/omitted, invalidates immediately.
 */
const invalidateSessionReconciliationCache = async (
  organisationId,
  sessionId,
  client = null,
) => {
  if (!organisationId || !sessionId) return;
  const doInvalidate = async () => {
    try {
      await deleteCache(buildReconciliationCacheKey(organisationId, sessionId));
    } catch (error) {
      console.error("Reconciliation cache invalidation error:", error.message);
    }
  };

  if (!client) {
    await doInvalidate();
  } else {
    registerAfterCommit(client, doInvalidate);
  }
};

/**
 * Get the live or closing cash reconciliation summary for a register session.
 *
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.branchId
 * @param {string} params.sessionId
 * @param {Object|null} [params.client=null]
 *
 * @returns {Promise<Object>} Reconciliation summary
 */
const getSessionReconciliationSummary = async ({
  organisationId,
  branchId,
  sessionId,
  client = null,
}) => {
  if (!organisationId) throw new Error("organisationId is required.");
  if (!branchId) throw new Error("branchId is required.");
  if (!sessionId) throw new Error("sessionId is required.");

  const cacheKey = buildReconciliationCacheKey(organisationId, sessionId);

  // If no transaction client provided, check cache
  if (!client) {
    try {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    } catch (cacheErr) {
      console.error("Reconciliation cache read error:", cacheErr.message);
    }
  }

  const dbClient = client || pool;

  // 1. Fetch session header
  const sessionQuery = `
    SELECT
      crs.id,
      crs.organisation_id,
      crs.branch_id,
      crs.cash_register_id,
      crs.cashier_id,
      crs.session_number,
      crs.shift_name,
      crs.opened_at,
      crs.closed_at,
      crs.opening_balance,
      crs.counted_cash,
      crs.expected_cash,
      crs.variance,
      crs.status,
      crs.variance_status,
      crs.opening_notes,
      crs.closing_notes,
      cr.name AS register_name,
      cr.identifier AS register_identifier,
      u.name AS cashier_name
    FROM cash_register_sessions crs
    INNER JOIN cash_registers cr
      ON cr.id = crs.cash_register_id
     AND cr.organisation_id = crs.organisation_id
    INNER JOIN users u
      ON u.id = crs.cashier_id
    WHERE crs.id = $1
      AND crs.organisation_id = $2
      AND crs.branch_id = $3;
  `;

  const sessionRes = await dbClient.query(sessionQuery, [sessionId, organisationId, branchId]);

  if (sessionRes.rowCount === 0) {
    throw new Error("Cash register session not found in the specified organisation and branch.");
  }

  const session = sessionRes.rows[0];

  // 2. Aggregate sales from payments and payment_transactions
  // Only consider COMPLETED payments linked to this session
  const salesQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN pt.payment_method = 'CASH' THEN pt.amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN pt.payment_method = 'UPI' THEN pt.amount ELSE 0 END), 0) AS upi_sales,
      COALESCE(SUM(CASE WHEN pt.payment_method = 'CARD' THEN pt.amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(pt.amount), 0) AS total_sales_collected,
      COUNT(DISTINCT p.id) AS transaction_count
    FROM payments p
    INNER JOIN payment_transactions pt
      ON pt.payment_id = p.id
    WHERE p.organisation_id = $1
      AND p.branch_id = $2
      AND p.cash_register_session_id = $3
      AND p.status = 'COMPLETED';
  `;

  const salesRes = await dbClient.query(salesQuery, [organisationId, branchId, sessionId]);
  const salesAgg = salesRes.rows[0];

  // 3. Aggregate returns (cash refunds vs total refunds)
  // Only consider PROCESSED returns linked to this session
  const returnsQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN r.refund_method = 'CASH' THEN r.refund_amount ELSE 0 END), 0) AS cash_refunds,
      COALESCE(SUM(r.refund_amount), 0) AS total_refunds,
      COUNT(r.id) AS return_count
    FROM returns r
    WHERE r.organisation_id = $1
      AND r.branch_id = $2
      AND r.cash_register_session_id = $3
      AND r.status = 'PROCESSED';
  `;

  const returnsRes = await dbClient.query(returnsQuery, [organisationId, branchId, sessionId]);
  const returnsAgg = returnsRes.rows[0];

  // 4. Aggregate cash movements (IN and OUT)
  const movementsQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN cm.movement_type = 'IN' THEN cm.amount ELSE 0 END), 0) AS cash_in,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'OUT' THEN cm.amount ELSE 0 END), 0) AS cash_out,
      COUNT(cm.id) AS movement_count
    FROM cash_movements cm
    WHERE cm.organisation_id = $1
      AND cm.branch_id = $2
      AND cm.cash_register_session_id = $3;
  `;

  const movementsRes = await dbClient.query(movementsQuery, [organisationId, branchId, sessionId]);
  const movementsAgg = movementsRes.rows[0];

  // 5. Compute real-time values
  const openingBalance = Number(session.opening_balance) || 0;
  const cashSales = Number(salesAgg.cash_sales) || 0;
  const upiSales = Number(salesAgg.upi_sales) || 0;
  const cardSales = Number(salesAgg.card_sales) || 0;
  const totalSalesCollected = Number(salesAgg.total_sales_collected) || 0;
  const transactionCount = parseInt(salesAgg.transaction_count, 10) || 0;

  const cashRefunds = Number(returnsAgg.cash_refunds) || 0;
  const totalRefunds = Number(returnsAgg.total_refunds) || 0;
  const returnCount = parseInt(returnsAgg.return_count, 10) || 0;

  const cashIn = Number(movementsAgg.cash_in) || 0;
  const cashOut = Number(movementsAgg.cash_out) || 0;
  const netMovement = cashIn - cashOut;
  const movementCount = parseInt(movementsAgg.movement_count, 10) || 0;

  // Authoritative expected cash calculation
  const calculatedExpectedCash = Number(
    (openingBalance + cashSales - cashRefunds + cashIn - cashOut).toFixed(2)
  );

  const countedCash = session.counted_cash !== null ? Number(session.counted_cash) : null;
  const variance = countedCash !== null
    ? Number((countedCash - calculatedExpectedCash).toFixed(2))
    : (session.variance !== null ? Number(session.variance) : null);

  const summary = {
    sessionId: session.id,
    organisationId: session.organisation_id,
    branchId: session.branch_id,
    cashRegisterId: session.cash_register_id,
    registerName: session.register_name,
    registerIdentifier: session.register_identifier,
    cashierId: session.cashier_id,
    cashierName: session.cashier_name,
    sessionNumber: session.session_number,
    shiftName: session.shift_name,
    status: session.status,
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    openingBalance,
    sales: {
      cashSales,
      upiSales,
      cardSales,
      totalSalesCollected,
      transactionCount,
    },
    refunds: {
      cashRefunds,
      totalRefunds,
      returnCount,
    },
    movements: {
      cashIn,
      cashOut,
      netMovement,
      movementCount,
    },
    expectedCash: calculatedExpectedCash,
    countedCash,
    variance,
    varianceStatus: session.variance_status || null,
    openingNotes: session.opening_notes,
    closingNotes: session.closing_notes,
  };

  // Cache aside if not in a transaction
  if (!client) {
    try {
      await setCache(cacheKey, summary, RECONCILIATION_CACHE_TTL);
    } catch (cacheErr) {
      console.error("Reconciliation cache write error:", cacheErr.message);
    }
  }

  return summary;
};

module.exports = {
  getSessionReconciliationSummary,
  invalidateSessionReconciliationCache,
  registerAfterCommit,
  buildReconciliationCacheKey,
};
