/**
 * Customer & Billing Dashboard Read Queries
 *
 * Purpose:
 * Provides read-only, cross-entity queries for the
 * Customer Directory and Customer/Billing dashboards.
 *
 * This repository contains dashboard projections rather
 * than normal CRUD operations.
 *
 * Responsibilities:
 * - tenant-safe reads
 * - joins across customer/billing tables
 * - aggregations
 * - filtering
 * - pagination
 * - selected read caching for expensive dashboard aggregates
 *
 * No financial records are modified here.
 */

const { pool } = require("../db/connection");
const { getCache, setCache } = require("../cache/cache");

const VALID_INVOICE_STATUSES = ["COMPLETED", "PARTIALLY_PAID", "PAID"];

// ============================================================
// DASHBOARD CACHE
// ============================================================

/*
 * Dashboard queries are read-heavy projections.
 *
 * We intentionally cache only unfiltered organisation-level
 * dashboard statistics.
 *
 * Paginated/filtered queries are NOT cached because every
 * combination of search/filter/pagination parameters would
 * create a separate cache entry and make invalidation much
 * harder.
 *
 * Redis is only an optimisation. PostgreSQL remains the
 * authoritative source of truth.
 */
const CUSTOMER_BILLING_DASHBOARD_CACHE_TTL = 60;

/**
 * Tenant-safe cache key for Customer Directory statistics.
 */
const buildCustomerDirectoryStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:directory-stats`;

/**
 * Tenant-safe cache key for Customer Ledger dashboard statistics.
 */
const buildCustomerLedgerDashboardStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:ledger-dashboard-stats`;

/**
 * Tenant-safe cache key for Payment Receipt dashboard statistics.
 */
const buildPaymentReceiptDashboardStatsCacheKey = (organisationId) =>
  `organisation:${organisationId}:customer-billing:payment-receipt-dashboard-stats`;

/**
 * Read a value from Redis using the existing cache abstraction.
 *
 * Redis failures are deliberately non-fatal.
 *
 * @param {string} cacheKey
 *
 * @returns {Promise<Object|null>}
 */
const readDashboardCache = async (cacheKey) => {
  try {
    return await getCache(cacheKey);
  } catch (cacheError) {
    console.error(`Cache read failed for ${cacheKey}:`, cacheError.message);

    return null;
  }
};

/**
 * Write a value to Redis using the existing cache abstraction.
 *
 * Cache failures are deliberately non-fatal because PostgreSQL
 * remains the source of truth.
 *
 * @param {string} cacheKey
 * @param {Object} value
 */
const writeDashboardCache = async (cacheKey, value) => {
  try {
    await setCache(cacheKey, value, CUSTOMER_BILLING_DASHBOARD_CACHE_TTL);
  } catch (cacheError) {
    console.error(`Cache write failed for ${cacheKey}:`, cacheError.message);
  }
};

// ============================================================
// CUSTOMER DIRECTORY
// ============================================================

/**
 * Get Customer Directory summary statistics.
 *
 * Returns:
 * - total customers
 * - chronic-care patients
 * - active credit accounts
 *
 * Loyalty points are intentionally not included because
 * there is currently no loyalty table/model in the schema.
 *
 * This aggregate is cached because it is an expensive,
 * organisation-level dashboard projection.
 *
 * Cache strategy:
 * - cache-aside
 * - tenant-safe key
 * - 60 second TTL
 * - positive result cached
 * - Redis failure falls back to PostgreSQL
 */
const getCustomerDirectoryStats = async (organisationId, client = pool) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  /*
   * Only use Redis when this is a normal pool-backed read.
   *
   * A caller-supplied transaction client must always read from
   * PostgreSQL so the query can see the transaction's current
   * state. Redis may contain an older committed snapshot and
   * therefore must not bypass the transaction.
   */
  const useCache = client === pool;

  const cacheKey = buildCustomerDirectoryStatsCacheKey(organisationId);

  if (useCache) {
    const cachedStats = await readDashboardCache(cacheKey);

    if (cachedStats) {
      return cachedStats;
    }
  }

  const result = await client.query(
    `
      SELECT
        (
          SELECT COUNT(*)::INT
          FROM customers c
          WHERE c.organisation_id = $1
            AND c.status = 'ACTIVE'
        ) AS total_customers,

        (
          SELECT COUNT(*)::INT
          FROM customers c
          WHERE c.organisation_id = $1
            AND c.status = 'ACTIVE'
            AND UPPER(c.category) = 'CHRONIC CARE'
        ) AS chronic_care_patients,

        (
          SELECT COUNT(*)::INT
          FROM customer_credit_accounts cca
          INNER JOIN customers c
            ON c.id = cca.customer_id
           AND c.organisation_id = cca.organisation_id
          WHERE cca.organisation_id = $1
            AND c.status = 'ACTIVE'
            AND cca.credit_enabled = TRUE
        ) AS active_credit_accounts;
    `,
    [organisationId],
  );

  const stats = result.rows[0];

  if (useCache && stats) {
    await writeDashboardCache(cacheKey, stats);
  }

  return stats;
};

/**
 * Get paginated Customer Directory rows.
 *
 * Each customer appears once.
 *
 * Returned data:
 * - customer identity
 * - calculated age
 * - latest active prescription
 * - doctor
 * - specialization
 * - credit information
 * - total spent
 * - current ledger balance
 *
 * Supported filters:
 * - searchTerm
 * - category
 * - creditEnabled
 * - status
 *
 * Supported pagination:
 * - limit
 * - offset
 *
 * This query is intentionally NOT cached because the combination
 * of filters and pagination produces many cache variants.
 */
const getCustomerDirectoryRows = async ({
  organisationId,
  searchTerm = null,
  category = null,
  creditEnabled = null,
  status = null,
  limit = 50,
  offset = 0,
  client = pool,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }

  const params = [organisationId];

  let parameterIndex = 1;

  const conditions = ["c.organisation_id = $1"];

  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  if (searchTerm && searchTerm.trim()) {
    parameterIndex += 1;

    params.push(`%${searchTerm.trim()}%`);

    conditions.push(`
      (
        c.full_name ILIKE $${parameterIndex}
        OR c.phone ILIKE $${parameterIndex}
        OR c.customer_number ILIKE $${parameterIndex}
        OR c.address ILIKE $${parameterIndex}
        OR rx.doctor_name ILIKE $${parameterIndex}
      )
    `);
  }

  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  if (category && category.trim()) {
    parameterIndex += 1;

    params.push(category.trim());

    conditions.push(`UPPER(c.category) = UPPER($${parameterIndex})`);
  }

  // ----------------------------------------------------------
  // CREDIT ENABLED
  // ----------------------------------------------------------

  if (creditEnabled !== null && creditEnabled !== undefined) {
    if (typeof creditEnabled !== "boolean") {
      throw new Error("creditEnabled must be a boolean when provided.");
    }

    parameterIndex += 1;

    params.push(creditEnabled);

    conditions.push(`COALESCE(cca.credit_enabled, FALSE) = $${parameterIndex}`);
  }

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (status && status.trim()) {
    parameterIndex += 1;

    params.push(status.trim());

    conditions.push(`UPPER(c.status) = UPPER($${parameterIndex})`);
  }

  // ----------------------------------------------------------
  // QUERY PARAMETERS
  // ----------------------------------------------------------

  parameterIndex += 1;

  const invoiceStatusesParameter = parameterIndex;

  params.push(VALID_INVOICE_STATUSES);

  parameterIndex += 1;

  const limitParameter = parameterIndex;

  params.push(limit);

  parameterIndex += 1;

  const offsetParameter = parameterIndex;

  params.push(offset);

  // ----------------------------------------------------------
  // QUERY
  // ----------------------------------------------------------

  const query = `
    SELECT
      c.id,
      c.organisation_id,
      c.customer_number,
      c.full_name,
      c.phone,
      c.email,
      c.date_of_birth,

      CASE
        WHEN c.date_of_birth IS NULL
          THEN NULL
        ELSE EXTRACT(
          YEAR
          FROM AGE(
            CURRENT_DATE,
            c.date_of_birth
          )
        )::INT
      END AS age,

      c.gender,
      c.category,
      c.address,
      c.status,
      c.created_at,
      c.updated_at,

      rx.prescription_id,
      rx.prescription_number
        AS active_prescription_number,
      rx.doctor_name,
      rx.specialization
        AS doctor_specialization,

      COALESCE(
        cca.credit_enabled,
        FALSE
      ) AS credit_enabled,

      COALESCE(
        cca.credit_limit,
        0
      ) AS credit_limit,

      COALESCE(
        inv.total_spent,
        0
      ) AS total_spent,

      COALESCE(
        ledger.current_balance,
        0
      ) AS outstanding_balance

    FROM customers c

    -- Latest active prescription
    LEFT JOIN LATERAL (
      SELECT
        p.id AS prescription_id,
        p.prescription_number,
        p.doctor_name,
        p.specialization

      FROM prescriptions p

      WHERE p.customer_id = c.id
        AND p.organisation_id =
          c.organisation_id
        AND p.status = 'ACTIVE'

      ORDER BY
        p.prescription_date DESC,
        p.created_at DESC,
        p.id DESC

      LIMIT 1
    ) rx ON TRUE

    -- Customer credit account
    LEFT JOIN customer_credit_accounts cca
      ON cca.customer_id = c.id
     AND cca.organisation_id =
       c.organisation_id

    -- Total spent
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          SUM(i.total_amount),
          0
        ) AS total_spent

      FROM invoices i

      WHERE i.customer_id = c.id
        AND i.organisation_id =
          c.organisation_id
        AND i.status =
          ANY($${invoiceStatusesParameter})
    ) inv ON TRUE

    -- Latest customer ledger balance
    LEFT JOIN LATERAL (
      SELECT
        cle.balance_after
          AS current_balance

      FROM customer_ledger_entries cle

      WHERE cle.customer_id = c.id
        AND cle.organisation_id =
          c.organisation_id

      ORDER BY
        cle.entry_date DESC,
        cle.created_at DESC,
        cle.id DESC

      LIMIT 1
    ) ledger ON TRUE

    WHERE ${conditions.join(`
      AND
    `)}

    ORDER BY
      c.full_name ASC,
      c.id ASC

    LIMIT $${limitParameter}
    OFFSET $${offsetParameter};
  `;

  const result = await client.query(query, params);

  return result.rows;
};

// ============================================================
// CUSTOMER DETAILS
// ============================================================

/**
 * Get the summary information displayed at the top of the
 * Customer Details page.
 *
 * Returns:
 * - customer identity
 * - customer number
 * - contact information
 * - customer since date
 * - age and gender
 * - customer category/status
 * - total purchase count
 * - total spent
 * - current outstanding balance
 * - credit limit
 * - credit enabled status
 * - active prescription information
 * - attending doctor
 * - doctor specialization
 * - hospital/clinic
 * - chronic conditions
 * - reported drug allergies
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate that organisationId is present and belongs to
 *    the authenticated tenant/context.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access customer information for this organisation.
 *
 * 3. Validate that customerId is present.
 *
 * 4. Validate that the customer belongs to organisationId.
 *
 * 5. Apply any application-level rule regarding whether
 *    inactive customers may be viewed.
 *
 * 6. Do not pass a customerId obtained from another tenant.
 *
 * This function is a read-only dashboard projection.
 * It does not perform business authorization or modify data.
 *
 * This query is intentionally NOT cached because its result
 * depends on customer-specific financial and prescription state
 * that can change through several independent write paths.
 */
const getCustomerDetailsSummary = async (
  organisationId,
  customerId,
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!customerId) {
    throw new Error("customerId is required.");
  }

  const result = await client.query(
    `
      SELECT
        c.id,
        c.organisation_id,
        c.customer_number,
        c.full_name,
        c.phone,
        c.email,
        c.date_of_birth,

        CASE
          WHEN c.date_of_birth IS NULL
            THEN NULL
          ELSE EXTRACT(
            YEAR
            FROM AGE(
              CURRENT_DATE,
              c.date_of_birth
            )
          )::INT
        END AS age,

        c.gender,
        c.category,
        c.address,
        c.status,
        c.created_at,
        c.updated_at,

        COALESCE(
          purchase_summary.total_purchases,
          0
        ) AS total_purchases,

        COALESCE(
          purchase_summary.total_spent,
          0
        ) AS total_spent,

        COALESCE(
          ledger.current_balance,
          0
        ) AS outstanding_balance,

        COALESCE(
          cca.credit_enabled,
          FALSE
        ) AS credit_enabled,

        COALESCE(
          cca.credit_limit,
          0
        ) AS credit_limit,

        /* ----------------------------------------------------
         * Active prescription / medical reference
         * ---------------------------------------------------- */

        prescription.id AS active_prescription_id,

        prescription.prescription_number
          AS active_prescription_number,

        prescription.prescription_date
          AS active_prescription_date,

        prescription.doctor_name,

        prescription.specialization
          AS doctor_specialization,

        prescription.hospital_or_clinic,

        prescription.doctor_registration_number,

        prescription.chronic_conditions,

        prescription.drug_allergies

      FROM customers c

      /* ------------------------------------------------------
       * Customer credit account
       * ------------------------------------------------------ */

      LEFT JOIN customer_credit_accounts cca
        ON cca.customer_id = c.id
       AND cca.organisation_id = c.organisation_id

      /* ------------------------------------------------------
       * Purchase summary
       * ------------------------------------------------------ */

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INT AS total_purchases,

          COALESCE(
            SUM(i.total_amount),
            0
          ) AS total_spent

        FROM invoices i

        WHERE i.customer_id = c.id
          AND i.organisation_id = c.organisation_id
          AND i.status = ANY(
            ARRAY[
              'COMPLETED',
              'PARTIALLY_PAID',
              'PAID'
            ]
          )
      ) purchase_summary ON TRUE

      /* ------------------------------------------------------
       * Latest customer ledger balance
       * ------------------------------------------------------ */

      LEFT JOIN LATERAL (
        SELECT
          cle.balance_after AS current_balance

        FROM customer_ledger_entries cle

        WHERE cle.customer_id = c.id
          AND cle.organisation_id = c.organisation_id

        ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC

        LIMIT 1
      ) ledger ON TRUE

      /* ------------------------------------------------------
       * Latest active prescription
       *
       * If multiple prescriptions are ACTIVE, the most recent
       * prescription is used for the summary section.
       * Complete prescription history remains available through
       * the prescription-specific query/repository.
       * ------------------------------------------------------ */

      LEFT JOIN LATERAL (
        SELECT
          p.id,
          p.prescription_number,
          p.prescription_date,
          p.doctor_name,
          p.specialization,
          p.hospital_or_clinic,
          p.doctor_registration_number,
          p.chronic_conditions,
          p.drug_allergies

        FROM prescriptions p

        WHERE p.customer_id = c.id
          AND p.organisation_id = c.organisation_id
          AND p.status = 'ACTIVE'

        ORDER BY
          p.prescription_date DESC NULLS LAST,
          p.created_at DESC,
          p.id DESC

        LIMIT 1
      ) prescription ON TRUE

      WHERE c.id = $1
        AND c.organisation_id = $2;
    `,
    [customerId, organisationId],
  );

  return result.rows[0] || null;
};

/**
 * Get paginated purchase-history rows for a customer.
 *
 * Returns:
 * - invoice number
 * - invoice date/time
 * - number of invoice items
 * - invoice amount
 * - payment method
 * - invoice status
 *
 * Payment method is derived from the payment transactions
 * associated with completed payments allocated to the invoice.
 *
 * If multiple payment methods were used, the result returns
 * "Mixed".
 *
 * If no completed payment has been allocated to the invoice,
 * the result returns "Unpaid".
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate organisationId.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access customer billing information for the organisation.
 *
 * 3. Validate customerId.
 *
 * 4. Validate that the customer belongs to organisationId.
 *
 * 5. Validate and normalize pagination values before calling
 *    the repository.
 *
 * 6. Validate any application-level invoice visibility rules.
 *
 * 7. Do not use this function to determine whether a customer
 *    is allowed to purchase or receive credit.
 *
 * This function only retrieves historical purchase information.
 *
 * This query is intentionally NOT cached because it supports
 * pagination/search and payment state can change frequently.
 */
const getCustomerPurchaseHistory = async ({
  organisationId,
  customerId,
  searchTerm = null,
  limit = 50,
  offset = 0,
  client = pool,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!customerId) {
    throw new Error("customerId is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }

  const params = [organisationId, customerId];

  let parameterIndex = 2;

  const conditions = ["i.organisation_id = $1", "i.customer_id = $2"];

  // ----------------------------------------------------------
  // SEARCH BY INVOICE NUMBER
  // ----------------------------------------------------------

  if (searchTerm && searchTerm.trim()) {
    parameterIndex += 1;

    params.push(`%${searchTerm.trim()}%`);

    conditions.push(`i.invoice_number ILIKE $${parameterIndex}`);
  }

  parameterIndex += 1;

  const limitParameter = parameterIndex;

  params.push(limit);

  parameterIndex += 1;

  const offsetParameter = parameterIndex;

  params.push(offset);

  const query = `
    SELECT
      i.id,
      i.invoice_number,
      i.invoice_date,
      i.customer_id,

      COUNT(ii.id)::INT AS item_count,

      i.total_amount,

      CASE
        WHEN COUNT(
          DISTINCT pt.payment_transaction_id
        ) = 0
          THEN 'Unpaid'

        WHEN COUNT(
          DISTINCT pt.payment_method
        ) = 1
          THEN MAX(pt.payment_method)

        ELSE 'Mixed'
      END AS payment_method,

      i.status

    FROM invoices i

    LEFT JOIN invoice_items ii
      ON ii.invoice_id = i.id

    LEFT JOIN LATERAL (
      SELECT
        pt.id AS payment_transaction_id,
        pt.payment_method
      FROM payment_allocations pa

      INNER JOIN payments p
        ON p.id = pa.payment_id
       AND p.organisation_id =
         i.organisation_id

      INNER JOIN payment_transactions pt
        ON pt.payment_id = p.id

      WHERE pa.invoice_id = i.id
        AND p.customer_id = i.customer_id
        AND p.organisation_id =
          i.organisation_id
        AND p.status = 'COMPLETED'
    ) pt ON TRUE

    WHERE ${conditions.join(`
      AND
    `)}

    GROUP BY
      i.id,
      i.invoice_number,
      i.invoice_date,
      i.customer_id,
      i.total_amount,
      i.status

    ORDER BY
      i.invoice_date DESC,
      i.id DESC

    LIMIT $${limitParameter}
    OFFSET $${offsetParameter};
  `;

  const result = await client.query(query, params);

  return result.rows;
};

/**
 * Get aggregate purchase information for a customer.
 *
 * Returns:
 * - total invoices
 * - total spent
 * - total returned/refunded
 * - current outstanding balance
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate organisationId.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access customer financial information.
 *
 * 3. Validate customerId.
 *
 * 4. Validate that the customer belongs to organisationId.
 *
 * 5. Apply any application-level rule regarding visibility of
 *    financial information.
 *
 * 6. Do not interpret this function as a payment settlement
 *    calculation. The authoritative outstanding balance is
 *    obtained from the customer ledger.
 *
 * This function is read-only and must not modify financial
 * records.
 *
 * This query is intentionally NOT cached because its financial
 * values can change through invoices, payments and returns.
 */
const getCustomerPurchaseSummary = async (
  organisationId,
  customerId,
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!customerId) {
    throw new Error("customerId is required.");
  }

  const result = await client.query(
    `
      SELECT
        COALESCE(
          purchase_summary.total_invoices,
          0
        ) AS total_invoices,

        COALESCE(
          purchase_summary.total_spent,
          0
        ) AS total_spent,

        COALESCE(
          return_summary.total_returns,
          0
        ) AS total_returns,

        COALESCE(
          ledger.current_balance,
          0
        ) AS outstanding_balance

      FROM customers c

      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INT AS total_invoices,

          COALESCE(
            SUM(i.total_amount),
            0
          ) AS total_spent

        FROM invoices i

        WHERE i.organisation_id =
          c.organisation_id
          AND i.customer_id = c.id
          AND i.status = ANY(
            ARRAY[
              'COMPLETED',
              'PARTIALLY_PAID',
              'PAID'
            ]
          )
      ) purchase_summary ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(r.refund_amount),
            0
          ) AS total_returns

        FROM returns r

        WHERE r.organisation_id =
          c.organisation_id
          AND r.customer_id = c.id
          AND r.status IN (
            'APPROVED',
            'PROCESSED'
          )
      ) return_summary ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          cle.balance_after
            AS current_balance

        FROM customer_ledger_entries cle

        WHERE cle.organisation_id =
          c.organisation_id
          AND cle.customer_id = c.id

        ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC

        LIMIT 1
      ) ledger ON TRUE

      WHERE c.id = $1
        AND c.organisation_id = $2;
    `,
    [customerId, organisationId],
  );

  return result.rows[0] || null;
};

/**
 * Get paginated return history for a customer.
 *
 * Returns:
 * - return number
 * - return date/time
 * - original invoice number
 * - returned item descriptions
 * - refund amount
 * - refund method
 * - return status
 * - return reason
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate organisationId.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access customer return information.
 *
 * 3. Validate customerId.
 *
 * 4. Validate that the customer belongs to organisationId.
 *
 * 5. Validate and normalize pagination values.
 *
 * 6. Apply any application-level rule concerning visibility
 *    of pending/rejected/cancelled returns.
 *
 * 7. Do not use this function to determine whether a return
 *    should be approved or processed.
 *
 * Return approval, refund calculation, inventory restoration,
 * and ledger/payment effects belong to the service layer.
 *
 * This function is read-only.
 *
 * This query is intentionally NOT cached because it is
 * paginated historical data.
 */
const getCustomerReturnHistory = async ({
  organisationId,
  customerId,
  limit = 50,
  offset = 0,
  client = pool,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!customerId) {
    throw new Error("customerId is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }

  const result = await client.query(
    `
      SELECT
        r.id,
        r.return_number,
        r.return_date,
        r.invoice_id,
        i.invoice_number,

        COALESCE(
          STRING_AGG(
            DISTINCT
              ri.quantity_returned::TEXT
              || ' x '
              || ii.product_name,
            ', '
            ORDER BY
              ri.quantity_returned::TEXT
              || ' x '
              || ii.product_name
          ),
          ''
        ) AS items_returned,

        COALESCE(
          SUM(ri.refund_amount),
          0
        ) AS refund_amount,

        r.refund_method,
        r.status,
        r.reason

      FROM returns r

      INNER JOIN invoices i
        ON i.id = r.invoice_id
       AND i.organisation_id =
         r.organisation_id
       AND i.customer_id =
         r.customer_id

      LEFT JOIN return_items ri
        ON ri.return_id = r.id

      LEFT JOIN invoice_items ii
        ON ii.id = ri.invoice_item_id

      WHERE r.organisation_id = $1
        AND r.customer_id = $2

      GROUP BY
        r.id,
        r.return_number,
        r.return_date,
        r.invoice_id,
        i.invoice_number,
        r.refund_method,
        r.status,
        r.reason

      ORDER BY
        r.return_date DESC,
        r.id DESC

      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, customerId, limit, offset],
  );

  return result.rows;
};

// ============================================================
// CUSTOMER LEDGER
// ============================================================

/**
 * Get the ledger summary for one customer.
 *
 * Returns:
 * - customer identity
 * - customer number
 * - credit enabled
 * - credit limit
 * - current outstanding balance
 * - total debit
 * - total credit
 *
 * The current outstanding balance is taken from the latest
 * customer_ledger_entries.balance_after value.
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate that organisationId is present.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access customer financial/ledger information.
 *
 * 3. Validate that customerId is present.
 *
 * 4. Validate that the customer belongs to organisationId.
 *
 * 5. Apply any application-level rule regarding whether an
 *    inactive customer may be viewed.
 *
 * 6. Do not use this function to determine authorization.
 *
 * 7. Do not modify or recalculate ledger balances in this
 *    read query.
 *
 * The customer ledger is the financial source of truth for
 * the customer's running balance.
 *
 * This query is intentionally NOT cached because ledger
 * balances can change after every financial event.
 */
const getCustomerLedgerSummary = async (
  organisationId,
  customerId,
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!customerId) {
    throw new Error("customerId is required.");
  }

  const result = await client.query(
    `
      SELECT
        c.id,
        c.organisation_id,
        c.customer_number,
        c.full_name,
        c.phone,
        c.category,
        c.status,

        COALESCE(
          cca.credit_enabled,
          FALSE
        ) AS credit_enabled,

        COALESCE(
          cca.credit_limit,
          0
        ) AS credit_limit,

        COALESCE(
          ledger.current_balance,
          0
        ) AS outstanding_balance,

        COALESCE(
          ledger_totals.total_debit,
          0
        ) AS total_debit,

        COALESCE(
          ledger_totals.total_credit,
          0
        ) AS total_credit

      FROM customers c

      LEFT JOIN customer_credit_accounts cca
        ON cca.customer_id = c.id
       AND cca.organisation_id =
         c.organisation_id

      LEFT JOIN LATERAL (
        SELECT
          cle.balance_after
            AS current_balance

        FROM customer_ledger_entries cle

        WHERE cle.organisation_id =
          c.organisation_id
          AND cle.customer_id = c.id

        ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC

        LIMIT 1
      ) ledger ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(cle.debit_amount),
            0
          ) AS total_debit,

          COALESCE(
            SUM(cle.credit_amount),
            0
          ) AS total_credit

        FROM customer_ledger_entries cle

        WHERE cle.organisation_id =
          c.organisation_id
          AND cle.customer_id = c.id
      ) ledger_totals ON TRUE

      WHERE c.id = $1
        AND c.organisation_id = $2;
    `,
    [customerId, organisationId],
  );

  return result.rows[0] || null;
};

/**
 * Get aggregate statistics for the Customer Ledger dashboard.
 *
 * Returns:
 * - total outstanding
 * - overdue amount
 * - total credit limit
 * - credit utilization
 * - customers with outstanding balances
 * - customers with overdue balances
 *
 * This is cached because it is an expensive organisation-level
 * dashboard aggregation.
 *
 * ------------------------------------------------------------
 * SERVICE-LAYER PRECONDITIONS
 * ------------------------------------------------------------
 *
 * Before calling this function, the service layer must:
 *
 * 1. Validate that organisationId is present.
 *
 * 2. Validate that the authenticated user is authorized to
 *    access organisation-level customer financial information.
 *
 * 3. Ensure the requested dashboard scope belongs to the
 *    organisation represented by organisationId.
 *
 * 4. Validate any branch/date/filter parameters before passing
 *    them to this repository if the API exposes such filters.
 *
 * 5. Do not use this function to authorize access to an
 *    organisation.
 *
 * 6. Do not modify ledger/payment/invoice records here.
 *
 * IMPORTANT:
 * The repository treats the latest customer ledger balance as
 * the current outstanding amount.
 *
 * Overdue calculation is temporarily based on invoice_date
 * because the current invoices schema does not contain an
 * explicit due_date.
 *
 * Current rule:
 *
 *   invoice_date <= CURRENT_DATE - 30 days
 *   AND invoice has an outstanding amount
 *
 * Redis is only used for normal pool-backed reads. A supplied
 * transaction client always reads directly from PostgreSQL.
 */
async function getCustomerLedgerDashboardStats(organisationId, client = pool) {
  if (!organisationId) {
    throw new Error("organisationId is required");
  }

  const useCache = client === pool;

  const cacheKey = buildCustomerLedgerDashboardStatsCacheKey(organisationId);

  if (useCache) {
    const cachedStats = await readDashboardCache(cacheKey);

    if (cachedStats) {
      return cachedStats;
    }
  }

  const query = `
    WITH invoice_balances AS (
      SELECT
        i.id AS invoice_id,
        i.organisation_id,
        i.customer_id,
        i.invoice_date,
        i.total_amount,

        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'COMPLETED'
              THEN pa.allocated_amount
              ELSE 0
            END
          ),
          0
        ) AS paid_amount

      FROM invoices i

      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = i.id

      LEFT JOIN payments p
        ON p.id = pa.payment_id

      WHERE i.organisation_id = $1
        AND i.status NOT IN (
          'VOID',
          'CANCELLED'
        )

      GROUP BY
        i.id,
        i.organisation_id,
        i.customer_id,
        i.invoice_date,
        i.total_amount
    ),

    outstanding_invoices AS (
      SELECT
        invoice_id,
        organisation_id,
        customer_id,
        invoice_date,

        GREATEST(
          total_amount - paid_amount,
          0
        ) AS outstanding_amount

      FROM invoice_balances

      WHERE total_amount - paid_amount > 0
    ),

    overdue_invoices AS (
      SELECT
        outstanding_amount
      FROM outstanding_invoices
      WHERE invoice_date <=
        CURRENT_DATE - INTERVAL '30 days'
    ),

    customer_balances AS (
      SELECT DISTINCT ON (
        cle.customer_id
      )
        cle.customer_id,
        cle.balance_after AS current_balance

      FROM customer_ledger_entries cle

      WHERE cle.organisation_id = $1

      ORDER BY
        cle.customer_id,
        cle.entry_date DESC,
        cle.created_at DESC,
        cle.id DESC
    ),

    credit_accounts AS (
      SELECT
        cca.customer_id,
        cca.credit_limit

      FROM customer_credit_accounts cca

      WHERE cca.organisation_id = $1
        AND cca.credit_enabled = TRUE
    )

    SELECT
      COALESCE(
        (
          SELECT SUM(current_balance)
          FROM customer_balances
          WHERE current_balance > 0
        ),
        0
      )::NUMERIC AS total_outstanding,

      COALESCE(
        (
          SELECT SUM(outstanding_amount)
          FROM overdue_invoices
        ),
        0
      )::NUMERIC AS overdue_amount,

      COALESCE(
        (
          SELECT SUM(credit_limit)
          FROM credit_accounts
        ),
        0
      )::NUMERIC AS total_credit_limit,

      (
        SELECT COUNT(*)
        FROM customer_balances
        WHERE current_balance > 0
      )::INT AS customers_with_outstanding,

      (
        SELECT COUNT(DISTINCT oi.customer_id)
        FROM outstanding_invoices oi

        INNER JOIN customer_balances cb
          ON cb.customer_id = oi.customer_id

        WHERE oi.invoice_date <=
          CURRENT_DATE - INTERVAL '30 days'

          AND oi.outstanding_amount > 0

          AND cb.current_balance > 0
      )::INT AS customers_with_overdue;
  `;

  const result = await client.query(query, [organisationId]);

  const row = result.rows[0];

  const totalOutstanding = Number(row.total_outstanding);

  const totalCreditLimit = Number(row.total_credit_limit);

  const creditUtilization =
    totalCreditLimit > 0 ? (totalOutstanding / totalCreditLimit) * 100 : 0;

  const dashboardStats = {
    totalOutstanding,
    overdueAmount: Number(row.overdue_amount),
    totalCreditLimit,
    creditUtilization: Number(creditUtilization.toFixed(2)),
    customersWithOutstanding: Number(row.customers_with_outstanding),
    customersWithOverdue: Number(row.customers_with_overdue),
  };

  if (useCache) {
    await writeDashboardCache(cacheKey, dashboardStats);
  }

  return dashboardStats;
}

/**
 * Get paginated customer ledger rows for the Customer Ledger
 * dashboard.
 *
 * Each row represents one ledger entry.
 *
 * Returns:
 * - entry date
 * - customer
 * - customer number
 * - entry type
 * - reference type
 * - reference id
 * - debit
 * - credit
 * - running balance
 * - description
 *
 * Supported filters:
 * - searchTerm
 * - entryType
 * - referenceType
 * - dateFrom
 * - dateTo
 *
 * This query is intentionally NOT cached because filters and
 * pagination create many cache variants and ledger data is
 * highly mutable.
 */
const getCustomerCreditLedgerRows = async ({
  organisationId,
  searchTerm = null,
  entryType = null,
  referenceType = null,
  dateFrom = null,
  dateTo = null,
  limit = 50,
  offset = 0,
  client = pool,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }

  const params = [organisationId];

  let parameterIndex = 1;

  const conditions = ["cle.organisation_id = $1"];

  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  if (searchTerm && searchTerm.trim()) {
    parameterIndex += 1;

    params.push(`%${searchTerm.trim()}%`);

    conditions.push(`
      (
        c.full_name ILIKE $${parameterIndex}
        OR c.customer_number ILIKE $${parameterIndex}
        OR c.phone ILIKE $${parameterIndex}
        OR cle.description ILIKE $${parameterIndex}
      )
    `);
  }

  // ----------------------------------------------------------
  // ENTRY TYPE
  // ----------------------------------------------------------

  if (entryType && entryType.trim()) {
    parameterIndex += 1;

    params.push(entryType.trim());

    conditions.push(`UPPER(cle.entry_type) = UPPER($${parameterIndex})`);
  }

  // ----------------------------------------------------------
  // REFERENCE TYPE
  // ----------------------------------------------------------

  if (referenceType && referenceType.trim()) {
    parameterIndex += 1;

    params.push(referenceType.trim());

    conditions.push(`UPPER(cle.reference_type) = UPPER($${parameterIndex})`);
  }

  // ----------------------------------------------------------
  // DATE FROM
  // ----------------------------------------------------------

  if (dateFrom) {
    parameterIndex += 1;

    params.push(dateFrom);

    conditions.push(`cle.entry_date >= $${parameterIndex}`);
  }

  // ----------------------------------------------------------
  // DATE TO
  // ----------------------------------------------------------

  if (dateTo) {
    parameterIndex += 1;

    params.push(dateTo);

    conditions.push(`cle.entry_date <= $${parameterIndex}`);
  }

  // ----------------------------------------------------------
  // PAGINATION
  // ----------------------------------------------------------

  parameterIndex += 1;

  const limitParameter = parameterIndex;

  params.push(limit);

  parameterIndex += 1;

  const offsetParameter = parameterIndex;

  params.push(offset);

  // ----------------------------------------------------------
  // QUERY
  // ----------------------------------------------------------

  const query = `
    SELECT
      cle.id,
      cle.organisation_id,
      cle.customer_id,

      c.customer_number,
      c.full_name,
      c.phone,

      cle.branch_id,

      cle.entry_type,
      cle.reference_type,
      cle.reference_id,

      cle.debit_amount,
      cle.credit_amount,

      cle.balance_after,

      cle.entry_date,
      cle.description,
      cle.created_at

    FROM customer_ledger_entries cle

    INNER JOIN customers c
      ON c.id = cle.customer_id
     AND c.organisation_id =
       cle.organisation_id

    WHERE ${conditions.join(`
      AND
    `)}

    ORDER BY
      cle.entry_date DESC,
      cle.created_at DESC,
      cle.id DESC

    LIMIT $${limitParameter}
    OFFSET $${offsetParameter};
  `;

  const result = await client.query(query, params);

  return result.rows;
};

// ============================================================
// PAYMENT RECEIPTS
// ============================================================

/**
 * Get Payment Receipts dashboard statistics.
 *
 * Returns:
 * - total receipts
 * - completed receipts
 * - total collected
 * - today's collected amount
 * - pending amount
 * - refunded amount
 *
 * This is cached because it is an expensive organisation-level
 * dashboard aggregation and is read frequently by the
 * Payment Receipts dashboard.
 *
 * payment_transactions are deliberately NOT joined here.
 *
 * One payment can contain multiple payment transactions
 * because split payments are supported.
 *
 * Therefore payment totals must come from payments.total_amount
 * rather than multiplying rows through payment_transactions.
 */
const getPaymentReceiptDashboardStats = async (
  organisationId,
  client = pool,
) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  const useCache = client === pool;

  const cacheKey = buildPaymentReceiptDashboardStatsCacheKey(organisationId);

  if (useCache) {
    const cachedStats = await readDashboardCache(cacheKey);

    if (cachedStats) {
      return cachedStats;
    }
  }

  const result = await client.query(
    `
      SELECT
        COUNT(*)::INT AS total_receipts,

        COUNT(*) FILTER (
          WHERE p.status = 'COMPLETED'
        )::INT AS completed_receipts,

        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'COMPLETED'
              THEN p.total_amount
              ELSE 0
            END
          ),
          0
        ) AS total_collected,

        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'COMPLETED'
               AND p.payment_date::DATE =
                 CURRENT_DATE
              THEN p.total_amount
              ELSE 0
            END
          ),
          0
        ) AS today_collected,

        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'PENDING'
              THEN p.total_amount
              ELSE 0
            END
          ),
          0
        ) AS pending_amount,

        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'REFUNDED'
              THEN p.total_amount
              ELSE 0
            END
          ),
          0
        ) AS refunded_amount

      FROM payments p

      WHERE p.organisation_id = $1;
    `,
    [organisationId],
  );

  const stats = result.rows[0];

  if (useCache && stats) {
    await writeDashboardCache(cacheKey, stats);
  }

  return stats;
};

/**
 * Get Payment Receipts dashboard rows.
 *
 * One row represents one payment/receipt.
 *
 * Split payment transactions are aggregated into the same
 * receipt row so that one payment never appears as multiple
 * receipts.
 *
 * Supported filters:
 * - searchTerm
 * - status
 * - paymentMethod
 * - dateFrom
 * - dateTo
 *
 * Supported pagination:
 * - limit
 * - offset
 *
 * This query is intentionally NOT cached because every
 * combination of search/filter/pagination would create a
 * separate cache entry.
 */
const getPaymentReceiptDashboardRows = async ({
  organisationId,
  searchTerm = null,
  status = null,
  paymentMethod = null,
  dateFrom = null,
  dateTo = null,
  limit = 50,
  offset = 0,
  client = pool,
}) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }

  const values = [organisationId];

  const conditions = [`p.organisation_id = $1`];

  // ----------------------------------------------------------
  // SEARCH
  // ----------------------------------------------------------

  if (searchTerm && searchTerm.trim()) {
    values.push(`%${searchTerm.trim()}%`);

    conditions.push(`
      (
        p.receipt_number ILIKE $${values.length}

        OR c.customer_number ILIKE $${values.length}

        OR c.full_name ILIKE $${values.length}

        OR c.phone ILIKE $${values.length}

        OR EXISTS (
          SELECT 1
          FROM payment_allocations pa_search

          INNER JOIN invoices i_search
            ON i_search.id =
              pa_search.invoice_id

          WHERE pa_search.payment_id = p.id
            AND i_search.organisation_id =
              p.organisation_id
            AND i_search.invoice_number ILIKE
              $${values.length}
        )

        OR EXISTS (
          SELECT 1
          FROM payment_transactions pt_search

          WHERE pt_search.payment_id = p.id
            AND pt_search.transaction_reference
              ILIKE $${values.length}
        )
      )
    `);
  }

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (status && status.trim()) {
    values.push(status.trim());

    conditions.push(`UPPER(p.status) = UPPER($${values.length})`);
  }

  // ----------------------------------------------------------
  // PAYMENT METHOD
  // ----------------------------------------------------------

  if (paymentMethod && paymentMethod.trim()) {
    values.push(paymentMethod.trim());

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM payment_transactions pt_filter

        WHERE pt_filter.payment_id = p.id
          AND UPPER(
            pt_filter.payment_method
          ) = UPPER($${values.length})
      )
    `);
  }

  // ----------------------------------------------------------
  // DATE FROM
  // ----------------------------------------------------------

  if (dateFrom) {
    values.push(dateFrom);

    conditions.push(`p.payment_date::DATE >= $${values.length}`);
  }

  // ----------------------------------------------------------
  // DATE TO
  // ----------------------------------------------------------

  if (dateTo) {
    values.push(dateTo);

    conditions.push(`p.payment_date::DATE <= $${values.length}`);
  }

  // ----------------------------------------------------------
  // PAGINATION
  // ----------------------------------------------------------

  values.push(limit);

  const limitParameter = values.length;

  values.push(offset);

  const offsetParameter = values.length;

  // ----------------------------------------------------------
  // QUERY
  // ----------------------------------------------------------

  const query = `
    SELECT
      p.id,
      p.organisation_id,
      p.branch_id,

      p.receipt_number,
      p.payment_date,

      p.customer_id,
      c.customer_number,
      c.full_name,
      c.phone,

      /*
       * A payment may be allocated to multiple invoices.
       *
       * Keep all invoice references inside the single
       * receipt row.
       */
      COALESCE(
        STRING_AGG(
          DISTINCT i.invoice_number,
          ', '
          ORDER BY i.invoice_number
        ) FILTER (
          WHERE i.id IS NOT NULL
        ),
        'Unallocated'
      ) AS invoice_reference,

      /*
       * Split-payment support.
       *
       * Example:
       *
       * CASH + UPI
       */
      COALESCE(
        STRING_AGG(
          DISTINCT pt.payment_method,
          ' + '
          ORDER BY pt.payment_method
        ),
        'Not Recorded'
      ) AS payment_method,

      /*
       * External transaction references.
       *
       * Cash normally has no transaction reference.
       */
      STRING_AGG(
        DISTINCT pt.transaction_reference,
        ', '
        ORDER BY pt.transaction_reference
      ) FILTER (
        WHERE pt.transaction_reference IS NOT NULL
          AND pt.transaction_reference <> ''
      ) AS transaction_reference,

      p.total_amount,

      p.received_by,
      u.name AS received_by_name,

      p.status,
      p.notes,

      p.created_at,
      p.updated_at

    FROM payments p

    INNER JOIN customers c
      ON c.id = p.customer_id
     AND c.organisation_id =
       p.organisation_id

    LEFT JOIN payment_allocations pa
      ON pa.payment_id = p.id

    LEFT JOIN invoices i
      ON i.id = pa.invoice_id
     AND i.organisation_id =
       p.organisation_id

    LEFT JOIN payment_transactions pt
      ON pt.payment_id = p.id

    LEFT JOIN users u
      ON u.id = p.received_by

    WHERE ${conditions.join(`
      AND
    `)}

    GROUP BY
      p.id,
      p.organisation_id,
      p.branch_id,
      p.receipt_number,
      p.payment_date,
      p.customer_id,
      c.customer_number,
      c.full_name,
      c.phone,
      p.total_amount,
      p.received_by,
      u.name,
      p.status,
      p.notes,
      p.created_at,
      p.updated_at

    ORDER BY
      p.payment_date DESC,
      p.id DESC

    LIMIT $${limitParameter}
    OFFSET $${offsetParameter};
  `;

  const result = await client.query(query, values);

  return result.rows;
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getCustomerDirectoryStats,
  getCustomerDirectoryRows,

  getCustomerDetailsSummary,
  getCustomerPurchaseHistory,
  getCustomerPurchaseSummary,
  getCustomerReturnHistory,

  getCustomerLedgerSummary,
  getCustomerLedgerDashboardStats,
  getCustomerCreditLedgerRows,

  getPaymentReceiptDashboardStats,
  getPaymentReceiptDashboardRows,
};
