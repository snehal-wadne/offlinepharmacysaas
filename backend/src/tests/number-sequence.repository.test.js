/**
 * Number Sequence Repository Test
 *
 * Purpose:
 * Verifies business-number generation and PostgreSQL
 * concurrency behavior implemented by
 * number-sequence.repository.js.
 *
 * This is an integration test and requires:
 * - PostgreSQL to be running
 * - The current schema to be installed
 *
 * Redis is NOT required.
 *
 * Number sequences are transactional PostgreSQL state and
 * therefore must never depend on Redis.
 */

const {
  createNumberSequence,
  getNumberSequence,
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");

const { pool } = require("../db/connection");

/**
 * Simple assertion helper for integration tests.
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

/**
 * Generate a unique email so the test user does not conflict
 * with existing development data.
 */
const testEmail = `number-sequence-test-${Date.now()}@example.com`;

/**
 * Small helper for rolling back a transaction safely.
 */
const rollbackSafely = async (client) => {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    // Ignore rollback errors during test cleanup.
  }
};

/**
 * Main integration test.
 */
const runTests = async () => {
  let testUserId = null;
  let testOrganisationId = null;
  let testOrganisationBId = null;
  let testBranchId = null;

  try {
    // --------------------------------------------------------
    // 1. CREATE ISOLATED TEST USER
    // --------------------------------------------------------

    console.log("--- Creating isolated test user ---");

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
      [testEmail, "test-password-hash", "Number Sequence Test User"],
    );

    testUserId = userResult.rows[0].id;

    assert(testUserId, "Test user should be created successfully.");

    // --------------------------------------------------------
    // 2. CREATE ISOLATED TEST ORGANISATION
    // --------------------------------------------------------

    console.log("--- Creating isolated test organisation ---");

    const organisationResult = await pool.query(
      `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [testUserId, `Number Sequence Test Organisation ${Date.now()}`],
    );

    testOrganisationId = organisationResult.rows[0].id;

    assert(
      testOrganisationId,
      "Test organisation should be created successfully.",
    );

    // --------------------------------------------------------
    // 2b. CREATE SECOND ISOLATED TEST ORGANISATION (FOR ISOLATION TESTS)
    // --------------------------------------------------------

    console.log("--- Creating second isolated test organisation ---");

    const organisationBResult = await pool.query(
      `
        INSERT INTO organisations (
            owner_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [testUserId, `Number Sequence Test Organisation B ${Date.now()}`],
    );

    testOrganisationBId = organisationBResult.rows[0].id;

    assert(
      testOrganisationBId,
      "Second test organisation should be created successfully.",
    );

    // --------------------------------------------------------
    // 3. CREATE ISOLATED TEST BRANCH
    // --------------------------------------------------------

    console.log("--- Creating isolated test branch ---");

    const branchResult = await pool.query(
      `
        INSERT INTO branches (
            organisation_id,
            name
        )
        VALUES ($1, $2)
        RETURNING id;
      `,
      [testOrganisationId, `Number Sequence Test Branch ${Date.now()}`],
    );

    testBranchId = branchResult.rows[0].id;

    assert(testBranchId, "Test branch should be created successfully.");

    // --------------------------------------------------------
    // 4. TEST ORGANISATION-SCOPED CUSTOMER NUMBER
    // --------------------------------------------------------

    console.log("--- Testing CUSTOMER sequence ---");

    const customerClient = await pool.connect();

    try {
      await customerClient.query("BEGIN");

      const customerNumber = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: customerClient,
      });

      console.log({
        customerNumber,
      });

      assert(
        customerNumber === "CUST-1001",
        "First customer number should be CUST-1001.",
      );

      await customerClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(customerClient);
      throw error;
    } finally {
      customerClient.release();
    }

    // --------------------------------------------------------
    // 5. TEST NEXT CUSTOMER NUMBER
    // --------------------------------------------------------

    console.log("--- Testing second CUSTOMER number ---");

    const customerClient2 = await pool.connect();

    try {
      await customerClient2.query("BEGIN");

      const customerNumber2 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: customerClient2,
      });

      console.log({
        customerNumber2,
      });

      assert(
        customerNumber2 === "CUST-1002",
        "Second customer number should be CUST-1002.",
      );

      await customerClient2.query("COMMIT");
    } catch (error) {
      await rollbackSafely(customerClient2);
      throw error;
    } finally {
      customerClient2.release();
    }

    // --------------------------------------------------------
    // 6. TEST PRESCRIPTION SEQUENCE
    // --------------------------------------------------------

    console.log("--- Testing PRESCRIPTION sequence ---");

    const prescriptionClient = await pool.connect();

    try {
      await prescriptionClient.query("BEGIN");

      const prescriptionNumber = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "PRESCRIPTION",
        client: prescriptionClient,
      });

      console.log({
        prescriptionNumber,
      });

      assert(
        prescriptionNumber === "RX-1001",
        "First prescription number should be RX-1001.",
      );

      await prescriptionClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(prescriptionClient);
      throw error;
    } finally {
      prescriptionClient.release();
    }

    // --------------------------------------------------------
    // 7. TEST BRANCH-SCOPED INVOICE NUMBER
    // --------------------------------------------------------

    console.log("--- Testing INVOICE sequence ---");

    const invoiceClient = await pool.connect();

    try {
      await invoiceClient.query("BEGIN");

      const invoiceNumber = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "INVOICE",
        client: invoiceClient,
      });

      console.log({
        invoiceNumber,
      });

      assert(
        invoiceNumber === "INV-1001",
        "First invoice number should be INV-1001.",
      );

      await invoiceClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(invoiceClient);
      throw error;
    } finally {
      invoiceClient.release();
    }

    // --------------------------------------------------------
    // 8. TEST NEXT INVOICE NUMBER
    // --------------------------------------------------------

    console.log("--- Testing second INVOICE number ---");

    const invoiceClient2 = await pool.connect();

    try {
      await invoiceClient2.query("BEGIN");

      const invoiceNumber2 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "INVOICE",
        client: invoiceClient2,
      });

      console.log({
        invoiceNumber2,
      });

      assert(
        invoiceNumber2 === "INV-1002",
        "Second invoice number should be INV-1002.",
      );

      await invoiceClient2.query("COMMIT");
    } catch (error) {
      await rollbackSafely(invoiceClient2);
      throw error;
    } finally {
      invoiceClient2.release();
    }

    // --------------------------------------------------------
    // 9. TEST RECEIPT NUMBER
    // --------------------------------------------------------

    console.log("--- Testing RECEIPT sequence ---");

    const receiptClient = await pool.connect();

    try {
      await receiptClient.query("BEGIN");

      const receiptNumber = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "RECEIPT",
        client: receiptClient,
      });

      console.log({
        receiptNumber,
      });

      assert(
        receiptNumber === "REC-1001",
        "First receipt number should be REC-1001.",
      );

      await receiptClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(receiptClient);
      throw error;
    } finally {
      receiptClient.release();
    }

    // --------------------------------------------------------
    // 10. VERIFY ORGANISATION-SCOPED SEQUENCE
    // --------------------------------------------------------

    console.log("--- Verifying CUSTOMER sequence state ---");

    const customerSequence = await getNumberSequence({
      organisationId: testOrganisationId,
      branchId: null,
      sequenceType: "CUSTOMER",
    });

    console.log(customerSequence);

    assert(customerSequence !== null, "Customer sequence should exist.");

    assert(
      Number(customerSequence.next_number) === 1003,
      "Customer sequence should have next_number = 1003.",
    );

    // --------------------------------------------------------
    // 11. VERIFY BRANCH-SCOPED SEQUENCE
    // --------------------------------------------------------

    console.log("--- Verifying INVOICE sequence state ---");

    const invoiceSequence = await getNumberSequence({
      organisationId: testOrganisationId,
      branchId: testBranchId,
      sequenceType: "INVOICE",
    });

    console.log(invoiceSequence);

    assert(invoiceSequence !== null, "Invoice sequence should exist.");

    assert(
      Number(invoiceSequence.next_number) === 1003,
      "Invoice sequence should have next_number = 1003.",
    );

    // --------------------------------------------------------
    // 12. VERIFY DIFFERENT SEQUENCE TYPES ARE INDEPENDENT
    // --------------------------------------------------------

    console.log("--- Verifying independent sequences ---");

    assert(
      customerSequence.sequence_type === "CUSTOMER",
      "Customer sequence should have CUSTOMER type.",
    );

    assert(
      invoiceSequence.sequence_type === "INVOICE",
      "Invoice sequence should have INVOICE type.",
    );

    assert(
      customerSequence.id !== invoiceSequence.id,
      "Different sequence types should use different sequence rows.",
    );

    // --------------------------------------------------------
    // 13. VERIFY INVALID ORGANISATION-SCOPED SCOPE
    // --------------------------------------------------------

    console.log("--- Testing invalid CUSTOMER branch scope ---");

    let invalidCustomerScopeFailed = false;

    try {
      await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "CUSTOMER",
        client: pool,
      });
    } catch (error) {
      invalidCustomerScopeFailed = true;

      console.log("Expected validation error:", error.message);
    }

    assert(
      invalidCustomerScopeFailed,
      "CUSTOMER sequence must reject branchId.",
    );

    // --------------------------------------------------------
    // 14. VERIFY INVALID BRANCH-SCOPED SCOPE
    // --------------------------------------------------------

    console.log("--- Testing invalid INVOICE organisation scope ---");

    let invalidInvoiceScopeFailed = false;

    try {
      await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "INVOICE",
        client: pool,
      });
    } catch (error) {
      invalidInvoiceScopeFailed = true;

      console.log("Expected validation error:", error.message);
    }

    assert(
      invalidInvoiceScopeFailed,
      "INVOICE sequence must require branchId.",
    );

    // --------------------------------------------------------
    // 15. VERIFY TRANSACTION ROLLBACK
    // --------------------------------------------------------

    console.log("--- Testing sequence rollback ---");

    const rollbackClient = await pool.connect();

    try {
      await rollbackClient.query("BEGIN");

      const temporaryNumber = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: rollbackClient,
      });

      console.log({
        temporaryNumber,
      });

      assert(
        temporaryNumber === "CUST-1003",
        "Rolled-back number should initially be CUST-1003.",
      );

      await rollbackClient.query("ROLLBACK");
    } finally {
      rollbackClient.release();
    }

    /**
     * After rollback, the sequence must still be at 1003.
     * Therefore the next committed number should again be
     * CUST-1003.
     */
    const rollbackVerificationClient = await pool.connect();

    try {
      await rollbackVerificationClient.query("BEGIN");

      const numberAfterRollback = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: rollbackVerificationClient,
      });

      console.log({
        numberAfterRollback,
      });

      assert(
        numberAfterRollback === "CUST-1003",
        "Rolled-back sequence increment must not be committed.",
      );

      await rollbackVerificationClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(rollbackVerificationClient);
      throw error;
    } finally {
      rollbackVerificationClient.release();
    }

    // --------------------------------------------------------
    // 16. CONCURRENCY TEST
    // --------------------------------------------------------

    console.log("--- Testing concurrent CUSTOMER generation ---");

    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query("BEGIN");

      /**
       * Client A obtains the sequence lock first.
       */
      const concurrentNumberA = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: clientA,
      });

      assert(
        concurrentNumberA === "CUST-1004",
        "First concurrent number should be CUST-1004.",
      );

      /**
       * Start client B while client A still holds the row lock.
       *
       * Client B should wait rather than receiving the same number.
       */
      await clientB.query("BEGIN");

      const concurrentPromiseB = getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "CUSTOMER",
        client: clientB,
      });

      /**
       * Give client B a moment to reach the locked sequence row.
       */
      await new Promise((resolve) => setTimeout(resolve, 100));

      /**
       * Release client A.
       *
       * Client B can now obtain the row lock and continue.
       */
      await clientA.query("COMMIT");

      const concurrentNumberB = await concurrentPromiseB;

      assert(
        concurrentNumberB === "CUST-1005",
        "Second concurrent number should be CUST-1005.",
      );

      await clientB.query("COMMIT");

      console.log({
        concurrentNumberA,
        concurrentNumberB,
      });
    } catch (error) {
      await rollbackSafely(clientA);
      await rollbackSafely(clientB);

      throw error;
    } finally {
      clientA.release();
      clientB.release();
    }

    // --------------------------------------------------------
    // 17. VERIFY FINAL CUSTOMER SEQUENCE
    // --------------------------------------------------------

    console.log("--- Verifying final CUSTOMER sequence ---");

    const finalCustomerSequence = await getNumberSequence({
      organisationId: testOrganisationId,
      branchId: null,
      sequenceType: "CUSTOMER",
    });

    console.log(finalCustomerSequence);

    assert(
      Number(finalCustomerSequence.next_number) === 1006,
      "Final customer sequence should have next_number = 1006.",
    );

    // --------------------------------------------------------
    // 18. TEST EXPLICIT SEQUENCE CREATION
    // --------------------------------------------------------

    console.log("--- Testing explicit sequence creation ---");

    const explicitSequence = await createNumberSequence({
      organisationId: testOrganisationId,
      branchId: null,
      sequenceType: "CUSTOMER",
    });

    console.log(explicitSequence);

    assert(
      explicitSequence !== null,
      "Explicit sequence creation should return a sequence.",
    );

    assert(
      explicitSequence.sequence_type === "CUSTOMER",
      "Explicit sequence should have CUSTOMER type.",
    );

    assert(
      Number(explicitSequence.next_number) === 1006,
      "Existing sequence should not be reset by createNumberSequence.",
    );

    // --------------------------------------------------------
    // 19. TEST PURCHASE SEQUENCE (PO-1001, PO-1002, ISOLATION, SCOPE, CONCURRENCY)
    // --------------------------------------------------------

    console.log("--- Testing PURCHASE sequence (PO) ---");

    const poClient = await pool.connect();
    try {
      await poClient.query("BEGIN");

      const poNumber1 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "PURCHASE",
        client: poClient,
      });

      console.log({ poNumber1 });

      assert(
        poNumber1 === "PO-1001",
        "First purchase order number should be PO-1001.",
      );

      const poNumber2 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "PURCHASE",
        client: poClient,
      });

      console.log({ poNumber2 });

      assert(
        poNumber2 === "PO-1002",
        "Second purchase order number should be PO-1002.",
      );

      await poClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(poClient);
      throw error;
    } finally {
      poClient.release();
    }

    // Verify Organisation Isolation for PURCHASE
    console.log("--- Testing PURCHASE organisation isolation ---");

    const poOrgBClient = await pool.connect();
    try {
      await poOrgBClient.query("BEGIN");

      const poOrgBNumber = await getNextBusinessNumber({
        organisationId: testOrganisationBId,
        branchId: null,
        sequenceType: "PURCHASE",
        client: poOrgBClient,
      });

      console.log({ poOrgBNumber });

      assert(
        poOrgBNumber === "PO-1001",
        "Organisation B purchase order should start independently at PO-1001.",
      );

      await poOrgBClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(poOrgBClient);
      throw error;
    } finally {
      poOrgBClient.release();
    }

    // Verify branchId is rejected for PURCHASE
    console.log("--- Testing invalid PURCHASE branch scope ---");
    let invalidPurchaseScopeFailed = false;
    try {
      await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "PURCHASE",
        client: pool,
      });
    } catch (error) {
      invalidPurchaseScopeFailed = true;
      console.log("Expected validation error:", error.message);
    }
    assert(
      invalidPurchaseScopeFailed,
      "PURCHASE sequence must reject branchId.",
    );

    // Concurrency test for PURCHASE
    console.log("--- Testing concurrent PURCHASE generation ---");
    const poClientA = await pool.connect();
    const poClientB = await pool.connect();

    try {
      await poClientA.query("BEGIN");
      const poConcurrentA = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "PURCHASE",
        client: poClientA,
      });

      assert(
        poConcurrentA === "PO-1003",
        "Concurrent purchase A should be PO-1003.",
      );

      await poClientB.query("BEGIN");
      const poConcurrentPromiseB = getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "PURCHASE",
        client: poClientB,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await poClientA.query("COMMIT");

      const poConcurrentB = await poConcurrentPromiseB;

      assert(
        poConcurrentB === "PO-1004",
        "Concurrent purchase B should be PO-1004.",
      );

      await poClientB.query("COMMIT");

      console.log({ poConcurrentA, poConcurrentB });
    } catch (error) {
      await rollbackSafely(poClientA);
      await rollbackSafely(poClientB);
      throw error;
    } finally {
      poClientA.release();
      poClientB.release();
    }

    // --------------------------------------------------------
    // 20. TEST STOCK_TRANSFER SEQUENCE (TR-1001, TR-1002, ISOLATION, SCOPE)
    // --------------------------------------------------------

    console.log("--- Testing STOCK_TRANSFER sequence (TR) ---");

    const trClient = await pool.connect();
    try {
      await trClient.query("BEGIN");

      const trNumber1 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "STOCK_TRANSFER",
        client: trClient,
      });

      console.log({ trNumber1 });

      assert(
        trNumber1 === "TR-1001",
        "First stock transfer number should be TR-1001.",
      );

      const trNumber2 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "STOCK_TRANSFER",
        client: trClient,
      });

      console.log({ trNumber2 });

      assert(
        trNumber2 === "TR-1002",
        "Second stock transfer number should be TR-1002.",
      );

      await trClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(trClient);
      throw error;
    } finally {
      trClient.release();
    }

    // Verify Organisation Isolation for STOCK_TRANSFER
    console.log("--- Testing STOCK_TRANSFER organisation isolation ---");

    const trOrgBClient = await pool.connect();
    try {
      await trOrgBClient.query("BEGIN");

      const trOrgBNumber = await getNextBusinessNumber({
        organisationId: testOrganisationBId,
        branchId: null,
        sequenceType: "STOCK_TRANSFER",
        client: trOrgBClient,
      });

      console.log({ trOrgBNumber });

      assert(
        trOrgBNumber === "TR-1001",
        "Organisation B stock transfer should start independently at TR-1001.",
      );

      await trOrgBClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(trOrgBClient);
      throw error;
    } finally {
      trOrgBClient.release();
    }

    // Verify branchId is rejected for STOCK_TRANSFER
    console.log("--- Testing invalid STOCK_TRANSFER branch scope ---");
    let invalidTransferScopeFailed = false;
    try {
      await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "STOCK_TRANSFER",
        client: pool,
      });
    } catch (error) {
      invalidTransferScopeFailed = true;
      console.log("Expected validation error:", error.message);
    }
    assert(
      invalidTransferScopeFailed,
      "STOCK_TRANSFER sequence must reject branchId.",
    );

    // --------------------------------------------------------
    // 21. TEST GOODS_RECEIPT SEQUENCE (GRN-1001, GRN-1002, ISOLATION, SCOPE)
    // --------------------------------------------------------

    console.log("--- Testing GOODS_RECEIPT sequence (GRN) ---");

    const grnClient = await pool.connect();
    try {
      await grnClient.query("BEGIN");

      const grnNumber1 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "GOODS_RECEIPT",
        client: grnClient,
      });

      console.log({ grnNumber1 });

      assert(
        grnNumber1 === "GRN-1001",
        "First goods receipt number should be GRN-1001.",
      );

      const grnNumber2 = await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: null,
        sequenceType: "GOODS_RECEIPT",
        client: grnClient,
      });

      console.log({ grnNumber2 });

      assert(
        grnNumber2 === "GRN-1002",
        "Second goods receipt number should be GRN-1002.",
      );

      await grnClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(grnClient);
      throw error;
    } finally {
      grnClient.release();
    }

    // Verify Organisation Isolation for GOODS_RECEIPT
    console.log("--- Testing GOODS_RECEIPT organisation isolation ---");

    const grnOrgBClient = await pool.connect();
    try {
      await grnOrgBClient.query("BEGIN");

      const grnOrgBNumber = await getNextBusinessNumber({
        organisationId: testOrganisationBId,
        branchId: null,
        sequenceType: "GOODS_RECEIPT",
        client: grnOrgBClient,
      });

      console.log({ grnOrgBNumber });

      assert(
        grnOrgBNumber === "GRN-1001",
        "Organisation B goods receipt should start independently at GRN-1001.",
      );

      await grnOrgBClient.query("COMMIT");
    } catch (error) {
      await rollbackSafely(grnOrgBClient);
      throw error;
    } finally {
      grnOrgBClient.release();
    }

    // Verify branchId is rejected for GOODS_RECEIPT
    console.log("--- Testing invalid GOODS_RECEIPT branch scope ---");
    let invalidReceiptScopeFailed = false;
    try {
      await getNextBusinessNumber({
        organisationId: testOrganisationId,
        branchId: testBranchId,
        sequenceType: "GOODS_RECEIPT",
        client: pool,
      });
    } catch (error) {
      invalidReceiptScopeFailed = true;
      console.log("Expected validation error:", error.message);
    }
    assert(
      invalidReceiptScopeFailed,
      "GOODS_RECEIPT sequence must reject branchId.",
    );

    // --------------------------------------------------------
    // 22. EXPLICITLY VERIFY GOODS_RECEIPT DOES NOT USE FINANCIAL RECEIPT SEQUENCE
    // --------------------------------------------------------

    console.log(
      "--- Verifying GOODS_RECEIPT and RECEIPT sequences are completely independent ---",
    );

    const financialReceiptSeq = await getNumberSequence({
      organisationId: testOrganisationId,
      branchId: testBranchId,
      sequenceType: "RECEIPT",
    });

    const goodsReceiptSeq = await getNumberSequence({
      organisationId: testOrganisationId,
      branchId: null,
      sequenceType: "GOODS_RECEIPT",
    });

    console.log({
      financialReceiptSeqNext: financialReceiptSeq?.next_number,
      goodsReceiptSeqNext: goodsReceiptSeq?.next_number,
    });

    assert(
      financialReceiptSeq !== null,
      "Financial RECEIPT sequence should exist.",
    );
    assert(goodsReceiptSeq !== null, "GOODS_RECEIPT sequence should exist.");
    assert(
      Number(financialReceiptSeq.next_number) === 1002,
      "Financial RECEIPT next_number should still be 1002 (unaffected by GOODS_RECEIPT).",
    );
    assert(
      Number(goodsReceiptSeq.next_number) === 1003,
      "GOODS_RECEIPT next_number should be 1003 after 2 issues.",
    );

    console.log("");
    console.log("Number sequence repository tests completed successfully.");
  } catch (error) {
    console.error("");
    console.error("Number sequence repository test failed.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    console.log("--- Cleaning up test data ---");

    /**
     * Deleting the organisation cascades to:
     *
     * - branches
     * - number_sequences
     *
     * The user is deleted separately afterward.
     */
    if (testOrganisationId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [testOrganisationId],
        );
      } catch (cleanupError) {
        console.error("Organisation cleanup failed:", cleanupError.message);
      }
    }

    if (testOrganisationBId) {
      try {
        await pool.query(
          `
            DELETE FROM organisations
            WHERE id = $1;
          `,
          [testOrganisationBId],
        );
      } catch (cleanupError) {
        console.error("Organisation B cleanup failed:", cleanupError.message);
      }
    }

    if (testUserId) {
      try {
        await pool.query(
          `
            DELETE FROM users
            WHERE id = $1;
          `,
          [testUserId],
        );
      } catch (cleanupError) {
        console.error("User cleanup failed:", cleanupError.message);
      }
    }

    await pool.end();
  }
};

runTests();

// Run using:
//
// node src/tests/number-sequence.repository.test.js
