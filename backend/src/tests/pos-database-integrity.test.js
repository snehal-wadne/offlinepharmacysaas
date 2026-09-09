/**
 * POS Database Integrity Tests
 *
 * Tests database-level composite foreign keys and constraints directly against PostgreSQL.
 * Verifies that direct database writes (bypassing repositories) cannot violate
 * tenant or branch boundaries.
 */

require("dotenv").config();
const assert = require("assert");
const { pool } = require("../db/connection");

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

const runTests = async () => {
  let ownerAId, orgAId, branchA1Id, branchA2Id, userAId;
  let ownerBId, orgBId, branchB1Id, userBId;
  let registerA1Id, sessionA1Id;
  let registerB1Id, sessionB1Id;

  try {
    console.log("\nRunning POS Database Integrity Integration Tests (Direct SQL)...\n");

    // Setup Org A
    const ownerARes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Owner A', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("db-owner-a")}@test.local`]
    );
    ownerAId = ownerARes.rows[0].id;

    const orgARes = await pool.query(
      "INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;",
      [ownerAId, uniqueValue("Org A DB Test")]
    );
    orgAId = orgARes.rows[0].id;

    const branchA1Res = await pool.query(
      "INSERT INTO branches (organisation_id, name) VALUES ($1, 'Branch A1') RETURNING id;",
      [orgAId]
    );
    branchA1Id = branchA1Res.rows[0].id;

    const branchA2Res = await pool.query(
      "INSERT INTO branches (organisation_id, name) VALUES ($1, 'Branch A2') RETURNING id;",
      [orgAId]
    );
    branchA2Id = branchA2Res.rows[0].id;

    const userARes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'User A', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("db-user-a")}@test.local`]
    );
    userAId = userARes.rows[0].id;
    await pool.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE');",
      [orgAId, userAId]
    );

    // Setup Org B
    const ownerBRes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'Owner B', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("db-owner-b")}@test.local`]
    );
    ownerBId = ownerBRes.rows[0].id;

    const orgBRes = await pool.query(
      "INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;",
      [ownerBId, uniqueValue("Org B DB Test")]
    );
    orgBId = orgBRes.rows[0].id;

    const branchB1Res = await pool.query(
      "INSERT INTO branches (organisation_id, name) VALUES ($1, 'Branch B1') RETURNING id;",
      [orgBId]
    );
    branchB1Id = branchB1Res.rows[0].id;

    const userBRes = await pool.query(
      "INSERT INTO users (email, password_hash, name, status) VALUES ($1, 'pwd', 'User B', 'ACTIVE') RETURNING id;",
      [`${uniqueValue("db-user-b")}@test.local`]
    );
    userBId = userBRes.rows[0].id;
    await pool.query(
      "INSERT INTO organisation_memberships (organisation_id, user_id, status) VALUES ($1, $2, 'ACTIVE');",
      [orgBId, userBId]
    );

    // Valid Register and Session in Org A / Branch A1
    const regA1Res = await pool.query(
      "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Reg A1', 'R-A1') RETURNING id;",
      [orgAId, branchA1Id]
    );
    registerA1Id = regA1Res.rows[0].id;

    const sessA1Res = await pool.query(
      "INSERT INTO cash_register_sessions (organisation_id, branch_id, cash_register_id, cashier_id, session_number, opening_balance, status) VALUES ($1, $2, $3, $4, 'REG-001', 100, 'OPEN') RETURNING id;",
      [orgAId, branchA1Id, registerA1Id, userAId]
    );
    sessionA1Id = sessA1Res.rows[0].id;

    // Valid Register and Session in Org B / Branch B1
    const regB1Res = await pool.query(
      "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Reg B1', 'R-B1') RETURNING id;",
      [orgBId, branchB1Id]
    );
    registerB1Id = regB1Res.rows[0].id;

    const sessB1Res = await pool.query(
      "INSERT INTO cash_register_sessions (organisation_id, branch_id, cash_register_id, cashier_id, session_number, opening_balance, status) VALUES ($1, $2, $3, $4, 'REG-B01', 200, 'OPEN') RETURNING id;",
      [orgBId, branchB1Id, registerB1Id, userBId]
    );
    sessionB1Id = sessB1Res.rows[0].id;

    // -------------------------------------------------------------------------
    // Test 1: cash_registers cross-tenant branch rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Attempt to insert register for Org A pointing to Branch B1 (belonging to Org B)
        await pool.query(
          "INSERT INTO cash_registers (organisation_id, branch_id, name, identifier) VALUES ($1, $2, 'Cross Reg', 'X-1');",
          [orgAId, branchB1Id]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503"); // foreign_key_violation
        assert.ok(err.constraint.includes("cash_registers_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject cash_registers with branch belonging to another organisation"
    );
    console.log("✓ 1. PostgreSQL rejects cross-tenant branch on cash_registers");

    // -------------------------------------------------------------------------
    // Test 2: cash_register_sessions cross-branch register rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Attempt to insert session for Branch A2 with Register A1 (belonging to Branch A1)
        await pool.query(
          "INSERT INTO cash_register_sessions (organisation_id, branch_id, cash_register_id, cashier_id, session_number, opening_balance, status) VALUES ($1, $2, $3, $4, 'REG-ERR', 50, 'CLOSED');",
          [orgAId, branchA2Id, registerA1Id, userAId]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503"); // foreign_key_violation
        assert.ok(err.constraint.includes("cash_register_sessions_register_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject cash_register_sessions when register belongs to another branch"
    );
    console.log("✓ 2. PostgreSQL rejects cross-branch register on cash_register_sessions");

    // -------------------------------------------------------------------------
    // Test 3: cash_register_sessions cross-tenant register rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Attempt to insert session for Org A with Register B1 (belonging to Org B)
        await pool.query(
          "INSERT INTO cash_register_sessions (organisation_id, branch_id, cash_register_id, cashier_id, session_number, opening_balance, status) VALUES ($1, $2, $3, $4, 'REG-ERR-2', 50, 'CLOSED');",
          [orgAId, branchA1Id, registerB1Id, userAId]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("cash_register_sessions_register_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject cash_register_sessions when register belongs to another organisation"
    );
    console.log("✓ 3. PostgreSQL rejects cross-tenant register on cash_register_sessions");

    // -------------------------------------------------------------------------
    // Test 4: cash_movements cross-branch session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Session A1 is in Branch A1; attempt to create movement in Branch A2 referencing Session A1
        await pool.query(
          "INSERT INTO cash_movements (organisation_id, branch_id, cash_register_session_id, cashier_id, movement_number, movement_type, amount, reason) VALUES ($1, $2, $3, $4, 'PC-X1', 'IN', 10, 'Test');",
          [orgAId, branchA2Id, sessionA1Id, userAId]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("cash_movements_session_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject cash_movements with session from another branch"
    );
    console.log("✓ 4. PostgreSQL rejects cross-branch session on cash_movements");

    // -------------------------------------------------------------------------
    // Test 5: cash_denominations cross-tenant session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Session B1 is in Org B; attempt to insert denomination with Org A and Session B1
        await pool.query(
          "INSERT INTO cash_denominations (organisation_id, cash_register_session_id, denomination_value, denomination_count) VALUES ($1, $2, 500, 2);",
          [orgAId, sessionB1Id]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("cash_denominations_session_org_fk"));
        return true;
      },
      "PostgreSQL must reject cash_denominations with session from another organisation"
    );
    console.log("✓ 5. PostgreSQL rejects cross-tenant session on cash_denominations");

    // -------------------------------------------------------------------------
    // Test 6: held_bills cross-branch session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Session A1 is in Branch A1; attempt to insert held bill in Branch A2 referencing Session A1
        await pool.query(
          `INSERT INTO held_bills (
             organisation_id, branch_id, cash_register_session_id, held_by, hold_token,
             customer_name, items_count, subtotal, tax_amount, discount_percent, total_amount, cart_data
           ) VALUES ($1, $2, $3, $4, 'HB-ERR', 'Walk-in', 1, 10, 0, 0, 10, '{}');`,
          [orgAId, branchA2Id, sessionA1Id, userAId]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("held_bills_session_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject held_bills with session from another branch"
    );
    console.log("✓ 6. PostgreSQL rejects cross-branch session on held_bills");

    // -------------------------------------------------------------------------
    // Test 7: invoices cross-branch session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    const custARes = await pool.query(
      "INSERT INTO customers (organisation_id, customer_number, full_name, phone) VALUES ($1, 'CUST-DB-1', 'Cust A', '9876543210') RETURNING id;",
      [orgAId]
    );
    const custAId = custARes.rows[0].id;

    await assert.rejects(
      async () => {
        // Session A1 is in Branch A1; attempt to insert invoice in Branch A2 referencing Session A1
        await pool.query(
          `INSERT INTO invoices (
             organisation_id, branch_id, customer_id, invoice_number, subtotal, total_amount, status, cash_register_session_id
           ) VALUES ($1, $2, $3, 'INV-DB-ERR', 100, 100, 'COMPLETED', $4);`,
          [orgAId, branchA2Id, custAId, sessionA1Id]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("invoices_session_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject invoices with session from another branch"
    );
    console.log("✓ 7. PostgreSQL rejects cross-branch session on invoices");

    // -------------------------------------------------------------------------
    // Test 8: payments cross-branch session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        // Session A1 is in Branch A1; attempt to insert payment in Branch A2 referencing Session A1
        await pool.query(
          `INSERT INTO payments (
             organisation_id, branch_id, customer_id, receipt_number, total_amount, status, cash_register_session_id
           ) VALUES ($1, $2, $3, 'REC-DB-ERR', 100, 'COMPLETED', $4);`,
          [orgAId, branchA2Id, custAId, sessionA1Id]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("payments_session_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject payments with session from another branch"
    );
    console.log("✓ 8. PostgreSQL rejects cross-branch session on payments");

    // -------------------------------------------------------------------------
    // Test 9: returns cross-branch session rejected by PostgreSQL
    // -------------------------------------------------------------------------
    const validInvRes = await pool.query(
      `INSERT INTO invoices (
         organisation_id, branch_id, customer_id, invoice_number, subtotal, total_amount, status, cash_register_session_id
       ) VALUES ($1, $2, $3, 'INV-DB-OK', 100, 100, 'COMPLETED', $4) RETURNING id;`,
      [orgAId, branchA1Id, custAId, sessionA1Id]
    );
    const validInvId = validInvRes.rows[0].id;

    await assert.rejects(
      async () => {
        // Session A1 is in Branch A1; attempt to insert return in Branch A2 referencing Session A1
        await pool.query(
          `INSERT INTO returns (
             organisation_id, branch_id, customer_id, invoice_id, return_number, refund_amount, refund_method, status, cash_register_session_id
           ) VALUES ($1, $2, $3, $4, 'RET-DB-ERR', 50, 'CASH', 'PROCESSED', $5);`,
          [orgAId, branchA2Id, custAId, validInvId, sessionA1Id]
        );
      },
      (err) => {
        assert.strictEqual(err.code, "23503");
        assert.ok(err.constraint.includes("returns_session_branch_org_fk"));
        return true;
      },
      "PostgreSQL must reject returns with session from another branch"
    );
    console.log("✓ 9. PostgreSQL rejects cross-branch session on returns");

    console.log("\nAll 9 POS Database Integrity tests passed successfully!\n");
  } finally {
    // Cleanup
    if (orgAId) {
      await pool.query("DELETE FROM organisations WHERE id = $1", [orgAId]).catch(() => {});
    }
    if (orgBId) {
      await pool.query("DELETE FROM organisations WHERE id = $1", [orgBId]).catch(() => {});
    }
    if (ownerAId) {
      await pool.query("DELETE FROM users WHERE id = $1", [ownerAId]).catch(() => {});
    }
    if (ownerBId) {
      await pool.query("DELETE FROM users WHERE id = $1", [ownerBId]).catch(() => {});
    }
    if (userAId) {
      await pool.query("DELETE FROM users WHERE id = $1", [userAId]).catch(() => {});
    }
    if (userBId) {
      await pool.query("DELETE FROM users WHERE id = $1", [userBId]).catch(() => {});
    }
    await pool.end();
  }
};

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
