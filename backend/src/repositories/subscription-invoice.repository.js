/**
 * Subscription Invoice Repository
 *
 * Handles database operations for B2B SaaS GST tax invoices issued by PharmaFlow.
 * Enforces 1 payment = exactly 1 tax invoice.
 */

const { pool } = require("../db/connection");

/**
 * Create immutable subscription tax invoice.
 */
const createInvoice = async (
  {
    invoiceNumber,
    organisationId,
    subscriptionId,
    paymentId,
    sellerLegalName,
    sellerGstin,
    sellerAddress,
    sellerState,
    buyerLegalName,
    buyerGstin,
    buyerAddress,
    buyerState,
    sacCode = "998313",
    billingPeriodStart,
    billingPeriodEnd,
    taxableAmount,
    gstRate,
    isInterstate = false,
    cgstAmount = 0,
    sgstAmount = 0,
    igstAmount = 0,
    totalAmount,
    status = "PAID",
    pdfUrl = null,
  },
  client = pool,
) => {
  const query = `
    INSERT INTO subscription_invoices (
      invoice_number,
      organisation_id,
      subscription_id,
      payment_id,
      seller_legal_name,
      seller_gstin,
      seller_address,
      seller_state,
      buyer_legal_name,
      buyer_gstin,
      buyer_address,
      buyer_state,
      sac_code,
      billing_period_start,
      billing_period_end,
      taxable_amount,
      gst_rate,
      is_interstate,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_amount,
      status,
      pdf_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    RETURNING *;
  `;

  const result = await client.query(query, [
    invoiceNumber,
    organisationId,
    subscriptionId,
    paymentId,
    sellerLegalName,
    sellerGstin,
    sellerAddress,
    sellerState,
    buyerLegalName,
    buyerGstin,
    buyerAddress,
    buyerState,
    sacCode,
    billingPeriodStart,
    billingPeriodEnd,
    taxableAmount,
    gstRate,
    isInterstate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
    status,
    pdfUrl,
  ]);

  return result.rows[0];
};

/**
 * Get invoice by payment ID.
 */
const getInvoiceByPaymentId = async (paymentId, client = pool) => {
  const query = `
    SELECT * FROM subscription_invoices
    WHERE payment_id = $1
    LIMIT 1;
  `;
  const result = await client.query(query, [paymentId]);
  return result.rows[0] || null;
};

/**
 * Get invoice by ID.
 */
const getInvoiceById = async (invoiceId, client = pool) => {
  const query = `
    SELECT * FROM subscription_invoices
    WHERE id = $1;
  `;
  const result = await client.query(query, [invoiceId]);
  return result.rows[0] || null;
};

/**
 * List all invoices for an organisation.
 */
const listInvoicesByOrgId = async (organisationId, client = pool) => {
  const query = `
    SELECT * FROM subscription_invoices
    WHERE organisation_id = $1
    ORDER BY issued_at DESC;
  `;
  const result = await client.query(query, [organisationId]);
  return result.rows;
};

module.exports = {
  createInvoice,
  getInvoiceByPaymentId,
  getInvoiceById,
  listInvoicesByOrgId,
};
