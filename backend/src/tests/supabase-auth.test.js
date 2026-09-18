/**
 * Supabase Auth Integration Test Suite
 *
 * Verifies:
 * 1. Supabase JWT Authentication (valid, invalid, expired, malformed)
 * 2. Database Identity Mapping (supabase_auth_id resolution & JIT linking)
 * 3. Multi-Tenant Isolation (403 on foreign org, 403 on foreign branch)
 * 4. Superadmin Clearance (asserts is_platform_superadmin = TRUE, 403 for normal users)
 * 5. Sync Authentication with Supabase JWTs
 * 6. User Registration & Password Recovery flows
 */

require("dotenv").config();
const assert = require("assert");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../db/connection");
const {
  createSupabaseTestToken,
  SUPABASE_JWT_SECRET,
  SUPABASE_URL,
} = require("../utils/supabase");

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

async function runSupabaseAuthSuite() {
  console.log("====================================================");
  console.log("    ⚡ PHARMAFLOW SUPABASE AUTH TEST SUITE           ");
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

  let tenantAOrgId = null;
  let tenantABranchId = null;
  let tenantBOrgId = null;
  let tenantBBranchId = null;

  let tenantAOwner = null;
  let superadminUser = null;
  let inactiveUser = null;

  try {
    // -------------------------------------------------------------------------
    // Setup Fixtures
    // -------------------------------------------------------------------------
    console.log("[Setup] Loading Test Fixtures from PostgreSQL...");

    // 1. Get Tenant A
    const orgARes = await pool.query(
      "SELECT id, owner_id FROM organisations WHERE status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1;",
    );
    assert.ok(orgARes.rows.length > 0, "Tenant A organisation must exist");
    tenantAOrgId = orgARes.rows[0].id;

    const branchARes = await pool.query(
      "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' LIMIT 1;",
      [tenantAOrgId],
    );
    assert.ok(branchARes.rows.length > 0, "Tenant A branch must exist");
    tenantABranchId = branchARes.rows[0].id;

    // 2. Get Tenant A Owner
    const ownerRes = await pool.query(
      "SELECT id, email, supabase_auth_id FROM users WHERE id = $1;",
      [orgARes.rows[0].owner_id],
    );
    tenantAOwner = ownerRes.rows[0];
    if (!tenantAOwner.supabase_auth_id) {
      const newAuthId = crypto.randomUUID();
      await pool.query(
        "UPDATE users SET supabase_auth_id = $1 WHERE id = $2;",
        [newAuthId, tenantAOwner.id],
      );
      tenantAOwner.supabase_auth_id = newAuthId;
    }

    // 3. Create Tenant B (Target for Cross-Tenant Negative Tests)
    try {
      const oldVictim = await pool.query(
        "SELECT id FROM users WHERE email = 'victim_org_b@pharmaflow.test';",
      );
      if (oldVictim.rows.length > 0) {
        const victimId = oldVictim.rows[0].id;
        await pool.query(
          "DELETE FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = $1);",
          [victimId],
        );
        await pool.query("DELETE FROM organisations WHERE owner_id = $1;", [
          victimId,
        ]);
        await pool.query("DELETE FROM users WHERE id = $1;", [victimId]);
      }
      await pool.query(
        "DELETE FROM users WHERE email = 'inactive_test@pharmaflow.test';",
      );
    } catch (_) {}

    const victimUser = await pool.query(
      `INSERT INTO users (name, email, password_hash, supabase_auth_id, status)
       VALUES ('Tenant B Victim', 'victim_org_b@pharmaflow.test', 'dummy_hash', $1, 'ACTIVE')
       RETURNING id;`,
      [crypto.randomUUID()],
    );
    const tenantBOrgRes = await pool.query(
      `INSERT INTO organisations (name, owner_id, status)
       VALUES ('Victim Organisation B', $1, 'ACTIVE')
       RETURNING id;`,
      [victimUser.rows[0].id],
    );
    tenantBOrgId = tenantBOrgRes.rows[0].id;

    const tenantBBranchRes = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, 'Victim Branch B', 'BR-VICTIM-B', 'ACTIVE')
       RETURNING id;`,
      [tenantBOrgId],
    );
    tenantBBranchId = tenantBBranchRes.rows[0].id;

    // 4. Get Platform Superadmin
    const superRes = await pool.query(
      "SELECT id, email, supabase_auth_id FROM users WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE' LIMIT 1;",
    );
    assert.ok(superRes.rows.length > 0, "Platform superadmin must exist");
    superadminUser = superRes.rows[0];
    if (!superadminUser.supabase_auth_id) {
      const superAuthId = crypto.randomUUID();
      await pool.query(
        "UPDATE users SET supabase_auth_id = $1 WHERE id = $2;",
        [superAuthId, superadminUser.id],
      );
      superadminUser.supabase_auth_id = superAuthId;
    }

    // 5. Create Inactive User
    const inactiveRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, supabase_auth_id, status)
       VALUES ('Inactive User', 'inactive_test@pharmaflow.test', 'dummy_hash', $1, 'INACTIVE')
       RETURNING id, email, supabase_auth_id;`,
      [crypto.randomUUID()],
    );
    inactiveUser = inactiveRes.rows[0];

    console.log("  ✓ Fixtures loaded successfully.\n");

    // =========================================================================
    // SECTION 1: Supabase JWT Verification
    // =========================================================================
    console.log("[Section 1] Supabase JWT Authentication & Token Validation");

    // Test 1: Valid Supabase JWT
    const validToken = createSupabaseTestToken({
      sub: tenantAOwner.supabase_auth_id,
      email: tenantAOwner.email,
    });

    const validRes = await makeRequest("/api/cashier/products", {
      headers: {
        Authorization: `Bearer ${validToken}`,
        "x-organisation-id": tenantAOrgId,
      },
    });
    if (validRes.status === 200) {
      testPass("Valid Supabase JWT accepted on protected route (200 OK)");
    } else {
      testFail("Valid Supabase JWT was rejected", validRes);
    }

    // Test 2: Invalid Cryptographic Signature
    const tamperedToken = validToken.slice(0, -5) + "abcde";
    const tamperedRes = await makeRequest("/api/cashier/products", {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
        "x-organisation-id": tenantAOrgId,
      },
    });
    if (tamperedRes.status === 401) {
      testPass(
        "Tampered cryptographic signature correctly rejected (401 Unauthorized)",
      );
    } else {
      testFail("Tampered signature was not rejected with 401", tamperedRes);
    }

    // Test 3: Expired Supabase JWT
    const expiredToken = jwt.sign(
      {
        sub: tenantAOwner.supabase_auth_id,
        email: tenantAOwner.email,
        aud: "authenticated",
        iss: `${SUPABASE_URL}/auth/v1`,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      },
      SUPABASE_JWT_SECRET,
      { algorithm: "HS256" },
    );

    const expiredRes = await makeRequest("/api/cashier/products", {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
        "x-organisation-id": tenantAOrgId,
      },
    });
    if (expiredRes.status === 401) {
      testPass("Expired Supabase JWT correctly rejected (401 Unauthorized)");
    } else {
      testFail("Expired JWT was not rejected with 401", expiredRes);
    }

    // Test 4: Malformed Authorization Header
    const malformedRes = await makeRequest("/api/cashier/products", {
      headers: {
        Authorization: "NotBearerSomethingInvalid",
      },
    });
    if (malformedRes.status === 401) {
      testPass(
        "Malformed authorization header correctly rejected (401 Unauthorized)",
      );
    } else {
      testFail("Malformed header was not rejected with 401", malformedRes);
    }

    // Test 5: Unknown Supabase User (sub not in database)
    const unknownToken = createSupabaseTestToken({
      sub: crypto.randomUUID(),
      email: "completely_unknown_user_9999@test.com",
    });
    const unknownRes = await makeRequest("/api/branches", {
      headers: {
        Authorization: `Bearer ${unknownToken}`,
      },
    });
    if (unknownRes.status === 401) {
      testPass(
        "Unknown Supabase user identity correctly rejected (401 Unauthorized)",
      );
    } else {
      testFail("Unknown user was not rejected with 401", unknownRes);
    }

    // Test 6: Inactive PharmaFlow User Account
    const inactiveToken = createSupabaseTestToken({
      sub: inactiveUser.supabase_auth_id,
      email: inactiveUser.email,
    });
    const inactiveResTest = await makeRequest("/api/branches", {
      headers: {
        Authorization: `Bearer ${inactiveToken}`,
      },
    });
    if (inactiveResTest.status === 401) {
      testPass(
        "Inactive database user correctly rejected despite valid JWT (401 Unauthorized)",
      );
    } else {
      testFail("Inactive user was not rejected with 401", inactiveResTest);
    }

    // =========================================================================
    // SECTION 2: Multi-Tenant & Branch Isolation
    // =========================================================================
    console.log("\n[Section 2] Multi-Tenant & Branch Isolation Enforcement");

    // Test 7: Foreign Organisation Spoofing Attack
    const foreignOrgRes = await makeRequest("/api/branches", {
      headers: {
        Authorization: `Bearer ${validToken}`,
        "x-organisation-id": tenantBOrgId, // User belongs to Tenant A, requests Tenant B
      },
    });
    if (foreignOrgRes.status === 403) {
      testPass("Cross-tenant organisation attack rejected (403 Forbidden)");
    } else {
      testFail("Cross-tenant attack was not rejected with 403", foreignOrgRes);
    }

    // Test 8: Foreign Branch Spoofing Attack
    const foreignBranchRes = await makeRequest("/api/cashier/sales", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
        "x-organisation-id": tenantAOrgId,
        "x-branch-id": tenantBBranchId, // Branch B belongs to Tenant B!
      },
      body: JSON.stringify({ items: [] }),
    });
    if (foreignBranchRes.status === 403) {
      testPass("Cross-tenant branch attack rejected (403 Forbidden)");
    } else {
      testFail(
        "Cross-tenant branch attack was not rejected with 403",
        foreignBranchRes,
      );
    }

    // =========================================================================
    // SECTION 3: Platform Superadmin Clearance
    // =========================================================================
    console.log("\n[Section 3] Platform Superadmin Clearance");

    const superToken = createSupabaseTestToken({
      sub: superadminUser.supabase_auth_id,
      email: superadminUser.email,
    });

    // Test 9: Valid Superadmin Access
    const superMetricsRes = await makeRequest(
      "/api/superadmin/dashboard/metrics",
      {
        headers: {
          Authorization: `Bearer ${superToken}`,
        },
      },
    );
    if (superMetricsRes.status === 200) {
      testPass("Platform Superadmin with Supabase JWT granted access (200 OK)");
    } else {
      testFail("Platform Superadmin was rejected", superMetricsRes);
    }

    // Test 10: Normal Tenant User Hitting Superadmin Route
    const normalUserSuperRes = await makeRequest(
      "/api/superadmin/dashboard/metrics",
      {
        headers: {
          Authorization: `Bearer ${validToken}`, // Tenant A Owner is NOT superadmin
        },
      },
    );
    if (normalUserSuperRes.status === 403) {
      testPass(
        "Normal tenant user blocked from Superadmin endpoint (403 Forbidden)",
      );
    } else {
      testFail(
        "Normal user was not blocked from superadmin endpoint",
        normalUserSuperRes,
      );
    }

    // =========================================================================
    // SECTION 4: Sync Authentication with Supabase JWT
    // =========================================================================
    console.log("\n[Section 4] Authoritative Offline Sync Authentication");

    // Test 11: Valid Sync Status
    const syncStatusRes = await makeRequest("/api/sync/status", {
      headers: {
        Authorization: `Bearer ${validToken}`,
        "x-organisation-id": tenantAOrgId,
      },
    });
    if (syncStatusRes.status === 200) {
      testPass("Authenticated sync status query succeeded (200 OK)");
    } else {
      testFail("Sync status query failed", syncStatusRes);
    }

    // Test 12: Cross-Tenant Sync Pull Attempt
    const crossSyncRes = await makeRequest(
      `/api/sync/pull?organisationId=${tenantBOrgId}`,
      {
        headers: {
          Authorization: `Bearer ${validToken}`,
          "x-organisation-id": tenantBOrgId,
        },
      },
    );
    if (crossSyncRes.status === 403) {
      testPass("Cross-tenant sync pull attempt rejected (403 Forbidden)");
    } else {
      testFail(
        "Cross-tenant sync pull was not rejected with 403",
        crossSyncRes,
      );
    }

    // =========================================================================
    // SECTION 5: Auth Endpoints (Register, Login, Password Recovery)
    // =========================================================================
    console.log("\n[Section 5] Authentication API Endpoints");

    // Test 13: User Registration
    const newTestEmail = `supa_test_${Date.now()}@pharmaflow.test`;
    const registerRes = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyName: "Supabase Test Pharmacy",
        email: newTestEmail,
        password: "TestPassword123!",
        name: "Supabase Test User",
      }),
    });
    if (registerRes.status === 201 && registerRes.body?.user?.supabaseAuthId) {
      testPass(
        "User registration succeeds and links supabase_auth_id (201 Created)",
      );
    } else {
      testFail("User registration failed", registerRes);
    }

    // Test 14: Duplicate User Registration
    const dupRegisterRes = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyName: "Duplicate Pharmacy",
        email: newTestEmail,
        password: "TestPassword123!",
        name: "Duplicate User",
      }),
    });
    if (dupRegisterRes.status === 400) {
      testPass("Duplicate user registration rejected (400 Bad Request)");
    } else {
      testFail(
        "Duplicate registration was not rejected with 400",
        dupRegisterRes,
      );
    }

    // Test 15: Password Login
    const loginRes = await makeRequest("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "root@falah.com",
        password: "more#78548",
      }),
    });
    if (loginRes.status === 200 && loginRes.body?.token) {
      testPass("User login succeeds and issues Supabase JWT (200 OK)");
    } else {
      testFail("User login failed", loginRes);
    }

    // Test 16: Invalid Password Login
    const invalidLoginRes = await makeRequest("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "root@falah.com",
        password: "WrongPassword999",
      }),
    });
    if (invalidLoginRes.status === 401) {
      testPass("Invalid password login rejected (401 Unauthorized)");
    } else {
      testFail("Invalid password was not rejected with 401", invalidLoginRes);
    }

    // Test 17: Forgot Password Request
    const forgotRes = await makeRequest("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "root@falah.com",
      }),
    });
    if (forgotRes.status === 200 && forgotRes.body?.success) {
      testPass("Forgot password recovery request accepted (200 OK)");
    } else {
      testFail("Forgot password request failed", forgotRes);
    }

    // Test 18: PIN Login Fail-Closed
    const pinRes = await makeRequest("/api/auth/pin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    if (pinRes.status === 401) {
      testPass("Cashier PIN login correctly fails closed (401 Unauthorized)");
    } else {
      testFail("PIN login was not rejected with 401", pinRes);
    }

    // -------------------------------------------------------------------------
    // Cleanup Fixtures
    // -------------------------------------------------------------------------
    console.log("\n[Cleanup] Removing temporary test fixtures...");
    const testUserRows = await pool.query(
      "SELECT id FROM users WHERE email = $1;",
      [newTestEmail],
    );
    if (testUserRows.rows.length > 0) {
      const newUserId = testUserRows.rows[0].id;
      const testOrgs = await pool.query(
        "SELECT id FROM organisations WHERE owner_id = $1;",
        [newUserId],
      );
      for (const org of testOrgs.rows) {
        await pool.query(
          "DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organisation_id = $1);",
          [org.id],
        );
        await pool.query(
          "DELETE FROM branch_assignments WHERE membership_id IN (SELECT id FROM organisation_memberships WHERE organisation_id = $1);",
          [org.id],
        );
        await pool.query(
          "DELETE FROM organisation_memberships WHERE organisation_id = $1;",
          [org.id],
        );
        await pool.query("DELETE FROM branches WHERE organisation_id = $1;", [
          org.id,
        ]);
        await pool.query("DELETE FROM roles WHERE organisation_id = $1;", [
          org.id,
        ]);
        await pool.query(
          "DELETE FROM subscriptions WHERE organisation_id = $1;",
          [org.id],
        );
        await pool.query("DELETE FROM organisations WHERE id = $1;", [org.id]);
      }
    }
    await pool.query("DELETE FROM branches WHERE id = $1;", [tenantBBranchId]);
    await pool.query("DELETE FROM subscriptions WHERE organisation_id = $1;", [
      tenantBOrgId,
    ]);
    await pool.query("DELETE FROM organisations WHERE id = $1;", [
      tenantBOrgId,
    ]);
    await pool.query("DELETE FROM users WHERE email IN ($1, $2, $3);", [
      "victim_org_b@pharmaflow.test",
      "inactive_test@pharmaflow.test",
      newTestEmail,
    ]);
    console.log("  ✓ Cleanup complete.");
  } catch (err) {
    console.error("\n❌ SUPABASE AUTH TEST SUITE RUNTIME ERROR:", err);
    failed++;
  }

  console.log("\n====================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runSupabaseAuthSuite().then(() => {
    if (require.main === module) {
      pool.end();
    }
  });
}

module.exports = { runSupabaseAuthSuite };
