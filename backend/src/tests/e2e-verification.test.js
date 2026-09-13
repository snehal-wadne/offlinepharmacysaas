/**
 * Comprehensive System-Wide E2E Integration Test Suite
 * Tests all backend modules, databases, and frontend API contracts.
 */

const BASE_URL = "http://localhost:5000";

async function testEndpoint(name, url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    let body = null;
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    const pass = res.status >= 200 && res.status < 300;
    console.log(`  ${pass ? "✓" : "❌"} [${res.status}] ${name}`);
    if (!pass) {
      console.log(
        "     Error body:",
        typeof body === "object" ? JSON.stringify(body) : body,
      );
    }
    return { pass, status: res.status, body };
  } catch (err) {
    console.log(`  ❌ [FAIL] ${name}: ${err.message}`);
    return { pass: false, error: err.message };
  }
}

async function runE2E() {
  console.log("====================================================");
  console.log("       🧪 RUNNING COMPREHENSIVE E2E VERIFICATION     ");
  console.log("====================================================\n");

  let passed = 0;
  let failed = 0;

  function count(result) {
    if (result && result.pass) passed++;
    else failed++;
  }

  const { pool } = require("../db/connection");
  const orgRes = await pool.query(
    "SELECT id FROM organisations WHERE status = 'ACTIVE' LIMIT 1;",
  );
  const orgId = orgRes.rows[0]?.id || "c206390c-2dae-41e5-a698-bf8259a73912";
  const branchRes = await pool.query(
    "SELECT id FROM branches WHERE organisation_id = $1 AND status = 'ACTIVE' LIMIT 1;",
    [orgId],
  );
  const activeBranchId =
    branchRes.rows[0]?.id || "1b411d94-a957-4b95-a22c-a05e267b14d2";
  const syncAuthHeaders = {
    Authorization: "Bearer pf_platform_default_dev",
    "x-organisation-id": orgId,
    "x-branch-id": activeBranchId,
  };

  // 1. Core Health
  console.log("[1/8] Core Health & Status:");
  count(await testEndpoint("GET /health", `${BASE_URL}/health`));
  count(await testEndpoint("GET /api/health", `${BASE_URL}/api/health`));
  count(
    await testEndpoint("GET /api/sync/status", `${BASE_URL}/api/sync/status`, {
      headers: syncAuthHeaders,
    }),
  );

  // 2. Tax & GST CRUD
  console.log("\n[2/8] Tax & GST CRUD Workflow:");
  const getTaxesRes = await testEndpoint(
    "GET /api/taxes",
    `${BASE_URL}/api/taxes`,
  );
  count(getTaxesRes);

  let createdTaxId = null;
  const postTaxRes = await testEndpoint(
    "POST /api/taxes",
    `${BASE_URL}/api/taxes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Special Test Cess ${Date.now()}`,
        taxType: "STATE_TAX",
        rate: 1.5,
        isDefault: false,
        description: "E2E automated test cess",
      }),
    },
  );
  count(postTaxRes);
  if (postTaxRes.pass && postTaxRes.body?.data?.id) {
    createdTaxId = postTaxRes.body.data.id;
  }

  if (createdTaxId) {
    count(
      await testEndpoint(
        "PUT /api/taxes/:id",
        `${BASE_URL}/api/taxes/${createdTaxId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rate: 2.0,
            description: "Updated E2E test cess",
          }),
        },
      ),
    );

    count(
      await testEndpoint(
        "PATCH /api/taxes/:id/status",
        `${BASE_URL}/api/taxes/${createdTaxId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        },
      ),
    );

    count(
      await testEndpoint(
        "DELETE /api/taxes/:id",
        `${BASE_URL}/api/taxes/${createdTaxId}`,
        {
          method: "DELETE",
        },
      ),
    );
  }

  count(
    await testEndpoint(
      "GET /api/taxes/branch-gst/main",
      `${BASE_URL}/api/taxes/branch-gst/main`,
    ),
  );
  count(
    await testEndpoint(
      "PUT /api/taxes/branch-gst/main",
      `${BASE_URL}/api/taxes/branch-gst/main`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gstin: "27AAAAF1234F1Z5",
          legalName: "Flora Institute Healthcare",
          tradeName: "Flora Main Pharmacy",
          state: "Maharashtra",
          stateCode: "27",
          gstScheme: "REGULAR",
        }),
      },
    ),
  );

  // 3. Cash Register & Movements
  console.log("\n[3/8] Cash Register & Movements Workflow:");
  count(
    await testEndpoint(
      "GET /api/cashier/register/current",
      `${BASE_URL}/api/cashier/register/current`,
      { headers: syncAuthHeaders },
    ),
  );
  count(
    await testEndpoint(
      "GET /api/cashier/register/history",
      `${BASE_URL}/api/cashier/register/history`,
      { headers: syncAuthHeaders },
    ),
  );
  count(
    await testEndpoint(
      "POST /api/cashier/register/movement",
      `${BASE_URL}/api/cashier/register/movement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...syncAuthHeaders },
        body: JSON.stringify({
          type: "IN",
          amount: 500,
          reason: "FLOAT_ADDITION",
          notes: "E2E Opening change verification",
        }),
      },
    ),
  );
  count(
    await testEndpoint(
      "GET /api/cashier/register/movements",
      `${BASE_URL}/api/cashier/register/movements`,
      { headers: syncAuthHeaders },
    ),
  );

  // 4. POS Billing & Held Bills
  console.log("\n[4/8] POS Billing & Held Bills Workflow:");
  const getProdsRes = await testEndpoint(
    "GET /api/cashier/products",
    `${BASE_URL}/api/cashier/products`,
  );
  count(getProdsRes);
  const sampleProd =
    (Array.isArray(getProdsRes.body?.data) ? getProdsRes.body.data[0] : null) ||
    (Array.isArray(getProdsRes.body) ? getProdsRes.body[0] : null);
  const dynamicProdId =
    sampleProd?.id || "5d63ea49-1a21-4c4c-849b-d11177596e42";

  count(
    await testEndpoint(
      "POST /api/cashier/sales",
      `${BASE_URL}/api/cashier/sales`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "E2E Verification Walk-in",
          customerPhone: "9888877777",
          paymentMethod: "CASH",
          items: [
            {
              productId: dynamicProdId,
              productName: sampleProd?.name || "Paracetamol 650mg",
              quantity: 2,
              unitPrice: sampleProd?.sellingPrice || 30,
            },
          ],
          totalAmount: (sampleProd?.sellingPrice || 30) * 2,
        }),
      },
    ),
  );
  count(
    await testEndpoint(
      "GET /api/cashier/sales/recent",
      `${BASE_URL}/api/cashier/sales/recent`,
    ),
  );
  count(
    await testEndpoint(
      "POST /api/cashier/held-bills",
      `${BASE_URL}/api/cashier/held-bills`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Held Patient Test",
          note: "Verification held bill",
          items: [{ name: "Vitamin C 500mg", quantity: 1, price: 50 }],
          total: 50,
        }),
      },
    ),
  );
  count(
    await testEndpoint(
      "GET /api/cashier/held-bills",
      `${BASE_URL}/api/cashier/held-bills`,
    ),
  );

  // 5. Inventory & Barcode
  console.log("\n[5/8] Inventory & Barcode Generation Workflow:");
  count(await testEndpoint("GET /api/inventory", `${BASE_URL}/api/inventory`));
  count(
    await testEndpoint(
      "GET /api/inventory/summary",
      `${BASE_URL}/api/inventory/summary`,
    ),
  );
  count(
    await testEndpoint(
      "GET /api/inventory/movements",
      `${BASE_URL}/api/inventory/movements`,
    ),
  );
  count(
    await testEndpoint(
      "GET /api/inventory/:id/barcode",
      `${BASE_URL}/api/inventory/${dynamicProdId}/barcode`,
    ),
  );

  // 6. Offline Sync Engine
  console.log("\n[6/8] Offline Sync Engine:");
  count(
    await testEndpoint("POST /api/sync/batch", `${BASE_URL}/api/sync/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...syncAuthHeaders },
      body: JSON.stringify({
        deviceId: "DEVICE-E2E-TEST",
        branchId: activeBranchId,
        operations: [],
      }),
    }),
  );

  // 7. Reports & Analytics
  console.log("\n[7/8] Reports & Analytics:");
  count(
    await testEndpoint(
      "GET /api/reports/sales",
      `${BASE_URL}/api/reports/sales`,
    ),
  );
  count(
    await testEndpoint(
      "GET /api/reports/inventory",
      `${BASE_URL}/api/reports/inventory`,
    ),
  );
  count(
    await testEndpoint(
      "GET /api/reports/expiry",
      `${BASE_URL}/api/reports/expiry`,
    ),
  );
  count(
    await testEndpoint(
      "GET /api/reports/profit-loss",
      `${BASE_URL}/api/reports/profit-loss`,
    ),
  );
  count(
    await testEndpoint("GET /api/reports/gst", `${BASE_URL}/api/reports/gst`),
  );

  // 8. Authentication & Owner Google Login
  console.log("\n[8/8] Authentication & Owner Google Login:");
  const googleOwnerRes = await testEndpoint(
    "POST /api/auth/google (Owner Login)",
    `${BASE_URL}/api/auth/google`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "surajmore303@gmail.com",
        name: "Suraj More",
        role: "OWNER",
        googleSub: "google_owner_test_123",
      }),
    },
  );
  count(googleOwnerRes);
  if (googleOwnerRes.pass && googleOwnerRes.body?.user) {
    const u = googleOwnerRes.body.user;
    console.log(
      `     ✓ Owner Verified: role=${u.role}, isOwner=${u.isOwner}, name=${u.name}, accessLevel=${u.accessLevel}`,
    );
  }

  const googleStaffRes = await testEndpoint(
    "POST /api/auth/google (Staff Login)",
    `${BASE_URL}/api/auth/google`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff.pharmacist@gmail.com",
        name: "Staff Pharmacist",
        role: "PHARMACIST",
        googleSub: "google_staff_test_456",
      }),
    },
  );
  count(googleStaffRes);

  console.log("\n====================================================");
  console.log(
    `🏁 E2E VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`,
  );
  console.log("====================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runE2E();
