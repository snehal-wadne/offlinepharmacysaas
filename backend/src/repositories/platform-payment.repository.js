/**
 * Platform Subscription Payment Repository
 *
 * Handles database operations for SaaS platform subscription payments.
 * Completely separate from tenant POS retail receipts.
 */

const { pool } = require("../db/connection");

/**
 * Insert new platform payment record in PENDING state.
 */
const createPayment = async (
  {
    paymentReference,
    organisationId,
    subscriptionId,
    transactionType = "NEW_ONBOARDING",
    razorpayOrderId,
    razorpayPaymentId = null,
    razorpaySignature = null,
    currency = "INR",
    baseAmount,
    gstRate,
    cgstAmount = 0,
    sgstAmount = 0,
    igstAmount = 0,
    totalAmount,
    paymentMethod = "RAZORPAY",
    status = "PENDING",
  },
  client = pool,
) => {
  const query = `
    INSERT INTO platform_subscription_payments (
      payment_reference,
      organisation_id,
      subscription_id,
      transaction_type,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      currency,
      base_amount,
      gst_rate,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_amount,
      payment_method,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;

  const result = await client.query(query, [
    paymentReference,
    organisationId,
    subscriptionId,
    transactionType,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    currency,
    baseAmount,
    gstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
    paymentMethod,
    status,
  ]);

  return result.rows[0];
};

/**
 * Get payment by ID.
 */
const getPaymentById = async (paymentId, client = pool) => {
  const query = `
    SELECT 
      p.*,
      o.name AS pharmacy_name,
      o.pharmacy_code
    FROM platform_subscription_payments p
    INNER JOIN organisations o ON o.id = p.organisation_id
    WHERE p.id = $1;
  `;
  const result = await client.query(query, [paymentId]);
  return result.rows[0] || null;
};

/**
 * Get payment by Razorpay Order ID.
 */
const getPaymentByRazorpayOrderId = async (orderId, client = pool) => {
  const query = `
    SELECT 
      p.*,
      o.name AS pharmacy_name,
      o.pharmacy_code
    FROM platform_subscription_payments p
    INNER JOIN organisations o ON o.id = p.organisation_id
    WHERE p.razorpay_order_id = $1
    ORDER BY p.created_at DESC
    LIMIT 1;
  `;
  const result = await client.query(query, [orderId]);
  return result.rows[0] || null;
};

/**
 * Get payment by Razorpay Payment ID.
 */
const getPaymentByRazorpayPaymentId = async (rzpPaymentId, client = pool) => {
  const query = `
    SELECT 
      p.*,
      o.name AS pharmacy_name,
      o.pharmacy_code
    FROM platform_subscription_payments p
    INNER JOIN organisations o ON o.id = p.organisation_id
    WHERE p.razorpay_payment_id = $1
    LIMIT 1;
  `;
  const result = await client.query(query, [rzpPaymentId]);
  return result.rows[0] || null;
};

/**
 * Lock payment row inside a transaction (SELECT ... FOR UPDATE).
 */
const getPaymentForUpdate = async (paymentId, client) => {
  const query = `
    SELECT *
    FROM platform_subscription_payments
    WHERE id = $1
    FOR UPDATE;
  `;
  const result = await client.query(query, [paymentId]);
  return result.rows[0] || null;
};

/**
 * Update payment record status and settlement metadata.
 */
const updatePayment = async (paymentId, updates, client = pool) => {
  const query = `
    UPDATE platform_subscription_payments
    SET 
      razorpay_payment_id = COALESCE($1, razorpay_payment_id),
      razorpay_signature = COALESCE($2, razorpay_signature),
      status = COALESCE($3, status),
      paid_at = COALESCE($4, paid_at),
      error_code = COALESCE($5, error_code),
      error_description = COALESCE($6, error_description),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING *;
  `;

  const result = await client.query(query, [
    updates.razorpayPaymentId,
    updates.razorpaySignature,
    updates.status,
    updates.paidAt,
    updates.errorCode,
    updates.errorDescription,
    paymentId,
  ]);

  return result.rows[0] || null;
};

/**
 * List platform payments with filters and pagination.
 */
const listPayments = async (
  {
    search = "",
    status = "All Status",
    month = "ALL",
    date = null,
    limit = 15,
    offset = 0,
  } = {},
  client = pool,
) => {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (status && status !== "All Status") {
    conditions.push(`p.status = $${paramIndex++}`);
    values.push(status.toUpperCase());
  }

  if (date) {
    conditions.push(`DATE(p.paid_at AT TIME ZONE 'UTC') = $${paramIndex++}`);
    values.push(date);
  } else if (month && month !== "ALL") {
    conditions.push(
      `TO_CHAR(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM') = $${paramIndex++}`,
    );
    values.push(month);
  }

  if (search && search.trim()) {
    conditions.push(`(
      o.name ILIKE $${paramIndex} 
      OR p.payment_reference ILIKE $${paramIndex}
      OR p.razorpay_order_id ILIKE $${paramIndex}
      OR p.razorpay_payment_id ILIKE $${paramIndex}
    )`);
    values.push(`%${search.trim()}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM platform_subscription_payments p
    INNER JOIN organisations o ON o.id = p.organisation_id
    ${whereClause};
  `;
  const countRes = await client.query(countQuery, values);
  const total = countRes.rows[0]?.total || 0;

  // Get paginated rows
  const dataQuery = `
    SELECT 
      p.id,
      p.payment_reference,
      p.transaction_type,
      p.razorpay_order_id,
      p.razorpay_payment_id,
      p.currency,
      p.total_amount,
      p.base_amount,
      p.gst_amount,
      p.status,
      p.payment_method,
      p.paid_at,
      p.created_at,
      TO_CHAR(COALESCE(p.paid_at, p.created_at), 'YYYY-MM-DD') AS iso_date,
      TO_CHAR(COALESCE(p.paid_at, p.created_at), 'YYYY-MM') AS month_key,
      o.name AS pharmacy_name,
      o.pharmacy_code
    FROM platform_subscription_payments p
    INNER JOIN organisations o ON o.id = p.organisation_id
    ${whereClause}
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++};
  `;

  values.push(limit, offset);
  const dataRes = await client.query(dataQuery, values);

  return {
    payments: dataRes.rows,
    total,
  };
};

/**
 * Aggregate summary KPIs for payment ledger (Volume, Success, Declined, Reversed).
 */
const getPaymentsKpiSummary = async (
  { month = "ALL", date = null } = {},
  client = pool,
) => {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  if (date) {
    conditions.push(`DATE(p.paid_at AT TIME ZONE 'UTC') = $${paramIdx++}`);
    values.push(date);
  } else if (month && month !== "ALL") {
    conditions.push(
      `TO_CHAR(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM') = $${paramIdx++}`,
    );
    values.push(month);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      COUNT(*)::int AS total_count,
      COALESCE(SUM(p.total_amount), 0) AS total_volume,
      COUNT(*) FILTER (WHERE p.status IN ('SUCCESS', 'PARTIALLY_REFUNDED'))::int AS success_count,
      COALESCE(SUM(p.total_amount) FILTER (WHERE p.status IN ('SUCCESS', 'PARTIALLY_REFUNDED')), 0) AS success_volume,
      COUNT(*) FILTER (WHERE p.status = 'FAILED')::int AS failed_count,
      COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'FAILED'), 0) AS failed_volume,
      COUNT(*) FILTER (WHERE p.status = 'REFUNDED')::int AS refunded_count,
      COALESCE(SUM(p.total_amount) FILTER (WHERE p.status = 'REFUNDED'), 0) AS refunded_volume
    FROM platform_subscription_payments p
    ${whereClause};
  `;

  const res = await client.query(query, values);
  return res.rows[0];
};

module.exports = {
  createPayment,
  getPaymentById,
  getPaymentByRazorpayOrderId,
  getPaymentByRazorpayPaymentId,
  getPaymentForUpdate,
  updatePayment,
  listPayments,
  getPaymentsKpiSummary,
};
