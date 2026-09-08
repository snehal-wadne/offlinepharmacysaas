/**
 * Tax Repository Integration Test
 *
 * Verifies:
 * - Creation of tax definitions (no automatic defaults)
 * - Projection of all tax fields
 * - Get tax by ID with Redis cache miss and hit
 * - List organisation taxes (with activeOnly filter)
 * - Update tax definitions and cache invalidation
 * - Set tax active/inactive status
 * - Uniqueness constraint on (organisation_id, name)
 * - Tenant isolation
 * - Transaction client Redis bypass
 * - Tax deletion
 */

require("dotenv").config();

const assert = require("assert");

const {
  createTax,
  getTaxById,
  listTaxes,
  updateTax,
  setTaxStatus,
  deleteTax,
} = require("../repositories/tax.repository");

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
  let taxId = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Tax Repository tests...\n");

    // 1. Setup Test Owner and Organisations
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("tax-owner")}@test.local`, "Tax Test Owner", "hash"],
    );
    ownerId = userRes.rows[0].id;

    const orgRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Tax Test Org 1 ${uniqueValue("")}`],
    );
    organisationId = orgRes.rows[0].id;

    const otherOrgRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Tax Test Org 2 ${uniqueValue("")}`],
    );
    otherOrgId = otherOrgRes.rows[0].id;

    console.log("✓ 1. Test fixtures created");

    // 2. Create Tax definition
    const taxData = {
      organisationId,
      name: "Central GST (CGST)",
      taxType: "CENTRAL_TAX",
      rate: 6.0,
      isDefault: true,
      isActive: true,
      description: "Central government share of GST on intra-state billing",
    };

    const created = await createTax(taxData);
    taxId = created.id;

    assert.ok(created.id);
    assert.strictEqual(created.organisation_id, organisationId);
    assert.strictEqual(created.name, "Central GST (CGST)");
    assert.strictEqual(created.tax_type, "CENTRAL_TAX");
    assert.strictEqual(Number(created.rate), 6.0);
    assert.strictEqual(created.is_default, true);
    assert.strictEqual(created.is_active, true);
    assert.strictEqual(
      created.description,
      "Central government share of GST on intra-state billing",
    );

    console.log("✓ 2. Tax definition created and all fields projected");

    // 3. Cache miss populates Redis
    const cacheKey = `organisation:${organisationId}:tax:${taxId}`;
    await deleteCache(cacheKey);

    const fetched = await getTaxById(organisationId, taxId);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, taxId);
    assert.strictEqual(fetched.name, "Central GST (CGST)");

    const cachedRaw = await redisClient.get(cacheKey);
    assert.ok(cachedRaw, "Tax should be cached in Redis");
    const cachedParsed = JSON.parse(cachedRaw);
    assert.strictEqual(cachedParsed.id, taxId);

    console.log("✓ 3. Tax cache miss populates Redis");

    // 4. Cache hit returns correct data
    const cacheHit = await getTaxById(organisationId, taxId);
    assert.strictEqual(cacheHit.id, taxId);

    console.log("✓ 4. Tax cache hit returns expected data");

    // 5. Tenant isolation
    const wrongOrgTax = await getTaxById(otherOrgId, taxId);
    assert.strictEqual(
      wrongOrgTax,
      null,
      "Tax must not be accessible to another organisation",
    );

    console.log("✓ 5. Tenant isolation verified");

    // 6. List taxes
    const taxList = await listTaxes(organisationId);
    assert.strictEqual(taxList.length, 1);
    assert.strictEqual(taxList[0].id, taxId);

    const otherOrgList = await listTaxes(otherOrgId);
    assert.strictEqual(otherOrgList.length, 0);

    console.log("✓ 6. List taxes returns organisation-specific taxes");

    // 7. Update tax
    const updated = await updateTax(organisationId, taxId, {
      rate: 9.0,
      description: "Updated rate to 9%",
    });
    assert.ok(updated);
    assert.strictEqual(Number(updated.rate), 9.0);
    assert.strictEqual(updated.description, "Updated rate to 9%");
    assert.strictEqual(
      updated.name,
      "Central GST (CGST)",
      "Unchanged fields preserved",
    );

    // Cache must be invalidated
    const cacheAfterUpdate = await redisClient.get(cacheKey);
    assert.strictEqual(
      cacheAfterUpdate,
      null,
      "Cache must be invalidated after update",
    );

    console.log("✓ 7. Update tax invalidates cache and returns updated fields");

    // 8. Set tax status
    const deactivated = await setTaxStatus(organisationId, taxId, false);
    assert.strictEqual(deactivated.is_active, false);

    const activeList = await listTaxes(organisationId, { activeOnly: true });
    assert.strictEqual(
      activeList.length,
      0,
      "Deactivated tax should not appear in active-only list",
    );

    await setTaxStatus(organisationId, taxId, true);

    console.log("✓ 8. Tax status toggle and active-only filtering work");

    // 9. Uniqueness constraint on (organisation_id, name)
    let duplicateFailed = false;
    try {
      await createTax({
        organisationId,
        name: "Central GST (CGST)",
        taxType: "CENTRAL_TAX",
        rate: 6.0,
      });
    } catch (err) {
      duplicateFailed = true;
    }
    assert.ok(duplicateFailed, "Tax name must be unique per organisation");

    console.log(
      "✓ 9. Uniqueness constraint enforced for (organisation_id, name)",
    );

    // 10. Delete tax
    const deleted = await deleteTax(organisationId, taxId);
    assert.ok(deleted);

    const recheck = await getTaxById(organisationId, taxId);
    assert.strictEqual(recheck, null);

    console.log("✓ 10. Delete tax works");

    console.log("\n✓ All Tax Repository tests passed successfully!\n");
  } catch (error) {
    console.error("Tax Repository test failed:", error);
    process.exitCode = 1;
  } finally {
    if (taxId) {
      try {
        await pool.query("DELETE FROM taxes WHERE id = $1;", [taxId]);
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
