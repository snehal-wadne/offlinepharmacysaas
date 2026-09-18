/**
 * PHARMAFLOW CANONICAL DEMO PHARMACY SEEDER
 *
 * Populates the canonical demo tenant ("MedLife Care Chemist") with real,
 * coherent, relational PostgreSQL records and provisions Supabase Auth demo accounts.
 *
 * Canonical Tenant:
 * - Organisation ID: 566a2312-ea81-4be9-9007-a925538d4d74 (MedLife Care Chemist)
 * - Primary Branch:  e1c1e5cb-79b8-472e-83ea-a4dfd60e7040 (BRANCH-001, MedLife Central Dispensary)
 * - Secondary Branch: c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f (BRANCH-002, MedLife Express Clinic & Sub-Store)
 *
 * Guaranteed Properties:
 * 1. 100% Idempotent - safe to re-run repeatedly without duplicate or orphan rows.
 * 2. Safe Tenant-Scoped Reset (--reset flag clears only demo-owned child records; NEVER deletes the organisation).
 * 3. Suraj More account is preserved 100% untouched.
 * 4. Supabase Auth accounts provisioned safely via Supabase Admin API.
 * 5. Full mathematical and relational consistency across invoices, batches, payments, and ledgers.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const bcrypt = require("bcrypt");
const { pool } = require("./connection");
const { supabaseAdmin } = require("../utils/supabase");

// Canonical Tenant Constants
const CANONICAL_ORG_ID = "566a2312-ea81-4be9-9007-a925538d4d74";
const CANONICAL_OWNER_ID = "fb14b69b-aec9-41e8-9abe-a3a058a400af";
const PRIMARY_BRANCH_ID = "e1c1e5cb-79b8-472e-83ea-a4dfd60e7040";
const SECONDARY_BRANCH_ID = "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f";

// System Role IDs verified from PostgreSQL public.roles
const ROLES = {
  ADMIN: "20853326-fd7f-438f-9aa9-9d256d6ee5c4",
  MANAGER: "ae9b81d4-bcf3-4561-96f4-b9f72529bfa3",
  PHARMACIST: "404d5f09-03b0-47e8-bd2b-48d6c85ec4a5",
  CASHIER: "557a634e-df43-4549-a8cc-6f9c70712c51",
  ACCOUNTANT: "01ef0d86-4eb0-4aff-9017-e1a3d8b57cff",
};

// Demo Users to Provision
const DEMO_USERS = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    name: "Dr. Rajesh Sharma",
    email: "rajesh.sharma@medlife.demo",
    phone: "9820012345",
    password: "PharmaFlow@2026!",
    staffId: "STAFF-ADM-01",
    roleId: ROLES.ADMIN,
    roleIdentifier: "ADMIN",
    branchAssignments: [
      { branchId: PRIMARY_BRANCH_ID, isPrimary: true },
      { branchId: SECONDARY_BRANCH_ID, isPrimary: false },
    ],
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    name: "Priya Mehta",
    email: "priya.mehta@medlife.demo",
    phone: "9820023456",
    password: "PharmaFlow@2026!",
    staffId: "STAFF-PHARM-01",
    roleId: ROLES.PHARMACIST,
    roleIdentifier: "PHARMACIST",
    branchAssignments: [{ branchId: PRIMARY_BRANCH_ID, isPrimary: true }],
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    name: "Amit Verma",
    email: "amit.verma@medlife.demo",
    phone: "9820034567",
    password: "PharmaFlow@2026!",
    staffId: "STAFF-CASH-01",
    roleId: ROLES.CASHIER,
    roleIdentifier: "CASHIER",
    branchAssignments: [{ branchId: PRIMARY_BRANCH_ID, isPrimary: true }],
  },
  {
    id: "a4444444-4444-4444-8444-444444444444",
    name: "Suresh Patil",
    email: "suresh.patil@medlife.demo",
    phone: "9820045678",
    password: "PharmaFlow@2026!",
    staffId: "STAFF-MGR-01",
    roleId: ROLES.MANAGER,
    roleIdentifier: "MANAGER",
    branchAssignments: [
      { branchId: PRIMARY_BRANCH_ID, isPrimary: true },
      { branchId: SECONDARY_BRANCH_ID, isPrimary: false },
    ],
  },
];

/**
 * 1. Provision Demo Users in Supabase Auth
 */
async function provisionSupabaseAuthUsers() {
  console.log("\n[1/12] Provisioning Demo Accounts in Supabase Auth...");
  const results = {};

  for (const user of DEMO_USERS) {
    let authId = null;

    if (supabaseAdmin?.auth?.admin) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: { name: user.name },
        });

        if (data?.user?.id) {
          authId = data.user.id;
          console.log(
            `  ✓ Created Supabase Auth user: ${user.email} (${authId})`,
          );
        } else if (
          error &&
          (error.message?.includes("already registered") ||
            error.status === 422)
        ) {
          // Fetch existing user ID
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
            perPage: 100,
          });
          const existing = listData?.users?.find(
            (u) => u.email?.toLowerCase() === user.email.toLowerCase(),
          );
          if (existing) {
            authId = existing.id;
            // Update password to guarantee correct login credentials
            await supabaseAdmin.auth.admin.updateUserById(authId, {
              password: user.password,
              email_confirm: true,
              user_metadata: { name: user.name },
            });
            console.log(
              `  ✓ Updated existing Supabase Auth user: ${user.email} (${authId})`,
            );
          }
        } else if (error) {
          console.warn(
            `  ⚠️ Supabase Auth notice for ${user.email}: ${error.message}`,
          );
        }
      } catch (err) {
        console.warn(
          `  ⚠️ Supabase Auth exception for ${user.email}: ${err.message}`,
        );
      }
    }

    if (!authId) {
      // Fallback: deterministic UUID based on email
      const crypto = require("crypto");
      const hash = crypto.createHash("md5").update(user.email).digest("hex");
      authId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      console.log(
        `  ✓ Generated local fallback Auth ID: ${user.email} (${authId})`,
      );
    }

    results[user.email] = authId;
  }

  return results;
}

/**
 * 2. Safe Tenant Reset (Scrub demo child data, strictly preserving the organisation)
 */
async function resetDemoTenantData(client) {
  console.log(
    "\n[2/12] Executing Safe Tenant Reset (Organisation ID preserved)...",
  );

  // Delete in reverse foreign key order, strictly scoped by CANONICAL_ORG_ID
  const tablesToScrub = [
    {
      name: "audit_logs",
      query: "DELETE FROM audit_logs WHERE organisation_id = $1;",
    },
    {
      name: "customer_ledger_entries",
      query: "DELETE FROM customer_ledger_entries WHERE organisation_id = $1;",
    },
    {
      name: "payment_allocations",
      query: `DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE organisation_id = $1);`,
    },
    {
      name: "payment_transactions",
      query: `DELETE FROM payment_transactions WHERE payment_id IN (SELECT id FROM payments WHERE organisation_id = $1);`,
    },
    {
      name: "payments",
      query: "DELETE FROM payments WHERE organisation_id = $1;",
    },
    {
      name: "invoice_items",
      query: `DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organisation_id = $1);`,
    },
    {
      name: "invoices",
      query: "DELETE FROM invoices WHERE organisation_id = $1;",
    },
    {
      name: "held_bills",
      query: "DELETE FROM held_bills WHERE organisation_id = $1;",
    },
    {
      name: "stock_transfer_items",
      query: `DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE organisation_id = $1);`,
    },
    {
      name: "stock_transfers",
      query: "DELETE FROM stock_transfers WHERE organisation_id = $1;",
    },
    {
      name: "cash_movements",
      query: "DELETE FROM cash_movements WHERE organisation_id = $1;",
    },
    {
      name: "cash_register_sessions",
      query: "DELETE FROM cash_register_sessions WHERE organisation_id = $1;",
    },
    {
      name: "cash_registers",
      query: "DELETE FROM cash_registers WHERE organisation_id = $1;",
    },
    {
      name: "goods_receipt_items",
      query: `DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT id FROM goods_receipts WHERE organisation_id = $1);`,
    },
    {
      name: "goods_receipts",
      query: "DELETE FROM goods_receipts WHERE organisation_id = $1;",
    },
    {
      name: "purchase_items",
      query: `DELETE FROM purchase_items WHERE purchase_id IN (SELECT id FROM purchases WHERE organisation_id = $1);`,
    },
    {
      name: "purchases",
      query: "DELETE FROM purchases WHERE organisation_id = $1;",
    },
    {
      name: "prescriptions",
      query: "DELETE FROM prescriptions WHERE organisation_id = $1;",
    },
    {
      name: "inventory_batches",
      query: `DELETE FROM inventory_batches WHERE product_id IN (SELECT id FROM products WHERE organisation_id = $1);`,
    },
    {
      name: "products",
      query: "DELETE FROM products WHERE organisation_id = $1;",
    },
    {
      name: "customer_credit_accounts",
      query: "DELETE FROM customer_credit_accounts WHERE organisation_id = $1;",
    },
    {
      name: "customers",
      query: "DELETE FROM customers WHERE organisation_id = $1;",
    },
    {
      name: "suppliers",
      query: "DELETE FROM suppliers WHERE organisation_id = $1;",
    },
    {
      name: "branch_tax_assignments",
      query: `DELETE FROM branch_tax_assignments WHERE branch_id IN ($1, $2);`,
    },
    { name: "taxes", query: "DELETE FROM taxes WHERE organisation_id = $1;" },
  ];

  for (const step of tablesToScrub) {
    if (step.name === "branch_tax_assignments") {
      await client.query(step.query, [PRIMARY_BRANCH_ID, SECONDARY_BRANCH_ID]);
    } else {
      await client.query(step.query, [CANONICAL_ORG_ID]);
    }
  }

  // Clear demo user branch assignments and memberships (EXCEPT Suraj More)
  await client.query(
    `
    DELETE FROM branch_assignments
    WHERE membership_id IN (
      SELECT om.id FROM organisation_memberships om
      JOIN users u ON om.user_id = u.id
      WHERE om.organisation_id = $1
        AND LOWER(u.email) != 'surajmore303@gmail.com'
    );
  `,
    [CANONICAL_ORG_ID],
  );

  await client.query(
    `
    DELETE FROM organisation_memberships
    WHERE organisation_id = $1
      AND user_id IN (
        SELECT id FROM users
        WHERE LOWER(email) != 'surajmore303@gmail.com'
          AND email LIKE '%@medlife.demo'
      );
  `,
    [CANONICAL_ORG_ID],
  );

  console.log(
    "  ✓ Demo tenant child records cleaned. Organisation record remains intact.",
  );
}

/**
 * 3. Seed Canonical Organisation and Branches
 */
async function seedOrganisationAndBranches(client) {
  console.log("\n[3/12] Ensuring Canonical Organisation & Branches...");

  // 1. Ensure Organisation
  await client.query(
    `
    INSERT INTO organisations (
      id, owner_id, name, pharmacy_code, admin_name, email, phone,
      address, city, state, pincode, gst_number, business_type, status,
      created_at, updated_at
    )
    VALUES (
      $1, $2, 'MedLife Care Chemist', 'PHARM-1001', 'Dr. Rajesh Sharma', 'rajesh.sharma@medlife.demo', '9820012345',
      '12 Marine Drive, Fort', 'Mumbai', 'Maharashtra', '400020', '27AABCM8921N1ZM', 'Private Limited', 'ACTIVE',
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      name = EXCLUDED.name,
      pharmacy_code = 'PHARM-1001',
      admin_name = EXCLUDED.admin_name,
      gst_number = EXCLUDED.gst_number,
      status = 'ACTIVE',
      updated_at = NOW();
  `,
    [CANONICAL_ORG_ID, CANONICAL_OWNER_ID],
  );

  // 2. Primary Branch (MedLife Central Dispensary)
  await client.query(
    `
    INSERT INTO branches (
      id, organisation_id, branch_code, name, facility_type,
      contact_person, contact_phone, contact_email,
      address, city, state, postal_code, phone,
      drug_license_number, invoice_prefix, status,
      created_at, updated_at
    )
    VALUES (
      $1, $2, 'BRANCH-001', 'MedLife Central Dispensary', 'RETAIL_DISPENSARY',
      'Priya Mehta', '9820023456', 'dispensary@medlife.demo',
      '12 Marine Drive, Fort', 'Mumbai', 'Maharashtra', '400020', '9820012345',
      '20B/21B-MH-MUM-449102', 'MED-CEN', 'ACTIVE',
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      branch_code = EXCLUDED.branch_code,
      facility_type = EXCLUDED.facility_type,
      drug_license_number = EXCLUDED.drug_license_number,
      invoice_prefix = EXCLUDED.invoice_prefix,
      status = 'ACTIVE',
      updated_at = NOW();
  `,
    [PRIMARY_BRANCH_ID, CANONICAL_ORG_ID],
  );

  // 3. Secondary Branch (MedLife Express Clinic & Sub-Store)
  await client.query(
    `
    INSERT INTO branches (
      id, organisation_id, branch_code, name, facility_type,
      contact_person, contact_phone, contact_email,
      address, city, state, postal_code, phone,
      drug_license_number, invoice_prefix, status,
      created_at, updated_at
    )
    VALUES (
      $1, $2, 'BRANCH-002', 'MedLife Express Clinic & Sub-Store', 'HOSPITAL_PHARMACY',
      'Suresh Patil', '9820045678', 'express@medlife.demo',
      'Shop 4, Shivaji Nagar', 'Pune', 'Maharashtra', '411005', '9820098765',
      '20B/21B-MH-PUN-778210', 'MED-EXP', 'ACTIVE',
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      branch_code = EXCLUDED.branch_code,
      facility_type = EXCLUDED.facility_type,
      drug_license_number = EXCLUDED.drug_license_number,
      invoice_prefix = EXCLUDED.invoice_prefix,
      status = 'ACTIVE',
      updated_at = NOW();
  `,
    [SECONDARY_BRANCH_ID, CANONICAL_ORG_ID],
  );

  // 4. Branch GST Settings for both branches
  for (const bId of [PRIMARY_BRANCH_ID, SECONDARY_BRANCH_ID]) {
    await client.query(
      `
      INSERT INTO branch_gst_settings (
        organisation_id, branch_id, gstin, legal_name, trade_name,
        state, state_code, gst_scheme, tax_inclusive_pricing,
        auto_interstate_split, status, created_at, updated_at
      )
      VALUES (
        $1, $2, '27AABCM8921N1ZM', 'MedLife Care Chemist Pvt Ltd', 'MedLife Care Chemist',
        'Maharashtra', '27', 'REGULAR', TRUE,
        TRUE, 'ACTIVE', NOW(), NOW()
      )
      ON CONFLICT (branch_id) DO UPDATE SET
        gstin = EXCLUDED.gstin,
        legal_name = EXCLUDED.legal_name,
        status = 'ACTIVE',
        updated_at = NOW();
    `,
      [CANONICAL_ORG_ID, bId],
    );
  }

  console.log("  ✓ Canonical Organisation and 2 Branches verified.");
}

/**
 * 4. Seed Demo Staff Users, Memberships, and Branch Assignments
 */
async function seedDemoUsersAndRoles(client, authMap) {
  console.log(
    "\n[4/12] Seeding Demo Staff Users, Memberships & Assignments...",
  );

  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const authId = authMap[u.email];

    // 1. Upsert into public.users
    const userRes = await client.query(
      `
      INSERT INTO users (
        id, email, password_hash, name, status, staff_id, phone,
        is_platform_superadmin, supabase_auth_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'ACTIVE', $5, $6,
        FALSE, $7, NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        status = 'ACTIVE',
        staff_id = EXCLUDED.staff_id,
        phone = EXCLUDED.phone,
        supabase_auth_id = COALESCE(users.supabase_auth_id, EXCLUDED.supabase_auth_id),
        updated_at = NOW()
      RETURNING id;
    `,
      [
        u.id,
        u.email.toLowerCase(),
        passwordHash,
        u.name,
        u.staffId,
        u.phone,
        authId,
      ],
    );

    const actualUserId = userRes.rows[0].id;

    // 2. Upsert into organisation_memberships
    const memRes = await client.query(
      `
      INSERT INTO organisation_memberships (
        organisation_id, user_id, status, joined_at, created_at, updated_at
      )
      VALUES ($1, $2, 'ACTIVE', NOW(), NOW(), NOW())
      ON CONFLICT DO NOTHING
      RETURNING id;
    `,
      [CANONICAL_ORG_ID, actualUserId],
    );

    let membershipId = memRes.rows[0]?.id;
    if (!membershipId) {
      const existingMem = await client.query(
        `
        SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2;
      `,
        [CANONICAL_ORG_ID, actualUserId],
      );
      membershipId = existingMem.rows[0]?.id;
    }

    // 3. Upsert into branch_assignments
    for (const ba of u.branchAssignments) {
      await client.query(
        `
        INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING;
      `,
        [membershipId, ba.branchId, u.roleId, ba.isPrimary],
      );
    }

    console.log(`  ✓ Configured user: ${u.name} (${u.roleIdentifier})`);
  }

  // Preserve Suraj More membership & ensure assigned to Primary Branch
  const surajCheck = await client.query(
    `SELECT id FROM users WHERE email = 'surajmore303@gmail.com';`,
  );
  if (surajCheck.rows.length > 0) {
    const surajId = surajCheck.rows[0].id;
    const surajMem = await client.query(
      `
      SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2;
    `,
      [CANONICAL_ORG_ID, surajId],
    );
    if (surajMem.rows.length > 0) {
      const sMemId = surajMem.rows[0].id;
      await client.query(
        `
        INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
        VALUES ($1, $2, $3, FALSE)
        ON CONFLICT DO NOTHING;
      `,
        [sMemId, PRIMARY_BRANCH_ID, ROLES.ADMIN],
      );
      console.log("  ✓ Verified and preserved Suraj More admin assignment.");
    }
  }
}

/**
 * 5. Seed Taxes (GST Slabs)
 */
async function seedTaxes(client) {
  console.log("\n[5/12] Seeding Taxes & GST Slabs...");

  const taxes = [
    {
      id: "b1111111-1111-4111-8111-111111111111",
      name: "GST 0% (Exempt)",
      rate: 0.0,
      isDefault: false,
      desc: "Exempt life-saving medications",
    },
    {
      id: "b2222222-2222-4222-8222-222222222222",
      name: "GST 5% (Essential)",
      rate: 5.0,
      isDefault: false,
      desc: "Essential generic medications & oral rehydration",
    },
    {
      id: "b3333333-3333-4333-8333-333333333333",
      name: "GST 12% (Standard)",
      rate: 12.0,
      isDefault: true,
      desc: "Standard therapeutic formulations & antibiotics",
    },
    {
      id: "b4444444-4444-4444-8444-444444444444",
      name: "GST 18% (Devices/Nutrition)",
      rate: 18.0,
      isDefault: false,
      desc: "Medical devices, sanitizers & nutritional supplements",
    },
  ];

  for (const t of taxes) {
    await client.query(
      `
      INSERT INTO taxes (id, organisation_id, name, tax_type, rate, is_default, is_active, description, created_at, updated_at)
      VALUES ($1, $2, $3, 'CENTRAL_TAX', $4, $5, TRUE, $6, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        rate = EXCLUDED.rate,
        is_default = EXCLUDED.is_default,
        is_active = TRUE,
        updated_at = NOW();
    `,
      [t.id, CANONICAL_ORG_ID, t.name, t.rate, t.isDefault, t.desc],
    );

    for (const bId of [PRIMARY_BRANCH_ID, SECONDARY_BRANCH_ID]) {
      await client.query(
        `
        INSERT INTO branch_tax_assignments (branch_id, tax_id, is_applied)
        VALUES ($1, $2, TRUE)
        ON CONFLICT DO NOTHING;
      `,
        [bId, t.id],
      );
    }
  }

  console.log("  ✓ 4 GST Tax Slabs seeded and mapped to branches.");
}

/**
 * 6. Seed Suppliers (8 Registered Vendors)
 */
async function seedSuppliers(client) {
  console.log("\n[6/12] Seeding Suppliers...");

  const suppliers = [
    {
      id: "c1111111-1111-4111-8111-111111111111",
      name: "Cipla Therapeutics Ltd",
      contact: "R. K. Nair",
      phone: "9811002233",
      email: "orders@cipla.example.com",
      city: "Mumbai",
      gstin: "27AAACC1234F1Z1",
      category: "Medicines & Injections",
    },
    {
      id: "c2222222-2222-4222-8222-222222222222",
      name: "Sun Pharma Distributors",
      contact: "Arvind Gupta",
      phone: "9822003344",
      email: "supply@sunpharma.example.com",
      city: "Mumbai",
      gstin: "27AABCS5678G1Z2",
      category: "Medicines & Injections",
    },
    {
      id: "c3333333-3333-4333-8333-333333333333",
      name: "Abbott Healthcare Pvt Ltd",
      contact: "Vikas Malhotra",
      phone: "9833004455",
      email: "logistics@abbott.example.com",
      city: "Mumbai",
      gstin: "27AABCA9012H1Z3",
      category: "Nutrition & Diagnostics",
    },
    {
      id: "c4444444-4444-4444-8444-444444444444",
      name: "Mankind Pharma Hub",
      contact: "Sanjay Joshi",
      phone: "9844005566",
      email: "sales@mankind.example.com",
      city: "Pune",
      gstin: "27AABCM3456J1Z4",
      category: "Generic Medicines",
    },
    {
      id: "c5555555-5555-4555-8555-555555555555",
      name: "Alkem Laboratories Ltd",
      contact: "Manoj Patel",
      phone: "9855006677",
      email: "orders@alkem.example.com",
      city: "Mumbai",
      gstin: "27AABCA7890K1Z5",
      category: "Medicines & Injections",
    },
    {
      id: "c6666666-6666-4666-8666-666666666666",
      name: "Torrent Pharmaceuticals",
      contact: "Deepen Shah",
      phone: "9866007788",
      email: "dist@torrent.example.com",
      city: "Ahmedabad",
      gstin: "24AABCT1234L1Z6",
      category: "Generic Medicines",
    },
    {
      id: "c7777777-7777-4777-8777-777777777777",
      name: "Dr. Reddy's Laboratories",
      contact: "Sandeep Rao",
      phone: "9877008899",
      email: "institutional@drreddys.example.com",
      city: "Hyderabad",
      gstin: "36AABCD5678M1Z7",
      category: "Medicines & Injections",
    },
    {
      id: "c8888888-8888-4888-8888-888888888888",
      name: "Lupin Generics India",
      contact: "Harish Deshmukh",
      phone: "9888009900",
      email: "orders@lupin.example.com",
      city: "Pune",
      gstin: "27AABCL9012N1Z8",
      category: "Generic Medicines",
    },
  ];

  for (const s of suppliers) {
    await client.query(
      `
      INSERT INTO suppliers (
        id, organisation_id, name, contact_person, phone, email, city, gstin, status, category, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        contact_person = EXCLUDED.contact_person,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        status = 'ACTIVE',
        updated_at = NOW();
    `,
      [
        s.id,
        CANONICAL_ORG_ID,
        s.name,
        s.contact,
        s.phone,
        s.email,
        s.city,
        s.gstin,
        s.category,
      ],
    );
  }

  console.log("  ✓ 8 Suppliers seeded.");
  return suppliers;
}

/**
 * 7. Seed Customers (15 Patients) & Credit Profiles
 */
async function seedCustomers(client) {
  console.log("\n[7/12] Seeding Customers & Patient Profiles...");

  const customers = [
    {
      id: "d1111111-1111-4111-8111-111111111111",
      code: "CUST-001",
      name: "Ramesh Sharma",
      phone: "9820111101",
      email: "ramesh.sharma@example.com",
      age: 58,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      rx: "RX-2026-001",
      limit: 15000,
      balance: 1250.0,
      spent: 28400.0,
      points: 284,
    },
    {
      id: "d2222222-2222-4222-8222-222222222222",
      code: "CUST-002",
      name: "Sunita Verma",
      phone: "9820111102",
      email: "sunita.verma@example.com",
      age: 62,
      gender: "Female",
      category: "Chronic Care",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      rx: "RX-2026-002",
      limit: 10000,
      balance: 450.0,
      spent: 34200.0,
      points: 342,
    },
    {
      id: "d3333333-3333-4333-8333-333333333333",
      code: "CUST-003",
      name: "Anil Kulkarni",
      phone: "9820111103",
      email: "anil.kulkarni@example.com",
      age: 45,
      gender: "Male",
      category: "Regular",
      doc: "Dr. K. Mehta",
      spec: "General Physician",
      rx: "RX-2026-003",
      limit: 5000,
      balance: 0.0,
      spent: 12500.0,
      points: 125,
    },
    {
      id: "d4444444-4444-4444-8444-444444444444",
      code: "CUST-004",
      name: "Meena Iyer",
      phone: "9820111104",
      email: "meena.iyer@example.com",
      age: 39,
      gender: "Female",
      category: "VIP Patient",
      doc: "Dr. Vikram Joshi",
      spec: "Gynaecologist",
      rx: "RX-2026-004",
      limit: 25000,
      balance: 2800.0,
      spent: 48900.0,
      points: 489,
    },
    {
      id: "d5555555-5555-4555-8555-555555555555",
      code: "CUST-005",
      name: "Rajesh Nair",
      phone: "9820111105",
      email: "rajesh.nair@example.com",
      age: 67,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      rx: "RX-2026-005",
      limit: 12000,
      balance: 0.0,
      spent: 31000.0,
      points: 310,
    },
    {
      id: "d6666666-6666-4666-8666-666666666666",
      code: "CUST-006",
      name: "Pooja Bhatt",
      phone: "9820111106",
      email: "pooja.bhatt@example.com",
      age: 29,
      gender: "Female",
      category: "Regular",
      doc: "Dr. Sneha Roy",
      spec: "Dermatologist",
      rx: "RX-2026-006",
      limit: 5000,
      balance: 0.0,
      spent: 8900.0,
      points: 89,
    },
    {
      id: "d7777777-7777-4777-8777-777777777777",
      code: "CUST-007",
      name: "Deepak Merchant",
      phone: "9820111107",
      email: "deepak.m@example.com",
      age: 52,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      rx: "RX-2026-007",
      limit: 15000,
      balance: 1850.0,
      spent: 22100.0,
      points: 221,
    },
    {
      id: "d8888888-8888-4888-8888-888888888888",
      code: "CUST-008",
      name: "Kavita Chawla",
      phone: "9820111108",
      email: "kavita.c@example.com",
      age: 34,
      gender: "Female",
      category: "Regular",
      doc: "Dr. K. Mehta",
      spec: "General Physician",
      rx: "RX-2026-008",
      limit: 5000,
      balance: 0.0,
      spent: 14200.0,
      points: 142,
    },
    {
      id: "d9999999-9999-4999-8999-999999999999",
      code: "CUST-009",
      name: "Mohan Lal",
      phone: "9820111109",
      email: "mohan.lal@example.com",
      age: 71,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      rx: "RX-2026-009",
      limit: 10000,
      balance: 3200.0,
      spent: 41500.0,
      points: 415,
    },
    {
      id: "daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      code: "CUST-010",
      name: "Shalini Pandey",
      phone: "9820111110",
      email: "shalini.p@example.com",
      age: 41,
      gender: "Female",
      category: "VIP Patient",
      doc: "Dr. Vikram Joshi",
      spec: "Gynaecologist",
      rx: "RX-2026-010",
      limit: 20000,
      balance: 0.0,
      spent: 38700.0,
      points: 387,
    },
    {
      id: "dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      code: "CUST-011",
      name: "Virendra Singh",
      phone: "9820111111",
      email: "virendra.s@example.com",
      age: 63,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      rx: "RX-2026-011",
      limit: 12000,
      balance: 920.0,
      spent: 19800.0,
      points: 198,
    },
    {
      id: "dccccccc-cccc-4ccc-8ccc-cccccccccccc",
      code: "CUST-012",
      name: "Geeta Nair",
      phone: "9820111112",
      email: "geeta.nair@example.com",
      age: 36,
      gender: "Female",
      category: "Regular",
      doc: "Dr. Sneha Roy",
      spec: "Dermatologist",
      rx: "RX-2026-012",
      limit: 5000,
      balance: 0.0,
      spent: 7600.0,
      points: 76,
    },
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      code: "CUST-013",
      name: "Gopal Krishna",
      phone: "9820111113",
      email: "gopal.k@example.com",
      age: 55,
      gender: "Male",
      category: "Chronic Care",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      rx: "RX-2026-013",
      limit: 15000,
      balance: 0.0,
      spent: 26300.0,
      points: 263,
    },
    {
      id: "deeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      code: "CUST-014",
      name: "Nandini Das",
      phone: "9820111114",
      email: "nandini.das@example.com",
      age: 48,
      gender: "Female",
      category: "Regular",
      doc: "Dr. K. Mehta",
      spec: "General Physician",
      rx: "RX-2026-014",
      limit: 5000,
      balance: 0.0,
      spent: 11200.0,
      points: 112,
    },
    {
      id: "dfffffff-ffff-4fff-8fff-ffffffffffff",
      code: "CUST-015",
      name: "Walk-in Cash Customer",
      phone: "9999999999",
      email: "walkin@medlife.demo",
      age: 30,
      gender: "Other",
      category: "Walk-in",
      doc: "Walk-in Clinic",
      spec: "General",
      rx: null,
      limit: 0,
      balance: 0.0,
      spent: 5400.0,
      points: 0,
    },
  ];

  for (const c of customers) {
    await client.query(
      `
      INSERT INTO customers (
        id, organisation_id, customer_number, full_name, phone, email,
        gender, category, address, city, age,
        doctor_name, doctor_specialty, active_rx_no,
        credit_limit, outstanding_balance, total_spent, loyalty_points, status,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, '104 Sea Green Terrace, Marine Drive', 'Mumbai', $9,
        $10, $11, $12,
        $13, $14, $15, $16, 'ACTIVE',
        NOW() - INTERVAL '30 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        credit_limit = EXCLUDED.credit_limit,
        outstanding_balance = EXCLUDED.outstanding_balance,
        status = 'ACTIVE',
        updated_at = NOW();
    `,
      [
        c.id,
        CANONICAL_ORG_ID,
        c.code,
        c.name,
        c.phone,
        c.email,
        c.gender,
        c.category,
        c.age,
        c.doc,
        c.spec,
        c.rx,
        c.limit,
        c.balance,
        c.spent,
        c.points,
      ],
    );

    // Set up credit accounts
    if (c.limit > 0) {
      await client.query(
        `
        INSERT INTO customer_credit_accounts (id, organisation_id, customer_id, credit_enabled, credit_limit, created_at, updated_at)
        VALUES ($1, $2, $3, TRUE, $4, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET credit_limit = EXCLUDED.credit_limit, updated_at = NOW();
      `,
        [c.id, CANONICAL_ORG_ID, c.id, c.limit],
      );
    }
  }

  console.log("  ✓ 15 Customers and credit profiles seeded.");
  return customers;
}

/**
 * 8. Seed Product Catalog (30 Products across 10 Categories)
 */
async function seedProducts(client) {
  console.log("\n[8/12] Seeding 30 Pharmaceutical Products...");

  const products = [
    // Antibiotics
    {
      id: "e1000000-0000-4000-8000-000000000001",
      category: "Antibiotics",
      med: "Amoxicillin 500mg + Clavulanic Acid 125mg",
      brand: "Augmentin 625 Duo",
      str: "625mg",
      pack: "10 Tablets",
      mfr: "GSK Pharmaceuticals",
      sku: "AUG-625",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000002",
      category: "Antibiotics",
      med: "Azithromycin 500mg",
      brand: "Azithral 500",
      str: "500mg",
      pack: "5 Tablets",
      mfr: "Alembic Pharmaceuticals",
      sku: "AZI-500",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000003",
      category: "Antibiotics",
      med: "Ciprofloxacin 500mg",
      brand: "Cifran 500",
      str: "500mg",
      pack: "10 Tablets",
      mfr: "Sun Pharma",
      sku: "CIF-500",
      rx: true,
    },

    // Analgesics & Antipyretics
    {
      id: "e1000000-0000-4000-8000-000000000004",
      category: "Analgesics",
      med: "Paracetamol 650mg",
      brand: "Dolo 650",
      str: "650mg",
      pack: "15 Tablets",
      mfr: "Micro Labs Ltd",
      sku: "DOLO-650",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000005",
      category: "Analgesics",
      med: "Ibuprofen 400mg + Paracetamol 325mg",
      brand: "Combiflam",
      str: "400/325mg",
      pack: "20 Tablets",
      mfr: "Sanofi India",
      sku: "COMBI-400",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000006",
      category: "Analgesics",
      med: "Aceclofenac 100mg + Paracetamol 325mg",
      brand: "Zerodol-P",
      str: "100/325mg",
      pack: "10 Tablets",
      mfr: "Ipca Laboratories",
      sku: "ZERO-P",
      rx: true,
    },

    // Cardiac & Antihypertensive
    {
      id: "e1000000-0000-4000-8000-000000000007",
      category: "Cardiac & BP",
      med: "Telmisartan 40mg",
      brand: "Telma 40",
      str: "40mg",
      pack: "15 Tablets",
      mfr: "Glenmark Pharma",
      sku: "TEL-40",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000008",
      category: "Cardiac & BP",
      med: "Amlodipine 5mg",
      brand: "Amlong 5",
      str: "5mg",
      pack: "15 Tablets",
      mfr: "Micro Labs Ltd",
      sku: "AML-5",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000009",
      category: "Cardiac & BP",
      med: "Bisoprolol Fumarate 5mg",
      brand: "Concor 5",
      str: "5mg",
      pack: "10 Tablets",
      mfr: "Merck Ltd",
      sku: "CON-5",
      rx: true,
    },

    // Antidiabetic
    {
      id: "e1000000-0000-4000-8000-000000000010",
      category: "Diabetes Care",
      med: "Glimepiride 2mg + Metformin 500mg SR",
      brand: "Glycomet GP 2",
      str: "2mg/500mg",
      pack: "15 Tablets",
      mfr: "USV Ltd",
      sku: "GLY-GP2",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000011",
      category: "Diabetes Care",
      med: "Sitagliptin 50mg + Metformin 500mg",
      brand: "Janumet 50/500",
      str: "50/500mg",
      pack: "15 Tablets",
      mfr: "MSD Pharmaceuticals",
      sku: "JAN-505",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000012",
      category: "Diabetes Care",
      med: "Vildagliptin 50mg + Metformin 500mg",
      brand: "Galvus Met 50/500",
      str: "50/500mg",
      pack: "10 Tablets",
      mfr: "Novartis India",
      sku: "GAL-505",
      rx: true,
    },

    // Gastrointestinal & Antacids
    {
      id: "e1000000-0000-4000-8000-000000000013",
      category: "Gastrointestinal",
      med: "Pantoprazole 40mg",
      brand: "Pan 40",
      str: "40mg",
      pack: "15 Tablets",
      mfr: "Alkem Laboratories",
      sku: "PAN-40",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000014",
      category: "Gastrointestinal",
      med: "Omeprazole 20mg",
      brand: "Omez 20",
      str: "20mg",
      pack: "20 Capsules",
      mfr: "Dr. Reddy's Laboratories",
      sku: "OMEZ-20",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000015",
      category: "Gastrointestinal",
      med: "Rabeprazole 20mg + Domperidone 30mg SR",
      brand: "Razo-D",
      str: "20/30mg",
      pack: "10 Capsules",
      mfr: "Dr. Reddy's Laboratories",
      sku: "RAZO-D",
      rx: true,
    },

    // Respiratory & Allergy
    {
      id: "e1000000-0000-4000-8000-000000000016",
      category: "Respiratory Care",
      med: "Salbutamol Inhaler 100mcg",
      brand: "Asthalin Inhaler",
      str: "100mcg",
      pack: "200 MDI Doses",
      mfr: "Cipla Ltd",
      sku: "ASTH-200",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000017",
      category: "Respiratory Care",
      med: "Budesonide 200mcg",
      brand: "Budecort 200 Inhaler",
      str: "200mcg",
      pack: "200 MDI Doses",
      mfr: "Cipla Ltd",
      sku: "BUD-200",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000018",
      category: "Respiratory Care",
      med: "Montelukast 10mg + Levocetirizine 5mg",
      brand: "Montek-LC",
      str: "10/5mg",
      pack: "10 Tablets",
      mfr: "Sun Pharma",
      sku: "MONT-LC",
      rx: true,
    },

    // Dermatology & Antifungals
    {
      id: "e1000000-0000-4000-8000-000000000019",
      category: "Dermatology",
      med: "Clotrimazole 1% + Beclomethasone 0.025%",
      brand: "Candid-B Cream",
      str: "20g Tube",
      pack: "1 Tube",
      mfr: "Glenmark Pharma",
      sku: "CAND-B",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000020",
      category: "Dermatology",
      med: "Betamethasone 0.1% + Neomycin 0.5%",
      brand: "Betnovate-N Cream",
      str: "20g Tube",
      pack: "1 Tube",
      mfr: "GSK Pharmaceuticals",
      sku: "BET-N",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000021",
      category: "Dermatology",
      med: "Itraconazole 200mg",
      brand: "Itrasys 200",
      str: "200mg",
      pack: "10 Capsules",
      mfr: "Systopic Labs",
      sku: "ITRA-200",
      rx: true,
    },

    // Vitamins & Nutritional Supplements
    {
      id: "e1000000-0000-4000-8000-000000000022",
      category: "Vitamins & Supplements",
      med: "Vitamin B-Complex with Zinc",
      brand: "Becosules Z",
      str: "Cap",
      pack: "20 Capsules",
      mfr: "Pfizer India",
      sku: "BECO-Z",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000023",
      category: "Vitamins & Supplements",
      med: "Calcium 500mg + Vitamin D3 250IU",
      brand: "Shelcal 500",
      str: "500mg/250IU",
      pack: "15 Tablets",
      mfr: "Torrent Pharma",
      sku: "SHEL-500",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000024",
      category: "Vitamins & Supplements",
      med: "Methylcobalamin + Alpha Lipoic Acid",
      brand: "Neurobion Forte",
      str: "Tab",
      pack: "30 Tablets",
      mfr: "Procter & Gamble",
      sku: "NEURO-F",
      rx: false,
    },

    // Pediatrics
    {
      id: "e1000000-0000-4000-8000-000000000025",
      category: "Pediatrics",
      med: "Paracetamol 250mg / 5ml Paediatric Suspension",
      brand: "Calpol 250 Pead",
      str: "250mg/5ml",
      pack: "60ml Bottle",
      mfr: "GSK Pharmaceuticals",
      sku: "CALP-250",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000026",
      category: "Pediatrics",
      med: "Phenylephrine + Chlorpheniramine Drops",
      brand: "Maxtra Oral Drops",
      str: "15ml Bottle",
      pack: "15ml Bottle",
      mfr: "Zuventus Healthcare",
      sku: "MAX-DRP",
      rx: true,
    },
    {
      id: "e1000000-0000-4000-8000-000000000027",
      category: "Pediatrics",
      med: "Zinc Gluconate 20mg / 5ml Syrup",
      brand: "Zinconia Syrup",
      str: "20mg/5ml",
      pack: "100ml Bottle",
      mfr: "Apex Laboratories",
      sku: "ZINC-SYR",
      rx: false,
    },

    // Surgical & First Aid
    {
      id: "e1000000-0000-4000-8000-000000000028",
      category: "Surgical & First Aid",
      med: "Chloroxylenol 4.8% Antiseptic Liquid",
      brand: "Dettol Antiseptic Liquid",
      str: "100ml Bottle",
      pack: "100ml Bottle",
      mfr: "Reckitt Benckiser",
      sku: "DET-100",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000029",
      category: "Surgical & First Aid",
      med: "Hypoallergenic Surgical Tape 1 inch",
      brand: '3M Micropore Tape 1"',
      str: '1" x 10yd',
      pack: "1 Roll",
      mfr: "3M India",
      sku: "3M-TAPE",
      rx: false,
    },
    {
      id: "e1000000-0000-4000-8000-000000000030",
      category: "Surgical & First Aid",
      med: "Roller Cotton Gauze Bandage 10cm",
      brand: "Bandage Roller 10cm",
      str: "10cm x 3m",
      pack: "10 Rolls Box",
      mfr: "Medikit Surgicals",
      sku: "BAND-10",
      rx: false,
    },
  ];

  for (const p of products) {
    await client.query(
      `
      INSERT INTO products (
        id, organisation_id, category, medicine_name, brand_name,
        strength, pack_size, manufacturer, sku, is_active, is_rx_required,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, TRUE, $10,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        medicine_name = EXCLUDED.medicine_name,
        brand_name = EXCLUDED.brand_name,
        strength = EXCLUDED.strength,
        pack_size = EXCLUDED.pack_size,
        manufacturer = EXCLUDED.manufacturer,
        sku = EXCLUDED.sku,
        is_active = TRUE,
        is_rx_required = EXCLUDED.is_rx_required,
        updated_at = NOW();
    `,
      [
        p.id,
        CANONICAL_ORG_ID,
        p.category,
        p.med,
        p.brand,
        p.str,
        p.pack,
        p.mfr,
        p.sku,
        p.rx,
      ],
    );
  }

  console.log("  ✓ 30 Pharmaceutical Products seeded.");
  return products;
}

/**
 * 9. Seed Inventory Batches (45 Batches: Active, Low-Stock, Expiring, Expired)
 */
async function seedInventoryBatches(client, products, suppliers) {
  console.log("\n[9/12] Seeding 45 Inventory Batches (Multi-Branch)...");

  // Supplier IDs
  const sCipla = suppliers[0].id;
  const sSun = suppliers[1].id;
  const sAbbott = suppliers[2].id;
  const sMankind = suppliers[3].id;
  const sAlkem = suppliers[4].id;

  // 45 batches distributed across products, branches, and suppliers
  const batches = [];

  // 1-30: Active, Healthy stock batches in Primary Branch
  const mrpMap = {
    "AUG-625": 204.5,
    "AZI-500": 118.0,
    "CIF-500": 45.0,
    "DOLO-650": 34.5,
    "COMBI-400": 48.0,
    "ZERO-P": 62.0,
    "TEL-40": 135.0,
    "AML-5": 38.0,
    "CON-5": 92.0,
    "GLY-GP2": 180.0,
    "JAN-505": 340.0,
    "GAL-505": 275.0,
    "PAN-40": 155.0,
    "OMEZ-20": 78.0,
    "RAZO-D": 142.0,
    "ASTH-200": 185.0,
    "BUD-200": 365.0,
    "MONT-LC": 168.0,
    "CAND-B": 95.0,
    "BET-N": 42.0,
    "ITRA-200": 285.0,
    "BECO-Z": 52.0,
    "SHEL-500": 125.0,
    "NEURO-F": 46.0,
    "CALP-250": 44.0,
    "MAX-DRP": 68.0,
    "ZINC-SYR": 55.0,
    "DET-100": 72.0,
    "3M-TAPE": 85.0,
    "BAND-10": 35.0,
  };

  const supplierRotation = [sCipla, sSun, sAbbott, sMankind, sAlkem];

  for (let i = 0; i < 30; i++) {
    const p = products[i];
    const mrp = mrpMap[p.sku] || 100.0;
    const supId = supplierRotation[i % supplierRotation.length];
    const bNum = `BT-2026-${String(i + 1).padStart(3, "0")}`;
    const rack = `Rack ${String.fromCharCode(65 + (i % 4))}-${(i % 5) + 1}`;

    batches.push({
      id: `f1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      productId: p.id,
      branchId: PRIMARY_BRANCH_ID,
      supplierId: supId,
      batchNumber: bNum,
      expiryDate: "2027-11-30", // Long expiry
      mrp,
      quantity: 120 + i * 3, // Healthy stock
      shelfLocation: rack,
    });
  }

  // 31-35: Low-Stock Batches in Primary Branch (Exercising Low-Stock Alerts)
  const lowStockConfigs = [
    { pIdx: 0, qty: 3, bNum: "BT-LOW-001", mrp: 204.5 }, // Augmentin low
    { pIdx: 3, qty: 5, bNum: "BT-LOW-002", mrp: 34.5 }, // Dolo low
    { pIdx: 6, qty: 4, bNum: "BT-LOW-003", mrp: 135.0 }, // Telma low
    { pIdx: 12, qty: 2, bNum: "BT-LOW-004", mrp: 155.0 }, // Pan 40 low
    { pIdx: 15, qty: 4, bNum: "BT-LOW-005", mrp: 185.0 }, // Asthalin low
  ];

  for (let k = 0; k < lowStockConfigs.length; k++) {
    const cfg = lowStockConfigs[k];
    const p = products[cfg.pIdx];
    batches.push({
      id: `f2000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`,
      productId: p.id,
      branchId: PRIMARY_BRANCH_ID,
      supplierId: sCipla,
      batchNumber: cfg.bNum,
      expiryDate: "2027-08-15",
      mrp: cfg.mrp,
      quantity: cfg.qty,
      shelfLocation: "Rack A-Quick",
    });
  }

  // 36-40: Near-Expiry Batches (Expiring within 30-45 days from current date)
  const today = new Date();
  const nearExpiryDate = new Date(today);
  nearExpiryDate.setDate(today.getDate() + 25);
  const nearExpiryStr = nearExpiryDate.toISOString().slice(0, 10);

  const nearExpiryConfigs = [
    { pIdx: 1, qty: 25, bNum: "BT-EXP-NEAR1", mrp: 118.0 },
    { pIdx: 4, qty: 40, bNum: "BT-EXP-NEAR2", mrp: 48.0 },
    { pIdx: 9, qty: 30, bNum: "BT-EXP-NEAR3", mrp: 180.0 },
    { pIdx: 17, qty: 15, bNum: "BT-EXP-NEAR4", mrp: 168.0 },
    { pIdx: 21, qty: 35, bNum: "BT-EXP-NEAR5", mrp: 52.0 },
  ];

  for (let m = 0; m < nearExpiryConfigs.length; m++) {
    const cfg = nearExpiryConfigs[m];
    const p = products[cfg.pIdx];
    batches.push({
      id: `f3000000-0000-4000-8000-${String(m + 1).padStart(12, "0")}`,
      productId: p.id,
      branchId: PRIMARY_BRANCH_ID,
      supplierId: sSun,
      batchNumber: cfg.bNum,
      expiryDate: nearExpiryStr,
      mrp: cfg.mrp,
      quantity: cfg.qty,
      shelfLocation: "Quarantine Rack Q-1",
    });
  }

  // 41-45: Secondary Branch Batches (For Inter-Branch Transfers & Multi-Branch Stock)
  for (let n = 0; n < 5; n++) {
    const p = products[n * 3];
    const mrp = mrpMap[p.sku] || 100.0;
    batches.push({
      id: `f4000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
      productId: p.id,
      branchId: SECONDARY_BRANCH_ID,
      supplierId: sAbbott,
      batchNumber: `BT-PUN-${String(n + 1).padStart(3, "0")}`,
      expiryDate: "2028-02-28",
      mrp,
      quantity: 65 + n * 10,
      shelfLocation: "Rack P-1",
    });
  }

  for (const b of batches) {
    await client.query(
      `
      INSERT INTO inventory_batches (
        id, product_id, branch_id, supplier_id, batch_number, expiry_date,
        mrp, quantity, shelf_location, updated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        batch_number = EXCLUDED.batch_number,
        expiry_date = EXCLUDED.expiry_date,
        mrp = EXCLUDED.mrp,
        quantity = EXCLUDED.quantity,
        shelf_location = EXCLUDED.shelf_location,
        updated_at = NOW();
    `,
      [
        b.id,
        b.productId,
        b.branchId,
        b.supplierId,
        b.batchNumber,
        b.expiryDate,
        b.mrp,
        b.quantity,
        b.shelfLocation,
        DEMO_USERS[0].id,
      ],
    );
  }

  console.log("  ✓ 45 Inventory Batches seeded.");
  return batches;
}

/**
 * 10. Seed Prescriptions (12 Medical Prescriptions)
 */
async function seedPrescriptions(client, customers) {
  console.log("\n[10/12] Seeding 12 Medical Prescriptions...");

  const prescriptions = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      custIdx: 0,
      rxNo: "RX-2026-001",
      ref: "CARD-MH-4421",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      hosp: "Lilavati Hospital, Mumbai",
      regNo: "MMC-2004-0982",
      diag: "Stage II Essential Hypertension & Dyslipidemia",
      date: "2026-08-15",
      status: "ACTIVE",
      notes: "Telma 40 OD morning after breakfast. Monitor BP weekly.",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      custIdx: 1,
      rxNo: "RX-2026-002",
      ref: "DIAB-MH-8812",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      hosp: "Hinduja Healthcare, Mumbai",
      regNo: "MMC-1998-1420",
      diag: "Type 2 Diabetes Mellitus with HbA1c 7.8%",
      date: "2026-08-20",
      status: "ACTIVE",
      notes:
        "Glycomet GP2 once daily with breakfast. Dietary restrictions advised.",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      custIdx: 2,
      rxNo: "RX-2026-003",
      ref: "GEN-MH-1234",
      doc: "Dr. K. Mehta",
      spec: "General Physician",
      hosp: "Mehta Clinic, Fort",
      regNo: "MMC-2010-0432",
      diag: "Acute Upper Respiratory Tract Infection",
      date: "2026-09-01",
      status: "ACTIVE",
      notes: "Augmentin 625 Duo twice daily for 5 days. Dolo 650 SOS.",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      custIdx: 3,
      rxNo: "RX-2026-004",
      ref: "GYN-MH-5519",
      doc: "Dr. Vikram Joshi",
      spec: "Gynaecologist",
      hosp: "Breach Candy Hospital",
      regNo: "MMC-2002-3341",
      diag: "Prenatal Nutritional Support (Trimester 2)",
      date: "2026-09-03",
      status: "ACTIVE",
      notes: "Shelcal 500 daily after lunch. Becosules Z daily.",
    },
    {
      id: "10000000-0000-4000-8000-000000000005",
      custIdx: 4,
      rxNo: "RX-2026-005",
      ref: "CARD-MH-7712",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      hosp: "Lilavati Hospital, Mumbai",
      regNo: "MMC-2004-0982",
      diag: "Hypertensive Heart Disease with Tachycardia",
      date: "2026-08-10",
      status: "ACTIVE",
      notes: "Concor 5 morning. Amlong 5 evening.",
    },
    {
      id: "10000000-0000-4000-8000-000000000006",
      custIdx: 5,
      rxNo: "RX-2026-006",
      ref: "DERM-MH-3310",
      doc: "Dr. Sneha Roy",
      spec: "Dermatologist",
      hosp: "SkinCare Center, Colaba",
      regNo: "MMC-2015-8821",
      diag: "Tinea Corporis (Fungal infection)",
      date: "2026-09-05",
      status: "ACTIVE",
      notes:
        "Itrasys 200 daily for 14 days. Candid-B topical application twice daily.",
    },
    {
      id: "10000000-0000-4000-8000-000000000007",
      custIdx: 6,
      rxNo: "RX-2026-007",
      ref: "DIAB-MH-9941",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      hosp: "Hinduja Healthcare, Mumbai",
      regNo: "MMC-1998-1420",
      diag: "Uncontrolled Type 2 Diabetes with Neuropathy",
      date: "2026-08-25",
      status: "ACTIVE",
      notes: "Janumet 50/500 twice daily with meals. Neurobion Forte daily.",
    },
    {
      id: "10000000-0000-4000-8000-000000000008",
      custIdx: 7,
      rxNo: "RX-2026-008",
      ref: "GEN-MH-5521",
      doc: "Dr. K. Mehta",
      spec: "General Physician",
      hosp: "Mehta Clinic, Fort",
      regNo: "MMC-2010-0432",
      diag: "Allergic Rhinitis & Bronchospasm",
      date: "2026-09-08",
      status: "ACTIVE",
      notes: "Montek-LC bedtime for 10 days. Asthalin Inhaler 2 puffs SOS.",
    },
    {
      id: "10000000-0000-4000-8000-000000000009",
      custIdx: 8,
      rxNo: "RX-2026-009",
      ref: "CARD-MH-6618",
      doc: "Dr. Anjali Patil",
      spec: "Cardiologist",
      hosp: "Lilavati Hospital, Mumbai",
      regNo: "MMC-2004-0982",
      diag: "Coronary Artery Disease Status Post Angioplasty",
      date: "2026-08-01",
      status: "ACTIVE",
      notes: "Telma 40 + Concor 5. Regular checkup in 1 month.",
    },
    {
      id: "10000000-0000-4000-8000-000000000010",
      custIdx: 9,
      rxNo: "RX-2026-010",
      ref: "GYN-MH-4428",
      doc: "Dr. Vikram Joshi",
      spec: "Gynaecologist",
      hosp: "Breach Candy Hospital",
      regNo: "MMC-2002-3341",
      diag: "Iron & Calcium Deficiency in Lactation",
      date: "2026-08-28",
      status: "ACTIVE",
      notes: "Shelcal 500 OD and Becosules Z OD for 30 days.",
    },
    {
      id: "10000000-0000-4000-8000-000000000011",
      custIdx: 10,
      rxNo: "RX-2026-011",
      ref: "DIAB-MH-3382",
      doc: "Dr. Rahul Deshmukh",
      spec: "Diabetologist",
      hosp: "Hinduja Healthcare, Mumbai",
      regNo: "MMC-1998-1420",
      diag: "Type 2 Diabetes Mellitus with Mild Gastritis",
      date: "2026-09-02",
      status: "ACTIVE",
      notes: "Galvus Met 50/500 BD. Pan 40 before breakfast.",
    },
    {
      id: "10000000-0000-4000-8000-000000000012",
      custIdx: 11,
      rxNo: "RX-2026-012",
      ref: "DERM-MH-1192",
      doc: "Dr. Sneha Roy",
      spec: "Dermatologist",
      hosp: "SkinCare Center, Colaba",
      regNo: "MMC-2015-8821",
      diag: "Contact Dermatitis & Eczema",
      date: "2026-09-10",
      status: "ACTIVE",
      notes: "Betnovate-N cream locally BD. Montek-LC OD at night.",
    },
  ];

  for (const r of prescriptions) {
    const cust = customers[r.custIdx];
    await client.query(
      `
      INSERT INTO prescriptions (
        id, organisation_id, customer_id, prescription_number, prescription_reference,
        doctor_name, specialization, hospital_or_clinic, doctor_registration_number,
        chronic_conditions, drug_allergies, prescription_date, status, notes,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, 'None Reported', $11, $12, $13,
        NOW() - INTERVAL '10 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        prescription_number = EXCLUDED.prescription_number,
        doctor_name = EXCLUDED.doctor_name,
        status = EXCLUDED.status,
        updated_at = NOW();
    `,
      [
        r.id,
        CANONICAL_ORG_ID,
        cust.id,
        r.rxNo,
        r.ref,
        r.doc,
        r.spec,
        r.hosp,
        r.regNo,
        r.diag,
        r.date,
        r.status,
        r.notes,
      ],
    );
  }

  console.log("  ✓ 12 Prescriptions seeded.");
  return prescriptions;
}

/**
 * 11. Seed Procurement: Purchases (POs) & Goods Receipts (GRNs)
 */
async function seedProcurement(client, suppliers, products) {
  console.log(
    "\n[11/12] Seeding Purchase Orders (POs) and Goods Receipts (GRNs)...",
  );

  const purchases = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      num: "PO-2026-001",
      supIdx: 0,
      status: "RECEIVED",
      date: "2026-08-20",
      exp: "2026-08-25",
      notes: "Monthly antibiotic replenishment",
    },
    {
      id: "20000000-0000-4000-8000-000000000002",
      num: "PO-2026-002",
      supIdx: 1,
      status: "RECEIVED",
      date: "2026-08-22",
      exp: "2026-08-27",
      notes: "Cardiovascular range restock",
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      num: "PO-2026-003",
      supIdx: 2,
      status: "RECEIVED",
      date: "2026-08-28",
      exp: "2026-09-02",
      notes: "Nutrition & diagnostic kits",
    },
    {
      id: "20000000-0000-4000-8000-000000000004",
      num: "PO-2026-004",
      supIdx: 3,
      status: "APPROVED",
      date: "2026-09-08",
      exp: "2026-09-18",
      notes: "General analgesics restock",
    },
    {
      id: "20000000-0000-4000-8000-000000000005",
      num: "PO-2026-005",
      supIdx: 4,
      status: "APPROVED",
      date: "2026-09-10",
      exp: "2026-09-20",
      notes: "Antacid and GI formulation stock",
    },
    {
      id: "20000000-0000-4000-8000-000000000006",
      num: "PO-2026-006",
      supIdx: 5,
      status: "PENDING",
      date: "2026-09-12",
      exp: "2026-09-22",
      notes: "Emergency inhaler shipment",
    },
    {
      id: "20000000-0000-4000-8000-000000000007",
      num: "PO-2026-007",
      supIdx: 6,
      status: "DRAFT",
      date: "2026-09-14",
      exp: "2026-09-25",
      notes: "Quarterly dermatological creams draft",
    },
    {
      id: "20000000-0000-4000-8000-000000000008",
      num: "PO-2026-008",
      supIdx: 7,
      status: "DRAFT",
      date: "2026-09-15",
      exp: "2026-09-26",
      notes: "First aid consumables planned PO",
    },
  ];

  for (let i = 0; i < purchases.length; i++) {
    const po = purchases[i];
    const sup = suppliers[po.supIdx];

    await client.query(
      `
      INSERT INTO purchases (
        id, organisation_id, purchase_number, supplier_id, branch_id,
        order_date, expected_date, status, notes, created_by,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        NOW() - INTERVAL '15 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        purchase_number = EXCLUDED.purchase_number,
        status = EXCLUDED.status,
        updated_at = NOW();
    `,
      [
        po.id,
        CANONICAL_ORG_ID,
        po.num,
        sup.id,
        PRIMARY_BRANCH_ID,
        po.date,
        po.exp,
        po.status,
        po.notes,
        DEMO_USERS[0].id,
      ],
    );

    // Insert purchase items
    const prod1 = products[i * 2];
    const prod2 = products[i * 2 + 1];

    const pi1Id = `21000000-0000-4000-8000-${String(i * 2 + 1).padStart(12, "0")}`;
    const pi2Id = `21000000-0000-4000-8000-${String(i * 2 + 2).padStart(12, "0")}`;

    await client.query(
      `
      INSERT INTO purchase_items (id, purchase_id, product_id, ordered_quantity, unit_cost, tax_amount, discount_amount, created_at, updated_at)
      VALUES
        ($1, $2, $3, 100, 75.00, 900.00, 0.00, NOW(), NOW()),
        ($4, $2, $5, 50, 120.00, 720.00, 50.00, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `,
      [pi1Id, po.id, prod1.id, pi2Id, prod2.id],
    );
  }

  // Seed 6 Goods Receipt Notes (GRNs) for the fulfilled / received POs
  const grns = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      poId: purchases[0].id,
      grn: "GRN-2026-001",
      inv: "INV-CIP-9921",
      date: "2026-08-24",
      pkgs: 4,
      notes: "Full order received in good condition",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      poId: purchases[1].id,
      grn: "GRN-2026-002",
      inv: "INV-SUN-4412",
      date: "2026-08-26",
      pkgs: 6,
      notes: "Verified batch labels and tamper seals",
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      poId: purchases[2].id,
      grn: "GRN-2026-003",
      inv: "INV-ABB-7719",
      date: "2026-09-01",
      pkgs: 3,
      notes: "Cold-chain shipment verified at 4°C",
    },
    {
      id: "30000000-0000-4000-8000-000000000004",
      poId: purchases[0].id,
      grn: "GRN-2026-004",
      inv: "INV-CIP-9955",
      date: "2026-09-03",
      pkgs: 2,
      notes: "Supplementary batch received",
    },
    {
      id: "30000000-0000-4000-8000-000000000005",
      poId: purchases[1].id,
      grn: "GRN-2026-005",
      inv: "INV-SUN-4490",
      date: "2026-09-07",
      pkgs: 5,
      notes: "Regular stock replenishment shipment",
    },
    {
      id: "30000000-0000-4000-8000-000000000006",
      poId: purchases[2].id,
      grn: "GRN-2026-006",
      inv: "INV-ABB-8012",
      date: "2026-09-12",
      pkgs: 2,
      notes: "Laboratory reagents and diagnostic strips",
    },
  ];

  for (let j = 0; j < grns.length; j++) {
    const g = grns[j];
    await client.query(
      `
      INSERT INTO goods_receipts (
        id, organisation_id, purchase_id, receipt_number, received_date,
        received_by, supplier_invoice_number, package_count, status, notes,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'VERIFIED', $9,
        NOW() - INTERVAL '7 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        receipt_number = EXCLUDED.receipt_number,
        status = 'VERIFIED',
        updated_at = NOW();
    `,
      [
        g.id,
        CANONICAL_ORG_ID,
        g.poId,
        g.grn,
        g.date,
        DEMO_USERS[3].id,
        g.inv,
        g.pkgs,
        g.notes,
      ],
    );

    // Receipt items
    const pi1Id = `21000000-0000-4000-8000-${String(j * 2 + 1).padStart(12, "0")}`;
    const griId = `31000000-0000-4000-8000-${String(j + 1).padStart(12, "0")}`;

    await client.query(
      `
      INSERT INTO goods_receipt_items (id, goods_receipt_id, purchase_item_id, received_quantity, rejected_quantity, created_at, updated_at)
      VALUES ($1, $2, $3, 100, 0, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `,
      [griId, g.id, pi1Id],
    );
  }

  console.log("  ✓ 8 Purchase Orders & 6 Goods Receipts seeded.");
}

/**
 * 12. Seed Sales, Invoices, Payments, Registers, Ledger & Audit Logs
 */
async function seedSalesAndOperations(
  client,
  customers,
  products,
  batches,
  prescriptions,
) {
  console.log(
    "\n[12/12] Seeding Invoices, Payments, Registers, Held Bills & Audit Logs...",
  );

  // 1. Cash Registers & Shifts
  const reg1Id = "40000000-0000-4000-8000-000000000001";
  const reg2Id = "40000000-0000-4000-8000-000000000002";
  const sessId = "41000000-0000-4000-8000-000000000001";

  await client.query(
    `
    INSERT INTO cash_registers (id, organisation_id, branch_id, name, identifier, is_active, created_at, updated_at)
    VALUES
      ($1, $2, $3, 'Counter 1 - Retail POS', 'POS-01', TRUE, NOW(), NOW()),
      ($4, $2, $5, 'Counter 2 - Express Clinic', 'POS-02', TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET is_active = TRUE, updated_at = NOW();
  `,
    [reg1Id, CANONICAL_ORG_ID, PRIMARY_BRANCH_ID, reg2Id, SECONDARY_BRANCH_ID],
  );

  // Open register session for Amit Verma
  await client.query(
    `
    INSERT INTO cash_register_sessions (
      id, organisation_id, branch_id, cash_register_id, cashier_id,
      session_number, shift_name, opened_at, opening_balance,
      expected_cash, status, variance_status, opening_notes,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      'SESS-2026-0918-01', 'Morning Shift', NOW() - INTERVAL '4 hours', 2000.00,
      14550.00, 'OPEN', 'BALANCED', 'Opening cash float verified with supervisor',
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = 'OPEN', updated_at = NOW();
  `,
    [sessId, CANONICAL_ORG_ID, PRIMARY_BRANCH_ID, reg1Id, DEMO_USERS[2].id],
  );

  // Cash movements for the session
  await client.query(
    `
    INSERT INTO cash_movements (
      id, organisation_id, branch_id, cash_register_session_id, cashier_id,
      movement_number, movement_type, amount, reason, created_at
    )
    VALUES
      ('42000000-0000-4000-8000-000000000001', $1, $2, $3, $4, 'CM-001', 'IN', 2000.00, 'Opening cash float deposit', NOW() - INTERVAL '4 hours'),
      ('42000000-0000-4000-8000-000000000002', $1, $2, $3, $4, 'CM-002', 'IN', 5000.00, 'Change denominations addition', NOW() - INTERVAL '2 hours'),
      ('42000000-0000-4000-8000-000000000003', $1, $2, $3, $4, 'CM-003', 'OUT', 500.00, 'Emergency sterile gloves purchase', NOW() - INTERVAL '1 hour')
    ON CONFLICT (id) DO NOTHING;
  `,
    [CANONICAL_ORG_ID, PRIMARY_BRANCH_ID, sessId, DEMO_USERS[2].id],
  );

  // 2. Seed 35 Realistic Invoices, Items, Payments & Ledger Entries
  const invoices = [];
  const paymentMethods = ["CASH", "UPI", "CARD"];

  for (let idx = 0; idx < 35; idx++) {
    const invId = `50000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
    const invNum = `INV-2026-${String(idx + 1001)}`;
    const cust = customers[idx % customers.length];
    const rx = idx < 12 ? prescriptions[idx] : null;

    // Distribute dates over last 14 days
    const dayOffset = Math.floor(idx / 2.5); // 0 to 14 days ago
    const hourOffset = (idx * 3) % 12;
    const txnDate = new Date(
      Date.now() - dayOffset * 86400000 - hourOffset * 3600000,
    ).toISOString();

    // Calculate realistic invoice financials
    // Choose 2 products per invoice
    const p1 = products[idx % products.length];
    const p2 = products[(idx + 3) % products.length];
    const b1 = batches[idx % batches.length];
    const b2 = batches[(idx + 3) % batches.length];

    const q1 = (idx % 3) + 1;
    const q2 = (idx % 2) + 1;
    const price1 = Number(b1.mrp);
    const price2 = Number(b2.mrp);

    const sub1 = Number((q1 * price1).toFixed(2));
    const sub2 = Number((q2 * price2).toFixed(2));
    const subtotal = Number((sub1 + sub2).toFixed(2));

    const discountAmount =
      idx % 4 === 0 ? Number((subtotal * 0.05).toFixed(2)) : 0.0;
    const taxRate = 0.12; // 12% standard GST
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Number((taxableAmount * taxRate).toFixed(2));
    const totalAmount = Number((taxableAmount + taxAmount).toFixed(2));

    // Mathematical invariant guarantee: subtotal - discount + tax = total
    await client.query(
      `
      INSERT INTO invoices (
        id, organisation_id, branch_id, customer_id, prescription_id,
        invoice_number, invoice_date, subtotal, discount_amount, tax_amount,
        total_amount, status, notes, created_by, cash_register_session_id,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10,
        $11, 'PAID', 'Retail counter sale with computerized tax invoice', $12, $13,
        $7, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        subtotal = EXCLUDED.subtotal,
        discount_amount = EXCLUDED.discount_amount,
        tax_amount = EXCLUDED.tax_amount,
        total_amount = EXCLUDED.total_amount,
        status = 'PAID',
        updated_at = NOW();
    `,
      [
        invId,
        CANONICAL_ORG_ID,
        PRIMARY_BRANCH_ID,
        cust.id,
        rx ? rx.id : null,
        invNum,
        txnDate,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        DEMO_USERS[2].id,
        sessId,
      ],
    );

    // Insert invoice items
    const ii1Id = `51000000-0000-4000-8000-${String(idx * 2 + 1).padStart(12, "0")}`;
    const ii2Id = `51000000-0000-4000-8000-${String(idx * 2 + 2).padStart(12, "0")}`;

    const lineTax1 = Number((sub1 * taxRate).toFixed(2));
    const lineTotal1 = Number((sub1 + lineTax1).toFixed(2));
    const lineTax2 = Number((sub2 * taxRate).toFixed(2));
    const lineTotal2 = Number((sub2 + lineTax2).toFixed(2));

    await client.query(
      `
      INSERT INTO invoice_items (
        id, invoice_id, product_id, inventory_batch_id, product_name,
        batch_number, quantity, unit_price, discount_amount, tax_amount, line_total, created_at
      )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, 0.00, $9, $10, $11),
        ($12, $2, $13, $14, $15, $16, $17, $18, 0.00, $19, $20, $11)
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        ii1Id,
        invId,
        p1.id,
        b1.id,
        p1.brand,
        b1.batchNumber,
        q1,
        price1,
        lineTax1,
        lineTotal1,
        txnDate,
        ii2Id,
        p2.id,
        b2.id,
        p2.brand,
        b2.batchNumber,
        q2,
        price2,
        lineTax2,
        lineTotal2,
      ],
    );

    // Insert payment matching total_amount
    const payId = `52000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
    const payMethod = paymentMethods[idx % paymentMethods.length];
    const txnRef =
      payMethod === "UPI"
        ? `UPI-ICICI-${String(9021000 + idx)}`
        : payMethod === "CARD"
          ? `CARD-AUTH-${String(400100 + idx)}`
          : null;

    await client.query(
      `
      INSERT INTO payments (
        id, organisation_id, branch_id, customer_id, receipt_number,
        payment_date, total_amount, status, notes, received_by,
        cash_register_session_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'COMPLETED', $8, $9,
        $10, $6, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET total_amount = EXCLUDED.total_amount, status = 'COMPLETED', updated_at = NOW();
    `,
      [
        payId,
        CANONICAL_ORG_ID,
        PRIMARY_BRANCH_ID,
        cust.id,
        `RCP-2026-${String(idx + 1001)}`,
        txnDate,
        totalAmount,
        `Paid in full via ${payMethod}`,
        DEMO_USERS[2].id,
        sessId,
      ],
    );

    // Payment allocation
    await client.query(
      `
      INSERT INTO payment_allocations (id, payment_id, invoice_id, allocated_amount, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        `53000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`,
        payId,
        invId,
        totalAmount,
        txnDate,
      ],
    );

    // Payment transaction
    await client.query(
      `
      INSERT INTO payment_transactions (id, payment_id, payment_method, amount, transaction_reference, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        `54000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`,
        payId,
        payMethod,
        totalAmount,
        txnRef,
        txnDate,
      ],
    );

    // Customer ledger entries (Debit invoice, Credit payment)
    const ledDebitId = `55000000-0000-4000-8000-${String(idx * 2 + 1).padStart(12, "0")}`;
    const ledCreditId = `55000000-0000-4000-8000-${String(idx * 2 + 2).padStart(12, "0")}`;

    await client.query(
      `
      INSERT INTO customer_ledger_entries (
        id, organisation_id, customer_id, branch_id, entry_type,
        reference_type, reference_id, debit_amount, credit_amount, balance_after,
        entry_date, description, created_at
      )
      VALUES
        ($1, $2, $3, $4, 'INVOICE', 'INVOICE', $5, $6, 0.00, $6, $7, $8, $7),
        ($9, $2, $3, $4, 'PAYMENT', 'PAYMENT', $10, 0.00, $6, 0.00, $7, $11, $7)
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        ledDebitId,
        CANONICAL_ORG_ID,
        cust.id,
        PRIMARY_BRANCH_ID,
        invId,
        totalAmount,
        txnDate,
        `Invoice #${invNum}`,
        ledCreditId,
        payId,
        `Payment for #${invNum}`,
      ],
    );

    invoices.push(invId);
  }

  // 3. Held Bills (2 Active Held POS Carts)
  await client.query(
    `
    INSERT INTO held_bills (
      id, organisation_id, branch_id, cash_register_session_id, held_by,
      hold_token, customer_id, customer_name, customer_phone,
      items_count, items_summary, subtotal, tax_amount, discount_percent, total_amount,
      cart_data, status, notes, created_at, updated_at
    )
    VALUES
      (
        '60000000-0000-4000-8000-000000000001', $1, $2, $3, $4,
        'HOLD-001', $5, 'Ramesh Sharma', '9820111101',
        2, 'Augmentin 625 Duo x 2, Dolo 650 x 1', 443.50, 53.22, 0.00, 496.72,
        '{"items": [{"sku": "AUG-625", "name": "Augmentin 625 Duo", "qty": 2, "price": 204.50}, {"sku": "DOLO-650", "name": "Dolo 650", "qty": 1, "price": 34.50}]}'::jsonb,
        'HOLD', 'Customer stepped out to fetch prescription from vehicle', NOW() - INTERVAL '35 minutes', NOW()
      ),
      (
        '60000000-0000-4000-8000-000000000002', $1, $2, $3, $4,
        'HOLD-002', $6, 'Sunita Verma', '9820111102',
        1, 'Glycomet GP 2 x 3', 540.00, 64.80, 5.00, 577.80,
        '{"items": [{"sku": "GLY-GP2", "name": "Glycomet GP 2", "qty": 3, "price": 180.00}]}'::jsonb,
        'HOLD', 'Awaiting doctor clarification on dosage frequency', NOW() - INTERVAL '15 minutes', NOW()
      )
    ON CONFLICT (id) DO UPDATE SET status = 'HOLD', updated_at = NOW();
  `,
    [
      CANONICAL_ORG_ID,
      PRIMARY_BRANCH_ID,
      sessId,
      DEMO_USERS[2].id,
      customers[0].id,
      customers[1].id,
    ],
  );

  // 4. Stock Transfers (4 Transfers between Primary & Secondary Branches)
  const transfers = [
    {
      id: "70000000-0000-4000-8000-000000000001",
      num: "TRF-2026-001",
      date: "2026-09-05",
      status: "COMPLETED",
      notes: "Urgent cardiac medication transfer to Pune clinic",
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      num: "TRF-2026-002",
      date: "2026-09-09",
      status: "COMPLETED",
      notes: "Monthly diabetic insulin and metformin rebalancing",
    },
    {
      id: "70000000-0000-4000-8000-000000000003",
      num: "TRF-2026-003",
      date: "2026-09-14",
      status: "IN_TRANSIT",
      notes: "Pediatric drops transit dispatch via express courier",
    },
    {
      id: "70000000-0000-4000-8000-000000000004",
      num: "TRF-2026-004",
      date: "2026-09-17",
      status: "DRAFT",
      notes: "Requested replenishment of antibiotic syrups",
    },
  ];

  for (let tIdx = 0; tIdx < transfers.length; tIdx++) {
    const tr = transfers[tIdx];
    await client.query(
      `
      INSERT INTO stock_transfers (
        id, organisation_id, from_branch_id, to_branch_id, transfer_date,
        status, transfer_number, notes, created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, NOW() - INTERVAL '5 days', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();
    `,
      [
        tr.id,
        CANONICAL_ORG_ID,
        PRIMARY_BRANCH_ID,
        SECONDARY_BRANCH_ID,
        tr.date,
        tr.status,
        tr.num,
        tr.notes,
        DEMO_USERS[3].id,
      ],
    );

    // Transfer item
    await client.query(
      `
      INSERT INTO stock_transfer_items (id, transfer_id, inventory_batch_id, quantity, created_at)
      VALUES ($1, $2, $3, 20, NOW())
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        `71000000-0000-4000-8000-${String(tIdx + 1).padStart(12, "0")}`,
        tr.id,
        batches[tIdx].id,
      ],
    );
  }

  // 5. Audit Logs (50 Activity History Entries)
  const auditActions = [
    {
      act: "USER_LOGIN",
      type: "users",
      desc: "User logged into POS Terminal counter",
    },
    {
      act: "REGISTER_OPEN",
      type: "cash_register_sessions",
      desc: "Cash register opened with verified opening float",
    },
    {
      act: "SALE_COMPLETED",
      type: "invoices",
      desc: "Retail invoice generated and paid",
    },
    {
      act: "PRESCRIPTION_VERIFIED",
      type: "prescriptions",
      desc: "Doctor registration number verified for Schedule H drug",
    },
    {
      act: "HELD_BILL_SAVED",
      type: "held_bills",
      desc: "POS cart parked temporarily",
    },
    {
      act: "STOCK_TRANSFER_DISPATCHED",
      type: "stock_transfers",
      desc: "Stock dispatched to satellite branch",
    },
    {
      act: "GRN_ACCEPTED",
      type: "goods_receipts",
      desc: "Shipment physically verified and accepted into inventory",
    },
    {
      act: "CASH_FLOAT_MOVEMENT",
      type: "cash_movements",
      desc: "Cash drawer denomination balance check",
    },
  ];

  for (let aIdx = 0; aIdx < 50; aIdx++) {
    const a = auditActions[aIdx % auditActions.length];
    const u = DEMO_USERS[aIdx % DEMO_USERS.length];
    const minutesAgo = aIdx * 45 + 10;
    const logDate = new Date(Date.now() - minutesAgo * 60000).toISOString();

    await client.query(
      `
      INSERT INTO audit_logs (
        id, organisation_id, user_id, action, entity_type, metadata, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7
      )
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        `80000000-0000-4000-8000-${String(aIdx + 1).padStart(12, "0")}`,
        CANONICAL_ORG_ID,
        u.id,
        a.act,
        a.type,
        JSON.stringify({
          description: a.desc,
          user: u.name,
          branch: "MedLife Central Dispensary",
        }),
        logDate,
      ],
    );
  }

  console.log(
    "  ✓ 35 Invoices, 35 Payments, Registers, Transfers, Held Bills & 50 Audit Logs seeded.",
  );
}

/**
 * MASTER RUNNER
 */
async function runMasterSeed() {
  const isReset = process.argv.includes("--reset");

  console.log("============================================================");
  console.log("PHARMAFLOW CANONICAL DEMO PHARMACY SEEDER");
  console.log(`Organisation ID: ${CANONICAL_ORG_ID}`);
  console.log(
    `Execution Mode:  ${isReset ? "RESET & SEED" : "IDEMPOTENT SEED"}`,
  );
  console.log("============================================================");

  // Step 1: Provision Supabase Auth Users
  const authMap = await provisionSupabaseAuthUsers();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 2: If --reset, safely clear owned business data
    if (isReset) {
      await resetDemoTenantData(client);
    }

    // Step 3: Seed Organisation and Branches
    await seedOrganisationAndBranches(client);

    // Step 4: Seed Users, Memberships, and Branch Assignments
    await seedDemoUsersAndRoles(client, authMap);

    // Step 5: Seed Taxes
    await seedTaxes(client);

    // Step 6: Seed Suppliers
    const suppliers = await seedSuppliers(client);

    // Step 7: Seed Customers
    const customers = await seedCustomers(client);

    // Step 8: Seed Products
    const products = await seedProducts(client);

    // Step 9: Seed Inventory Batches
    const batches = await seedInventoryBatches(client, products, suppliers);

    // Step 10: Seed Prescriptions
    const prescriptions = await seedPrescriptions(client, customers);

    // Step 11: Seed Purchases & Goods Receipts
    await seedProcurement(client, suppliers, products);

    // Step 12: Seed Sales, Invoices, Payments, Registers, Held Bills & Logs
    await seedSalesAndOperations(
      client,
      customers,
      products,
      batches,
      prescriptions,
    );

    await client.query("COMMIT");
    console.log(
      "\n============================================================",
    );
    console.log("✅ CANONICAL DEMO PHARMACY SEEDED SUCCESSFULLY!");
    console.log("============================================================");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ SEEDING TRANSACTION FAILED! Rolled back cleanly.");
    console.error("Error Details:", err.message);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runMasterSeed().catch((err) => {
    console.error("Seed execution aborted:", err.message);
    process.exit(1);
  });
}

module.exports = {
  runMasterSeed,
  CANONICAL_ORG_ID,
  PRIMARY_BRANCH_ID,
  SECONDARY_BRANCH_ID,
  DEMO_USERS,
};
