/**
 * Platform Payment Refund Repository
 *
 * Implements two-phase refund reservation and settlement.
 * Protects against concurrent over-refunds and timeout retries.
 */

const { pool } = require("../db/connection");

/**
 * Phase 1: Create a PENDING refund reservation.
 */
const createRefundReservation = async (
  {
    paymentId,
    refundReference,
    amount,
    currency = "INR",
    reason,
    processedBy = null,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO platform_payment_refunds (
      payment_id,
      refund_reference,
      amount,
      currency,
      reason,
      status,
      processed_by
    )
    VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
    RETURNING *;
  `;

  const result = await client.query(query, [
    paymentId,
    refundReference,
    amount,
    currency,
    reason,
    processedBy,
  ]);

  return result.rows[0];
};

/**
 * Phase 3: Finalize refund reservation after gateway dispatch.
 */
const finalizeRefund = async (
  refundId,
  { razorpayRefundId, status, errorMessage = null },
  client = pool,
) => {
  const query = `
    UPDATE platform_payment_refunds
    SET 
      razorpay_refund_id = COALESCE($1, razorpay_refund_id),
      status = $2,
      error_message = $3,
      processed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *;
  `;

  const result = await client.query(query, [
    razorpayRefundId,
    status,
    errorMessage,
    refundId,
  ]);

  return result.rows[0] || null;
};

/**
 * Get refund by internal reference (RFD-2026-XXXX).
 */
const getRefundByReference = async (refundReference, client = pool) => {
  const query = `
    SELECT * FROM platform_payment_refunds
    WHERE refund_reference = $1
    LIMIT 1;
  `;
  const result = await client.query(query, [refundReference]);
  return result.rows[0] || null;
};

/**
 * Get refund by ID.
 */
const getRefundById = async (refundId, client = pool) => {
  const query = `
    SELECT * FROM platform_payment_refunds
    WHERE id = $1;
  `;
  const result = await client.query(query, [refundId]);
  return result.rows[0] || null;
};

/**
 * Calculate total processed and pending refunds for a given payment.
 */
const sumRefundsForPayment = async (paymentId, client = pool) => {
  const query = `
    SELECT 
      COALESCE(SUM(amount) FILTER (WHERE status = 'PROCESSED'), 0) AS total_processed,
      COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) AS total_pending,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('PROCESSED', 'PENDING')), 0) AS total_committed
    FROM platform_payment_refunds
    WHERE payment_id = $1;
  `;
  const result = await client.query(query, [paymentId]);
  return result.rows[0];
};

/**
 * List all refunds for a payment.
 */
const listRefundsByPaymentId = async (paymentId, client = pool) => {
  const query = `
    SELECT * FROM platform_payment_refunds
    WHERE payment_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await client.query(query, [paymentId]);
  return result.rows;
};

module.exports = {
  createRefundReservation,
  finalizeRefund,
  getRefundByReference,
  getRefundById,
  sumRefundsForPayment,
  listRefundsByPaymentId,
};
