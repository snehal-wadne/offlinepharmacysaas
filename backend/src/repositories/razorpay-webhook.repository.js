/**
 * Razorpay Webhook Event Repository
 *
 * Implements crash-safe at-least-once event logging and idempotency ledger.
 */

const { pool } = require("../db/connection");

/**
 * Record or check existing webhook event.
 * If event already exists, updates updated_at timestamp.
 */
const recordWebhookEvent = async (
  {
    eventId,
    eventType,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    payload,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO razorpay_webhook_events (
      event_id,
      event_type,
      razorpay_order_id,
      razorpay_payment_id,
      payload,
      status
    )
    VALUES ($1, $2, $3, $4, $5, 'RECEIVED')
    ON CONFLICT (event_id) 
    DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    RETURNING 
      id,
      event_id,
      event_type,
      status,
      attempts,
      updated_at,
      (xmax = 0) AS is_new;
  `;

  const result = await client.query(query, [
    eventId,
    eventType,
    razorpayOrderId,
    razorpayPaymentId,
    JSON.stringify(payload),
  ]);

  return result.rows[0];
};

/**
 * Update webhook processing status.
 */
const updateWebhookStatus = async (
  eventId,
  {
    status,
    errorMessage = null,
    processedAt = null,
    incrementAttempts = false,
  },
  client = pool,
) => {
  const query = `
    UPDATE razorpay_webhook_events
    SET 
      status = $1,
      error_message = $2,
      processed_at = COALESCE($3, processed_at),
      attempts = attempts + ${incrementAttempts ? "1" : "0"},
      updated_at = CURRENT_TIMESTAMP
    WHERE event_id = $4
    RETURNING *;
  `;

  const result = await client.query(query, [
    status,
    errorMessage,
    processedAt,
    eventId,
  ]);
  return result.rows[0] || null;
};

/**
 * Get webhook event by Razorpay event ID.
 */
const getWebhookEventById = async (eventId, client = pool) => {
  const query = `
    SELECT * FROM razorpay_webhook_events
    WHERE event_id = $1;
  `;
  const result = await client.query(query, [eventId]);
  return result.rows[0] || null;
};

/**
 * Find stale events stuck in PROCESSING status (e.g. process crashed).
 */
const getStaleProcessingEvents = async (
  thresholdMinutes = 5,
  client = pool,
) => {
  const query = `
    SELECT * FROM razorpay_webhook_events
    WHERE status = 'PROCESSING'
      AND updated_at <= CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
    ORDER BY updated_at ASC;
  `;
  const result = await client.query(query, [thresholdMinutes]);
  return result.rows;
};

module.exports = {
  recordWebhookEvent,
  updateWebhookStatus,
  getWebhookEventById,
  getStaleProcessingEvents,
};
