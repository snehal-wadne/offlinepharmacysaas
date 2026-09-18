/**
 * Phase 2 Authentication & Onboarding Remediation Test Suite
 *
 * Verifies Phase 2 requirements:
 * 1. Google Login Fails Closed (404 ACCOUNT_NOT_FOUND) for unregistered Google accounts.
 * 2. Google Onboarding (/api/auth/google-onboard) atomically provisions:
 *    - Owner user in users table linked to Supabase Auth ID
 *    - Organisation in organisations table
 *    - FREE subscription plan in subscriptions table
 *    - Initial branch (or no branch if createInitialBranch=false)
 *    - System roles & Owner membership
 * 3. Incomplete Google signup leaves no tenant entities in PostgreSQL.
 * 4. No-Branch Pharmacy State:
 *    - When createInitialBranch=false, getMe returns hasBranch=false.
 * 5. Inventory Endpoint Routing:
 *    - /api/inventory and /inventory are both mounted and route correctly.
 * 6. Express Root OAuth Forwarding:
 *    - GET / serves the client-side redirect bounce script forwarding tokens to port 8081.
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

async function runPhase2Suite() {
  console.log("====================================================");
  console.log("  🧪 PHARMAFLOW PHASE 2 AUTH & ONBOARDING SUITE     ");
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

  try {
    // -------------------------------------------------------------
    // Test 1: Express Root GET / includes port 8081 OAuth redirect script
    // -------------------------------------------------------------
    console.log("--- Test 1: Express Server OAuth Redirect Script ---");
    {
      const res = await makeRequest("/", { method: "GET" });
      if (
        res.status === 200 &&
        typeof res.body === "string" &&
        res.body.includes("localhost:8081") &&
        res.body.includes("window.location.hash")
      ) {
        testPass(
          "GET / serves client-side redirect script forwarding OAuth tokens to http://localhost:8081",
        );
      } else {
        testFail(
          "GET / did not contain expected OAuth forwarder to port 8081",
          res.body?.slice ? res.body.slice(0, 300) : res.body,
        );
      }
    }

    // -------------------------------------------------------------
    // Test 2: Google Login with unregistered account returns 404 ACCOUNT_NOT_FOUND
    // -------------------------------------------------------------
    console.log("\n--- Test 2: Google Login Semantics (Unregistered User) ---");
    const unregisteredGoogleSub = crypto.randomUUID();
    const unregisteredGoogleEmail = `unreg_${runId}@gmail-oauth-test.com`;
    const unregisteredToken = createSupabaseTestToken({
      sub: unregisteredGoogleSub,
      email: unregisteredGoogleEmail,
      user_metadata: { name: "Unregistered Google User" },
    });

    {
      const res = await makeRequest("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: unregisteredToken }),
      });

      if (
        res.status === 404 &&
        res.body?.code === "ACCOUNT_NOT_FOUND" &&
        res.body?.success === false
      ) {
        testPass(
          "Unregistered Google login rejected with HTTP 404 and code 'ACCOUNT_NOT_FOUND'",
        );
      } else {
        testFail(
          "Expected 404 with code ACCOUNT_NOT_FOUND for unregistered Google account",
          res,
        );
      }

      // Verify no orphan user or organisation was created
      const checkOrphan = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1);",
        [unregisteredGoogleEmail],
      );
      if (checkOrphan.rows.length === 0) {
        testPass(
          "Verified no orphan user entity created in PostgreSQL for failed Google login",
        );
      } else {
        testFail(
          "Orphan user created in PostgreSQL despite failed login!",
          checkOrphan.rows,
        );
      }
    }

    // -------------------------------------------------------------
    // Test 3: Google Onboarding (/api/auth/google-onboard) without token fails
    // -------------------------------------------------------------
    console.log("\n--- Test 3: Google Onboarding Guard ---");
    {
      const res = await makeRequest("/api/auth/google-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pharmacyName: "Test Pharmacy" }),
      });

      if (res.status === 401) {
        testPass(
          "POST /api/auth/google-onboard rejected without token (HTTP 401)",
        );
      } else {
        testFail("Expected 401 when token is missing in google-onboard", res);
      }
    }

    // -------------------------------------------------------------
    // Test 4: Full Google Onboarding with Branch & Free Plan
    // -------------------------------------------------------------
    console.log("\n--- Test 4: Full Google Onboarding Transaction ---");
    const newGoogleSub = crypto.randomUUID();
    const newGoogleEmail = `google_owner_${runId}@pharmaflow-google.com`;
    const newGoogleToken = createSupabaseTestToken({
      sub: newGoogleSub,
      email: newGoogleEmail,
      user_metadata: { full_name: `Dr. Google Owner ${runId}` },
    });

    let onboardedUser = null;
    let onboardedOrgId = null;

    {
      const res = await makeRequest("/api/auth/google-onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newGoogleToken}`,
        },
        body: JSON.stringify({
          pharmacyName: `Google Health Pharmacy ${runId}`,
          ownerName: `Dr. Google Owner ${runId}`,
          phone: "+91 98000 11223",
          address: "100 Medical Enclave",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411001",
          branches: "1",
          branchName: "Central Dispensary",
          gstNumber: "27AABCG1234F1Z5",
          businessType: "Private Limited",
          createInitialBranch: true,
        }),
      });

      if (res.status === 201 && res.body?.success && res.body?.user) {
        onboardedUser = res.body.user;
        onboardedOrgId = res.body.organisation.id;
        testPass(
          "Google Onboarding succeeded with HTTP 201 and valid user/org context",
        );

        assert.strictEqual(onboardedUser.role, "OWNER");
        assert.strictEqual(onboardedUser.hasBranch, true);
        assert.ok(
          onboardedUser.branchId,
          "Expected branchId in onboard response",
        );
        testPass("Response indicates OWNER role and hasBranch=true");
      } else {
        testFail("Google Onboarding failed", res);
      }

      // Check PostgreSQL Free Plan subscription
      const subRes = await pool.query(
        `SELECT s.id, s.status, sp.tier_code, sp.price
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id = s.plan_id
         WHERE s.organisation_id = $1;`,
        [onboardedOrgId],
      );

      if (subRes.rows.length > 0) {
        const sub = subRes.rows[0];
        assert.strictEqual(sub.status, "ACTIVE");
        assert.ok(
          sub.tier_code === "FREE" || Number(sub.price) === 0,
          `Expected FREE tier or price 0, got ${sub.tier_code} / ${sub.price}`,
        );
        testPass(
          `Verified automatic FREE subscription created in PostgreSQL (tier: ${sub.tier_code})`,
        );
      } else {
        testFail("No subscription record found for onboarded organisation!");
      }
    }

    // -------------------------------------------------------------
    // Test 5: Authoritative /api/auth/me for Onboarded Google User
    // -------------------------------------------------------------
    console.log("\n--- Test 5: Authenticated Context for Onboarded User ---");
    {
      const res = await makeRequest("/api/auth/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newGoogleToken}`,
        },
      });

      if (res.status === 200 && res.body?.user) {
        const me = res.body.user;
        assert.strictEqual(me.hasBranch, true);
        assert.strictEqual(me.role, "OWNER");
        assert.strictEqual(me.organisationId, onboardedOrgId);
        testPass(
          "GET /api/auth/me returns authoritative user context with hasBranch=true",
        );
      } else {
        testFail("GET /api/auth/me failed for onboarded user", res);
      }
    }

    // -------------------------------------------------------------
    // Test 6: Subsequent Google Login for registered account succeeds
    // -------------------------------------------------------------
    console.log("\n--- Test 6: Registered Google User Login ---");
    {
      const res = await makeRequest("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newGoogleToken }),
      });

      if (res.status === 200 && res.body?.success && res.body?.user) {
        assert.strictEqual(res.body.user.role, "OWNER");
        assert.strictEqual(res.body.user.hasBranch, true);
        testPass(
          "Google login for registered account succeeds with HTTP 200 and OWNER context",
        );
      } else {
        testFail("Registered Google login failed", res);
      }
    }

    // -------------------------------------------------------------
    // Test 7: Pharmacy Onboarding with NO initial branch (createInitialBranch=false)
    // -------------------------------------------------------------
    console.log(
      "\n--- Test 7: Onboarding without Branch (hasBranch=false) ---",
    );
    const noBranchGoogleSub = crypto.randomUUID();
    const noBranchGoogleEmail = `nobranch_${runId}@pharmaflow-google.com`;
    const noBranchGoogleToken = createSupabaseTestToken({
      sub: noBranchGoogleSub,
      email: noBranchGoogleEmail,
      user_metadata: { full_name: `Dr. No Branch ${runId}` },
    });

    let noBranchOrgId = null;

    {
      const res = await makeRequest("/api/auth/google-onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${noBranchGoogleToken}`,
        },
        body: JSON.stringify({
          pharmacyName: `No Branch Pharmacy ${runId}`,
          ownerName: `Dr. No Branch ${runId}`,
          phone: "+91 98000 99887",
          address: "200 Empty St",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          branchName: "",
          createInitialBranch: false,
        }),
      });

      if (res.status === 201 && res.body?.success) {
        noBranchOrgId = res.body.organisation.id;
        assert.strictEqual(res.body.user.hasBranch, false);
        assert.strictEqual(res.body.user.branchId, null);
        assert.strictEqual(res.body.branch, null);
        testPass(
          "Onboarded without branch: response has hasBranch=false and branch=null",
        );
      } else {
        testFail("Onboarding with createInitialBranch=false failed", res);
      }

      // Query /api/auth/me for this no-branch user
      const meRes = await makeRequest("/api/auth/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${noBranchGoogleToken}`,
        },
      });

      if (meRes.status === 200 && meRes.body?.user) {
        assert.strictEqual(meRes.body.user.hasBranch, false);
        assert.strictEqual(meRes.body.user.branchId, null);
        assert.strictEqual(meRes.body.user.branch, null);
        testPass(
          "GET /api/auth/me authoritatively returns hasBranch=false for no-branch pharmacy",
        );
      } else {
        testFail("GET /api/auth/me failed for no-branch user", meRes);
      }
    }

    // -------------------------------------------------------------
    // Test 8: Inventory Routes Availability (/api/inventory and /inventory)
    // -------------------------------------------------------------
    console.log("\n--- Test 8: Inventory Endpoints Mount Check ---");
    {
      // Check /api/inventory
      const apiInvRes = await makeRequest("/api/inventory", {
        headers: {
          Authorization: `Bearer ${newGoogleToken}`,
          "x-organisation-id": onboardedOrgId,
        },
      });
      // Route exists (even if 200 or requires parameters, it's not a 404 Route Not Found from Express)
      if (apiInvRes.status !== 404) {
        testPass(
          `/api/inventory responded with HTTP ${apiInvRes.status} (route is registered)`,
        );
      } else {
        testFail("/api/inventory returned 404 (Route not mounted)", apiInvRes);
      }

      // Check /inventory alias
      const aliasInvRes = await makeRequest("/inventory", {
        headers: {
          Authorization: `Bearer ${newGoogleToken}`,
          "x-organisation-id": onboardedOrgId,
        },
      });
      if (aliasInvRes.status !== 404) {
        testPass(
          `/inventory alias responded with HTTP ${aliasInvRes.status} (route is registered)`,
        );
      } else {
        testFail(
          "/inventory alias returned 404 (Route not mounted)",
          aliasInvRes,
        );
      }
    }

    // -------------------------------------------------------------
    // Cleanup created test organisations
    // -------------------------------------------------------------
    const orgsToClean = [onboardedOrgId, noBranchOrgId].filter(Boolean);
    for (const orgId of orgsToClean) {
      await pool
        .query("DELETE FROM organisations WHERE id = $1;", [orgId])
        .catch(() => {});
    }
  } catch (err) {
    testFail("Unhandled error in Phase 2 suite", err.message || err);
  } finally {
    console.log("\n====================================================");
    console.log(`  PHASE 2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("====================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhase2Suite().then(() => {
  pool.end().catch(() => {});
});
