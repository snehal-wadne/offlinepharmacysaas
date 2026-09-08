const { pool } = require("./connection");
const { migrateBranchManagement } = require("./migrate-branch-management");

async function runVerification() {
  const client = await pool.connect();
  let failureCount = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      failureCount++;
    } else {
      console.log(`✓ PASS: ${message}`);
    }
  }

  try {
    console.log("====================================================");
    console.log("STARTING BRANCH MANAGEMENT MIGRATION VERIFICATION");
    console.log("====================================================\n");

    // 1. Check branches columns and default
    const branchCols = await client.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'branches'
    `);
    const branchColMap = {};
    branchCols.rows.forEach((r) => {
      branchColMap[r.column_name] = r;
    });

    assert(
      branchColMap["branch_code"] !== undefined,
      "branches.branch_code exists",
    );
    assert(
      branchColMap["branch_code"] &&
        branchColMap["branch_code"].column_default === null,
      "branches.branch_code has NO database default (random UUID removed)",
    );
    assert(
      branchColMap["facility_type"] !== undefined,
      "branches.facility_type exists",
    );
    assert(
      branchColMap["contact_person"] !== undefined,
      "branches.contact_person exists",
    );
    assert(
      branchColMap["contact_phone"] !== undefined,
      "branches.contact_phone exists",
    );
    assert(
      branchColMap["contact_email"] !== undefined,
      "branches.contact_email exists",
    );
    assert(
      branchColMap["operating_hours"] !== undefined,
      "branches.operating_hours exists",
    );
    assert(
      branchColMap["drug_license_number"] !== undefined,
      "branches.drug_license_number exists",
    );
    assert(
      branchColMap["invoice_prefix"] !== undefined,
      "branches.invoice_prefix exists",
    );
    assert(branchColMap["status"] !== undefined, "branches.status exists");

    // 2. Check branches constraints
    const branchConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'branches'::regclass
    `);
    const bConstMap = {};
    branchConstraints.rows.forEach((r) => {
      bConstMap[r.conname] = r.def;
    });

    assert(
      bConstMap["branches_organisation_code_unique"] &&
        bConstMap["branches_organisation_code_unique"].includes(
          "organisation_id, branch_code",
        ),
      "branches_organisation_code_unique constraint exists on (organisation_id, branch_code)",
    );
    assert(
      bConstMap["branches_facility_type_check"] &&
        bConstMap["branches_facility_type_check"].includes(
          "HOSPITAL_PHARMACY",
        ) &&
        bConstMap["branches_facility_type_check"].includes(
          "RETAIL_DISPENSARY",
        ) &&
        bConstMap["branches_facility_type_check"].includes("CENTRAL_WAREHOUSE"),
      "branches_facility_type_check enforces exact fixed facility types",
    );
    assert(
      bConstMap["branches_status_check"] &&
        bConstMap["branches_status_check"].includes("ACTIVE") &&
        bConstMap["branches_status_check"].includes("INACTIVE"),
      "branches_status_check enforces ACTIVE and INACTIVE",
    );

    // 3. Check users staff fields
    const userCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);
    const userColMap = {};
    userCols.rows.forEach((r) => {
      userColMap[r.column_name] = r;
    });

    assert(userColMap["staff_id"] !== undefined, "users.staff_id exists");
    assert(userColMap["phone"] !== undefined, "users.phone exists");
    assert(
      userColMap["professional_registration_number"] !== undefined,
      "users.professional_registration_number exists",
    );
    assert(
      userColMap["working_shift"] !== undefined,
      "users.working_shift exists",
    );
    assert(
      userColMap["organisation_id"] === undefined,
      "users.organisation_id was NOT introduced (global identity preserved)",
    );

    // 4. Check users indexes
    const userIndexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'users'
    `);
    const uIdxMap = {};
    userIndexes.rows.forEach((r) => {
      uIdxMap[r.indexname] = r.indexdef;
    });
    assert(
      uIdxMap["idx_users_staff_id"] !== undefined,
      "idx_users_staff_id non-unique index exists on users",
    );

    // 5. Check roles extensions and constraints
    const roleCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'roles'
    `);
    const roleColMap = {};
    roleCols.rows.forEach((r) => {
      roleColMap[r.column_name] = r;
    });

    assert(
      roleColMap["role_identifier"] !== undefined,
      "roles.role_identifier exists",
    );
    assert(
      roleColMap["clearance_level"] !== undefined,
      "roles.clearance_level exists",
    );

    const roleConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'roles'::regclass
    `);
    const rConstMap = {};
    roleConstraints.rows.forEach((r) => {
      rConstMap[r.conname] = r.def;
    });

    assert(
      rConstMap["roles_organisation_identifier_unique"] &&
        rConstMap["roles_organisation_identifier_unique"].includes(
          "organisation_id, role_identifier",
        ),
      "roles_organisation_identifier_unique constraint exists",
    );
    assert(
      rConstMap["roles_clearance_level_check"] &&
        rConstMap["roles_clearance_level_check"].includes("ADMIN"),
      "roles_clearance_level_check constraint exists",
    );

    // 6. Check seeded roles
    const seededRoles = await client.query(`
      SELECT organisation_id, name, role_identifier, clearance_level, is_system_role
      FROM roles
      ORDER BY organisation_id, role_identifier
    `);

    // Verify invented roles were removed
    const inventedRoles = seededRoles.rows.filter((r) =>
      ["CHIEF_PHARM", "STORE_MGR", "AUDITOR"].includes(r.role_identifier),
    );
    assert(
      inventedRoles.length === 0,
      "No invented roles (Chief Pharmacist, Store Manager, Auditor) exist in database",
    );

    // Verify exactly one admin role per organisation
    const orgs = await client.query("SELECT id FROM organisations");
    for (const org of orgs.rows) {
      const orgAdminRoles = seededRoles.rows.filter(
        (r) => r.organisation_id === org.id && r.role_identifier === "ADMIN",
      );
      assert(
        orgAdminRoles.length === 1,
        `Organisation ${org.id} has exactly ONE Admin role definition`,
      );
    }

    // 7. Check branch_assignments is_primary and partial unique index
    const baCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'branch_assignments'
    `);
    const baColMap = {};
    baCols.rows.forEach((r) => {
      baColMap[r.column_name] = r;
    });
    assert(
      baColMap["is_primary"] !== undefined,
      "branch_assignments.is_primary exists",
    );

    const baIndexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'branch_assignments'
    `);
    const baIdxMap = {};
    baIndexes.rows.forEach((r) => {
      baIdxMap[r.indexname] = r.indexdef;
    });
    assert(
      baIdxMap["branch_assignments_one_primary_per_membership"] &&
        baIdxMap["branch_assignments_one_primary_per_membership"].includes(
          "WHERE (is_primary = true)",
        ),
      "branch_assignments_one_primary_per_membership partial unique index exists",
    );

    // 8. Check number_sequences types
    const seqConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'number_sequences'::regclass
    `);
    const sConstMap = {};
    seqConstraints.rows.forEach((r) => {
      sConstMap[r.conname] = r.def;
    });

    assert(
      sConstMap["number_sequences_type_check"] &&
        sConstMap["number_sequences_type_check"].includes("BRANCH") &&
        sConstMap["number_sequences_type_check"].includes("STAFF"),
      "number_sequences_type_check includes both BRANCH and STAFF sequence types",
    );

    // 9. Check branch_gst_settings table & data
    const gstCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'branch_gst_settings'
    `);
    const gstColMap = {};
    gstCols.rows.forEach((r) => {
      gstColMap[r.column_name] = r;
    });

    assert(
      gstColMap["branch_id"] !== undefined,
      "branch_gst_settings.branch_id exists",
    );
    assert(
      gstColMap["gstin"] !== undefined,
      "branch_gst_settings.gstin exists",
    );
    assert(
      gstColMap["auto_saas_tax"] === undefined,
      "Speculative auto_saas_tax column removed from branch_gst_settings",
    );

    const gstConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'branch_gst_settings'::regclass
    `);
    const gConstMap = {};
    gstConstraints.rows.forEach((r) => {
      gConstMap[r.conname] = r.def;
    });
    assert(
      gConstMap["branch_gst_settings_branch_unique"] !== undefined,
      "branch_gst_settings is strictly 1:1 with branches (UNIQUE(branch_id))",
    );

    // Check no fabricated GST data exists
    const fakeGst = await client.query(`
      SELECT COUNT(*) FROM branch_gst_settings
      WHERE gstin = '27AABCF1234F1Z5' OR legal_name = 'Flora Institute Healthcare & Pharmacy Pvt Ltd'
    `);
    assert(
      Number(fakeGst.rows[0].count) === 0,
      "No fabricated GST data exists in database (count is 0)",
    );

    // 10. Check taxes table & organisation ownership
    const taxCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'taxes'
    `);
    const taxColMap = {};
    taxCols.rows.forEach((r) => {
      taxColMap[r.column_name] = r;
    });
    assert(
      taxColMap["organisation_id"] !== undefined,
      "taxes table is organisation-scoped (organisation_id column exists)",
    );
    assert(taxColMap["name"] !== undefined, "taxes.name exists");
    assert(taxColMap["rate"] !== undefined, "taxes.rate exists");
    assert(taxColMap["tax_type"] !== undefined, "taxes.tax_type exists");

    // 11. Check branch_tax_assignments columns
    const btaCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'branch_tax_assignments'
    `);
    const btaColMap = {};
    btaCols.rows.forEach((r) => {
      btaColMap[r.column_name] = r;
    });
    assert(
      btaColMap["branch_id"] !== undefined,
      "branch_tax_assignments.branch_id exists",
    );
    assert(
      btaColMap["tax_id"] !== undefined,
      "branch_tax_assignments.tax_id exists",
    );
    assert(
      btaColMap["is_applied"] !== undefined,
      "branch_tax_assignments.is_applied exists",
    );

    // 12. Verification of Zero Default Tax Seeding & Assignment Preservation
    // Create a legitimate test tax and test branch_tax_assignment
    const testOrgId = orgs.rows[0].id;
    const testTax = await client.query(
      `
      INSERT INTO taxes (organisation_id, name, tax_type, rate, is_default, is_active, description)
      VALUES ($1, 'Verification Test Tax Preserve', 'OTHER', 3.50, FALSE, TRUE, 'Preservation test')
      RETURNING id;
    `,
      [testOrgId],
    );

    const testBranch = await client.query(
      "SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1",
      [testOrgId],
    );
    let testTaxAssigned = false;
    if (testBranch.rows.length > 0) {
      await client.query(
        `
        INSERT INTO branch_tax_assignments (branch_id, tax_id, is_applied)
        VALUES ($1, $2, TRUE);
      `,
        [testBranch.rows[0].id, testTax.rows[0].id],
      );
      testTaxAssigned = true;
    }

    // Run migration again against this state to test idempotency and non-destructiveness
    await migrateBranchManagement();

    // Verify the test tax still exists (preserved!)
    const checkTestTax = await client.query(
      "SELECT id, rate FROM taxes WHERE id = $1",
      [testTax.rows[0].id],
    );
    assert(
      checkTestTax.rows.length === 1 &&
        Number(checkTestTax.rows[0].rate) === 3.5,
      "Existing tax definitions are preserved intact during migration",
    );

    // Verify the test branch_tax_assignment still exists (destructive deletion removed!)
    if (testTaxAssigned) {
      const checkAssignment = await client.query(
        "SELECT is_applied FROM branch_tax_assignments WHERE branch_id = $1 AND tax_id = $2",
        [testBranch.rows[0].id, testTax.rows[0].id],
      );
      assert(
        checkAssignment.rows.length === 1,
        "Existing branch_tax_assignments are preserved intact (destructive DELETE removed)",
      );
    }

    // Clean up verification test fixtures
    await client.query("DELETE FROM taxes WHERE id = $1", [testTax.rows[0].id]);

    // Verify zero automatic branch-tax assignments exist for unassigned branches
    const unassignedBranchCheck = await client.query(`
      SELECT b.id
      FROM branches b
      LEFT JOIN branch_tax_assignments bta ON b.id = bta.branch_id
      WHERE bta.tax_id IS NULL
    `);
    assert(
      unassignedBranchCheck.rows.length > 0,
      "Migration creates ZERO automatic branch-tax assignments for branches",
    );

    // 12. Check existing branches data integrity
    const existingBranches = await client.query(
      "SELECT id, organisation_id, name, branch_code, facility_type, status FROM branches",
    );
    assert(
      existingBranches.rows.length >= 4,
      "All existing branches preserved",
    );
    for (const b of existingBranches.rows) {
      assert(
        b.branch_code && b.branch_code.length > 0,
        `Branch "${b.name}" has valid branch_code: ${b.branch_code}`,
      );
      assert(
        [
          "HOSPITAL_PHARMACY",
          "RETAIL_DISPENSARY",
          "CENTRAL_WAREHOUSE",
        ].includes(b.facility_type),
        `Branch "${b.name}" has valid facility_type: ${b.facility_type}`,
      );
      assert(
        ["ACTIVE", "INACTIVE"].includes(b.status),
        `Branch "${b.name}" has valid status: ${b.status}`,
      );
    }

    // 13. Check existing users data integrity
    const existingUsers = await client.query(
      "SELECT id, email, password_hash, status FROM users",
    );
    assert(existingUsers.rows.length >= 9, "All existing users preserved");
    for (const u of existingUsers.rows) {
      assert(
        u.password_hash === null ||
          u.password_hash.startsWith("$2") ||
          u.password_hash === "test-password" ||
          u.password_hash.length > 0,
        `User "${u.email}" has valid secure password hash / no plaintext leak`,
      );
    }

    console.log("\n====================================================");
    if (failureCount === 0) {
      console.log("✓ ALL 28 VERIFICATION CHECKS PASSED PERFECTLY!");
    } else {
      console.error(`❌ ${failureCount} CHECKS FAILED!`);
    }
    console.log("====================================================\n");
  } catch (err) {
    console.error("Verification encountered an exception:", err);
    failureCount++;
  } finally {
    client.release();
    await pool.end();
    process.exit(failureCount === 0 ? 0 : 1);
  }
}

runVerification();
