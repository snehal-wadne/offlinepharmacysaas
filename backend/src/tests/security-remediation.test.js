/**
 * Security Remediation Verification Suite
 *
 * Verifies the remediation of:
 * - Finding 1: Dev backdoor tokens rejection in production / when ALLOW_DEV_AUTH !== 'true'
 * - Finding 2: Cross-tenant organisation & branch attacks rejected with 403 Forbidden
 * - Finding 3: Cross-tenant customer isolation (no fallback across organisations)
 * - Finding 4: Google OAuth isolation (no auto-membership, no owner displacement)
 * - Legitimate tenant flow works end-to-end
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");
const authService = require("../services/auth.service");
const cashierService = require("../services/cashier.service");
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
  return { status: res.status, body };
}

async function runSecuritySuite() {
  console.log("====================================================");
  console.log("   🛡️  PHARMAFLOW SECURITY REMEDIATION TEST SUITE    ");
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

  // Setup fixtures
  let tenantAOrgId = null;
  let tenantABranchId = null;
  let tenantBOrgId = null;
  let tenantBBranchId = null;
  let attackerUserId = null;

  let tenantBUserId = null;
  let emptyOrgUserId = null;

  try {
    // Obtain Tenant A (Primary Org)
    const orgRes = await pool.query(
      "SELECT id, owner_id FROM organisations WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
    );
    assert.ok(orgRes.rows.length > 0, "Tenant A organisation must exist");
    tenantAOrgId = orgRes.rows[0].id;

    const branchRes = await pool.query(
      "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' LIMIT 1;",
      [tenantAOrgId],
    );
    assert.ok(branchRes.rows.length > 0, "Tenant A branch must exist");
    tenantABranchId = branchRes.rows[0].id;

    // Create Tenant B Owner User
    const tenantBUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, status)
       VALUES ('Tenant B Owner', 'tenant_b_owner_sec@test.com', 'dummy_test_hash', 'ACTIVE')
       RETURNING id;`,
    );
    tenantBUserId = tenantBUser.rows[0].id;

    // Create Tenant B (Victim / Target Org)
    const tenantBOrg = await pool.query(
      `INSERT INTO organisations (name, owner_id, status)
       VALUES ('Security Test Victim Org B', $1, 'ACTIVE')
       RETURNING id;`,
      [tenantBUserId],
    );
    tenantBOrgId = tenantBOrg.rows[0].id;

    const tenantBBranch = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, 'Victim Branch B', 'BR-VICTIM-B', 'ACTIVE')
       RETURNING id;`,
      [tenantBOrgId],
    );
    tenantBBranchId = tenantBBranch.rows[0].id;

    // Authenticate legitimate Tenant A Owner
    const legitimateToken = createSupabaseTestToken({
      email: "surajmore303@gmail.com",
      sub: "google_owner_test_123",
    });
    const legitimateLogin = await authService.googleLogin({
      token: legitimateToken,
    });
    const tenantAOwnerToken = legitimateLogin.token;
    assert.ok(tenantAOwnerToken, "Legitimate owner token must be generated");

    // =========================================================================
    // TEST 1: Dev Token Rejection
    // =========================================================================
    console.log("[Test 1] Verifying Dev Backdoor Token Rejection...");
    const devTokenHeaders = {
      Authorization: "Bearer pf_platform_default_dev",
      "Content-Type": "application/json",
    };

    const superadminDevRes = await makeRequest("/api/superadmin/audit-logs", {
      headers: devTokenHeaders,
    });
    // In production or when ALLOW_DEV_AUTH !== 'true', must return 401 or 403
    if (superadminDevRes.status === 401 || superadminDevRes.status === 403) {
      testPass(
        `pf_platform_default_dev correctly rejected on superadmin route (${superadminDevRes.status})`,
      );
    } else {
      testFail(
        "pf_platform_default_dev was accepted on superadmin route",
        superadminDevRes,
      );
    }

    const syncDevRes = await makeRequest(
      `/api/sync/pull?organisationId=${tenantAOrgId}`,
      {
        method: "GET",
        headers: {
          ...devTokenHeaders,
          "x-organisation-id": tenantAOrgId,
        },
      },
    );
    if (syncDevRes.status === 401 || syncDevRes.status === 403) {
      testPass(
        `pf_platform_default_dev correctly rejected on sync route (${syncDevRes.status})`,
      );
    } else {
      testFail(
        "pf_platform_default_dev was accepted on sync route",
        syncDevRes,
      );
    }

    // =========================================================================
    // TEST 2: Cross-Tenant Organisation Attack (403 Forbidden)
    // =========================================================================
    console.log(
      "\n[Test 2] Verifying Cross-Tenant Organisation Attack Rejection...",
    );
    // Tenant A user attempts to access Tenant B organisation data
    const crossOrgRes = await makeRequest("/api/cashier/registers", {
      headers: {
        Authorization: `Bearer ${tenantAOwnerToken}`,
        "x-organisation-id": tenantBOrgId,
        "x-branch-id": tenantBBranchId,
      },
    });

    if (crossOrgRes.status === 403) {
      testPass(
        `Cross-tenant org spoofing rejected with 403 Forbidden (${crossOrgRes.body?.error || "Forbidden"})`,
      );
    } else {
      testFail(
        `Expected 403 Forbidden for cross-tenant org attack, got ${crossOrgRes.status}`,
        crossOrgRes.body,
      );
    }

    // =========================================================================
    // TEST 3: Cross-Tenant Branch Attack (403 Forbidden)
    // =========================================================================
    console.log("\n[Test 3] Verifying Cross-Tenant Branch Attack Rejection...");
    // Tenant A user specifies own org, but provides Tenant B's branch
    const crossBranchRes = await makeRequest("/api/cashier/registers", {
      headers: {
        Authorization: `Bearer ${tenantAOwnerToken}`,
        "x-organisation-id": tenantAOrgId,
        "x-branch-id": tenantBBranchId,
      },
    });

    if (crossBranchRes.status === 403) {
      testPass(
        `Cross-tenant branch spoofing rejected with 403 Forbidden (${crossBranchRes.body?.error || "Forbidden"})`,
      );
    } else {
      testFail(
        `Expected 403 Forbidden for cross-tenant branch attack, got ${crossBranchRes.status}`,
        crossBranchRes.body,
      );
    }

    // =========================================================================
    // TEST 4: Customer Isolation & Fallback Elimination
    // =========================================================================
    console.log(
      "\n[Test 4] Verifying Customer Isolation (No Cross-Tenant Fallback)...",
    );
    // Seed a single customer strictly in Tenant B
    const tenantBCustomer = await pool.query(
      `INSERT INTO customers (organisation_id, customer_number, full_name, phone, status)
       VALUES ($1, 'CUST-B-999', 'Tenant B VIP Customer', '8888888888', 'ACTIVE')
       RETURNING id;`,
      [tenantBOrgId],
    );
    const tenantBCustId = tenantBCustomer.rows[0].id;

    // Call cashierService._resolveContext for Tenant B
    const ctxB = await cashierService._resolveContext(
      tenantBOrgId,
      tenantBBranchId,
    );
    assert.strictEqual(
      ctxB.customerId,
      tenantBCustId,
      "Tenant B must resolve its own customer",
    );

    // Verify cashierService._resolveContext rejects missing organisationId
    let threwOrgError = false;
    try {
      await cashierService._resolveContext(null, tenantABranchId);
    } catch (err) {
      threwOrgError = true;
      assert.ok(
        err.message.includes("Organisation context is required"),
        `Expected organisation requirement error, got: ${err.message}`,
      );
    }
    assert.ok(
      threwOrgError,
      "cashierService._resolveContext must throw if organisationId is missing",
    );
    testPass(
      "Cashier operations strictly require organisationId and scope customer resolution",
    );

    // Create a temporary isolated org with 0 customers
    const emptyOrgUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, status)
       VALUES ('Empty Org Owner', 'empty_org_owner_sec@test.com', 'dummy_test_hash', 'ACTIVE')
       RETURNING id;`,
    );
    emptyOrgUserId = emptyOrgUser.rows[0].id;

    const emptyOrg = await pool.query(
      `INSERT INTO organisations (name, owner_id, status)
       VALUES ('Empty Customer Test Org', $1, 'ACTIVE')
       RETURNING id;`,
      [emptyOrgUserId],
    );
    const emptyOrgBranch = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, 'Empty Branch', 'BR-EMPTY', 'ACTIVE')
       RETURNING id;`,
      [emptyOrg.rows[0].id],
    );

    const emptyOrgCtx = await cashierService._resolveContext(
      emptyOrg.rows[0].id,
      emptyOrgBranch.rows[0].id,
    );

    // Verify that the newly created walk-in customer is strictly in emptyOrg, NOT borrowed from Tenant A or B
    const verifyCust = await pool.query(
      "SELECT organisation_id FROM customers WHERE id = $1;",
      [emptyOrgCtx.customerId],
    );
    assert.strictEqual(
      verifyCust.rows[0].organisation_id,
      emptyOrg.rows[0].id,
      "Auto-created walk-in customer must belong strictly to the requesting organisation",
    );
    assert.notStrictEqual(
      emptyOrgCtx.customerId,
      tenantBCustId,
      "Empty organisation must NEVER borrow Tenant B's customer",
    );
    testPass(
      "Zero-customer organisation creates isolated walk-in customer without cross-tenant leakage",
    );

    // Clean up emptyOrg
    await pool.query("DELETE FROM customers WHERE organisation_id = $1;", [
      emptyOrg.rows[0].id,
    ]);
    await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [
      emptyOrg.rows[0].id,
    ]);
    await pool.query("DELETE FROM organisations WHERE id = $1;", [
      emptyOrg.rows[0].id,
    ]);
    await pool.query("DELETE FROM users WHERE id = $1;", [emptyOrgUserId]);
    emptyOrgUserId = null;

    // =========================================================================
    // TEST 5: Google Login Isolation & Owner Protection
    // =========================================================================
    console.log(
      "\n[Test 5] Verifying Google Login Isolation & Owner Protection...",
    );
    const originalTenantAOwner = orgRes.rows[0].owner_id;

    // Attempt Google login as an uninvited stranger requesting OWNER role
    const attackerEmail = `attacker_${Date.now()}@untrusted-domain.com`;
    const attackerSub = `google_attacker_${Date.now()}`;
    const attackerToken = createSupabaseTestToken({
      email: attackerEmail,
      sub: attackerSub,
    });
    try {
      await authService.googleLogin({
        token: attackerToken,
      });
      assert.fail("Stranger Google login must be rejected");
    } catch (err) {
      assert.ok(
        err.message.includes("not registered"),
        "Stranger Google login must be rejected as not registered",
      );
      testPass(
        "Stranger Google login safely rejected without access (no account created or attached)",
      );
    }

    // 1. Must NOT displace existing owner of Tenant A
    const postAttackOrg = await pool.query(
      "SELECT owner_id FROM organisations WHERE id = $1;",
      [tenantAOrgId],
    );
    assert.strictEqual(
      postAttackOrg.rows[0].owner_id,
      originalTenantAOwner,
      "Tenant A owner_id MUST NOT be changed or displaced by stranger login",
    );
    testPass("Tenant A owner_id intact (no owner displacement)");

    // 2. Verify no user or memberships created for stranger
    const attackerUsers = await pool.query(
      "SELECT id FROM users WHERE email = $1;",
      [attackerEmail],
    );
    assert.strictEqual(
      attackerUsers.rows.length,
      0,
      "Stranger must not have a database user record created",
    );
    testPass("No rogue user or membership created for stranger");

    // =========================================================================
    // TEST 6: Legitimate Tenant Flow
    // =========================================================================
    console.log("\n[Test 6] Verifying Legitimate Tenant Flow End-to-End...");
    const legitRes = await makeRequest("/api/cashier/registers", {
      headers: {
        Authorization: `Bearer ${tenantAOwnerToken}`,
        "x-organisation-id": tenantAOrgId,
        "x-branch-id": tenantABranchId,
      },
    });

    if (legitRes.status === 200) {
      testPass(
        `Legitimate tenant request succeeded with 200 OK (count: ${legitRes.body?.count ?? 0})`,
      );
    } else {
      testFail(
        `Legitimate tenant request failed with ${legitRes.status}`,
        legitRes.body,
      );
    }
  } finally {
    // Cleanup fixtures
    console.log("\n[Cleanup] Cleaning up security test fixtures...");
    if (tenantBOrgId) {
      await pool
        .query("DELETE FROM customers WHERE organisation_id = $1;", [
          tenantBOrgId,
        ])
        .catch(() => {});
      await pool
        .query("DELETE FROM branches WHERE organisation_id = $1;", [
          tenantBOrgId,
        ])
        .catch(() => {});
      await pool
        .query("DELETE FROM organisations WHERE id = $1;", [tenantBOrgId])
        .catch(() => {});
    }
    if (tenantBUserId) {
      await pool
        .query("DELETE FROM users WHERE id = $1;", [tenantBUserId])
        .catch(() => {});
    }
    if (emptyOrgUserId) {
      await pool
        .query("DELETE FROM users WHERE id = $1;", [emptyOrgUserId])
        .catch(() => {});
    }
    if (attackerUserId) {
      await pool
        .query("DELETE FROM users WHERE id = $1;", [attackerUserId])
        .catch(() => {});
    }
  }

  console.log("\n====================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecuritySuite().catch((err) => {
  console.error("FATAL ERROR in security test suite:", err);
  process.exit(1);
});
