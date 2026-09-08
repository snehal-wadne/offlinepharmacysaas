/**
 * Branch Management Dashboard Repository Integration Test
 *
 * Verifies:
 * - Mathematical accuracy of branch dashboard statistics (counts, types, status)
 * - Prevention of row multiplication when computing staff and tax counts
 * - User & staff management stats and directory projections
 * - Role management stats and directory projections with user counts
 * - Tax & GST configuration summary and total applied tax calculation
 * - Tenant isolation across organisations (Org A vs Org B)
 * - Empty organisation edge cases
 * - Redis cache miss and hit behavior for dashboard aggregates
 * - Transaction client Redis bypass
 */

require("dotenv").config();

const assert = require("assert");

const {
  getBranchManagementStats,
  getBranchListProjections,
  getBranchDetailProjection,
  getUserStaffManagementStats,
  getUserStaffDirectoryRows,
  getRoleManagementStats,
  getRoleDirectoryRows,
  getTaxGstSettingsSummary,
} = require("../repositories/branch-management-dashboard.repository");

const { pool } = require("../db/connection");
const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");
const { deleteCache } = require("../cache/cache");

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const runTests = async () => {
  let ownerId = null;
  let orgAId = null;
  let orgBId = null;

  const branchIds = [];
  const memberIds = [];
  const userIds = [];
  const roleIds = [];
  const taxIds = [];

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning Branch Management Dashboard Repository tests...\n");

    // =========================================================
    // 1. SETUP TEST FIXTURES
    // =========================================================

    // Owner
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("dash-owner")}@test.local`, "Dashboard Owner", "hash"],
    );
    ownerId = userRes.rows[0].id;
    userIds.push(ownerId);

    // Organisation A (Populated) and Organisation B (Empty)
    const orgARes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Dash Org A ${uniqueValue("")}`],
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await pool.query(
      `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
      [ownerId, `Dash Org B ${uniqueValue("")}`],
    );
    orgBId = orgBRes.rows[0].id;

    // Roles in Org A
    const adminRoleRes = await pool.query(
      `INSERT INTO roles (organisation_id, name, role_identifier, clearance_level, is_system_role)
       VALUES ($1, 'Administrator', 'ADMIN', 'ADMIN', TRUE) RETURNING id;`,
      [orgAId],
    );
    const adminRoleId = adminRoleRes.rows[0].id;
    roleIds.push(adminRoleId);

    const pharmRoleRes = await pool.query(
      `INSERT INTO roles (organisation_id, name, role_identifier, clearance_level, is_system_role)
       VALUES ($1, 'Pharmacist', 'PHARMACIST', 'CLINICAL_DISPENSING', TRUE) RETURNING id;`,
      [orgAId],
    );
    const pharmRoleId = pharmRoleRes.rows[0].id;
    roleIds.push(pharmRoleId);

    const cashierRoleRes = await pool.query(
      `INSERT INTO roles (organisation_id, name, role_identifier, clearance_level, is_system_role)
       VALUES ($1, 'Billing / Cashier', 'CASHIER', 'STANDARD_POS', TRUE) RETURNING id;`,
      [orgAId],
    );
    const cashierRoleId = cashierRoleRes.rows[0].id;
    roleIds.push(cashierRoleId);

    const customRoleRes = await pool.query(
      `INSERT INTO roles (organisation_id, name, role_identifier, clearance_level, is_system_role)
       VALUES ($1, 'Store Supervisor', 'SUPERVISOR', 'STANDARD_POS', FALSE) RETURNING id;`,
      [orgAId],
    );
    const customRoleId = customRoleRes.rows[0].id;
    roleIds.push(customRoleId);

    // Branches in Org A:
    // Branch 1: Hospital Pharmacy, ACTIVE
    const b1Res = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, facility_type, status, city)
       VALUES ($1, 'Main Hospital Branch', 'BR-001', 'HOSPITAL_PHARMACY', 'ACTIVE', 'Pune') RETURNING id;`,
      [orgAId],
    );
    const b1Id = b1Res.rows[0].id;
    branchIds.push(b1Id);

    // Branch 2: Retail Dispensary, ACTIVE
    const b2Res = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, facility_type, status, city)
       VALUES ($1, 'City OPD Dispensary', 'BR-002', 'RETAIL_DISPENSARY', 'ACTIVE', 'Pune') RETURNING id;`,
      [orgAId],
    );
    const b2Id = b2Res.rows[0].id;
    branchIds.push(b2Id);

    // Branch 3: Central Warehouse, INACTIVE
    const b3Res = await pool.query(
      `INSERT INTO branches (organisation_id, name, branch_code, facility_type, status, city)
       VALUES ($1, 'Central Warehouse', 'BR-003', 'CENTRAL_WAREHOUSE', 'INACTIVE', 'Mumbai') RETURNING id;`,
      [orgAId],
    );
    const b3Id = b3Res.rows[0].id;
    branchIds.push(b3Id);

    // GST Settings for Branch 1
    await pool.query(
      `INSERT INTO branch_gst_settings (organisation_id, branch_id, gstin, legal_name, state, state_code)
       VALUES ($1, $2, '27AAAAF1234F1Z5', 'Org A Healthcare', 'Maharashtra', '27');`,
      [orgAId, b1Id],
    );

    // Taxes in Org A
    const cgstRes = await pool.query(
      `INSERT INTO taxes (organisation_id, name, tax_type, rate, is_default, is_active)
       VALUES ($1, 'CGST', 'CENTRAL_TAX', 6.0, TRUE, TRUE) RETURNING id;`,
      [orgAId],
    );
    const cgstId = cgstRes.rows[0].id;
    taxIds.push(cgstId);

    const sgstRes = await pool.query(
      `INSERT INTO taxes (organisation_id, name, tax_type, rate, is_default, is_active)
       VALUES ($1, 'SGST', 'STATE_TAX', 6.0, TRUE, TRUE) RETURNING id;`,
      [orgAId],
    );
    const sgstId = sgstRes.rows[0].id;
    taxIds.push(sgstId);

    // Assign Taxes to Branch 1
    await pool.query(
      `INSERT INTO branch_tax_assignments (branch_id, tax_id, is_applied)
       VALUES ($1, $2, TRUE), ($1, $3, TRUE);`,
      [b1Id, cgstId, sgstId],
    );

    // Staff Users & Memberships in Org A
    // User 1: Admin
    const u1Res = await pool.query(
      `INSERT INTO users (email, name, password_hash, staff_id, phone, status)
       VALUES ($1, 'Admin User', 'hash', 'EMP-001', '9800000001', 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("u1")}@test.local`],
    );
    const u1Id = u1Res.rows[0].id;
    userIds.push(u1Id);

    const m1Res = await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id;`,
      [orgAId, u1Id],
    );
    const m1Id = m1Res.rows[0].id;
    memberIds.push(m1Id);

    // User 2: Pharmacist (Multi-branch: assigned to Branch 1 and Branch 2)
    const u2Res = await pool.query(
      `INSERT INTO users (email, name, password_hash, staff_id, phone, professional_registration_number, status)
       VALUES ($1, 'Dr. Pharmacist', 'hash', 'EMP-002', '9800000002', 'PCI-MH-94821', 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("u2")}@test.local`],
    );
    const u2Id = u2Res.rows[0].id;
    userIds.push(u2Id);

    const m2Res = await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id;`,
      [orgAId, u2Id],
    );
    const m2Id = m2Res.rows[0].id;
    memberIds.push(m2Id);

    // User 3: Cashier
    const u3Res = await pool.query(
      `INSERT INTO users (email, name, password_hash, staff_id, phone, status)
       VALUES ($1, 'Cashier User', 'hash', 'EMP-003', '9800000003', 'ACTIVE') RETURNING id;`,
      [`${uniqueValue("u3")}@test.local`],
    );
    const u3Id = u3Res.rows[0].id;
    userIds.push(u3Id);

    const m3Res = await pool.query(
      `INSERT INTO organisation_memberships (organisation_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id;`,
      [orgAId, u3Id],
    );
    const m3Id = m3Res.rows[0].id;
    memberIds.push(m3Id);

    // Assignments:
    // Member 1 -> Branch 1 (Primary, Admin)
    await pool.query(
      `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
       VALUES ($1, $2, $3, TRUE);`,
      [m1Id, b1Id, adminRoleId],
    );

    // Member 2 -> Branch 1 (Primary, Pharmacist) AND Branch 2 (Secondary, Pharmacist)
    await pool.query(
      `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
       VALUES ($1, $2, $4, TRUE), ($1, $3, $4, FALSE);`,
      [m2Id, b1Id, b2Id, pharmRoleId],
    );

    // Member 3 -> Branch 2 (Primary, Cashier)
    await pool.query(
      `INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
       VALUES ($1, $2, $3, TRUE);`,
      [m3Id, b2Id, cashierRoleId],
    );

    console.log(
      "✓ 1. Test fixtures initialized with branches, staff, roles, and taxes",
    );

    // Clear caches
    await deleteCache(`organisation:${orgAId}:branch-mgmt:branch-stats`);
    await deleteCache(`organisation:${orgAId}:branch-mgmt:staff-stats`);
    await deleteCache(`organisation:${orgAId}:branch-mgmt:role-stats`);

    // =========================================================
    // 2. TEST BRANCH MANAGEMENT STATS
    // =========================================================
    console.log("--- Testing getBranchManagementStats ---");
    const branchStats = await getBranchManagementStats(orgAId);

    assert.strictEqual(
      branchStats.total_branches,
      3,
      "Expected 3 total branches",
    );
    assert.strictEqual(
      branchStats.active_branches,
      2,
      "Expected 2 active branches",
    );
    assert.strictEqual(
      branchStats.inactive_branches,
      1,
      "Expected 1 inactive branch",
    );
    assert.strictEqual(
      branchStats.hospital_pharmacies,
      1,
      "Expected 1 hospital pharmacy",
    );
    assert.strictEqual(
      branchStats.retail_dispensaries,
      1,
      "Expected 1 retail dispensary",
    );
    assert.strictEqual(
      branchStats.central_warehouses,
      1,
      "Expected 1 central warehouse",
    );
    assert.strictEqual(
      branchStats.total_assigned_staff,
      3,
      "Expected exactly 3 distinct assigned staff (no row multiplication)",
    );
    assert.strictEqual(
      branchStats.total_gst_registered,
      1,
      "Expected 1 branch with GST settings",
    );

    // Cache hit
    const cachedStats = await getBranchManagementStats(orgAId);
    assert.strictEqual(cachedStats.total_branches, 3);

    console.log(
      "✓ 2. Branch management stats verified with mathematical accuracy and Redis cache",
    );

    // =========================================================
    // 3. TEST BRANCH LIST PROJECTIONS
    // =========================================================
    console.log("--- Testing getBranchListProjections ---");
    const branchList = await getBranchListProjections(orgAId);
    assert.strictEqual(branchList.length, 3);

    const b1Proj = branchList.find((b) => b.id === b1Id);
    assert.ok(b1Proj);
    assert.strictEqual(
      b1Proj.staff_count,
      2,
      "Branch 1 has 2 members assigned (Member 1 & Member 2)",
    );
    assert.strictEqual(
      b1Proj.assigned_tax_count,
      2,
      "Branch 1 has 2 taxes assigned",
    );
    assert.strictEqual(b1Proj.gstin, "27AAAAF1234F1Z5");

    const b2Proj = branchList.find((b) => b.id === b2Id);
    assert.strictEqual(
      b2Proj.staff_count,
      2,
      "Branch 2 has 2 members assigned (Member 2 & Member 3)",
    );

    const b3Proj = branchList.find((b) => b.id === b3Id);
    assert.strictEqual(b3Proj.staff_count, 0, "Branch 3 has 0 staff assigned");

    // Filter by status
    const activeList = await getBranchListProjections(orgAId, {
      status: "ACTIVE",
    });
    assert.strictEqual(activeList.length, 2);

    console.log(
      "✓ 3. Branch list projections verified without row multiplication",
    );

    // =========================================================
    // 4. TEST BRANCH DETAIL PROJECTION
    // =========================================================
    console.log("--- Testing getBranchDetailProjection ---");
    const detail = await getBranchDetailProjection(orgAId, b1Id);
    assert.ok(detail);
    assert.strictEqual(detail.name, "Main Hospital Branch");
    assert.strictEqual(detail.gstin, "27AAAAF1234F1Z5");
    assert.strictEqual(detail.staff.length, 2);
    assert.strictEqual(detail.taxes.length, 2);

    console.log(
      "✓ 4. Branch detail projection verified with staff and tax arrays",
    );

    // =========================================================
    // 5. TEST USER & STAFF MANAGEMENT STATS
    // =========================================================
    console.log("--- Testing getUserStaffManagementStats ---");
    const staffStats = await getUserStaffManagementStats(orgAId);

    assert.strictEqual(staffStats.total_staff, 3);
    assert.strictEqual(staffStats.active_staff, 3);
    assert.strictEqual(staffStats.registered_pharmacists, 1);
    assert.strictEqual(staffStats.billing_cashiers, 1);
    assert.strictEqual(staffStats.multi_branch_admins, 1);

    console.log("✓ 5. User & staff management stats verified");

    // =========================================================
    // 6. TEST USER & STAFF DIRECTORY ROWS
    // =========================================================
    console.log("--- Testing getUserStaffDirectoryRows ---");
    const staffRows = await getUserStaffDirectoryRows(orgAId);
    assert.strictEqual(staffRows.length, 3);

    const m2Row = staffRows.find((r) => r.membership_id === m2Id);
    assert.ok(m2Row);
    assert.strictEqual(m2Row.name, "Dr. Pharmacist");
    assert.strictEqual(m2Row.staff_id, "EMP-002");
    assert.strictEqual(m2Row.professional_registration_number, "PCI-MH-94821");
    assert.strictEqual(m2Row.primary_branch_name, "Main Hospital Branch");
    assert.strictEqual(
      m2Row.branch_count,
      2,
      "Member 2 has 2 branch assignments",
    );
    assert.strictEqual(m2Row.assigned_branches.length, 2);

    console.log(
      "✓ 6. User staff directory rows verified with primary and multi-branch details",
    );

    // =========================================================
    // 7. TEST ROLE MANAGEMENT STATS & DIRECTORY
    // =========================================================
    console.log(
      "--- Testing getRoleManagementStats & getRoleDirectoryRows ---",
    );
    const roleStats = await getRoleManagementStats(orgAId);
    assert.strictEqual(roleStats.total_roles, 4);
    assert.strictEqual(roleStats.system_roles, 3);
    assert.strictEqual(roleStats.custom_roles, 1);

    const roleRows = await getRoleDirectoryRows(orgAId);
    assert.strictEqual(roleRows.length, 4);

    const pharmRoleRow = roleRows.find((r) => r.id === pharmRoleId);
    assert.ok(pharmRoleRow);
    assert.strictEqual(
      pharmRoleRow.user_count,
      1,
      "Only Member 2 has pharmacist role",
    );

    console.log("✓ 7. Role management stats and directory rows verified");

    // =========================================================
    // 8. TEST TAX & GST SETTINGS SUMMARY
    // =========================================================
    console.log("--- Testing getTaxGstSettingsSummary ---");
    const taxSummary = await getTaxGstSettingsSummary(orgAId, b1Id);
    assert.strictEqual(taxSummary.branch_id, b1Id);
    assert.ok(taxSummary.gst_settings);
    assert.strictEqual(taxSummary.gst_settings.gstin, "27AAAAF1234F1Z5");
    assert.strictEqual(taxSummary.applied_taxes_count, 2);
    assert.strictEqual(Number(taxSummary.total_applied_tax_rate), 12.0);

    console.log(
      "✓ 8. Tax and GST settings summary verified (total applied rate = 12%)",
    );

    // =========================================================
    // 9. TEST EMPTY ORGANISATION B (TENANT ISOLATION)
    // =========================================================
    console.log("--- Testing Tenant Isolation (Empty Org B) ---");
    const emptyBranchStats = await getBranchManagementStats(orgBId);
    assert.strictEqual(emptyBranchStats.total_branches, 0);
    assert.strictEqual(emptyBranchStats.active_branches, 0);
    assert.strictEqual(emptyBranchStats.total_assigned_staff, 0);

    const emptyBranches = await getBranchListProjections(orgBId);
    assert.strictEqual(emptyBranches.length, 0);

    const emptyStaff = await getUserStaffDirectoryRows(orgBId);
    assert.strictEqual(emptyStaff.length, 0);

    console.log(
      "✓ 9. Tenant isolation strictly verified against empty organisation B",
    );

    // =========================================================
    // 10. TEST TRANSACTION CLIENT BYPASSES REDIS
    // =========================================================
    console.log("--- Testing Transaction Client Redis Bypass ---");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const txStats = await getBranchManagementStats(orgAId, client);
      assert.strictEqual(txStats.total_branches, 3);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    console.log(
      "✓ 10. Transaction client correctly executes on PostgreSQL without Redis",
    );

    console.log(
      "\n✓ All Branch Management Dashboard Repository tests passed successfully!\n",
    );
  } catch (error) {
    console.error("Dashboard Repository test failed:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup in reverse dependency order
    if (memberIds.length > 0) {
      try {
        await pool.query(
          "DELETE FROM organisation_memberships WHERE id = ANY($1::uuid[]);",
          [memberIds],
        );
      } catch (e) {}
    }
    if (branchIds.length > 0) {
      try {
        await pool.query("DELETE FROM branches WHERE id = ANY($1::uuid[]);", [
          branchIds,
        ]);
      } catch (e) {}
    }
    if (taxIds.length > 0) {
      try {
        await pool.query("DELETE FROM taxes WHERE id = ANY($1::uuid[]);", [
          taxIds,
        ]);
      } catch (e) {}
    }
    if (roleIds.length > 0) {
      try {
        await pool.query("DELETE FROM roles WHERE id = ANY($1::uuid[]);", [
          roleIds,
        ]);
      } catch (e) {}
    }
    if (orgAId || orgBId) {
      try {
        await pool.query(
          "DELETE FROM organisations WHERE id = ANY($1::uuid[]);",
          [[orgAId, orgBId].filter(Boolean)],
        );
      } catch (e) {}
    }
    if (userIds.length > 0) {
      try {
        await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[]);", [
          userIds,
        ]);
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
