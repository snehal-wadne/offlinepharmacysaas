/**
 * Branch Repository Integration Test
 *
 * Verifies:
 * - Branch creation with all newly supported fields
 * - Projection of all branch fields in CREATE, SELECT, UPDATE
 * - Find branch by ID with Redis cache miss and hit
 * - Find branch by code within organisation
 * - List branches for organisation with filtering
 * - Update branch fields
 * - Update branch status
 * - Tenant isolation (cannot access branch of another organisation)
 * - Cache invalidation on mutation
 * - Delete branch
 */

require("dotenv").config();

const assert = require("assert");

const {
  createBranch,
  getBranchById,
  getBranchByCode,
  getBranchesByOrganisation,
  listBranches,
  updateBranch,
  updateBranchStatus,
  deleteBranch,
} = require("../repositories/branch.repository");

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

    console.log("\nRunning Branch Repository tests...\n");

    // 1. Setup Test Owner & Organisations
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [
        `${uniqueValue("branch-owner")}@test.local`,
        "Branch Test Owner",
        "hash",
      ],
    );
    ownerId = userRes.rows[0].id;

    const org1Res = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Branch Test Org 1 ${uniqueValue("")}`],
    );
    organisationId = org1Res.rows[0].id;

    const org2Res = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Branch Test Org 2 ${uniqueValue("")}`],
    );
    otherOrgId = org2Res.rows[0].id;

    console.log("✓ 1. Created test organisations for tenant isolation");

    // 2. Create branch with all fields
    const branchData = {
      organisationId,
      branchCode: "BR-PUN-001",
      name: "Main Campus Hospital Pharmacy",
      facilityType: "HOSPITAL_PHARMACY",
      contactPerson: "Dr. Suresh Patil",
      contactPhone: "+91 98220 11450",
      contactEmail: "pharmacy.main@flora.edu.in",
      address: "Flora Campus, Khopi",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "412205",
      phone: "+91 98220 11450",
      operatingHours: "24 Hours / 7 Days",
      drugLicenseNumber: "MH-PZ2-20B-184920",
      invoicePrefix: "FIT-HQ-",
      status: "ACTIVE",
    };

    const created = await createBranch(branchData);
    branchId = created.id;

    assert.ok(created.id, "Branch should have an ID");
    assert.strictEqual(created.organisation_id, organisationId);
    assert.strictEqual(created.branch_code, "BR-PUN-001");
    assert.strictEqual(created.name, "Main Campus Hospital Pharmacy");
    assert.strictEqual(created.facility_type, "HOSPITAL_PHARMACY");
    assert.strictEqual(created.contact_person, "Dr. Suresh Patil");
    assert.strictEqual(created.contact_phone, "+91 98220 11450");
    assert.strictEqual(created.contact_email, "pharmacy.main@flora.edu.in");
    assert.strictEqual(created.operating_hours, "24 Hours / 7 Days");
    assert.strictEqual(created.drug_license_number, "MH-PZ2-20B-184920");
    assert.strictEqual(created.invoice_prefix, "FIT-HQ-");
    assert.strictEqual(created.status, "ACTIVE");

    console.log("✓ 2. Created branch with all fields persisted and returned");

    // 3. Cache miss populates Redis
    const cacheKey = `organisation:${organisationId}:branch:${branchId}`;
    await deleteCache(cacheKey);

    const fetched = await getBranchById(branchId, organisationId);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, branchId);
    assert.strictEqual(fetched.branch_code, "BR-PUN-001");
    assert.strictEqual(fetched.contact_person, "Dr. Suresh Patil");

    const cachedRaw = await redisClient.get(cacheKey);
    assert.ok(cachedRaw, "Branch should be cached in Redis on read");
    const cachedParsed = JSON.parse(cachedRaw);
    assert.strictEqual(cachedParsed.id, branchId);
    assert.strictEqual(cachedParsed.branch_code, "BR-PUN-001");

    console.log("✓ 3. Branch cache miss populates Redis");

    // 4. Cache hit returns cached data
    const cacheHit = await getBranchById(branchId, organisationId);
    assert.strictEqual(cacheHit.id, branchId);
    assert.strictEqual(cacheHit.branch_code, "BR-PUN-001");

    console.log("✓ 4. Branch cache hit returns expected data");

    // 5. Tenant isolation on read
    const otherOrgRead = await getBranchById(branchId, otherOrgId);
    assert.strictEqual(
      otherOrgRead,
      null,
      "Branch must not be accessible to another organisation",
    );

    console.log("✓ 5. Tenant isolation verified on getBranchById");

    // 6. Find by branch_code
    const byCode = await getBranchByCode(organisationId, "BR-PUN-001");
    assert.ok(byCode);
    assert.strictEqual(byCode.id, branchId);

    const otherOrgByCode = await getBranchByCode(otherOrgId, "BR-PUN-001");
    assert.strictEqual(
      otherOrgByCode,
      null,
      "Branch code must be tenant isolated",
    );

    console.log(
      "✓ 6. Find branch by branch_code works and respects tenant boundary",
    );

    // 7. List branches
    const branchList = await getBranchesByOrganisation(organisationId);
    assert.strictEqual(branchList.length, 1);
    assert.strictEqual(branchList[0].id, branchId);
    assert.strictEqual(branchList[0].facility_type, "HOSPITAL_PHARMACY");

    const otherOrgList = await getBranchesByOrganisation(otherOrgId);
    assert.strictEqual(otherOrgList.length, 0);

    console.log("✓ 7. List branches returns correct organisation records");

    // 8. Filtered list
    const activeFiltered = await listBranches(organisationId, {
      status: "ACTIVE",
    });
    assert.strictEqual(activeFiltered.length, 1);

    const inactiveFiltered = await listBranches(organisationId, {
      status: "INACTIVE",
    });
    assert.strictEqual(inactiveFiltered.length, 0);

    console.log("✓ 8. Filtered listBranches works");

    // 9. Update branch
    const dashboardStatsCacheKey = `organisation:${organisationId}:branch-mgmt:branch-stats`;
    await redisClient.set(
      dashboardStatsCacheKey,
      JSON.stringify({ total_branches: 1 }),
      { EX: 60 },
    );

    const updated = await updateBranch(branchId, organisationId, {
      name: "FIT Main Campus Hospital Pharmacy - Updated",
      contactPerson: "Dr. Suresh Patil (Chief)",
      operatingHours: "24x7 Emergency",
    });

    assert.ok(updated);
    assert.strictEqual(
      updated.name,
      "FIT Main Campus Hospital Pharmacy - Updated",
    );
    assert.strictEqual(updated.contact_person, "Dr. Suresh Patil (Chief)");
    assert.strictEqual(updated.operating_hours, "24x7 Emergency");
    assert.strictEqual(
      updated.facility_type,
      "HOSPITAL_PHARMACY",
      "Unmodified fields should be preserved",
    );

    // Cache should have been invalidated
    const cacheAfterUpdate = await redisClient.get(cacheKey);
    assert.strictEqual(
      cacheAfterUpdate,
      null,
      "Cache must be invalidated after update",
    );
    assert.strictEqual(
      await redisClient.get(dashboardStatsCacheKey),
      null,
      "Branch writes must invalidate cached branch dashboard statistics",
    );

    console.log("✓ 9. Update branch persists changes and invalidates cache");

    // 10. Update branch status
    const statusUpdated = await updateBranchStatus(
      branchId,
      organisationId,
      "INACTIVE",
    );
    assert.strictEqual(statusUpdated.status, "INACTIVE");

    const recheckStatus = await getBranchById(branchId, organisationId);
    assert.strictEqual(recheckStatus.status, "INACTIVE");

    console.log("✓ 10. Update branch status works");

    // 11. Delete branch
    const deleted = await deleteBranch(branchId, organisationId);
    assert.ok(deleted);

    const recheckDeleted = await getBranchById(branchId, organisationId);
    assert.strictEqual(recheckDeleted, null);

    console.log("✓ 11. Delete branch works and cleans up");

    console.log("\n✓ All Branch Repository tests passed successfully!\n");
  } catch (error) {
    console.error("Branch Repository test failed:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup
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
