/**
 * Phase 1 Tenant Isolation & Security Verification Test Suite
 *
 * Verifies Phase 1 acceptance criteria:
 * 1. Multi-Tenant Boundary: Authenticated user in Org A can NEVER view, mutate, or access Org B data.
 * 2. Spoofing & Injection Prevention: Client-supplied organisationId (in body, query, or headers)
 *    is rejected or sanitized; cannot hijack another tenant.
 * 3. Cross-Tenant Negative Tests:
 *    - Customers: cannot read, update, or delete other org's customers; client-supplied orgId rejected with 403.
 *    - Inventory: cannot read, update, or delete other org's inventory batches.
 *    - Cashier / POS: cannot read, delete held bills, lookup invoices, or return sales from other org.
 *    - Stock Transfers: cannot transfer stock across different organisations.
 *    - Reports: cannot read another organisation's analytics or metrics.
 *    - Sync: cannot pull or mutate data across tenants.
 * 4. Superadmin Delegation: Platform superadmins can switch organisation scope via x-organisation-id;
 *    regular users attempting x-organisation-id spoofing receive 403 Forbidden.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const { createSupabaseTestToken } = require("../utils/supabase");

const BASE_URL = process.env.API_URL || "http://localhost:5000";

async function makeRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, headers: res.headers, body };
}

async function runTenantIsolationSuite() {
  console.log("====================================================");
  console.log("  🛡️  PHARMAFLOW PHASE 1 TENANT ISOLATION SUITE     ");
  console.log("====================================================\n");

  let passed = 0;
  let failed = 0;

  function testPass(desc) {
    passed++;
    console.log(`  ✓ ${desc}`);
  }

  function testFail(desc, details) {
    failed++;
    console.error(`  ❌ [FAIL] ${desc}`);
    if (details) console.error("     Details:", details);
  }

  const runId = Date.now().toString().slice(-6);

  // Setup containers
  let orgA = null,
    userA = null,
    tokenA = null,
    branchA = null;
  let orgB = null,
    userB = null,
    tokenB = null,
    branchB = null;
  let superadminUser = null,
    superadminToken = null;

  try {
    // -------------------------------------------------------------
    // Step 0: Discover or Register Org A and Org B
    // -------------------------------------------------------------
    console.log("[Setup] Registering two distinct organisations...");

    // Register Org A
    const regResA = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyName: `Tenant Alpha Pharmacy ${runId}`,
        name: `Alpha Owner ${runId}`,
        email: `alpha_owner_${runId}@pharmaflow-test.io`,
        password: "StrongPassword#2026",
        branchName: "Alpha Main Branch",
        city: "Mumbai",
        createInitialBranch: true,
      }),
    });
    assert.strictEqual(regResA.status, 201, "Org A registration failed");
    orgA = regResA.body.organisation;
    userA = regResA.body.user;
    tokenA = createSupabaseTestToken({
      userId: userA.supabaseAuthId || userA.supabase_auth_id || userA.id,
      email: userA.email,
    });
    const branchResA = await pool.query(
      "SELECT id, name FROM branches WHERE organisation_id = $1 LIMIT 1;",
      [orgA.id],
    );
    branchA = branchResA.rows[0];

    // Register Org B
    const regResB = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyName: `Tenant Beta Pharmacy ${runId}`,
        name: `Beta Owner ${runId}`,
        email: `beta_owner_${runId}@pharmaflow-test.io`,
        password: "StrongPassword#2026",
        branchName: "Beta Main Branch",
        city: "Delhi",
        createInitialBranch: true,
      }),
    });
    assert.strictEqual(regResB.status, 201, "Org B registration failed");
    orgB = regResB.body.organisation;
    userB = regResB.body.user;
    tokenB = createSupabaseTestToken({
      userId: userB.supabaseAuthId || userB.supabase_auth_id || userB.id,
      email: userB.email,
    });
    const branchResB = await pool.query(
      "SELECT id, name FROM branches WHERE organisation_id = $1 LIMIT 1;",
      [orgB.id],
    );
    branchB = branchResB.rows[0];

    // Superadmin setup
    const saRes = await pool.query(
      "SELECT id, name, email, supabase_auth_id FROM users WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE' LIMIT 1;",
    );
    if (saRes.rows.length > 0) {
      superadminUser = saRes.rows[0];
      superadminToken = createSupabaseTestToken({
        userId: superadminUser.supabase_auth_id || superadminUser.id,
        email: superadminUser.email,
      });
    }

    testPass(
      `Test tenants established: Org A (${orgA.id}) & Org B (${orgB.id})`,
    );

    // =============================================================
    // TEST 1: Customer Tenant Scoping & Isolation
    // =============================================================
    console.log(
      "\n[Test 1] Customer Isolation & Query Poisoning Prevention...",
    );

    // 1.1 User A creates customer in Org A
    const custResA = await makeRequest("/api/customers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: `Customer Alpha ${runId}`,
        phone: "9876543210",
        email: `custA_${runId}@example.com`,
      }),
    });
    assert.strictEqual(
      custResA.status,
      201,
      "Customer creation in Org A failed",
    );
    const customerA = custResA.body.data;
    assert.strictEqual(
      customerA.organisation_id || customerA.organisationId,
      orgA.id,
    );
    testPass("Org A created customer successfully bound to Org A");

    // 1.2 User B attempts to read Customer A via GET /api/customers/:id -> MUST return 404
    const getCustByB = await makeRequest(`/api/customers/${customerA.id}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (getCustByB.status === 404) {
      testPass("Cross-tenant GET /api/customers/:id blocked with HTTP 404");
    } else {
      testFail("User B should not be able to read Customer A", getCustByB);
    }

    // 1.3 User B lists customers -> Customer A MUST NOT be in the results
    const listCustByB = await makeRequest("/api/customers", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(listCustByB.status, 200);
    const bCustomers =
      listCustByB.body.data?.customers || listCustByB.body.data || [];
    const leakedCust = bCustomers.find((c) => c.id === customerA.id);
    if (!leakedCust) {
      testPass("User B customer listing excludes Org A customers");
    } else {
      testFail("Customer A leaked into User B customer listing!", leakedCust);
    }

    // 1.4 User B attempts to UPDATE Customer A -> MUST return 404
    const updateCustByB = await makeRequest(`/api/customers/${customerA.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ name: "Hacked Customer Name" }),
    });
    if (updateCustByB.status === 404) {
      testPass("Cross-tenant PUT /api/customers/:id blocked with HTTP 404");
    } else {
      testFail("User B should not be able to update Customer A", updateCustByB);
    }

    // 1.5 User B attempts to DELETE Customer A -> MUST return 404
    const deleteCustByB = await makeRequest(`/api/customers/${customerA.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (deleteCustByB.status === 404) {
      testPass("Cross-tenant DELETE /api/customers/:id blocked with HTTP 404");
    } else {
      testFail("User B should not be able to delete Customer A", deleteCustByB);
    }

    // 1.6 User B attempts organisation injection during customer creation
    const injectCustRes = await makeRequest("/api/customers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        name: `Injected Customer ${runId}`,
        phone: "9111222333",
        organisationId: orgA.id, // malicious attempt to write into Org A
      }),
    });
    // Our tenant-context immediately rejects cross-tenant injection with 403 Forbidden
    if (injectCustRes.status === 403) {
      testPass(
        "Cross-tenant organisationId injection rejected with HTTP 403 Forbidden",
      );
    } else if (injectCustRes.status === 201) {
      // If sanitized instead of rejected, verify it stayed in Org B
      const actualOrg =
        injectCustRes.body.data?.organisation_id ||
        injectCustRes.body.data?.organisationId;
      assert.strictEqual(actualOrg, orgB.id);
      testPass(
        "Cross-tenant organisationId injection sanitized to authenticated tenant",
      );
    } else {
      testFail(
        "Customer creation with injected organisationId produced unexpected response",
        injectCustRes,
      );
    }

    // =============================================================
    // TEST 2: Inventory & Batch Isolation
    // =============================================================
    console.log("\n[Test 2] Inventory & Batch Isolation...");

    // Seed supplier for Org A
    const suppResA = await pool.query(
      `INSERT INTO suppliers (organisation_id, name, contact_person, phone, email, city)
       VALUES ($1, $2, 'Rep Alpha', '9988776655', $3, 'Mumbai') RETURNING id;`,
      [orgA.id, `Supplier Alpha ${runId}`, `supp_${runId}@alpha.com`],
    );
    const supplierAId = suppResA.rows[0].id;

    // Seed product in Org A
    const prodResA = await pool.query(
      `INSERT INTO products (organisation_id, category, medicine_name, brand_name, strength, pack_size, manufacturer, sku)
       VALUES ($1, 'ALLOPATHIC', $2, 'Brand A', '500mg', '10 tablets', 'Pharma Alpha', $3)
       RETURNING id;`,
      [orgA.id, `Paracetamol A ${runId}`, `SKU-A-${runId}`],
    );
    const productAId = prodResA.rows[0].id;

    // Seed inventory batch in Org A
    const batchResA = await pool.query(
      `INSERT INTO inventory_batches (
         product_id, branch_id, supplier_id, batch_number, expiry_date,
         mrp, quantity, shelf_location
       ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '1 year', 20.0, 100, 'A1-R1')
       RETURNING id;`,
      [productAId, branchA.id, supplierAId, `BATCH-A-${runId}`],
    );
    const batchAId = batchResA.rows[0].id;

    // 2.1 User B queries inventory -> Product A & Batch A must NOT appear
    const invResB = await makeRequest("/api/inventory", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(invResB.status, 200);
    const invItemsB = invResB.body.data || [];
    const leakedBatch = invItemsB.find(
      (i) => i.id === batchAId || i.batch_number === `BATCH-A-${runId}`,
    );
    if (!leakedBatch) {
      testPass(
        "User B inventory listing completely isolates Org A products/batches",
      );
    } else {
      testFail("Org A inventory batch leaked into Org B listing!", leakedBatch);
    }

    // 2.2 User B attempts to DELETE Batch A -> MUST return 404
    const deleteBatchByB = await makeRequest(
      `/api/inventory/batch/${batchAId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (deleteBatchByB.status === 404) {
      testPass(
        "Cross-tenant DELETE /api/inventory/batch/:id blocked with HTTP 404",
      );
    } else {
      testFail(
        "User B was able to delete Org A inventory batch!",
        deleteBatchByB,
      );
    }

    // Verify batch is still alive in DB
    const batchStillAlive = await pool.query(
      "SELECT id FROM inventory_batches WHERE id = $1;",
      [batchAId],
    );
    assert.strictEqual(
      batchStillAlive.rows.length,
      1,
      "Batch A must remain in database",
    );
    testPass(
      "Org A batch preserved; unauthorized cross-tenant deletion prevented",
    );

    // =============================================================
    // TEST 3: Branch & Cross-Tenant Stock Transfer Isolation
    // =============================================================
    console.log("\n[Test 3] Branch Ownership & Stock Transfer Scoping...");

    // 3.1 User B queries branches with query spoofing (?organisationId=Org A) -> MUST return 403 Forbidden
    const spoofBranchRes = await makeRequest(
      `/api/branches?organisationId=${orgA.id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (spoofBranchRes.status === 403) {
      testPass(
        "Branch query parameter spoofing rejected with HTTP 403 Forbidden",
      );
    } else if (spoofBranchRes.status === 200) {
      const returnedBranches =
        spoofBranchRes.body.data || spoofBranchRes.body || [];
      const leakedOrgABranch = returnedBranches.find(
        (b) => b.id === branchA.id || b.organisation_id === orgA.id,
      );
      if (!leakedOrgABranch) {
        testPass(
          "Branch query parameter spoofing ignored; User B sees only Org B branches",
        );
      } else {
        testFail(
          "Org A branch leaked to User B when passing organisationId parameter!",
          leakedOrgABranch,
        );
      }
    } else {
      testFail("Unexpected response for branch query spoofing", spoofBranchRes);
    }

    // 3.2 User B attempts to transfer stock from Org A's branch to Org B's branch -> MUST FAIL
    const crossOrgTransferRes = await makeRequest("/api/stock-transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        fromBranchId: branchA.id, // Org A branch
        toBranchId: branchB.id, // Org B branch
        items: [
          {
            productId: productAId,
            batchId: batchAId,
            quantity: 5,
          },
        ],
      }),
    });
    if (
      crossOrgTransferRes.status === 400 ||
      crossOrgTransferRes.status === 403 ||
      crossOrgTransferRes.status === 404
    ) {
      testPass(
        `Cross-organisation stock transfer blocked with HTTP ${crossOrgTransferRes.status}`,
      );
    } else {
      testFail(
        "User B was able to create stock transfer from Org A branch!",
        crossOrgTransferRes,
      );
    }

    // =============================================================
    // TEST 4: Cashier / POS Isolation (Held Bills, Invoices, Returns)
    // =============================================================
    console.log("\n[Test 4] Cashier & POS Sales Isolation...");

    // 4.1 User A holds a bill in Org A
    const holdBillRes = await pool.query(
      `INSERT INTO held_bills (
         organisation_id, branch_id, held_by, hold_token,
         customer_name, customer_phone, items_count, total_amount, cart_data, status
       ) VALUES ($1, $2, $3, $4, 'Customer A', '9999999999', 1, 100.00, '{"items": []}', 'HOLD')
       RETURNING id;`,
      [orgA.id, branchA.id, userA.id, `HOLD-${runId}`],
    );
    const heldBillAId = holdBillRes.rows[0].id;

    // User B lists held bills -> MUST NOT include heldBillAId
    const bHeldBills = await makeRequest("/api/cashier/held-bills", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(bHeldBills.status, 200);
    const heldList = bHeldBills.body.data || [];
    const leakedHold = heldList.find(
      (h) => h.id === heldBillAId || h.hold_token === `HOLD-${runId}`,
    );
    if (!leakedHold) {
      testPass(
        "Held bills list strictly isolated to authenticated organisation",
      );
    } else {
      testFail("Org A held bill leaked into Org B cashier screen!", leakedHold);
    }

    // User B attempts to DELETE Org A held bill -> MUST return 404
    const deleteHoldByB = await makeRequest(
      `/api/cashier/held-bills/${heldBillAId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (deleteHoldByB.status === 404) {
      testPass(
        "Cross-tenant DELETE /api/cashier/held-bills/:id blocked with HTTP 404",
      );
    } else {
      testFail("User B deleted Org A held bill!", deleteHoldByB);
    }

    // 4.2 Seed a completed sale invoice for Org A
    const invoiceNumA = `INV-TEST-A-${runId}`;
    const invRes = await pool.query(
      `INSERT INTO invoices (
         organisation_id, branch_id, customer_id, invoice_number,
         subtotal, discount_amount, tax_amount, total_amount, status, created_by
       ) VALUES ($1, $2, $3, $4, 100.0, 0.0, 10.0, 110.0, 'COMPLETED', $5)
       RETURNING id;`,
      [orgA.id, branchA.id, customerA.id, invoiceNumA, userA.id],
    );
    const invoiceAId = invRes.rows[0].id;

    // User B queries invoice by number -> MUST return 404
    const getSaleByB = await makeRequest(`/api/cashier/sales/${invoiceNumA}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (getSaleByB.status === 404) {
      testPass(
        "Cross-tenant GET /api/cashier/sales/:invoiceNo blocked with HTTP 404",
      );
    } else {
      testFail("User B retrieved Org A invoice by number!", getSaleByB);
    }

    // User B searches invoice for return -> MUST return 404
    const searchReturnByB = await makeRequest(
      `/api/cashier/returns/search-invoice?invoiceNumber=${invoiceNumA}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (searchReturnByB.status === 404) {
      testPass("Cross-tenant searchReturnInvoice blocked with HTTP 404");
    } else {
      testFail("User B found Org A invoice in return search!", searchReturnByB);
    }

    // User B attempts to process a return against Invoice A -> MUST FAIL (400 or 404)
    const returnByB = await makeRequest("/api/cashier/returns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        originalInvoiceNumber: invoiceNumA,
        returnReason: "Wrong medicine",
        items: [{ productId: productAId, quantity: 1, refundAmount: 18.0 }],
      }),
    });
    if (returnByB.status === 400 || returnByB.status === 404) {
      testPass(
        `Cross-tenant return processing blocked with HTTP ${returnByB.status}`,
      );
    } else {
      testFail("User B processed return against Org A invoice!", returnByB);
    }

    // =============================================================
    // TEST 5: Reports & Analytics Isolation
    // =============================================================
    console.log(
      "\n[Test 5] Reports Scoping & Arbitrary Fallback Elimination...",
    );

    // User B calls reports with Org A in query -> MUST be rejected with 403 or return only Org B report data
    const reportRes = await makeRequest(
      `/api/reports/sales?organisationId=${orgA.id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (reportRes.status === 403) {
      testPass(
        "Reports endpoint rejects cross-tenant query spoofing with HTTP 403 Forbidden",
      );
    } else if (reportRes.status === 200) {
      const reportData = reportRes.body.data || reportRes.body;
      const totalRev = Number(
        reportData.total_revenue || reportData.total_sales || 0,
      );
      assert.strictEqual(
        totalRev,
        0,
        "Report data must reflect only Org B, not Org A",
      );
      testPass(
        "Reports endpoint ignores organisationId query override; reports scoped to Org B",
      );
    } else {
      testFail("Unexpected response for cross-tenant report query", reportRes);
    }

    // Clean legitimate reports query succeeds
    const cleanReportRes = await makeRequest(`/api/reports/sales`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(cleanReportRes.status, 200);
    testPass(
      "Legitimate report query succeeds with HTTP 200 scoped to user organisation",
    );

    // =============================================================
    // TEST 6: Sync Protocol Isolation
    // =============================================================
    console.log("\n[Test 6] Offline Sync Protocol Isolation...");

    // User B requests sync pull passing ?organisationId=Org A -> MUST be rejected with 403 or isolate
    const syncPullRes = await makeRequest(
      `/api/sync/pull?organisationId=${orgA.id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenB}` },
      },
    );
    if (syncPullRes.status === 403) {
      testPass(
        "Sync pull cross-tenant query override rejected with HTTP 403 Forbidden",
      );
    } else if (syncPullRes.status === 200) {
      const syncData = syncPullRes.body.data || {};
      const pulledProducts = syncData.products || [];
      const pulledCustomers = syncData.customers || [];
      const hasOrgAProd = pulledProducts.some((p) => p.id === productAId);
      const hasOrgACust = pulledCustomers.some((c) => c.id === customerA.id);
      if (!hasOrgAProd && !hasOrgACust) {
        testPass(
          "Sync pull strictly isolates data to Org B; Org A entities not returned",
        );
      } else {
        testFail("Org A entities leaked in User B sync pull!", {
          hasOrgAProd,
          hasOrgACust,
        });
      }
    } else {
      testFail("Unexpected response for cross-tenant sync pull", syncPullRes);
    }

    // Clean legitimate sync pull succeeds
    const cleanSyncRes = await makeRequest(`/api/sync/pull`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(cleanSyncRes.status, 200);
    const cleanSyncData = cleanSyncRes.body.data || {};
    const cleanProducts = cleanSyncData.products || [];
    const cleanCustomers = cleanSyncData.customers || [];
    const leakedProd = cleanProducts.some((p) => p.id === productAId);
    const leakedCustClean = cleanCustomers.some((c) => c.id === customerA.id);
    if (!leakedProd && !leakedCustClean) {
      testPass(
        "Legitimate sync pull succeeds and strictly contains only Org B records",
      );
    } else {
      testFail("Org A records leaked in standard sync pull!", {
        leakedProd,
        leakedCustClean,
      });
    }

    // =============================================================
    // TEST 7: Superadmin Scoped Access & Header Spoofing Prevention
    // =============================================================
    console.log("\n[Test 7] Superadmin Delegation & Spoofing Gating...");

    // 7.1 Regular User B passes x-organisation-id header aiming for Org A -> MUST BE 403 FORBIDDEN
    const spoofHeaderRes = await makeRequest("/api/customers", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "x-organisation-id": orgA.id,
      },
    });
    if (spoofHeaderRes.status === 403) {
      testPass(
        "Standard user spoofing x-organisation-id header rejected with HTTP 403 Forbidden",
      );
    } else {
      testFail(
        "Non-superadmin was able to use x-organisation-id without 403!",
        spoofHeaderRes,
      );
    }

    // 7.2 Platform Superadmin with x-organisation-id -> CAN access Org A
    if (superadminUser && superadminToken) {
      const saCustA = await makeRequest("/api/customers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${superadminToken}`,
          "x-organisation-id": orgA.id,
        },
      });
      assert.strictEqual(saCustA.status, 200);
      const saCustAList =
        saCustA.body.data?.customers || saCustA.body.data || [];
      const foundInA = saCustAList.some((c) => c.id === customerA.id);
      if (foundInA) {
        testPass(
          "Superadmin with x-organisation-id: Org A successfully reads Org A customer",
        );
      } else {
        testFail(
          "Superadmin could not find Org A customer when scoped to Org A",
          saCustA.body,
        );
      }

      // Superadmin switches to Org B
      const saCustB = await makeRequest("/api/customers", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${superadminToken}`,
          "x-organisation-id": orgB.id,
        },
      });
      assert.strictEqual(saCustB.status, 200);
      const saCustBList =
        saCustB.body.data?.customers || saCustB.body.data || [];
      const leakedInB = saCustBList.some((c) => c.id === customerA.id);
      if (!leakedInB) {
        testPass(
          "Superadmin with x-organisation-id: Org B correctly sees Org B context (excludes Org A)",
        );
      } else {
        testFail(
          "Superadmin scoped to Org B leaked Org A customer!",
          saCustB.body,
        );
      }
    } else {
      console.log(
        "  ⚠️  Superadmin user not configured, skipping Superadmin delegation test",
      );
    }
  } catch (err) {
    testFail("Unexpected error during test execution", err.message || err);
    console.error(err);
  } finally {
    console.log("\n====================================================");
    console.log(
      `  PHASE 1 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`,
    );
    console.log("====================================================\n");

    // Close db connection if opened
    await pool.end().catch(() => {});

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTenantIsolationSuite();
