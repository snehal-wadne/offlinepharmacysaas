/**
 * Branch GST Repository Integration Test
 *
 * Verifies:
 * - Branch GST settings creation
 * - Projection of all GST fields
 * - Get GST settings with Redis cache miss and hit
 * - Update GST settings and cache invalidation
 * - One-to-one uniqueness constraint per branch
 * - Tenant isolation
 * - Transaction client Redis bypass
 * - Deletion of GST settings
 */

require("dotenv").config();

const assert = require("assert");

const {
  createBranchGstSettings,
  getBranchGstSettings,
  updateBranchGstSettings,
  deleteBranchGstSettings,
} = require("../repositories/branch-gst.repository");

const { pool } = require("../db/connection");
const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");
const { getCache, deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const runTests = async () => {
  let ownerId = null;
  let organisationId = null;
  let otherOrgId = null;
  let branchId = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Branch GST Repository tests...\n");

    // 1. Setup Test Owner, Organisations, and Branch
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("gst-owner")}@test.local`, "GST Test Owner", "hash"],
    );
    ownerId = userRes.rows[0].id;

    const orgRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `GST Test Org 1 ${uniqueValue("")}`],
    );
    organisationId = orgRes.rows[0].id;

    const otherOrgRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `GST Test Org 2 ${uniqueValue("")}`],
    );
    otherOrgId = otherOrgRes.rows[0].id;

    const branchRes = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [organisationId, "GST Test Branch", `BR-${Date.now()}`],
    );
    branchId = branchRes.rows[0].id;

    console.log("✓ 1. Test fixtures initialized");

    // 2. Create Branch GST Settings
    const gstData = {
      organisationId,
      branchId,
      gstin: "27AAAAF1234F1Z5",
      legalName: "Flora Healthcare Pvt Ltd",
      tradeName: "PharmaFlow Main",
      state: "Maharashtra",
      stateCode: "27",
      gstScheme: "REGULAR",
      taxInclusivePricing: true,
      autoInterstateSplit: true,
      eInvoicingEnabled: false,
      status: "ACTIVE",
    };

    const created = await createBranchGstSettings(gstData);
    assert.ok(created.id);
    assert.strictEqual(created.organisation_id, organisationId);
    assert.strictEqual(created.branch_id, branchId);
    assert.strictEqual(created.gstin, "27AAAAF1234F1Z5");
    assert.strictEqual(created.legal_name, "Flora Healthcare Pvt Ltd");
    assert.strictEqual(created.trade_name, "PharmaFlow Main");
    assert.strictEqual(created.state, "Maharashtra");
    assert.strictEqual(created.state_code, "27");
    assert.strictEqual(created.gst_scheme, "REGULAR");
    assert.strictEqual(created.tax_inclusive_pricing, true);
    assert.strictEqual(created.auto_interstate_split, true);
    assert.strictEqual(created.e_invoicing_enabled, false);

    console.log("✓ 2. Branch GST settings created with all fields returned");

    // 3. Cache miss populates Redis
    const cacheKey = `organisation:${organisationId}:branch:${branchId}:gst`;
    await deleteCache(cacheKey);

    const fetched = await getBranchGstSettings(organisationId, branchId);
    assert.ok(fetched);
    assert.strictEqual(fetched.gstin, "27AAAAF1234F1Z5");

    const cachedRaw = await redisClient.get(cacheKey);
    assert.ok(cachedRaw, "GST settings should be cached in Redis");
    const cachedParsed = JSON.parse(cachedRaw);
    assert.strictEqual(cachedParsed.gstin, "27AAAAF1234F1Z5");

    console.log("✓ 3. Branch GST cache miss populates Redis");

    // 4. Cache hit returns cached data
    const cacheHit = await getBranchGstSettings(organisationId, branchId);
    assert.strictEqual(cacheHit.gstin, "27AAAAF1234F1Z5");

    console.log("✓ 4. Branch GST cache hit returns correct data");

    // 5. Tenant isolation
    const wrongOrg = await getBranchGstSettings(otherOrgId, branchId);
    assert.strictEqual(wrongOrg, null, "GST settings must be tenant isolated");

    console.log("✓ 5. Tenant isolation verified");

    // 6. Transaction client bypasses Redis
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txResult = await getBranchGstSettings(
        organisationId,
        branchId,
        client,
      );
      assert.ok(txResult);
      assert.strictEqual(txResult.gstin, "27AAAAF1234F1Z5");
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    console.log("✓ 6. Transaction client correctly reads from PostgreSQL");

    // 7. Update GST Settings
    const dashboardStatsCacheKey = `organisation:${organisationId}:branch-mgmt:branch-stats`;
    await redisClient.set(
      dashboardStatsCacheKey,
      JSON.stringify({ total_gst_registered: 1 }),
      { EX: 60 },
    );

    const updated = await updateBranchGstSettings(organisationId, branchId, {
      tradeName: "PharmaFlow Main - Updated",
      eInvoicingEnabled: true,
    });
    assert.ok(updated);
    assert.strictEqual(updated.trade_name, "PharmaFlow Main - Updated");
    assert.strictEqual(updated.e_invoicing_enabled, true);
    assert.strictEqual(
      updated.gstin,
      "27AAAAF1234F1Z5",
      "Unchanged fields preserved",
    );

    // Cache should be invalidated
    const cacheAfterUpdate = await redisClient.get(cacheKey);
    assert.strictEqual(
      cacheAfterUpdate,
      null,
      "Cache must be invalidated after update",
    );
    assert.strictEqual(
      await redisClient.get(dashboardStatsCacheKey),
      null,
      "GST writes must invalidate cached branch dashboard statistics",
    );

    console.log(
      "✓ 7. Update GST settings invalidates cache and returns updated fields",
    );

    // 8. 1:1 constraint enforcement
    let duplicateFailed = false;
    try {
      await createBranchGstSettings({
        organisationId,
        branchId,
        gstin: "27BBBBF1234F1Z6",
      });
    } catch (err) {
      duplicateFailed = true;
    }
    assert.ok(
      duplicateFailed,
      "Cannot create duplicate GST settings for the same branch",
    );

    console.log("✓ 8. 1:1 uniqueness constraint enforced per branch");

    // 9. Delete GST Settings
    const deleted = await deleteBranchGstSettings(organisationId, branchId);
    assert.ok(deleted);

    const recheck = await getBranchGstSettings(organisationId, branchId);
    assert.strictEqual(recheck, null);

    console.log("✓ 9. Delete GST settings works");

    console.log("\n✓ All Branch GST Repository tests passed successfully!\n");
  } catch (error) {
    console.error("Branch GST Repository test failed:", error);
    process.exitCode = 1;
  } finally {
    if (branchId) {
      try {
        await pool.query("DELETE FROM branches WHERE id = $1;", [branchId]);
      } catch (e) {}
    }
    if (organisationId) {
      try {
        await pool.query("DELETE FROM organisations WHERE id = $1;", [
          organisationId,
        ]);
      } catch (e) {}
    }
    if (otherOrgId) {
      try {
        await pool.query("DELETE FROM organisations WHERE id = $1;", [
          otherOrgId,
        ]);
      } catch (e) {}
    }
    if (ownerId) {
      try {
        await pool.query("DELETE FROM users WHERE id = $1;", [ownerId]);
      } catch (e) {}
    }
    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (e) {}
    await pool.end();
  }
};

runTests();
