/**
 * Test script for all Sync Engine API endpoints
 */
const { pool } = require("../db/connection");
const { signToken } = require("../utils/token.util");

async function runTests() {
  console.log("=== Testing Sync Engine Endpoints ===");

  // Find a valid active user with organisation and branch
  const userRes = await pool.query(`
    SELECT u.id as user_id, om.organisation_id, ba.branch_id
    FROM users u
    JOIN organisation_memberships om ON om.user_id = u.id AND om.status = 'ACTIVE'
    JOIN branch_assignments ba ON ba.membership_id = om.id
    JOIN branches b ON b.id = ba.branch_id AND b.status = 'ACTIVE'
    JOIN organisations o ON o.id = om.organisation_id AND o.status = 'ACTIVE'
    WHERE u.status = 'ACTIVE'
    LIMIT 1;
  `);

  if (userRes.rows.length === 0) {
    console.error("No valid active user found for tests!");
    process.exit(1);
  }

  const { user_id, organisation_id, branch_id } = userRes.rows[0];
  console.log(`Test user:   ${user_id}`);
  console.log(`Test org:    ${organisation_id}`);
  console.log(`Test branch: ${branch_id}`);

  const token = signToken({ userId: user_id });
  const baseUrl = "http://localhost:5000";

  let passed = 0;
  let failed = 0;

  async function testEndpoint(name, url, options, expectedStatus = 200) {
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (res.status === expectedStatus) {
        console.log(`✅ [PASS] ${name} -> HTTP ${res.status}`);
        passed++;
        return data;
      } else {
        console.error(
          `❌ [FAIL] ${name} -> Expected HTTP ${expectedStatus}, got ${res.status}:`,
          data,
        );
        failed++;
        return null;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${name} -> Network error:`, err.message);
      failed++;
      return null;
    }
  }

  // 1. Bootstrap with Authorization header
  console.log("\n--- 1. Testing /api/sync/bootstrap ---");
  await testEndpoint(
    "Bootstrap with Authorization Bearer header",
    `${baseUrl}/api/sync/bootstrap?organisationId=${encodeURIComponent(organisation_id)}&branchId=${encodeURIComponent(branch_id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-organisation-id": organisation_id,
        "x-branch-id": branch_id,
      },
    },
  );

  // 2. Bootstrap with x-sync-auth header
  await testEndpoint(
    "Bootstrap with x-sync-auth header",
    `${baseUrl}/api/sync/bootstrap?organisationId=${encodeURIComponent(organisation_id)}&branchId=${encodeURIComponent(branch_id)}`,
    {
      method: "GET",
      headers: {
        "x-sync-auth": token,
        "x-organisation-id": organisation_id,
        "x-branch-id": branch_id,
      },
    },
  );

  // 3. Bootstrap without auth header (Dev fallback when ALLOW_DEV_AUTH=true)
  await testEndpoint(
    "Bootstrap dev fallback (no token, non-prod)",
    `${baseUrl}/api/sync/bootstrap?organisationId=${encodeURIComponent(organisation_id)}&branchId=${encodeURIComponent(branch_id)}`,
    {
      method: "GET",
      headers: {
        "x-organisation-id": organisation_id,
        "x-branch-id": branch_id,
      },
    },
  );

  // 4. Pull changes
  console.log("\n--- 2. Testing /api/sync/pull ---");
  await testEndpoint(
    "Pull changes with Bearer token",
    `${baseUrl}/api/sync/pull?organisationId=${encodeURIComponent(organisation_id)}&branchId=${encodeURIComponent(branch_id)}&cursor=0&limit=10`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-organisation-id": organisation_id,
        "x-branch-id": branch_id,
      },
    },
  );

  // 5. Push mutations
  console.log("\n--- 3. Testing /api/sync/push ---");
  await testEndpoint(
    "Push empty mutations batch with Bearer token",
    `${baseUrl}/api/sync/push`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-organisation-id": organisation_id,
        "x-branch-id": branch_id,
      },
      body: JSON.stringify({
        deviceId: "TEST_DEVICE_01",
        batchId: `batch_${Date.now()}`,
        organisationId: organisation_id,
        branchId: branch_id,
        mutations: [],
      }),
    },
  );

  // 6. Batch sync
  console.log("\n--- 4. Testing /api/sync/batch ---");
  await testEndpoint(
    "Batch sync with Bearer token",
    `${baseUrl}/api/sync/batch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-organisation-id": organisation_id,
      },
      body: JSON.stringify({
        batchId: `batch_${Date.now()}`,
        mutations: [],
      }),
    },
  );

  // 7. Status probe
  console.log("\n--- 5. Testing /api/sync/status ---");
  await testEndpoint(
    "Sync status probe with Bearer token",
    `${baseUrl}/api/sync/status`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-organisation-id": organisation_id,
      },
    },
  );

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
