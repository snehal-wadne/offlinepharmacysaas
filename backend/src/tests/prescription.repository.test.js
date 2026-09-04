/**
 * Prescription Repository Test
 *
 * Purpose:
 * Verifies prescription creation, organisation-scoped
 * numbering, retrieval, customer history, organisation
 * listing, searching, updating, deletion, tenant isolation,
 * Redis cache behavior, and transaction rollback behavior
 * implemented by prescription.repository.js.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - Redis to be running
 * - The current database schema to be applied
 */

const {
  createPrescription,
  getPrescriptionById,
  getPrescriptionsByCustomer,
  getPrescriptionsByOrganisation,
  searchPrescriptions,
  updatePrescription,
  deletePrescription,
} = require("../repositories/prescription.repository");

const { createCustomer } = require("../repositories/customer.repository");

const { pool } = require("../db/connection");

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { deleteCache } = require("../cache/cache");

/**
 * Simple assertion helper.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Builds the same tenant-safe cache key used by
 * prescription.repository.js.
 */
const buildPrescriptionCacheKey = (organisationId, prescriptionId) =>
  `organisation:${organisationId}:prescription:${prescriptionId}`;

/**
 * Creates an isolated test user and organisation.
 */
const createTestOrganisation = async (label) => {
  const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const userResult = await pool.query(
    `
        INSERT INTO users (
            email,
            password_hash,
            name
        )
        VALUES ($1, $2, $3)
        RETURNING id;
      `,
    [
      `prescription-${label}-${uniqueValue}@example.com`,
      "test-password-hash",
      `Prescription Test User ${label}`,
    ],
  );

  const userId = userResult.rows[0].id;

  const organisationResult = await pool.query(
    `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
    [userId, `Prescription Test Organisation ${label} ${uniqueValue}`],
  );

  return {
    userId,
    organisationId: organisationResult.rows[0].id,
  };
};

/**
 * Main test runner.
 */
const runTests = async () => {
  let organisationA = null;
  let organisationB = null;

  let customerA = null;
  let customerB = null;

  let prescription = null;
  let prescriptionId = null;

  try {
    // --------------------------------------------------------
    // 1. CONNECT REDIS
    // --------------------------------------------------------

    await connectRedis();

    console.log("Redis connection successful.");

    // --------------------------------------------------------
    // 2. CREATE TWO ISOLATED ORGANISATIONS
    // --------------------------------------------------------

    console.log("--- Creating isolated test organisations ---");

    organisationA = await createTestOrganisation("A");

    organisationB = await createTestOrganisation("B");

    console.log({
      organisationA,
      organisationB,
    });

    assert(
      organisationA.organisationId !== organisationB.organisationId,
      "Test organisations must be different.",
    );

    // --------------------------------------------------------
    // 3. CREATE CUSTOMER A
    // --------------------------------------------------------

    console.log("--- Creating customer for Organisation A ---");

    customerA = await createCustomer({
      organisationId: organisationA.organisationId,
      fullName: "Rajesh Verma",
      phone: "9876543210",
      email: "rajesh@example.com",
      dateOfBirth: "1990-05-15",
      gender: "MALE",
      category: "REGULAR",
      address: "Pune, Maharashtra",
    });

    console.log(customerA);

    assert(
      customerA.customer_number === "CUST-1001",
      "Organisation A customer should receive CUST-1001.",
    );

    // --------------------------------------------------------
    // 4. CREATE CUSTOMER B
    // --------------------------------------------------------

    console.log("--- Creating customer for Organisation B ---");

    customerB = await createCustomer({
      organisationId: organisationB.organisationId,
      fullName: "Priya Sharma",
      phone: "9123456780",
      email: "priya@example.com",
      dateOfBirth: "1995-08-20",
      gender: "FEMALE",
      category: "CORPORATE",
      address: "Mumbai, Maharashtra",
    });

    console.log(customerB);

    assert(
      customerB.customer_number === "CUST-1001",
      "Organisation B should have an independent customer sequence.",
    );

    // --------------------------------------------------------
    // 5. TEST CROSS-TENANT CUSTOMER PROTECTION
    // --------------------------------------------------------

    console.log("--- Testing cross-tenant customer protection ---");

    let crossTenantError = null;

    try {
      await createPrescription({
        organisationId: organisationA.organisationId,

        /**
         * Customer B belongs to Organisation B.
         *
         * This must be rejected.
         */
        customerId: customerB.id,

        prescriptionReference: "EXT-CROSS-TENANT",
        doctorName: "Dr. Invalid Tenant",
        specialization: "General Medicine",
      });
    } catch (error) {
      crossTenantError = error;
    }

    assert(
      crossTenantError !== null,
      "Prescription creation must reject a customer belonging to another organisation.",
    );

    assert(
      crossTenantError.message.includes(
        "Customer not found in the specified organisation",
      ),
      "Cross-tenant customer failure should have the expected error.",
    );

    console.log("Cross-tenant customer protection verified.");

    // --------------------------------------------------------
    // 6. VERIFY FAILED CREATION DID NOT CONSUME RX NUMBER
    // --------------------------------------------------------

    console.log("--- Verifying failed prescription transaction rollback ---");

    const sequenceAfterFailure = await pool.query(
      `
          SELECT
              next_number
          FROM number_sequences
          WHERE organisation_id = $1
            AND branch_id IS NULL
            AND sequence_type = 'PRESCRIPTION';
        `,
      [organisationA.organisationId],
    );

    /**
     * Because the failed prescription creation rolled back
     * the entire transaction, even the newly created sequence
     * row should have disappeared.
     */
    assert(
      sequenceAfterFailure.rowCount === 0,
      "Failed prescription creation should roll back the newly created prescription sequence.",
    );

    console.log("Prescription sequence rollback verified.");

    // --------------------------------------------------------
    // 7. CREATE PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Creating prescription ---");

    prescription = await createPrescription({
      organisationId: organisationA.organisationId,

      customerId: customerA.id,

      prescriptionReference: "RX-EXT-2026-001",

      doctorName: "Dr. Rahul Sharma",

      specialization: "Cardiology",

      hospitalOrClinic: "City Care Hospital",

      doctorRegistrationNumber: "MH-MED-123456",

      chronicConditions: "Hypertension",

      drugAllergies: "Penicillin",

      prescriptionDate: "2026-09-01",

      status: "ACTIVE",

      notes: "Continue medication as prescribed.",
    });

    prescriptionId = prescription.id;

    console.log(prescription);

    assert(prescription.id, "Created prescription should have an ID.");

    assert(
      prescription.organisation_id === organisationA.organisationId,
      "Prescription should belong to Organisation A.",
    );

    assert(
      prescription.customer_id === customerA.id,
      "Prescription should belong to Customer A.",
    );

    assert(
      prescription.prescription_number === "RX-1001",
      "First successful prescription should receive RX-1001.",
    );

    assert(
      prescription.prescription_reference === "RX-EXT-2026-001",
      "Prescription should contain the external reference.",
    );

    assert(
      prescription.doctor_name === "Dr. Rahul Sharma",
      "Prescription should contain the correct doctor name.",
    );

    assert(
      prescription.specialization === "Cardiology",
      "Prescription should contain the correct specialization.",
    );

    assert(
      prescription.hospital_or_clinic === "City Care Hospital",
      "Prescription should contain the correct hospital/clinic.",
    );

    assert(
      prescription.doctor_registration_number === "MH-MED-123456",
      "Prescription should contain the doctor registration number.",
    );

    assert(
      prescription.chronic_conditions === "Hypertension",
      "Prescription should contain chronic conditions.",
    );

    assert(
      prescription.drug_allergies === "Penicillin",
      "Prescription should contain drug allergies.",
    );

    assert(
      prescription.status === "ACTIVE",
      "Prescription should have ACTIVE status.",
    );

    console.log(
      "Prescription creation and transactional numbering successful.",
    );

    // --------------------------------------------------------
    // 8. VERIFY PRESCRIPTION CACHE KEY
    // --------------------------------------------------------

    console.log("--- Verifying tenant-safe prescription cache key ---");

    const cacheKey = buildPrescriptionCacheKey(
      organisationA.organisationId,
      prescriptionId,
    );

    const otherOrganisationCacheKey = buildPrescriptionCacheKey(
      organisationB.organisationId,
      prescriptionId,
    );

    assert(
      cacheKey !== otherOrganisationCacheKey,
      "Different organisations must have different prescription cache keys.",
    );

    console.log("Tenant-safe prescription cache key verified.");

    // --------------------------------------------------------
    // 9. CACHE MISS
    // --------------------------------------------------------

    console.log("--- Testing prescription cache miss ---");

    await deleteCache(cacheKey);

    const firstFetch = await getPrescriptionById(
      organisationA.organisationId,
      prescriptionId,
    );

    console.log(firstFetch);

    assert(
      firstFetch !== null,
      "Prescription should be returned on cache miss.",
    );

    assert(
      firstFetch.id === prescriptionId,
      "Fetched prescription ID should match.",
    );

    assert(
      firstFetch.prescription_number === "RX-1001",
      "Fetched prescription should contain RX-1001.",
    );

    console.log("Prescription cache miss successful.");

    // --------------------------------------------------------
    // 10. VERIFY REDIS CACHE
    // --------------------------------------------------------

    console.log("--- Verifying prescription was cached ---");

    const cachedPrescription = await redisClient.get(cacheKey);

    assert(
      cachedPrescription !== null,
      "Prescription should be stored in Redis.",
    );

    const parsedCachedPrescription = JSON.parse(cachedPrescription);

    assert(
      parsedCachedPrescription.id === prescriptionId,
      "Cached prescription ID should match.",
    );

    assert(
      parsedCachedPrescription.prescription_number === "RX-1001",
      "Cached prescription should contain the correct number.",
    );

    assert(
      parsedCachedPrescription.doctor_name === "Dr. Rahul Sharma",
      "Cached prescription should contain the correct doctor.",
    );

    console.log("Prescription successfully cached in Redis.");

    // --------------------------------------------------------
    // 11. CACHE HIT
    // --------------------------------------------------------

    console.log("--- Testing prescription cache hit ---");

    const secondFetch = await getPrescriptionById(
      organisationA.organisationId,
      prescriptionId,
    );

    console.log(secondFetch);

    assert(
      secondFetch !== null,
      "Prescription should be returned on cache hit.",
    );

    assert(
      secondFetch.id === prescriptionId,
      "Cache-hit prescription ID should match.",
    );

    assert(
      secondFetch.doctor_name === "Dr. Rahul Sharma",
      "Cache-hit prescription should contain the correct doctor.",
    );

    console.log("Prescription cache hit successful.");

    // --------------------------------------------------------
    // 12. TENANT ISOLATION ON READ
    // --------------------------------------------------------

    console.log("--- Testing prescription tenant isolation ---");

    const prescriptionFromOtherOrganisation = await getPrescriptionById(
      organisationB.organisationId,
      prescriptionId,
    );

    assert(
      prescriptionFromOtherOrganisation === null,
      "Prescription must not be accessible through another organisation.",
    );

    console.log("Prescription tenant isolation verified.");

    // --------------------------------------------------------
    // 13. GET PRESCRIPTIONS BY CUSTOMER
    // --------------------------------------------------------

    console.log("--- Getting prescriptions by customer ---");

    const customerPrescriptions = await getPrescriptionsByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    console.log(customerPrescriptions);

    const customerPrescription = customerPrescriptions.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      customerPrescription,
      "Created prescription should appear in customer prescription history.",
    );

    assert(
      customerPrescription.customer_id === customerA.id,
      "Customer prescription history should contain the correct customer.",
    );

    assert(
      customerPrescription.prescription_number === "RX-1001",
      "Customer prescription history should contain RX-1001.",
    );

    console.log("Customer prescription history successful.");

    // --------------------------------------------------------
    // 14. VERIFY CUSTOMER TENANT ISOLATION IN HISTORY
    // --------------------------------------------------------

    console.log(
      "--- Testing customer prescription history tenant isolation ---",
    );

    const wrongTenantCustomerHistory = await getPrescriptionsByCustomer(
      organisationB.organisationId,
      customerA.id,
    );

    assert(
      wrongTenantCustomerHistory.length === 0,
      "Customer prescription history must be tenant-scoped.",
    );

    console.log("Customer prescription history tenant isolation verified.");

    // --------------------------------------------------------
    // 15. GET PRESCRIPTIONS BY ORGANISATION
    // --------------------------------------------------------

    console.log("--- Getting prescriptions by organisation ---");

    const organisationPrescriptions = await getPrescriptionsByOrganisation(
      organisationA.organisationId,
    );

    console.log(organisationPrescriptions);

    const organisationPrescription = organisationPrescriptions.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      organisationPrescription,
      "Created prescription should appear in organisation prescription list.",
    );

    console.log("Organisation prescription listing successful.");

    // --------------------------------------------------------
    // 16. VERIFY OTHER ORGANISATION CANNOT SEE IT
    // --------------------------------------------------------

    console.log("--- Testing organisation prescription isolation ---");

    const otherOrganisationPrescriptions = await getPrescriptionsByOrganisation(
      organisationB.organisationId,
    );

    const leakedPrescription = otherOrganisationPrescriptions.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      !leakedPrescription,
      "Prescription must not appear in another organisation's prescription list.",
    );

    console.log("Organisation-level prescription isolation verified.");

    // --------------------------------------------------------
    // 17. SEARCH BY PRESCRIPTION NUMBER
    // --------------------------------------------------------

    console.log("--- Searching prescription by system number ---");

    const numberResults = await searchPrescriptions(
      organisationA.organisationId,
      "RX-1001",
    );

    console.log(numberResults);

    const numberMatch = numberResults.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      numberMatch,
      "Prescription should be searchable by system prescription number.",
    );

    console.log("Prescription-number search successful.");

    // --------------------------------------------------------
    // 18. SEARCH BY EXTERNAL REFERENCE
    // --------------------------------------------------------

    console.log("--- Searching prescription by external reference ---");

    const referenceResults = await searchPrescriptions(
      organisationA.organisationId,
      "RX-EXT-2026-001",
    );

    console.log(referenceResults);

    const referenceMatch = referenceResults.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      referenceMatch,
      "Prescription should be searchable by external reference.",
    );

    console.log("Prescription external-reference search successful.");

    // --------------------------------------------------------
    // 19. SEARCH BY DOCTOR
    // --------------------------------------------------------

    console.log("--- Searching prescription by doctor ---");

    const doctorResults = await searchPrescriptions(
      organisationA.organisationId,
      "Rahul Sharma",
    );

    console.log(doctorResults);

    const doctorMatch = doctorResults.find(
      (item) => item.id === prescriptionId,
    );

    assert(doctorMatch, "Prescription should be searchable by doctor name.");

    console.log("Prescription doctor search successful.");

    // --------------------------------------------------------
    // 20. SEARCH BY HOSPITAL / CLINIC
    // --------------------------------------------------------

    console.log("--- Searching prescription by hospital/clinic ---");

    const clinicResults = await searchPrescriptions(
      organisationA.organisationId,
      "City Care",
    );

    console.log(clinicResults);

    const clinicMatch = clinicResults.find(
      (item) => item.id === prescriptionId,
    );

    assert(
      clinicMatch,
      "Prescription should be searchable by hospital/clinic.",
    );

    console.log("Prescription clinic search successful.");

    // --------------------------------------------------------
    // 21. CREATE SECOND PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Creating second prescription ---");

    const secondPrescription = await createPrescription({
      organisationId: organisationA.organisationId,

      customerId: customerA.id,

      prescriptionReference: "RX-EXT-2026-002",

      doctorName: "Dr. Priya Patel",

      specialization: "Dermatology",

      hospitalOrClinic: "Skin Care Clinic",

      doctorRegistrationNumber: "MH-MED-654321",

      chronicConditions: null,

      drugAllergies: null,

      prescriptionDate: "2026-09-02",

      status: "ACTIVE",

      notes: "Follow-up consultation.",
    });

    console.log(secondPrescription);

    assert(
      secondPrescription.prescription_number === "RX-1002",
      "Second prescription should receive RX-1002.",
    );

    assert(
      secondPrescription.customer_id === customerA.id,
      "Second prescription should belong to Customer A.",
    );

    console.log("Sequential prescription numbering verified.");

    // --------------------------------------------------------
    // 22. VERIFY PRESCRIPTION SEQUENCE STATE
    // --------------------------------------------------------

    console.log("--- Verifying prescription sequence state ---");

    const sequenceResult = await pool.query(
      `
          SELECT
              next_number
          FROM number_sequences
          WHERE organisation_id = $1
            AND branch_id IS NULL
            AND sequence_type = 'PRESCRIPTION';
        `,
      [organisationA.organisationId],
    );

    assert(
      sequenceResult.rowCount === 1,
      "Prescription number sequence should exist.",
    );

    assert(
      Number(sequenceResult.rows[0].next_number) === 1003,
      "Prescription sequence should advance to 1003 after two successful prescriptions.",
    );

    console.log("Prescription sequence state verified.");

    // --------------------------------------------------------
    // 23. UPDATE PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Updating prescription ---");

    const updatedPrescription = await updatePrescription(
      organisationA.organisationId,
      prescriptionId,
      {
        prescriptionReference: "RX-EXT-2026-001-UPDATED",

        doctorName: "Dr. Rahul Kumar Sharma",

        specialization: "Cardiology",

        hospitalOrClinic: "Advanced Heart Care",

        doctorRegistrationNumber: "MH-MED-123456",

        chronicConditions: "Hypertension and diabetes",

        drugAllergies: "Penicillin and sulfa drugs",

        prescriptionDate: "2026-09-03",

        status: "ACTIVE",

        notes: "Updated treatment plan.",
      },
    );

    console.log(updatedPrescription);

    assert(
      updatedPrescription !== null,
      "Prescription update should return the updated prescription.",
    );

    assert(
      updatedPrescription.doctor_name === "Dr. Rahul Kumar Sharma",
      "Doctor name should be updated.",
    );

    assert(
      updatedPrescription.hospital_or_clinic === "Advanced Heart Care",
      "Hospital/clinic should be updated.",
    );

    assert(
      updatedPrescription.chronic_conditions === "Hypertension and diabetes",
      "Chronic conditions should be updated.",
    );

    assert(
      updatedPrescription.drug_allergies === "Penicillin and sulfa drugs",
      "Drug allergies should be updated.",
    );

    assert(
      updatedPrescription.notes === "Updated treatment plan.",
      "Prescription notes should be updated.",
    );

    assert(
      updatedPrescription.prescription_number === "RX-1001",
      "Prescription number must remain immutable after update.",
    );

    assert(
      updatedPrescription.customer_id === customerA.id,
      "Customer association must remain unchanged by normal update.",
    );

    console.log("Prescription update successful.");

    // --------------------------------------------------------
    // 24. VERIFY UPDATE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying prescription update cache invalidation ---");

    const cacheAfterUpdate = await redisClient.get(cacheKey);

    assert(
      cacheAfterUpdate === null,
      "Updating prescription should invalidate its Redis cache.",
    );

    console.log("Prescription update cache invalidation successful.");

    // --------------------------------------------------------
    // 25. VERIFY FRESH UPDATED PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Testing fresh prescription read after update ---");

    const freshPrescription = await getPrescriptionById(
      organisationA.organisationId,
      prescriptionId,
    );

    console.log(freshPrescription);

    assert(
      freshPrescription !== null,
      "Updated prescription should be returned after cache invalidation.",
    );

    assert(
      freshPrescription.doctor_name === "Dr. Rahul Kumar Sharma",
      "Fresh read should return the updated doctor.",
    );

    assert(
      freshPrescription.hospital_or_clinic === "Advanced Heart Care",
      "Fresh read should return updated clinic.",
    );

    assert(
      freshPrescription.prescription_number === "RX-1001",
      "Fresh read should preserve the prescription number.",
    );

    console.log("Fresh updated prescription read successful.");

    // --------------------------------------------------------
    // 26. VERIFY CACHE REPOPULATION
    // --------------------------------------------------------

    console.log("--- Verifying updated prescription was cached again ---");

    const cacheAfterFreshRead = await redisClient.get(cacheKey);

    assert(
      cacheAfterFreshRead !== null,
      "Updated prescription should be cached again.",
    );

    const parsedUpdatedCache = JSON.parse(cacheAfterFreshRead);

    assert(
      parsedUpdatedCache.doctor_name === "Dr. Rahul Kumar Sharma",
      "Updated cache should contain the new doctor name.",
    );

    assert(
      parsedUpdatedCache.hospital_or_clinic === "Advanced Heart Care",
      "Updated cache should contain the new clinic.",
    );

    console.log("Updated prescription successfully cached.");

    // --------------------------------------------------------
    // 27. CANCEL PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Testing prescription cancellation ---");

    const cancelledPrescription = await updatePrescription(
      organisationA.organisationId,
      prescriptionId,
      {
        prescriptionReference: "RX-EXT-2026-001-UPDATED",

        doctorName: "Dr. Rahul Kumar Sharma",

        specialization: "Cardiology",

        hospitalOrClinic: "Advanced Heart Care",

        doctorRegistrationNumber: "MH-MED-123456",

        chronicConditions: "Hypertension and diabetes",

        drugAllergies: "Penicillin and sulfa drugs",

        prescriptionDate: "2026-09-03",

        status: "CANCELLED",

        notes: "Prescription cancelled for testing.",
      },
    );

    console.log(cancelledPrescription);

    assert(
      cancelledPrescription !== null,
      "Prescription should be updateable to CANCELLED.",
    );

    assert(
      cancelledPrescription.status === "CANCELLED",
      "Prescription status should become CANCELLED.",
    );

    console.log("Prescription cancellation successful.");

    // --------------------------------------------------------
    // 28. DELETE SECOND PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Deleting second prescription ---");

    const deletedSecondPrescription = await deletePrescription(
      organisationA.organisationId,
      secondPrescription.id,
    );

    assert(
      deletedSecondPrescription === true,
      "Second prescription should be deleted successfully.",
    );

    console.log("Second prescription deletion successful.");

    // --------------------------------------------------------
    // 29. DELETE FIRST PRESCRIPTION
    // --------------------------------------------------------

    console.log("--- Deleting first prescription ---");

    const deletedFirstPrescription = await deletePrescription(
      organisationA.organisationId,
      prescriptionId,
    );

    assert(
      deletedFirstPrescription === true,
      "First prescription should be deleted successfully.",
    );

    prescription = null;

    console.log("First prescription deletion successful.");

    // --------------------------------------------------------
    // 30. VERIFY DELETE CACHE INVALIDATION
    // --------------------------------------------------------

    console.log("--- Verifying prescription delete cache invalidation ---");

    const cacheAfterDelete = await redisClient.get(cacheKey);

    assert(
      cacheAfterDelete === null,
      "Deleting prescription should invalidate its Redis cache.",
    );

    console.log("Prescription delete cache invalidation successful.");

    // --------------------------------------------------------
    // 31. VERIFY DELETED PRESCRIPTION RETURNS NULL
    // --------------------------------------------------------

    console.log("--- Verifying deleted prescription ---");

    const deletedPrescription = await getPrescriptionById(
      organisationA.organisationId,
      prescriptionId,
    );

    assert(
      deletedPrescription === null,
      "Deleted prescription should return null.",
    );

    console.log("Deleted prescription correctly returns null.");

    // --------------------------------------------------------
    // 32. VERIFY CUSTOMER PRESCRIPTION HISTORY IS EMPTY
    // --------------------------------------------------------

    console.log(
      "--- Verifying deleted prescriptions are removed from customer history ---",
    );

    const finalCustomerPrescriptions = await getPrescriptionsByCustomer(
      organisationA.organisationId,
      customerA.id,
    );

    assert(
      finalCustomerPrescriptions.length === 0,
      "Customer prescription history should be empty after deleting the test prescriptions.",
    );

    console.log("Customer prescription history cleanup verified.");

    // --------------------------------------------------------
    // 33. SUCCESS
    // --------------------------------------------------------

    console.log("");
    console.log("Prescription repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Prescription repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------
    // CLEANUP PRESCRIPTION
    // --------------------------------------------------------

    if (prescriptionId && organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM prescriptions
            WHERE id = $1
              AND organisation_id = $2;
          `,
          [prescriptionId, organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error("Prescription cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // CLEANUP ORGANISATIONS
    // --------------------------------------------------------

    if (organisationA) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationA.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation A cleanup failed:", cleanupError.message);
      }
    }

    if (organisationB) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [organisationB.organisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation B cleanup failed:", cleanupError.message);
      }
    }

    // --------------------------------------------------------
    // CLEANUP USERS
    // --------------------------------------------------------

    if (organisationA?.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationA.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation A user cleanup failed:",
          cleanupError.message,
        );
      }
    }

    if (organisationB?.userId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [organisationB.userId],
        );
      } catch (cleanupError) {
        console.error(
          "Organisation B user cleanup failed:",
          cleanupError.message,
        );
      }
    }

    // --------------------------------------------------------
    // DISCONNECT REDIS
    // --------------------------------------------------------

    try {
      await disconnectRedis();
    } catch (redisError) {
      console.error("Redis disconnect failed:", redisError.message);
    }

    // --------------------------------------------------------
    // CLOSE POSTGRESQL POOL
    // --------------------------------------------------------

    await pool.end();
  }
};

runTests();
