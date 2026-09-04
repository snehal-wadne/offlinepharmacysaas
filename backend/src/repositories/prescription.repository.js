/**
 * Prescription Repository
 *
 * Purpose:
 * Handles all direct database operations related to prescriptions.
 *
 * The repository layer is responsible for:
 * - PostgreSQL queries
 * - Tenant-safe prescription access
 * - Prescription business-number generation
 * - Customer ownership validation through tenant-scoped queries
 * - Redis caching for individual prescription reads
 *
 * The repository does NOT handle:
 * - HTTP request/response logic
 * - Authentication/authorization
 * - User permissions
 * - Complex business rules
 *
 * Application flow:
 *
 * Controller
 *     ↓
 * Service
 *     ↓
 * Prescription Repository
 *     ↓
 * PostgreSQL
 *
 * Redis is used only as a read cache.
 */

const { pool } = require("../db/connection");

const { getCache, setCache, deleteCache } = require("../cache/cache");

const { getNextBusinessNumber } = require("./number-sequence.repository");

/**
 * Cache TTL in seconds.
 *
 * PostgreSQL remains the source of truth.
 */
const PRESCRIPTION_CACHE_TTL = 60;

/**
 * Builds the tenant-safe cache key used for an individual
 * prescription.
 *
 * organisation_id is deliberately included so that the same
 * prescription UUID can never resolve through another
 * organisation's cache namespace.
 *
 * @param {string} organisationId
 * @param {string} prescriptionId
 *
 * @returns {string}
 */
const buildPrescriptionCacheKey = (organisationId, prescriptionId) =>
  `organisation:${organisationId}:prescription:${prescriptionId}`;

/**
 * Explicit prescription columns.
 *
 * Keeping the column list explicit prevents accidental exposure
 * of future columns added to the table.
 */
const PRESCRIPTION_COLUMNS = `
    id,
    organisation_id,
    customer_id,
    prescription_number,
    prescription_reference,
    doctor_name,
    specialization,
    hospital_or_clinic,
    doctor_registration_number,
    chronic_conditions,
    drug_allergies,
    prescription_date,
    status,
    notes,
    created_at,
    updated_at
`;

/**
 * Create a new prescription.
 *
 * Prescription numbers are organisation-scoped and generated
 * through number-sequence.repository.js.
 *
 * IMPORTANT:
 * The generated RX number and prescription INSERT occur inside
 * the same PostgreSQL transaction.
 *
 * The customer is validated against the same organisation as
 * part of the INSERT query:
 *
 *     customer.id = customerId
 *     customer.organisation_id = organisationId
 *
 * This prevents a prescription in Organisation A from being
 * accidentally associated with a customer belonging to
 * Organisation B.
 *
 * If a transaction client is supplied, the caller owns the
 * transaction.
 *
 * If no client is supplied, this function creates and manages
 * its own transaction.
 *
 * @param {Object} prescription
 * @param {string} prescription.organisationId
 * @param {string} prescription.customerId
 * @param {string|null} prescription.prescriptionReference
 * @param {string} prescription.doctorName
 * @param {string|null} prescription.specialization
 * @param {string|null} prescription.hospitalOrClinic
 * @param {string|null} prescription.doctorRegistrationNumber
 * @param {string|null} prescription.chronicConditions
 * @param {string|null} prescription.drugAllergies
 * @param {string|null} prescription.prescriptionDate
 * @param {string|null} prescription.status
 * @param {string|null} prescription.notes
 * @param {Object|null} client PostgreSQL transaction client
 *
 * @returns {Promise<Object>} Newly created prescription
 */
const createPrescription = async ({
  organisationId,
  customerId,
  prescriptionReference = null,
  doctorName,
  specialization = null,
  hospitalOrClinic = null,
  doctorRegistrationNumber = null,
  chronicConditions = null,
  drugAllergies = null,
  prescriptionDate = null,
  status = "ACTIVE",
  notes = null,
  client = null,
}) => {
  let dbClient = client;
  let ownsTransaction = false;

  try {
    /**
     * Create a transaction when the caller did not provide one.
     */
    if (!dbClient) {
      dbClient = await pool.connect();
      ownsTransaction = true;

      await dbClient.query("BEGIN");
    }

    /**
     * Generate organisation-scoped prescription number.
     */
    const prescriptionNumber = await getNextBusinessNumber({
      organisationId,
      branchId: null,
      sequenceType: "PRESCRIPTION",
      client: dbClient,
    });

    /**
     * Insert through a tenant-scoped customer lookup.
     *
     * This is intentionally NOT:
     *
     * INSERT ... VALUES (..., customerId, ...)
     *
     * because that would allow a caller to provide:
     *
     * organisation A
     * customer belonging to organisation B
     *
     * while still satisfying the customer_id foreign key.
     */
    const query = `
        INSERT INTO prescriptions (
            organisation_id,
            customer_id,
            prescription_number,
            prescription_reference,
            doctor_name,
            specialization,
            hospital_or_clinic,
            doctor_registration_number,
            chronic_conditions,
            drug_allergies,
            prescription_date,
            status,
            notes
        )
        SELECT
            $1,
            c.id,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            COALESCE($10::DATE, CURRENT_DATE),
            $11,
            $12
        FROM customers c
        WHERE c.id = $13
          AND c.organisation_id = $1
        RETURNING
            ${PRESCRIPTION_COLUMNS};
    `;

    const values = [
      organisationId,
      prescriptionNumber,
      prescriptionReference,
      doctorName,
      specialization,
      hospitalOrClinic,
      doctorRegistrationNumber,
      chronicConditions,
      drugAllergies,
      prescriptionDate,
      status,
      notes,
      customerId,
    ];

    const result = await dbClient.query(query, values);

    /**
     * If the customer does not belong to this organisation,
     * the INSERT returns no row.
     */
    if (result.rowCount === 0) {
      throw new Error("Customer not found in the specified organisation.");
    }

    const prescription = result.rows[0];

    /**
     * Commit only when this repository owns the transaction.
     */
    if (ownsTransaction) {
      await dbClient.query("COMMIT");
    }

    return prescription;
  } catch (error) {
    /**
     * Roll back only transactions created by this repository.
     */
    if (ownsTransaction && dbClient) {
      try {
        await dbClient.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Prescription transaction rollback failed:",
          rollbackError.message,
        );
      }
    }

    throw error;
  } finally {
    /**
     * Do not release a transaction client supplied by the caller.
     */
    if (ownsTransaction && dbClient) {
      dbClient.release();
    }
  }
};

/**
 * Get a prescription by ID.
 *
 * Tenant isolation is enforced through organisation_id.
 *
 * Individual prescription records are cached because detail
 * reads are expected to be frequent.
 *
 * @param {string} organisationId
 * @param {string} prescriptionId
 *
 * @returns {Promise<Object|null>}
 */
const getPrescriptionById = async (organisationId, prescriptionId) => {
  const cacheKey = buildPrescriptionCacheKey(organisationId, prescriptionId);

  /**
   * Cache-aside read.
   */
  try {
    const cachedPrescription = await getCache(cacheKey);

    if (cachedPrescription) {
      return cachedPrescription;
    }
  } catch (cacheError) {
    /**
     * Redis is an optimization, not a dependency.
     */
    console.error(
      "Cache read failed for getPrescriptionById:",
      cacheError.message,
    );
  }

  const query = `
        SELECT
            ${PRESCRIPTION_COLUMNS}
        FROM prescriptions
        WHERE id = $1
          AND organisation_id = $2;
    `;

  const values = [prescriptionId, organisationId];

  const result = await pool.query(query, values);

  const prescription = result.rows[0] || null;

  /**
   * Cache only existing records.
   */
  if (prescription) {
    try {
      await setCache(cacheKey, prescription, PRESCRIPTION_CACHE_TTL);
    } catch (cacheError) {
      console.error(
        "Cache write failed for getPrescriptionById:",
        cacheError.message,
      );
    }
  }

  return prescription;
};

/**
 * Get prescriptions belonging to a customer.
 *
 * The customer itself is also tenant-scoped in the query.
 *
 * Lists are intentionally not cached.
 *
 * @param {string} organisationId
 * @param {string} customerId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPrescriptionsByCustomer = async (
  organisationId,
  customerId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${PRESCRIPTION_COLUMNS}
        FROM prescriptions
        WHERE organisation_id = $1
          AND customer_id = $2
        ORDER BY prescription_date DESC, created_at DESC, id DESC
        LIMIT $3
        OFFSET $4;
    `;

  const values = [organisationId, customerId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Get prescriptions belonging to an organisation.
 *
 * This is useful for organisation-level prescription
 * administration/search screens.
 *
 * Lists are intentionally not cached.
 *
 * @param {string} organisationId
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const getPrescriptionsByOrganisation = async (
  organisationId,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${PRESCRIPTION_COLUMNS}
        FROM prescriptions
        WHERE organisation_id = $1
        ORDER BY prescription_date DESC, created_at DESC, id DESC
        LIMIT $2
        OFFSET $3;
    `;

  const values = [organisationId, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Search prescriptions within an organisation.
 *
 * Searchable fields:
 * - system prescription number
 * - external prescription reference
 * - doctor name
 * - specialization
 * - hospital/clinic
 * - doctor registration number
 *
 * @param {string} organisationId
 * @param {string} searchTerm
 * @param {number} limit
 * @param {number} offset
 *
 * @returns {Promise<Object[]>}
 */
const searchPrescriptions = async (
  organisationId,
  searchTerm,
  limit = 50,
  offset = 0,
) => {
  const query = `
        SELECT
            ${PRESCRIPTION_COLUMNS}
        FROM prescriptions
        WHERE organisation_id = $1
          AND (
                prescription_number ILIKE $2
                OR prescription_reference ILIKE $2
                OR doctor_name ILIKE $2
                OR specialization ILIKE $2
                OR hospital_or_clinic ILIKE $2
                OR doctor_registration_number ILIKE $2
          )
        ORDER BY prescription_date DESC, created_at DESC, id DESC
        LIMIT $3
        OFFSET $4;
    `;

  const searchPattern = `%${searchTerm}%`;

  const values = [organisationId, searchPattern, limit, offset];

  const result = await pool.query(query, values);

  return result.rows;
};

/**
 * Update a prescription.
 *
 * prescription_number is intentionally immutable.
 *
 * organisation_id and customer_id are also not changed here.
 * Changing the owner/customer of an existing prescription is a
 * business operation that should be handled explicitly by the
 * service layer if ever required.
 *
 * @param {string} organisationId
 * @param {string} prescriptionId
 * @param {Object} prescription
 *
 * @returns {Promise<Object|null>}
 */
const updatePrescription = async (
  organisationId,
  prescriptionId,
  {
    prescriptionReference = null,
    doctorName,
    specialization = null,
    hospitalOrClinic = null,
    doctorRegistrationNumber = null,
    chronicConditions = null,
    drugAllergies = null,
    prescriptionDate = null,
    status = "ACTIVE",
    notes = null,
  },
) => {
  const query = `
        UPDATE prescriptions
        SET
            prescription_reference = $1,
            doctor_name = $2,
            specialization = $3,
            hospital_or_clinic = $4,
            doctor_registration_number = $5,
            chronic_conditions = $6,
            drug_allergies = $7,
            prescription_date = $8,
            status = $9,
            notes = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
          AND organisation_id = $12
        RETURNING
            ${PRESCRIPTION_COLUMNS};
    `;

  const values = [
    prescriptionReference,
    doctorName,
    specialization,
    hospitalOrClinic,
    doctorRegistrationNumber,
    chronicConditions,
    drugAllergies,
    prescriptionDate,
    status,
    notes,
    prescriptionId,
    organisationId,
  ];

  const result = await pool.query(query, values);

  const updatedPrescription = result.rows[0] || null;

  /**
   * Invalidate the individual prescription cache after
   * PostgreSQL has successfully updated the record.
   */
  if (updatedPrescription) {
    const cacheKey = buildPrescriptionCacheKey(organisationId, prescriptionId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for updatePrescription:",
        cacheError.message,
      );
    }
  }

  return updatedPrescription;
};

/**
 * Delete a prescription.
 *
 * The current schema allows deletion and sets any referencing
 * invoice prescription_id to NULL through ON DELETE SET NULL.
 *
 * In normal business workflows, the service layer should decide
 * whether deletion is appropriate. For example, an existing
 * prescription referenced by completed business records may be
 * better marked CANCELLED rather than physically deleted.
 *
 * @param {string} organisationId
 * @param {string} prescriptionId
 *
 * @returns {Promise<boolean>}
 */
const deletePrescription = async (organisationId, prescriptionId) => {
  const query = `
        DELETE FROM prescriptions
        WHERE id = $1
          AND organisation_id = $2
        RETURNING id;
    `;

  const values = [prescriptionId, organisationId];

  const result = await pool.query(query, values);

  const deleted = result.rowCount > 0;

  /**
   * Invalidate the individual cache after a successful delete.
   */
  if (deleted) {
    const cacheKey = buildPrescriptionCacheKey(organisationId, prescriptionId);

    try {
      await deleteCache(cacheKey);
    } catch (cacheError) {
      console.error(
        "Cache invalidation failed for deletePrescription:",
        cacheError.message,
      );
    }
  }

  return deleted;
};

module.exports = {
  createPrescription,
  getPrescriptionById,
  getPrescriptionsByCustomer,
  getPrescriptionsByOrganisation,
  searchPrescriptions,
  updatePrescription,
  deletePrescription,
};
