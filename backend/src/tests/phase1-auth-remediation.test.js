/**
 * Phase 1 Authentication Remediation Test Suite
 *
 * Verifies Phase 1 acceptance criteria:
 * 1. Pharmacy Owner Onboarding (/api/auth/register creates user, organisation, branches, system roles, memberships, assignments)
 * 2. Tenant & Role Injection Prevention (rejects/ignores client-supplied orgId, roleId, role, is_platform_superadmin)
 * 3. Authoritative Workspace Context (/api/auth/me returns user, organisation, branch, roles)
 * 4. Hardened Google Login (/api/auth/google strictly requires verified Supabase JWT)
 * 5. Platform Superadmin Gating (/api/superadmin/auth/me grants superadmin, denies tenant user with 403)
 */

require("dotenv").config();
const assert = require("assert");
const crypto = require("crypto");
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
  return { status: res.status, body };
}

async function runPhase1Suite() {
  console.log("====================================================");
  console.log("  🏥 PHARMAFLOW PHASE 1 AUTH REMEDIATION SUITE      ");
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
  let testOwnerEmail = `owner_${runId}@pharmaflow-test.io`;
  let testOwnerUser = null;
  let testOrgId = null;
  let superadminUser = null;

  try {
    // -------------------------------------------------------------
    // Setup & Superadmin Discovery
    // -------------------------------------------------------------
    const saRes = await pool.query(
      "SELECT id, name, email, is_platform_superadmin, supabase_auth_id FROM users WHERE is_platform_superadmin = TRUE AND status = 'ACTIVE' LIMIT 1;",
    );
    if (saRes.rows.length > 0) {
      superadminUser = saRes.rows[0];
    }

    // =============================================================
    // TEST 1: Pharmacy Owner Onboarding (Full Flow)
    // =============================================================
    console.log("[Group 1] Pharmacy Owner Onboarding...");

    const regPayload = {
      pharmacyName: `Remediation Test Pharmacy ${runId}`,
      name: `Dr. Owner ${runId}`,
      email: testOwnerEmail,
      password: "StrongPassword#2026",
      branchName: "Central Dispensary",
      phone: "+91 9998887776",
      city: "Pune",
    };

    const regRes = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regPayload),
    });

    if (regRes.status === 201 && regRes.body?.success) {
      testPass("Owner Onboarding succeeded with HTTP 201");
      testOwnerUser = regRes.body.user;
      testOrgId = regRes.body.organisation?.id;
    } else {
      testFail("Owner Onboarding failed", regRes.body);
    }

    // Verify DB Entities
    if (testOwnerUser?.id && testOrgId) {
      const userCheck = await pool.query(
        "SELECT id, email, status, is_platform_superadmin FROM users WHERE id = $1;",
        [testOwnerUser.id],
      );
      assert.strictEqual(userCheck.rows[0]?.status, "ACTIVE");
      assert.strictEqual(userCheck.rows[0]?.is_platform_superadmin, false);
      testPass("Database user verified ACTIVE and not superadmin");

      const orgCheck = await pool.query(
        "SELECT id, name, owner_id FROM organisations WHERE id = $1;",
        [testOrgId],
      );
      assert.strictEqual(orgCheck.rows[0]?.owner_id, testOwnerUser.id);
      testPass("Organisation verified with owner_id = new user");

      const branchCheck = await pool.query(
        "SELECT id, name FROM branches WHERE organisation_id = $1;",
        [testOrgId],
      );
      assert.strictEqual(branchCheck.rows.length, 1);
      assert.strictEqual(branchCheck.rows[0]?.name, "Central Dispensary");
      testPass("Initial branch created and linked to organisation");

      const rolesCheck = await pool.query(
        "SELECT role_identifier, name FROM roles WHERE organisation_id = $1;",
        [testOrgId],
      );
      const roleIdentifiers = rolesCheck.rows.map((r) => r.role_identifier);
      assert.ok(roleIdentifiers.includes("ADMIN"), "Must have ADMIN role");
      assert.ok(roleIdentifiers.includes("MANAGER"), "Must have MANAGER role");
      assert.ok(
        roleIdentifiers.includes("PHARMACIST"),
        "Must have PHARMACIST role",
      );
      assert.ok(roleIdentifiers.includes("CASHIER"), "Must have CASHIER role");
      testPass(
        "System roles (ADMIN, MANAGER, PHARMACIST, CASHIER) seeded for new org",
      );

      const memberCheck = await pool.query(
        "SELECT user_id, status FROM organisation_memberships WHERE organisation_id = $1;",
        [testOrgId],
      );
      assert.strictEqual(memberCheck.rows[0]?.user_id, testOwnerUser.id);
      assert.strictEqual(memberCheck.rows[0]?.status, "ACTIVE");
      testPass("Organisation membership created with ACTIVE status");

      const assignCheck = await pool.query(
        `SELECT ba.branch_id, r.role_identifier 
         FROM branch_assignments ba
         JOIN organisation_memberships om ON ba.membership_id = om.id
         JOIN roles r ON ba.role_id = r.id
         WHERE om.organisation_id = $1;`,
        [testOrgId],
      );
      assert.ok(assignCheck.rows.length > 0);
      assert.strictEqual(assignCheck.rows[0]?.role_identifier, "ADMIN");
      testPass("Branch assignment linked with administrator role");
    }

    // =============================================================
    // TEST 2: Security & Injection Prevention on Registration
    // =============================================================
    console.log("\n[Group 2] Injection Prevention on Registration...");

    const fakeOrgId = "00000000-0000-0000-0000-000000000000";
    const fakeRoleId = "00000000-0000-0000-0000-000000000001";
    const maliciousEmail = `hacker_${runId}@pharmaflow-test.io`;

    const injectRes = await makeRequest("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacyName: `Injected Pharmacy ${runId}`,
        name: "Hacker User",
        email: maliciousEmail,
        password: "StrongPassword#2026",
        organisationId: fakeOrgId,
        roleId: fakeRoleId,
        role: "SUPERADMIN",
        is_platform_superadmin: true,
      }),
    });

    if (injectRes.status === 201 && injectRes.body?.success) {
      const hackerUser = injectRes.body.user;
      const hackerDb = await pool.query(
        "SELECT id, is_platform_superadmin FROM users WHERE id = $1;",
        [hackerUser.id],
      );
      assert.strictEqual(hackerDb.rows[0]?.is_platform_superadmin, false);
      assert.notStrictEqual(injectRes.body.organisation.id, fakeOrgId);

      const hackerRole = await pool.query(
        `SELECT r.role_identifier 
         FROM branch_assignments ba
         JOIN organisation_memberships om ON ba.membership_id = om.id
         JOIN roles r ON ba.role_id = r.id
         WHERE om.user_id = $1;`,
        [hackerUser.id],
      );
      assert.strictEqual(hackerRole.rows[0]?.role_identifier, "ADMIN");
      testPass(
        "Client-supplied organisationId, role, and is_platform_superadmin ignored",
      );

      // Cleanup
      await pool
        .query("DELETE FROM users WHERE id = $1;", [hackerUser.id])
        .catch(() => {});
      if (injectRes.body.organisation?.id) {
        await pool
          .query("DELETE FROM organisations WHERE id = $1;", [
            injectRes.body.organisation.id,
          ])
          .catch(() => {});
      }
    } else {
      testFail(
        "Injection test registration failed unexpectedly",
        injectRes.body,
      );
    }

    // =============================================================
    // TEST 3: Authoritative User Context (/api/auth/me)
    // =============================================================
    console.log("\n[Group 3] GET /api/auth/me Endpoint...");

    // 3.1 Unauthenticated call -> 401
    const noTokenMe = await makeRequest("/api/auth/me", { method: "GET" });
    if (noTokenMe.status === 401) {
      testPass("GET /api/auth/me without token returns HTTP 401");
    } else {
      testFail("GET /api/auth/me should return 401 without token", noTokenMe);
    }

    // 3.2 Authenticated call with owner token
    if (testOwnerUser) {
      const ownerToken = createSupabaseTestToken({
        userId:
          testOwnerUser.supabaseAuthId ||
          testOwnerUser.supabase_auth_id ||
          testOwnerUser.id,
        email: testOwnerUser.email,
      });

      const ownerMe = await makeRequest("/api/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      if (ownerMe.status === 200 && ownerMe.body?.success) {
        const u = ownerMe.body.user || ownerMe.body.data?.user;
        assert.strictEqual(u.id, testOwnerUser.id);
        assert.strictEqual(u.email, testOwnerUser.email);
        assert.strictEqual(u.organisationId, testOrgId);
        assert.strictEqual(u.role, "OWNER");
        testPass(
          "GET /api/auth/me returns authenticated owner profile with org and role context",
        );
      } else {
        testFail("GET /api/auth/me with owner token failed", ownerMe);
      }
    }

    // =============================================================
    // TEST 4: Hardened Google Auth Endpoint
    // =============================================================
    console.log("\n[Group 4] Hardened Google Auth (/api/auth/google)...");

    // 4.1 Plain body without Bearer token -> 401
    const spoofedGoogle = await makeRequest("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "victim@target.com",
        name: "Victim User",
        googleSub: "spoofed_sub_123",
      }),
    });

    if (spoofedGoogle.status === 401) {
      testPass(
        "Google auth without verified Supabase JWT rejected with HTTP 401",
      );
    } else {
      testFail(
        "Google auth must require verified Supabase Bearer token",
        spoofedGoogle,
      );
    }

    // 4.2 Verified Supabase Google Token for existing user
    if (testOwnerUser) {
      const googleToken = createSupabaseTestToken({
        userId:
          testOwnerUser.supabaseAuthId ||
          testOwnerUser.supabase_auth_id ||
          testOwnerUser.id,
        email: testOwnerUser.email,
      });

      const validGoogle = await makeRequest("/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${googleToken}`,
        },
        body: JSON.stringify({
          email: testOwnerUser.email,
          name: testOwnerUser.name,
        }),
      });

      if (validGoogle.status === 200 && validGoogle.body?.success) {
        assert.strictEqual(validGoogle.body.user.email, testOwnerUser.email);
        testPass(
          "Google auth with verified Supabase JWT succeeds with HTTP 200",
        );
      } else {
        testFail("Google auth with verified token failed", validGoogle);
      }
    }

    // =============================================================
    // TEST 5: Superadmin Clearance Gating
    // =============================================================
    console.log("\n[Group 5] Platform Superadmin Clearance Gating...");

    // 5.1 Normal tenant user accessing superadmin -> 403 Forbidden
    if (testOwnerUser) {
      const tenantToken = createSupabaseTestToken({
        userId:
          testOwnerUser.supabaseAuthId ||
          testOwnerUser.supabase_auth_id ||
          testOwnerUser.id,
        email: testOwnerUser.email,
      });

      const tenantSaRes = await makeRequest("/api/superadmin/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tenantToken}`,
        },
      });

      if (tenantSaRes.status === 403) {
        testPass(
          "Normal tenant owner denied superadmin clearance with HTTP 403",
        );
      } else {
        testFail(
          "Tenant user must receive HTTP 403 on superadmin endpoint",
          tenantSaRes,
        );
      }
    }

    // 5.2 Real platform superadmin token -> 200 OK
    if (superadminUser) {
      const saToken = createSupabaseTestToken({
        userId: superadminUser.supabase_auth_id || superadminUser.id,
        email: superadminUser.email,
      });

      const saMeRes = await makeRequest("/api/superadmin/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${saToken}`,
        },
      });

      if (saMeRes.status === 200 && saMeRes.body?.success) {
        assert.strictEqual(saMeRes.body.user.isPlatformSuperadmin, true);
        testPass(
          "Platform Superadmin token verified with HTTP 200 and clearance confirmed",
        );
      } else {
        testFail("Superadmin /auth/me failed for platform superadmin", saMeRes);
      }
    }
  } catch (err) {
    console.error("Suite exception:", err);
    failed++;
  } finally {
    // Cleanup test owner organisation and user
    if (testOwnerUser?.id) {
      try {
        await pool.query("DELETE FROM users WHERE id = $1;", [
          testOwnerUser.id,
        ]);
        if (testOrgId) {
          await pool.query("DELETE FROM organisations WHERE id = $1;", [
            testOrgId,
          ]);
        }
      } catch (_) {}
    }
  }

  console.log("\n====================================================");
  console.log(`  PHASE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase1Suite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal test runner error:", err);
      process.exit(1);
    });
}

module.exports = { runPhase1Suite };
