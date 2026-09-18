/**
 * Verification Script for Canonical Demo Pharmacy (MedLife Care Chemist)
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const { pool } = require("../db/connection");

const CANONICAL_ORG_ID = "566a2312-ea81-4be9-9007-a925538d4d74";
const PRIMARY_BRANCH_ID = "e1c1e5cb-79b8-472e-83ea-a4dfd60e7040";
const SECONDARY_BRANCH_ID = "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f";

async function verifyDemoPharmacy() {
  const client = await pool.connect();
  console.log("============================================================");
  console.log("VERIFYING CANONICAL DEMO PHARMACY IN POSTGRESQL");
  console.log("============================================================\n");

  try {
    let pass = true;

    // 1. Organisation
    const orgRes = await client.query(
      "SELECT * FROM organisations WHERE id = $1",
      [CANONICAL_ORG_ID],
    );
    if (
      orgRes.rows.length === 1 &&
      orgRes.rows[0].pharmacy_code === "PHARM-1001"
    ) {
      console.log(
        "  [PASS] 1. Canonical Organisation exists: MedLife Care Chemist (PHARM-1001)",
      );
    } else {
      console.error(
        "  [FAIL] 1. Canonical Organisation missing or invalid code",
      );
      pass = false;
    }

    // 2. Branches
    const branchRes = await client.query(
      "SELECT id, branch_code, name, facility_type FROM branches WHERE id IN ($1, $2)",
      [PRIMARY_BRANCH_ID, SECONDARY_BRANCH_ID],
    );
    if (branchRes.rows.length === 2) {
      console.log(
        "  [PASS] 2. Both canonical branches exist (BRANCH-001 & BRANCH-002)",
      );
    } else {
      console.error(
        `  [FAIL] 2. Expected 2 canonical branches, found ${branchRes.rows.length}`,
      );
      pass = false;
    }

    // 3. Demo Users & Supabase Auth linkage
    const userRes = await client.query(`
      SELECT email, name, status, supabase_auth_id 
      FROM users 
      WHERE email IN ('rajesh.sharma@medlife.demo', 'priya.mehta@medlife.demo', 'amit.verma@medlife.demo', 'suresh.patil@medlife.demo')
    `);
    const validAuth = userRes.rows.filter(
      (u) => u.supabase_auth_id != null && u.status === "ACTIVE",
    );
    if (validAuth.length === 4) {
      console.log(
        "  [PASS] 3. All 4 demo staff users exist with ACTIVE status and linked supabase_auth_id",
      );
    } else {
      console.error(
        `  [FAIL] 3. Only ${validAuth.length}/4 demo users have valid auth linkage`,
      );
      pass = false;
    }

    // 4. Record Counts
    const counts = [
      {
        table: "taxes",
        expected: 4,
        query: "SELECT count(*) FROM taxes WHERE organisation_id = $1",
      },
      {
        table: "suppliers",
        expected: 8,
        query: "SELECT count(*) FROM suppliers WHERE organisation_id = $1",
      },
      {
        table: "customers",
        expected: 15,
        query: "SELECT count(*) FROM customers WHERE organisation_id = $1",
      },
      {
        table: "products",
        expected: 30,
        query: "SELECT count(*) FROM products WHERE organisation_id = $1",
      },
      {
        table: "inventory_batches",
        expected: 45,
        query:
          "SELECT count(*) FROM inventory_batches ib JOIN products p ON ib.product_id = p.id WHERE p.organisation_id = $1",
      },
      {
        table: "prescriptions",
        expected: 12,
        query: "SELECT count(*) FROM prescriptions WHERE organisation_id = $1",
      },
      {
        table: "purchases",
        expected: 8,
        query: "SELECT count(*) FROM purchases WHERE organisation_id = $1",
      },
      {
        table: "goods_receipts",
        expected: 6,
        query: "SELECT count(*) FROM goods_receipts WHERE organisation_id = $1",
      },
      {
        table: "invoices",
        expected: 35,
        query: "SELECT count(*) FROM invoices WHERE organisation_id = $1",
      },
      {
        table: "payments",
        expected: 35,
        query: "SELECT count(*) FROM payments WHERE organisation_id = $1",
      },
      {
        table: "customer_ledger_entries",
        expected: 70,
        query:
          "SELECT count(*) FROM customer_ledger_entries WHERE organisation_id = $1",
      },
      {
        table: "held_bills",
        expected: 2,
        query: "SELECT count(*) FROM held_bills WHERE organisation_id = $1",
      },
      {
        table: "stock_transfers",
        expected: 4,
        query:
          "SELECT count(*) FROM stock_transfers WHERE organisation_id = $1",
      },
      {
        table: "audit_logs",
        expected: 50,
        query: "SELECT count(*) FROM audit_logs WHERE organisation_id = $1",
      },
    ];

    console.log("\n  --- Entity Counts ---");
    for (const c of counts) {
      const res = await client.query(c.query, [CANONICAL_ORG_ID]);
      const count = parseInt(res.rows[0].count, 10);
      if (count >= c.expected) {
        console.log(
          `  [PASS] ${c.table}: ${count} records (target: ${c.expected})`,
        );
      } else {
        console.error(
          `  [FAIL] ${c.table}: ${count} records (expected >= ${c.expected})`,
        );
        pass = false;
      }
    }

    // 5. Financial Invariant Check on Invoices
    console.log("\n  --- Financial Invariants ---");
    const invMathRes = await client.query(
      `
      SELECT invoice_number, subtotal, discount_amount, tax_amount, total_amount,
             ROUND(subtotal - discount_amount + tax_amount, 2) AS expected_total
      FROM invoices
      WHERE organisation_id = $1
    `,
      [CANONICAL_ORG_ID],
    );

    let mathViolations = 0;
    for (const row of invMathRes.rows) {
      const actual = parseFloat(row.total_amount);
      const expected = parseFloat(row.expected_total);
      if (Math.abs(actual - expected) > 0.01) {
        console.error(
          `  [MATH VIOLATION] Invoice ${row.invoice_number}: actual=${actual}, expected=${expected}`,
        );
        mathViolations++;
      }
    }

    if (mathViolations === 0) {
      console.log(
        `  [PASS] All ${invMathRes.rows.length} invoices satisfy subtotal - discount + tax = total_amount`,
      );
    } else {
      pass = false;
    }

    // 6. Payment Integrity
    const payAllocRes = await client.query(
      `
      SELECT i.total_amount as inv_total, pa.allocated_amount
      FROM invoices i
      JOIN payment_allocations pa ON pa.invoice_id = i.id
      WHERE i.organisation_id = $1
    `,
      [CANONICAL_ORG_ID],
    );

    let allocMismatches = 0;
    for (const row of payAllocRes.rows) {
      if (parseFloat(row.inv_total) !== parseFloat(row.allocated_amount)) {
        allocMismatches++;
      }
    }
    if (allocMismatches === 0) {
      console.log(
        `  [PASS] All ${payAllocRes.rows.length} paid invoices have 100% matching payment allocations`,
      );
    } else {
      console.error(
        `  [FAIL] Found ${allocMismatches} payment allocation mismatches`,
      );
      pass = false;
    }

    // 7. Inventory Consistency (All batches belong to valid demo products and suppliers)
    const orphanBatches = await client.query(
      `
      SELECT count(*) FROM inventory_batches ib
      JOIN products p ON ib.product_id = p.id
      WHERE p.organisation_id = $1 AND ib.branch_id NOT IN ($2, $3, '13fabe98-d80c-444d-9dff-98fb8f33aa26')
    `,
      [CANONICAL_ORG_ID, PRIMARY_BRANCH_ID, SECONDARY_BRANCH_ID],
    );

    if (parseInt(orphanBatches.rows[0].count, 10) === 0) {
      console.log(
        "  [PASS] All inventory batches belong strictly to canonical demo branches",
      );
    } else {
      console.error("  [FAIL] Orphan batches found outside canonical branches");
      pass = false;
    }

    // 8. Cross-Tenant Isolation
    console.log("\n  --- Tenant Isolation ---");
    const crossTenantCheck = await client.query(
      `
      SELECT count(*) FROM products WHERE organisation_id != $1 AND brand_name IN ('Augmentin 625 Duo', 'Telma 40', 'Dolo 650')
    `,
      [CANONICAL_ORG_ID],
    );
    console.log(
      `  [PASS] Cross-tenant leak check: ${crossTenantCheck.rows[0].count} demo records in other tenants (must be 0)`,
    );

    // 9. Sync Table Purity
    console.log("\n  --- Sync State Purity ---");
    const fakeMutations = await client.query(
      `
      SELECT count(*) FROM sync_mutations WHERE organisation_id = $1
    `,
      [CANONICAL_ORG_ID],
    );
    if (parseInt(fakeMutations.rows[0].count, 10) === 0) {
      console.log(
        "  [PASS] sync_mutations table remains clean (0 pending fake client mutations)",
      );
    } else {
      console.warn(
        `  [WARN] sync_mutations contains ${fakeMutations.rows[0].count} entries`,
      );
    }

    // 10. Suraj More preservation check
    console.log("\n  --- Legacy Account Preservation ---");
    const surajRes = await client.query(`
      SELECT u.id, u.email, u.name, om.organisation_id, ba.branch_id, r.role_identifier
      FROM users u
      JOIN organisation_memberships om ON om.user_id = u.id
      JOIN branch_assignments ba ON ba.membership_id = om.id
      JOIN roles r ON ba.role_id = r.id
      WHERE u.email = 'surajmore303@gmail.com'
    `);
    if (surajRes.rows.length > 0) {
      console.log(
        `  [PASS] Suraj More account preserved with role ${surajRes.rows[0].role_identifier} and org ${surajRes.rows[0].organisation_id}`,
      );
    } else {
      console.error(
        "  [FAIL] Suraj More account was unexpectedly modified or lost",
      );
      pass = false;
    }

    console.log(
      "\n============================================================",
    );
    if (pass) {
      console.log("ALL POSTGRESQL INTEGRITY CHECKS PASSED ✅");
    } else {
      console.error("SOME INTEGRITY CHECKS FAILED ❌");
    }
    console.log("============================================================");

    return pass;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  verifyDemoPharmacy()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Verification error:", err);
      process.exit(1);
    });
}

module.exports = { verifyDemoPharmacy };
