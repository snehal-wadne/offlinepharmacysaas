/**
 * Customer Ledger Repository
 *
 * Responsibilities:
 *
 * - persist customer ledger entries
 * - enforce organisation/customer ownership
 * - enforce optional branch ownership
 * - provide tenant-safe ledger reads
 * - provide customer statement reads
 * - provide reference-based reads
 * - support caller-owned transactions
 *
 * Business logic intentionally NOT handled here:
 *
 * - calculating customer outstanding balance
 * - calculating invoice/payment amounts
 * - creating invoice/payment ledger entries
 * - validating application permissions
 * - validating source transaction lifecycle
 * - recalculating historical balances
 *
 * `balance_after` is persisted exactly as supplied by the
 * service layer.
 *
 * The schema intentionally does not define a foreign key from
 * reference_id because reference_type may refer to:
 *
 * - INVOICE
 * - PAYMENT
 * - RETURN
 * - ADJUSTMENT
 *
 * Returns/adjustments may be backed by their own tables later.
 */

const { pool } = require("../db/connection");

/**
 * Supported ledger entry types from schema.sql.
 */
const ENTRY_TYPES = Object.freeze([
  "INVOICE",
  "PAYMENT",
  "RETURN",
  "ADJUSTMENT",
]);

/**
 * Supported reference types from schema.sql.
 */
const REFERENCE_TYPES = Object.freeze([
  "INVOICE",
  "PAYMENT",
  "RETURN",
  "ADJUSTMENT",
]);

/**
 * Return whether a value is a valid supported ledger entry type.
 */
const isValidEntryType = (value) => {
  return ENTRY_TYPES.includes(value);
};

/**
 * Return whether a value is a valid supported reference type.
 */
const isValidReferenceType = (value) => {
  return REFERENCE_TYPES.includes(value);
};

/**
 * Validate required organisation ID.
 */
const requireOrganisationId = (organisationId) => {
  if (!organisationId) {
    throw new Error("organisationId is required.");
  }
};

/**
 * Validate required customer ID.
 */
const requireCustomerId = (customerId) => {
  if (!customerId) {
    throw new Error("customerId is required.");
  }
};

/**
 * Validate UUID-like identifiers.
 *
 * PostgreSQL ultimately validates UUID values as well, but
 * explicit validation here gives the service a clearer error.
 */
const requireId = (value, fieldName) => {
  if (!value) {
    throw new Error(`${fieldName} is required.`);
  }
};

/**
 * Validate ledger entry type.
 */
const requireEntryType = (entryType) => {
  if (!isValidEntryType(entryType)) {
    throw new Error(
      `Invalid entryType. Supported values: ${ENTRY_TYPES.join(", ")}.`,
    );
  }
};

/**
 * Validate ledger reference type.
 */
const requireReferenceType = (referenceType) => {
  if (!isValidReferenceType(referenceType)) {
    throw new Error(
      `Invalid referenceType. Supported values: ${REFERENCE_TYPES.join(", ")}.`,
    );
  }
};

/**
 * Validate that a customer belongs to the organisation.
 *
 * If branchId is supplied, also verify that the branch belongs
 * to the same organisation.
 */
const validateOwnership = async ({
  organisationId,
  customerId,
  branchId = null,
  client = null,
}) => {
  requireOrganisationId(organisationId);
  requireCustomerId(customerId);

  const db = client || pool;

  const customerResult = await db.query(
    `
      SELECT
          c.id,
          c.organisation_id
      FROM customers c
      WHERE c.id = $1
        AND c.organisation_id = $2
      LIMIT 1;
    `,
    [customerId, organisationId],
  );

  if (customerResult.rowCount === 0) {
    throw new Error("Customer does not belong to the specified organisation.");
  }

  if (branchId !== null && branchId !== undefined) {
    const branchResult = await db.query(
      `
        SELECT
            b.id,
            b.organisation_id
        FROM branches b
        WHERE b.id = $1
          AND b.organisation_id = $2
        LIMIT 1;
      `,
      [branchId, organisationId],
    );

    if (branchResult.rowCount === 0) {
      throw new Error("Branch does not belong to the specified organisation.");
    }
  }
};

/**
 * Create a customer ledger entry.
 *
 * The caller supplies balance_after.
 *
 * This repository does not calculate the running balance because
 * doing so would be business logic and would require transaction-
 * level coordination with all preceding ledger entries.
 *
 * If client is supplied, the caller owns the transaction.
 */
const createCustomerLedgerEntry = async ({
  organisationId,
  customerId,
  branchId = null,
  entryType,
  referenceType,
  referenceId,
  debitAmount = 0,
  creditAmount = 0,
  balanceAfter,
  entryDate = null,
  description = null,
  client = null,
}) => {
  requireOrganisationId(organisationId);
  requireCustomerId(customerId);
  requireEntryType(entryType);
  requireReferenceType(referenceType);
  requireId(referenceId, "referenceId");

  if (balanceAfter === undefined || balanceAfter === null) {
    throw new Error("balanceAfter is required.");
  }

  await validateOwnership({
    organisationId,
    customerId,
    branchId,
    client,
  });

  const db = client || pool;

  const result = await db.query(
    `
      INSERT INTO customer_ledger_entries (
          organisation_id,
          customer_id,
          branch_id,
          entry_type,
          reference_type,
          reference_id,
          debit_amount,
          credit_amount,
          balance_after,
          entry_date,
          description
      )
      VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          COALESCE($10, CURRENT_TIMESTAMP),
          $11
      )
      RETURNING
          id,
          organisation_id,
          customer_id,
          branch_id,
          entry_type,
          reference_type,
          reference_id,
          debit_amount,
          credit_amount,
          balance_after,
          entry_date,
          description,
          created_at;
    `,
    [
      organisationId,
      customerId,
      branchId,
      entryType,
      referenceType,
      referenceId,
      debitAmount,
      creditAmount,
      balanceAfter,
      entryDate,
      description,
    ],
  );

  return result.rows[0];
};

/**
 * Get one ledger entry by ID.
 *
 * Tenant-safe.
 */
const getCustomerLedgerEntryById = async (organisationId, ledgerEntryId) => {
  requireOrganisationId(organisationId);
  requireId(ledgerEntryId, "ledgerEntryId");

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
        AND cle.id = $2
      LIMIT 1;
    `,
    [organisationId, ledgerEntryId],
  );

  return result.rows[0] || null;
};

/**
 * Get customer ledger statement.
 *
 * Ordered newest first, matching the schema's primary customer
 * ledger access pattern.
 */
const getCustomerLedgerEntriesByCustomer = async (
  organisationId,
  customerId,
  limit = 100,
  offset = 0,
) => {
  requireOrganisationId(organisationId);
  requireCustomerId(customerId);

  await validateOwnership({
    organisationId,
    customerId,
  });

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
        AND cle.customer_id = $2
      ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, customerId, limit, offset],
  );

  return result.rows;
};

/**
 * Get ledger entries by branch.
 *
 * Useful for branch-level financial reporting.
 */
const getCustomerLedgerEntriesByBranch = async (
  organisationId,
  branchId,
  limit = 100,
  offset = 0,
) => {
  requireOrganisationId(organisationId);
  requireId(branchId, "branchId");

  const branchResult = await pool.query(
    `
      SELECT id
      FROM branches
      WHERE id = $1
        AND organisation_id = $2
      LIMIT 1;
    `,
    [branchId, organisationId],
  );

  if (branchResult.rowCount === 0) {
    throw new Error("Branch does not belong to the specified organisation.");
  }

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
        AND cle.branch_id = $2
      ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC
      LIMIT $3
      OFFSET $4;
    `,
    [organisationId, branchId, limit, offset],
  );

  return result.rows;
};

/**
 * Get all ledger entries for an organisation.
 *
 * Useful for organisation-level reporting.
 */
const getCustomerLedgerEntriesByOrganisation = async (
  organisationId,
  limit = 100,
  offset = 0,
) => {
  requireOrganisationId(organisationId);

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
      ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC
      LIMIT $2
      OFFSET $3;
    `,
    [organisationId, limit, offset],
  );

  return result.rows;
};

/**
 * Get ledger entries associated with a source reference.
 *
 * Example:
 *
 * referenceType = INVOICE
 * referenceId   = invoice UUID
 *
 * The reference itself is not a FK in schema.sql.
 */
const getCustomerLedgerEntriesByReference = async (
  organisationId,
  referenceType,
  referenceId,
) => {
  requireOrganisationId(organisationId);
  requireReferenceType(referenceType);
  requireId(referenceId, "referenceId");

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
        AND cle.reference_type = $2
        AND cle.reference_id = $3
      ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC;
    `,
    [organisationId, referenceType, referenceId],
  );

  return result.rows;
};

/**
 * Get the latest ledger entry for a customer.
 *
 * Useful when the service needs the current persisted
 * balance_after value before creating another ledger entry.
 */
const getLatestCustomerLedgerEntry = async (organisationId, customerId) => {
  requireOrganisationId(organisationId);
  requireCustomerId(customerId);

  await validateOwnership({
    organisationId,
    customerId,
  });

  const result = await pool.query(
    `
      SELECT
          cle.id,
          cle.organisation_id,
          cle.customer_id,
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
      WHERE cle.organisation_id = $1
        AND cle.customer_id = $2
      ORDER BY
          cle.entry_date DESC,
          cle.created_at DESC,
          cle.id DESC
      LIMIT 1;
    `,
    [organisationId, customerId],
  );

  return result.rows[0] || null;
};

/**
 * Delete a ledger entry.
 *
 * This is intentionally exposed only for controlled administrative
 * cleanup/testing.
 *
 * Normal financial application flows should treat ledger entries
 * as append-only and should not delete finalized financial history.
 */
const deleteCustomerLedgerEntry = async (
  organisationId,
  ledgerEntryId,
  client = null,
) => {
  requireOrganisationId(organisationId);
  requireId(ledgerEntryId, "ledgerEntryId");

  const db = client || pool;

  const result = await db.query(
    `
      DELETE FROM customer_ledger_entries
      WHERE organisation_id = $1
        AND id = $2
      RETURNING id;
    `,
    [organisationId, ledgerEntryId],
  );

  return result.rowCount > 0;
};

module.exports = {
  ENTRY_TYPES,
  REFERENCE_TYPES,

  createCustomerLedgerEntry,

  getCustomerLedgerEntryById,
  getCustomerLedgerEntriesByCustomer,
  getCustomerLedgerEntriesByBranch,
  getCustomerLedgerEntriesByOrganisation,
  getCustomerLedgerEntriesByReference,
  getLatestCustomerLedgerEntry,

  deleteCustomerLedgerEntry,
};
