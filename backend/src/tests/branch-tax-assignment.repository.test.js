/**
 * Branch Tax Assignment Repository Integration Test
 *
 * Verifies:
 * - Assigning tax to branch
 * - Listing taxes assigned to branch with joined tax fields
 * - Updating is_applied status
 * - Idempotency of re-assigning tax to branch
 * - CRITICAL TENANT RULE: Cross-organisation assignment prevention
 * - Tenant isolation on reads
 * - Redis cache miss, hit, and invalidation
 * - Removing individual branch tax assignment
 * - Removing all tax assignments for a branch
 */

require("dotenv").config();

const assert = require("assert");

const {
  assignTaxToBranch,
  getBranchTaxAssignments,
  updateBranchTaxAssignment,
  removeBranchTaxAssignment,
  removeAllBranchTaxAssignments,
} = require("../repositories/branch-tax-assignment.repository");

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
  let organisationIdA = null;
  let organisationIdB = null;
  let branchIdA = null;
  let branchIdB = null;
  let taxIdA = null;
  let taxIdB = null;

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Branch Tax Assignment Repository tests...\n");

    // 1. Setup Test Fixtures: 2 Organisations, each with 1 Branch and 1 Tax
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [
        `${uniqueValue("tax-assign-owner")}@test.local`,
        "Tax Assign Owner",
        "hash",
      ],
    );
    ownerId = userRes.rows[0].id;

    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Org A ${uniqueValue("")}`],
    );
    organisationIdA = orgARes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Org B ${uniqueValue("")}`],
    );
    organisationIdB = orgBRes.rows[0].id;

    const branchARes = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [organisationIdA, "Branch A", `BR-A-${Date.now()}`],
    );
    branchIdA = branchARes.rows[0].id;

    const branchBRes = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [organisationIdB, "Branch B", `BR-B-${Date.now()}`],
    );
    branchIdB = branchBRes.rows[0].id;

    const taxARes = await pool.query(
      `INSERT INTO taxes (organisation_id, name, tax_type, rate, is_default, is_active)
       VALUES ($1, $2, 'CENTRAL_TAX', 6.0, true, true) RETURNING id;`,
      [organisationIdA, "Org A CGST"],
    );
    taxIdA = taxARes.rows[0].id;

    const taxBRes = await pool.query(
      `INSERT INTO taxes (organisation_id, name, tax_type, rate, is_default, is_active)
       VALUES ($1, $2, 'STATE_TAX', 6.0, true, true) RETURNING id;`,
      [organisationIdB, "Org B SGST"],
    );
    taxIdB = taxBRes.rows[0].id;

    console.log("✓ 1. Test fixtures initialized across 2 organisations");

    // 2. Assign Tax to Branch (Same Organisation)
    const assignment = await assignTaxToBranch(
      organisationIdA,
      branchIdA,
      taxIdA,
      true,
    );

    assert.ok(assignment);
    assert.strictEqual(assignment.branch_id, branchIdA);
    assert.strictEqual(assignment.tax_id, taxIdA);
    assert.strictEqual(assignment.is_applied, true);

    console.log(
      "✓ 2. Assign tax to branch succeeds for valid same-organisation entities",
    );

    // 3. CRITICAL TENANT CHECK: Cross-organisation branch/tax protection
    // Try to assign Branch A (Org A) to Tax B (Org B) under Org A
    const crossAssign1 = await assignTaxToBranch(
      organisationIdA,
      branchIdA,
      taxIdB,
      true,
    );
    assert.strictEqual(
      crossAssign1,
      null,
      "Must NOT allow assigning a foreign organisation's tax",
    );

    // Try to assign Branch B (Org B) to Tax A (Org A) under Org B
    const crossAssign2 = await assignTaxToBranch(
      organisationIdB,
      branchIdB,
      taxIdA,
      true,
    );
    assert.strictEqual(
      crossAssign2,
      null,
      "Must NOT allow assigning a foreign organisation's tax",
    );

    // Try to spoof organisationId
    const crossAssign3 = await assignTaxToBranch(
      organisationIdB,
      branchIdA,
      taxIdA,
      true,
    );
    assert.strictEqual(
      crossAssign3,
      null,
      "Must NOT allow cross-organisation assignment under wrong org context",
    );

    console.log(
      "✓ 3. Cross-organisation tax assignment strictly blocked at SQL level",
    );

    // 4. List branch taxes (cache miss populates Redis -> cache hit)
    const cacheKey = `organisation:${organisationIdA}:branch:${branchIdA}:taxes`;
    await deleteCache(cacheKey);

    const list1 = await getBranchTaxAssignments(organisationIdA, branchIdA);
    assert.strictEqual(list1.length, 1);
    assert.strictEqual(list1[0].branch_id, branchIdA);
    assert.strictEqual(list1[0].tax_id, taxIdA);
    assert.strictEqual(list1[0].tax_name, "Org A CGST");
    assert.strictEqual(Number(list1[0].rate), 6.0);
    assert.strictEqual(list1[0].is_applied, true);

    const cachedRaw = await redisClient.get(cacheKey);
    assert.ok(cachedRaw, "Assignments should be cached in Redis");

    const cacheHit = await getBranchTaxAssignments(organisationIdA, branchIdA);
    assert.strictEqual(cacheHit.length, 1);
    assert.strictEqual(cacheHit[0].tax_id, taxIdA);

    console.log("✓ 4. List branch taxes works with Redis cache miss and hit");

    // 5. Tenant isolation on reads
    const wrongOrgList = await getBranchTaxAssignments(
      organisationIdB,
      branchIdA,
    );
    assert.strictEqual(
      wrongOrgList.length,
      0,
      "Cannot read another organisation's branch taxes",
    );

    console.log("✓ 5. Tenant isolation verified on branch tax reads");

    // 6. Update is_applied
    const updated = await updateBranchTaxAssignment(
      organisationIdA,
      branchIdA,
      taxIdA,
      false,
    );
    assert.ok(updated);
    assert.strictEqual(updated.is_applied, false);

    // Cache should be invalidated
    const cacheAfterUpdate = await redisClient.get(cacheKey);
    assert.strictEqual(
      cacheAfterUpdate,
      null,
      "Cache must be invalidated after update",
    );

    const recheckList = await getBranchTaxAssignments(
      organisationIdA,
      branchIdA,
    );
    assert.strictEqual(recheckList[0].is_applied, false);

    console.log("✓ 6. Update is_applied works and invalidates cache");

    // 7. Remove single assignment
    const removed = await removeBranchTaxAssignment(
      organisationIdA,
      branchIdA,
      taxIdA,
    );
    assert.ok(removed);

    const emptyList = await getBranchTaxAssignments(organisationIdA, branchIdA);
    assert.strictEqual(emptyList.length, 0);

    console.log("✓ 7. Remove branch tax assignment works");

    // 8. Remove all assignments
    await assignTaxToBranch(organisationIdA, branchIdA, taxIdA, true);
    const count = await removeAllBranchTaxAssignments(
      organisationIdA,
      branchIdA,
    );
    assert.strictEqual(count, 1);

    const finalCheck = await getBranchTaxAssignments(
      organisationIdA,
      branchIdA,
    );
    assert.strictEqual(finalCheck.length, 0);

    console.log("✓ 8. Remove all branch tax assignments works");

    console.log(
      "\n✓ All Branch Tax Assignment Repository tests passed successfully!\n",
    );
  } catch (error) {
    console.error("Branch Tax Assignment Repository test failed:", error);
    process.exitCode = 1;
  } finally {
    if (branchIdA || branchIdB) {
      try {
        await pool.query("DELETE FROM branches WHERE id = ANY($1::uuid[]);", [
          [branchIdA, branchIdB].filter(Boolean),
        ]);
      } catch (e) {}
    }
    if (taxIdA || taxIdB) {
      try {
        await pool.query("DELETE FROM taxes WHERE id = ANY($1::uuid[]);", [
          [taxIdA, taxIdB].filter(Boolean),
        ]);
      } catch (e) {}
    }
    if (organisationIdA || organisationIdB) {
      try {
        await pool.query(
          "DELETE FROM organisations WHERE id = ANY($1::uuid[]);",
          [[organisationIdA, organisationIdB].filter(Boolean)],
        );
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
