/**
 * Authoritative Canonical Demo Seeder for PharmaFlow SaaS
 *
 * Populates the canonical development tenant with coherent, realistic records
 * sourced from frontend mock datasets (cashier, inventory, purchases, customers, returns).
 *
 * Canonical Tenant:
 * - Organisation ID: 2c778baa-10de-472c-a10d-796dbd4314ba (MedLife Care Chemist)
 * - Branch ID:       e329330e-787e-4e55-b88c-41506f955f83 (Main Branch, BR-1001)
 * - Owner:           33a7d546-e55d-4a11-8315-2e73d03ab0f2 (Vikram Malhotra)
 * - Login Accounts:  root@falah.com / more#78548, admin@flora.edu.in / admin123
 *
 * Guarantees:
 * - 100% Idempotent (safe to re-run repeatedly without creating duplicates)
 * - Preserves existing test data and sync sequences
 * - Strict internal business coherence (Foreign Keys, Batches, Ledger, Inventory)
 */

const bcrypt = require("bcrypt");
const { pool } = require("./connection");

const CANONICAL_ORG_ID = "2c778baa-10de-472c-a10d-796dbd4314ba";
const CANONICAL_BRANCH_ID = "e329330e-787e-4e55-b88c-41506f955f83";
const CANONICAL_OWNER_ID = "33a7d546-e55d-4a11-8315-2e73d03ab0f2";

async function seedCanonicalDemo() {
  const client = await pool.connect();
  console.log("============================================================");
  console.log("SEEDING PHARMAFLOW CANONICAL DEVELOPMENT TENANT");
  console.log("============================================================");
  console.log(`Organisation ID: ${CANONICAL_ORG_ID}`);
  console.log(`Branch ID:       ${CANONICAL_BRANCH_ID}`);

  try {
    await client.query("BEGIN");

    // -------------------------------------------------------------
    // 1. ORGANISATION & BRANCH VERIFICATION / REPAIR
    // -------------------------------------------------------------
    console.log("\n1. Verifying Canonical Organisation & Branch...");
    await client.query(
      `
      INSERT INTO organisations (id, owner_id, name, pharmacy_code, status, address, city, state, pincode, gst_number)
      VALUES ($1, $2, 'MedLife Care Chemist', 'MEDLIFE-01', 'ACTIVE', '101 Medical Enclave, MG Road', 'Mumbai', 'Maharashtra', '400001', '27AABCS1429B1Z1')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE',
        gst_number = EXCLUDED.gst_number;
    `,
      [CANONICAL_ORG_ID, CANONICAL_OWNER_ID],
    );

    await client.query(
      `
      INSERT INTO branches (id, organisation_id, branch_code, name, facility_type, contact_person, phone, address, city, state, postal_code, status)
      VALUES ($1, $2, 'BR-1001', 'Main Branch', 'RETAIL_DISPENSARY', 'Vikram Malhotra', '9819088712', 'Shop 1-2, Ground Floor, Central Galleria', 'Mumbai', 'Maharashtra', '400001', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE';
    `,
      [CANONICAL_BRANCH_ID, CANONICAL_ORG_ID],
    );

    // Branch GST Settings
    await client.query(
      `
      INSERT INTO branch_gst_settings (organisation_id, branch_id, gstin, legal_name, trade_name, state, state_code, gst_scheme, tax_inclusive_pricing, auto_interstate_split, status)
      VALUES ($1, $2, '27AABCS1429B1Z1', 'MedLife Care Chemist Pvt Ltd', 'MedLife Care Chemist', 'Maharashtra', '27', 'REGULAR', TRUE, TRUE, 'ACTIVE')
      ON CONFLICT (branch_id) DO UPDATE SET
        gstin = EXCLUDED.gstin,
        legal_name = EXCLUDED.legal_name,
        status = 'ACTIVE';
    `,
      [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID],
    );

    // -------------------------------------------------------------
    // 2. ROLES
    // -------------------------------------------------------------
    console.log("2. Ensuring Roles...");
    let adminRoleId;
    const adminRoleRes = await client.query(
      `
      SELECT id FROM roles WHERE organisation_id = $1 AND (role_identifier = 'ROLE_ADMIN' OR name = 'Administrator') LIMIT 1;
    `,
      [CANONICAL_ORG_ID],
    );

    if (adminRoleRes.rows.length > 0) {
      adminRoleId = adminRoleRes.rows[0].id;
    } else {
      const inserted = await client.query(
        `
        INSERT INTO roles (organisation_id, name, role_identifier, clearance_level, is_system_role)
        VALUES ($1, 'Administrator', 'ROLE_ADMIN', 'ADMIN', TRUE)
        RETURNING id;
      `,
        [CANONICAL_ORG_ID],
      );
      adminRoleId = inserted.rows[0].id;
    }

    // -------------------------------------------------------------
    // 3. USERS & MEMBERSHIPS (Frontend Login Accounts)
    // -------------------------------------------------------------
    console.log("3. Seeding / Reusing Frontend Login Users...");
    const usersToSeed = [
      {
        email: "root@falah.com",
        name: "Super Admin Falah",
        password: "more#78548",
        role: "Administrator",
      },
      {
        email: "admin@flora.edu.in",
        name: "Flora Administrator",
        password: "admin123",
        role: "Administrator",
      },
      {
        email: "dev@falah.local",
        name: "Development User",
        password: "dev123456",
        role: "Administrator",
      },
    ];

    for (const u of usersToSeed) {
      const hash = await bcrypt.hash(u.password, 10);
      let userId;
      const existingUser = await client.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [u.email],
      );
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        await client.query(
          "UPDATE users SET password_hash = $1, status = $2 WHERE id = $3",
          [hash, "ACTIVE", userId],
        );
      } else {
        const newUser = await client.query(
          `
          INSERT INTO users (email, password_hash, name, status)
          VALUES ($1, $2, $3, 'ACTIVE')
          RETURNING id;
        `,
          [u.email, hash, u.name],
        );
        userId = newUser.rows[0].id;
      }

      // Membership in Canonical Org
      let membershipId;
      const existingMem = await client.query(
        `
        SELECT id FROM organisation_memberships WHERE organisation_id = $1 AND user_id = $2 LIMIT 1;
      `,
        [CANONICAL_ORG_ID, userId],
      );

      if (existingMem.rows.length > 0) {
        membershipId = existingMem.rows[0].id;
        await client.query(
          "UPDATE organisation_memberships SET status = $1 WHERE id = $2",
          ["ACTIVE", membershipId],
        );
      } else {
        const newMem = await client.query(
          `
          INSERT INTO organisation_memberships (organisation_id, user_id, status, joined_at)
          VALUES ($1, $2, 'ACTIVE', NOW())
          RETURNING id;
        `,
          [CANONICAL_ORG_ID, userId],
        );
        membershipId = newMem.rows[0].id;
      }

      // Branch assignment
      await client.query(
        `
        INSERT INTO branch_assignments (membership_id, branch_id, role_id, is_primary)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (membership_id, branch_id) DO UPDATE SET role_id = EXCLUDED.role_id, is_primary = TRUE;
      `,
        [membershipId, CANONICAL_BRANCH_ID, adminRoleId],
      );
    }

    // -------------------------------------------------------------
    // 4. SUPPLIERS
    // -------------------------------------------------------------
    console.log("4. Seeding Suppliers...");
    const suppliersData = [
      {
        name: "Sun Pharma Care",
        contact: "Rajesh Sharma",
        phone: "+91 98201 44512",
        email: "orders@sunpharma.example.com",
        city: "Mumbai, MH",
        gstin: "27AABCS1429B1Z1",
        category: "Medicines & Injections",
      },
      {
        name: "Cipla Healthcare Ltd",
        contact: "Anjali Verma",
        phone: "+91 98450 11234",
        email: "supply@cipla.example.com",
        city: "Ahmedabad, GJ",
        gstin: "24AAACC4451C1Z8",
        category: "Generic Medicines",
      },
      {
        name: "Abbott Laboratories",
        contact: "Vikram Mehta",
        phone: "+91 99100 88765",
        email: "contact@abbott.example.com",
        city: "New Delhi, DL",
        gstin: "07AABCA9981D1Z4",
        category: "Nutrition & Diagnostics",
      },
      {
        name: "NutriLife Care",
        contact: "Priya Nair",
        phone: "+91 97411 33210",
        email: "sales@nutrilife.example.com",
        city: "Bengaluru, KA",
        gstin: "29AABCN3312E1Z2",
        category: "Supplements & Vitamins",
      },
      {
        name: "GenSupply Dist.",
        contact: "Karan Patel",
        phone: "+91 98220 99881",
        email: "karan@gensupply.example.com",
        city: "Pune, MH",
        gstin: "27AABCG5512F1Z6",
        category: "Generic Medicines",
      },
      {
        name: "Medico Distributors",
        contact: "Suresh Kadam",
        phone: "+91 98230 44556",
        email: "orders@medico.example.com",
        city: "Nagpur, MH",
        gstin: "27AABCM8821D1Z5",
        category: "Medicines & Injections",
      },
    ];

    const supplierMap = new Map();
    for (const s of suppliersData) {
      const existing = await client.query(
        "SELECT id FROM suppliers WHERE organisation_id = $1 AND name = $2 LIMIT 1",
        [CANONICAL_ORG_ID, s.name],
      );
      let sId;
      if (existing.rows.length > 0) {
        sId = existing.rows[0].id;
      } else {
        const res = await client.query(
          `
          INSERT INTO suppliers (organisation_id, name, contact_person, phone, email, city, gstin, category, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
          RETURNING id;
        `,
          [
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
        sId = res.rows[0].id;
      }
      supplierMap.set(s.name, sId);
    }
    const defaultSupplierId = supplierMap.get("Sun Pharma Care");

    // -------------------------------------------------------------
    // 5. PRODUCTS & INVENTORY BATCHES
    // -------------------------------------------------------------
    console.log("5. Seeding Products & Inventory Batches...");
    const productsData = [
      {
        sku: "PCM500",
        medicineName: "Paracetamol 500mg",
        brandName: "Crocin 500",
        category: "Analgesics",
        strength: "500mg",
        packSize: "Strip of 10 Tablets",
        manufacturer: "GSK",
        batches: [
          {
            batchNumber: "B001",
            expiryDate: "2026-12-31",
            mrp: 50.0,
            qty: 120,
            shelf: "A1-S1",
          },
          {
            batchNumber: "B002",
            expiryDate: "2027-06-30",
            mrp: 50.0,
            qty: 80,
            shelf: "A1-S2",
          },
        ],
      },
      {
        sku: "AZM500",
        medicineName: "Azithromycin 500mg",
        brandName: "Azithral 500",
        category: "Antibiotics",
        strength: "500mg",
        packSize: "Strip of 5 Tablets",
        manufacturer: "Alembic",
        batches: [
          {
            batchNumber: "B002",
            expiryDate: "2026-10-31",
            mrp: 135.0,
            qty: 80,
            shelf: "B1-S1",
          },
          {
            batchNumber: "BT-2026-E",
            expiryDate: "2026-11-30",
            mrp: 135.0,
            qty: 65,
            shelf: "B1-S2",
          },
        ],
      },
      {
        sku: "CET10",
        medicineName: "Cetirizine 10mg",
        brandName: "Cetcip 10",
        category: "Respiratory",
        strength: "10mg",
        packSize: "Strip of 15 Tablets",
        manufacturer: "Cipla",
        batches: [
          {
            batchNumber: "B003",
            expiryDate: "2027-01-31",
            mrp: 40.0,
            qty: 150,
            shelf: "C1-S1",
          },
          {
            batchNumber: "B004",
            expiryDate: "2027-05-31",
            mrp: 40.0,
            qty: 90,
            shelf: "C1-S2",
          },
        ],
      },
      {
        sku: "VTC100",
        medicineName: "Vitamin C Tablets",
        brandName: "Limcee 500",
        category: "Hydration",
        strength: "500mg",
        packSize: "Strip of 15 Tablets",
        manufacturer: "Abbott",
        batches: [
          {
            batchNumber: "B004",
            expiryDate: "2026-08-31",
            mrp: 200.0,
            qty: 65,
            shelf: "D1-S1",
          },
          {
            batchNumber: "B005",
            expiryDate: "2026-12-31",
            mrp: 200.0,
            qty: 110,
            shelf: "D1-S2",
          },
        ],
      },
      {
        sku: "OTC-ORS",
        medicineName: "ORS Powder",
        brandName: "Electral",
        category: "Hydration",
        strength: "21.8g",
        packSize: "Sachet 21.8g",
        manufacturer: "FDC Ltd",
        batches: [
          {
            batchNumber: "B005",
            expiryDate: "2026-11-30",
            mrp: 28.0,
            qty: 100,
            shelf: "D1-S3",
          },
        ],
      },
      {
        sku: "MED-DOLO-650",
        medicineName: "Dolo 650 Tablets (15s)",
        brandName: "Dolo 650",
        category: "Analgesics",
        strength: "650mg",
        packSize: "Strip of 15",
        manufacturer: "Micro Labs",
        batches: [
          {
            batchNumber: "BTH-2026-A1",
            expiryDate: "2027-11-30",
            mrp: 34.5,
            qty: 145,
            shelf: "A1-S3",
          },
          {
            batchNumber: "BTH-2026-A2",
            expiryDate: "2028-02-28",
            mrp: 34.5,
            qty: 80,
            shelf: "A1-S4",
          },
        ],
      },
      {
        sku: "MED-AUG-625",
        medicineName: "Augmentin 625 Duo (10s)",
        brandName: "Augmentin 625 Duo",
        category: "Antibiotics",
        strength: "625mg",
        packSize: "Strip of 10",
        manufacturer: "GSK",
        batches: [
          {
            batchNumber: "AUG-8821",
            expiryDate: "2026-08-31",
            mrp: 224.0,
            qty: 82,
            shelf: "B1-S3",
          },
          {
            batchNumber: "AUG-8822",
            expiryDate: "2027-01-31",
            mrp: 224.0,
            qty: 65,
            shelf: "B1-S4",
          },
        ],
      },
      {
        sku: "MED-PAN-40",
        medicineName: "Pan 40 Tablets (15s)",
        brandName: "Pan 40",
        category: "Antacids / PPI",
        strength: "40mg",
        packSize: "Strip of 15",
        manufacturer: "Alkem",
        batches: [
          {
            batchNumber: "PAN-7419",
            expiryDate: "2027-04-30",
            mrp: 175.5,
            qty: 210,
            shelf: "E1-S1",
          },
          {
            batchNumber: "PAN-7420",
            expiryDate: "2027-09-30",
            mrp: 175.5,
            qty: 130,
            shelf: "E1-S2",
          },
        ],
      },
      {
        sku: "SKU-BRU-400",
        medicineName: "Ibuprofen 400mg",
        brandName: "Brufen 400",
        category: "Analgesics",
        strength: "400mg",
        packSize: "Strip of 10 Tablets",
        manufacturer: "Abbott",
        batches: [
          {
            batchNumber: "B-2001",
            expiryDate: "2027-03-31",
            mrp: 18.5,
            qty: 35,
            shelf: "F1-S1",
          },
        ],
      },
      {
        sku: "SKU-OMZ-020",
        medicineName: "Omeprazole 20mg",
        brandName: "Omez 20mg",
        category: "Antacids / PPI",
        strength: "20mg",
        packSize: "Strip of 15 Capsules",
        manufacturer: "Dr. Reddy's",
        batches: [
          {
            batchNumber: "B-5001",
            expiryDate: "2027-08-31",
            mrp: 42.0,
            qty: 210,
            shelf: "E1-S3",
          },
        ],
      },
      {
        sku: "MED-MET-500",
        medicineName: "Metformin 500mg",
        brandName: "Glycomet 500",
        category: "Diabetic Care",
        strength: "500mg",
        packSize: "Strip of 20 Tablets",
        manufacturer: "USV Ltd",
        batches: [
          {
            batchNumber: "MET-1001",
            expiryDate: "2027-10-31",
            mrp: 48.0,
            qty: 160,
            shelf: "G1-S1",
          },
        ],
      },
      {
        sku: "MED-TEL-040",
        medicineName: "Telmisartan 40mg",
        brandName: "Telma 40",
        category: "Cardiovascular",
        strength: "40mg",
        packSize: "Strip of 15 Tablets",
        manufacturer: "Glenmark",
        batches: [
          {
            batchNumber: "TEL-4001",
            expiryDate: "2027-12-31",
            mrp: 120.0,
            qty: 190,
            shelf: "G1-S2",
          },
        ],
      },
      {
        sku: "MED-SYR-100",
        medicineName: "Cough Syrup 100ml Bottle",
        brandName: "Ascoril LS",
        category: "Respiratory",
        strength: "100ml",
        packSize: "100ml Bottle",
        manufacturer: "Glenmark",
        batches: [
          {
            batchNumber: "SYR-2026",
            expiryDate: "2026-10-31",
            mrp: 115.0,
            qty: 45,
            shelf: "H1-S1",
          },
        ],
      },
      {
        sku: "MED-MLC-010",
        medicineName: "Montelukast 10mg + Levocetirizine 5mg",
        brandName: "Montair LC",
        category: "Respiratory",
        strength: "10mg/5mg",
        packSize: "Strip of 10 Tablets",
        manufacturer: "Cipla",
        batches: [
          {
            batchNumber: "MLC-901",
            expiryDate: "2027-07-31",
            mrp: 180.0,
            qty: 120,
            shelf: "C1-S3",
          },
        ],
      },
    ];

    const productMap = new Map();
    const batchMap = new Map();

    for (const p of productsData) {
      let productId;
      const existingP = await client.query(
        "SELECT id FROM products WHERE organisation_id = $1 AND sku = $2 LIMIT 1",
        [CANONICAL_ORG_ID, p.sku],
      );
      if (existingP.rows.length > 0) {
        productId = existingP.rows[0].id;
        await client.query(
          `
          UPDATE products
          SET medicine_name = $1, brand_name = $2, category = $3, strength = $4, pack_size = $5, manufacturer = $6, is_active = TRUE
          WHERE id = $7
        `,
          [
            p.medicineName,
            p.brandName,
            p.category,
            p.strength,
            p.packSize,
            p.manufacturer,
            productId,
          ],
        );
      } else {
        const newP = await client.query(
          `
          INSERT INTO products (organisation_id, sku, medicine_name, brand_name, category, strength, pack_size, manufacturer, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
          RETURNING id;
        `,
          [
            CANONICAL_ORG_ID,
            p.sku,
            p.medicineName,
            p.brandName,
            p.category,
            p.strength,
            p.packSize,
            p.manufacturer,
          ],
        );
        productId = newP.rows[0].id;
      }
      productMap.set(p.sku, productId);

      // Batches
      for (const b of p.batches) {
        const existingB = await client.query(
          `
          SELECT id FROM inventory_batches
          WHERE product_id = $1 AND branch_id = $2 AND batch_number = $3
          LIMIT 1;
        `,
          [productId, CANONICAL_BRANCH_ID, b.batchNumber],
        );

        let batchId;
        if (existingB.rows.length > 0) {
          batchId = existingB.rows[0].id;
          await client.query(
            `
            UPDATE inventory_batches
            SET expiry_date = $1, mrp = $2, quantity = $3, shelf_location = $4
            WHERE id = $5
          `,
            [b.expiryDate, b.mrp, b.qty, b.shelf, batchId],
          );
        } else {
          const newB = await client.query(
            `
            INSERT INTO inventory_batches (product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, shelf_location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
          `,
            [
              productId,
              CANONICAL_BRANCH_ID,
              defaultSupplierId,
              b.batchNumber,
              b.expiryDate,
              b.mrp,
              b.qty,
              b.shelf,
            ],
          );
          batchId = newB.rows[0].id;
        }
        batchMap.set(`${p.sku}_${b.batchNumber}`, batchId);
      }
    }

    // -------------------------------------------------------------
    // 6. CUSTOMERS, CREDIT ACCOUNTS & PRESCRIPTIONS
    // -------------------------------------------------------------
    console.log("6. Seeding Customers, Credit Accounts & Prescriptions...");
    const customersData = [
      {
        customerNumber: "CUST-1040",
        fullName: "Ayesha Khan",
        phone: "9876543210",
        email: "ayesha.khan@email.com",
        dob: "1994-06-15",
        gender: "Female",
        category: "Regular",
        address: "B-404, Green Palms, Andheri West, Mumbai 400053",
        creditLimit: 2000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-1025",
          doctor: "Dr. Farooq Siddiqui",
          specialization: "General Physician",
          hospital: "Lifecare Clinic Mumbai",
          docReg: "MCI-MH-38910",
          chronic: "Mild Allergy, Migraine",
          allergies: "Sulfa Drugs",
        },
      },
      {
        customerNumber: "CUST-1041",
        fullName: "Rajesh Verma",
        phone: "9820144521",
        email: "rajesh.verma@gmail.com",
        dob: "1972-03-10",
        gender: "Male",
        category: "Chronic Care",
        address: "Flat 402, Sea View Apts, Bandra West, Mumbai",
        creditLimit: 25000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0841",
          doctor: "Dr. Amitabh Sharma",
          specialization: "Cardiologist",
          hospital: "Lilavati Hospital",
          docReg: "MCI-MH-49201",
          chronic: "Hypertension, Type 2 Diabetes",
          allergies: "None",
        },
      },
      {
        customerNumber: "CUST-1042",
        fullName: "Sunita Mehra",
        phone: "9811193012",
        email: "sunita.mehra@falah.local",
        dob: "1958-11-22",
        gender: "Female",
        category: "Senior Citizen",
        address: "14 Lake View Apartments, East Delhi, Delhi - 110092",
        creditLimit: 15000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0799",
          doctor: "Dr. Priya Nambiar",
          specialization: "Orthopedic",
          hospital: "City Orthopedic Hospital",
          docReg: "DL-MED-100003",
          chronic: "Osteoarthritis",
          allergies: "Penicillin",
        },
      },
      {
        customerNumber: "CUST-1043",
        fullName: "Anil Deshmukh",
        phone: "9765411209",
        email: "anil.deshmukh@corp.in",
        dob: "1984-09-04",
        gender: "Male",
        category: "Regular",
        address: "Rowhouse 9, Hiranandani Estate, Thane",
        creditLimit: 0,
        creditEnabled: false,
        rx: null,
      },
      {
        customerNumber: "CUST-1044",
        fullName: "Meera Iyer",
        phone: "9930987761",
        email: "meera.iyer@gmail.com",
        dob: "1990-01-18",
        gender: "Female",
        category: "VIP",
        address: "14A, Sky Heights, Worli Sea Face, Mumbai",
        creditLimit: 50000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0880",
          doctor: "Dr. Farhan Merchant",
          specialization: "Pediatrician / Family Care",
          hospital: "Hinduja Healthcare",
          docReg: "MCI-MH-55209",
          chronic: "Asthma (Inhaler regimen)",
          allergies: "Dust & Pollen",
        },
      },
      {
        customerNumber: "CUST-1045",
        fullName: "Farooq Qureshi",
        phone: "9867099812",
        email: "farooq.qureshi@falah.local",
        dob: "1966-06-28",
        gender: "Male",
        category: "Chronic Care",
        address: "19 Noor Residency, Kurla West, Mumbai, MH - 400070",
        creditLimit: 10000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0955",
          doctor: "Dr. Neha Khan",
          specialization: "Diabetologist",
          hospital: "Metro Health Mumbai",
          docReg: "MH-MED-100006",
          chronic: "Type 2 Diabetes",
          allergies: "Aspirin",
        },
      },
      {
        customerNumber: "CUST-1046",
        fullName: "Vikramaditya Roy",
        phone: "9845088219",
        email: "vikram.roy@techmail.com",
        dob: "1963-04-12",
        gender: "Male",
        category: "Chronic Care",
        address: "Villa 3, Palm Meadows, Powai, Mumbai",
        creditLimit: 30000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0610",
          doctor: "Dr. Amitabh Sharma",
          specialization: "Cardiologist",
          hospital: "Lilavati Hospital",
          docReg: "MCI-MH-49201",
          chronic: "Post-CABG Cardiac Care, Dyslipidemia",
          allergies: "None",
        },
      },
      {
        customerNumber: "CUST-1047",
        fullName: "Pooja Agarwal",
        phone: "9711054321",
        email: "pooja.agarwal@outlook.com",
        dob: "1995-08-20",
        gender: "Female",
        category: "Regular",
        address: "Flat 101, Palm Beach Residency, Vashi, Navi Mumbai",
        creditLimit: 0,
        creditEnabled: false,
        rx: null,
      },
      {
        customerNumber: "CUST-1048",
        fullName: "Gopal Krishna Pillai",
        phone: "9447065120",
        email: "gopal.pillai@bsnl.in",
        dob: "1952-01-05",
        gender: "Male",
        category: "Senior Citizen",
        address: "Old Police Quarters, Dadar West, Mumbai",
        creditLimit: 20000.0,
        creditEnabled: true,
        rx: {
          number: "Rx-2026-0740",
          doctor: "Dr. Anand Joshi",
          specialization: "Diabetologist",
          hospital: "KEM Hospital Dadar",
          docReg: "MCI-MH-21940",
          chronic: "Insulin-Dependent Diabetes, Neuropathy",
          allergies: "Aspirin",
        },
      },
    ];

    const customerMap = new Map();
    for (const c of customersData) {
      let customerId;
      const existingC = await client.query(
        "SELECT id FROM customers WHERE organisation_id = $1 AND customer_number = $2 LIMIT 1",
        [CANONICAL_ORG_ID, c.customerNumber],
      );
      if (existingC.rows.length > 0) {
        customerId = existingC.rows[0].id;
        await client.query(
          `
          UPDATE customers
          SET full_name = $1, phone = $2, email = $3, date_of_birth = $4, gender = $5, category = $6, address = $7, status = 'ACTIVE'
          WHERE id = $8
        `,
          [
            c.fullName,
            c.phone,
            c.email,
            c.dob,
            c.gender,
            c.category,
            c.address,
            customerId,
          ],
        );
      } else {
        const newC = await client.query(
          `
          INSERT INTO customers (organisation_id, customer_number, full_name, phone, email, date_of_birth, gender, category, address, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
          RETURNING id;
        `,
          [
            CANONICAL_ORG_ID,
            c.customerNumber,
            c.fullName,
            c.phone,
            c.email,
            c.dob,
            c.gender,
            c.category,
            c.address,
          ],
        );
        customerId = newC.rows[0].id;
      }
      customerMap.set(c.customerNumber, customerId);

      // Credit Account
      await client.query(
        `
        INSERT INTO customer_credit_accounts (organisation_id, customer_id, credit_enabled, credit_limit)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (customer_id) DO UPDATE SET
          credit_enabled = EXCLUDED.credit_enabled,
          credit_limit = EXCLUDED.credit_limit;
      `,
        [CANONICAL_ORG_ID, customerId, c.creditEnabled, c.creditLimit],
      );

      // Prescription
      if (c.rx) {
        await client.query(
          `
          INSERT INTO prescriptions (organisation_id, customer_id, prescription_number, prescription_reference, doctor_name, specialization, hospital_or_clinic, doctor_registration_number, chronic_conditions, drug_allergies, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
          ON CONFLICT (organisation_id, prescription_number) DO UPDATE SET
            doctor_name = EXCLUDED.doctor_name,
            specialization = EXCLUDED.specialization,
            hospital_or_clinic = EXCLUDED.hospital_or_clinic,
            chronic_conditions = EXCLUDED.chronic_conditions,
            drug_allergies = EXCLUDED.drug_allergies;
        `,
          [
            CANONICAL_ORG_ID,
            customerId,
            c.rx.number,
            c.rx.number,
            c.rx.doctor,
            c.rx.specialization,
            c.rx.hospital,
            c.rx.docReg,
            c.rx.chronic,
            c.rx.allergies,
          ],
        );
      }
    }

    // -------------------------------------------------------------
    // 7. PURCHASES & GOODS RECEIPTS
    // -------------------------------------------------------------
    console.log("7. Seeding Purchases & Goods Receipts...");
    const purchasesData = [
      {
        purchaseNumber: "PO-1026",
        supplierName: "Sun Pharma Care",
        orderDate: "2026-09-01",
        expectedDate: "2026-09-05",
        status: "DRAFT",
        items: [{ sku: "MED-MLC-010", qty: 20, unitCost: 140.0 }],
      },
      {
        purchaseNumber: "PO-1025",
        supplierName: "Sun Pharma Care",
        orderDate: "2026-08-29",
        expectedDate: "2026-09-02",
        status: "PENDING",
        items: [{ sku: "PCM500", qty: 100, unitCost: 35.0 }],
      },
      {
        purchaseNumber: "PO-1024",
        supplierName: "Cipla Healthcare Ltd",
        orderDate: "2026-08-28",
        expectedDate: "2026-08-31",
        status: "RECEIVED",
        items: [{ sku: "AZM500", qty: 50, unitCost: 95.0 }],
        grn: "GR-1024",
      },
      {
        purchaseNumber: "PO-1023",
        supplierName: "Abbott Laboratories",
        orderDate: "2026-08-27",
        expectedDate: "2026-09-01",
        status: "RECEIVED",
        items: [{ sku: "MED-MET-500", qty: 100, unitCost: 32.0 }],
        grn: "GR-1023",
      },
      {
        purchaseNumber: "PO-1022",
        supplierName: "GenSupply Dist.",
        orderDate: "2026-08-25",
        expectedDate: "2026-08-28",
        status: "RECEIVED",
        items: [{ sku: "VTC100", qty: 40, unitCost: 130.0 }],
        grn: "GR-1022",
      },
      {
        purchaseNumber: "PO-1021",
        supplierName: "Medico Distributors",
        orderDate: "2026-08-22",
        expectedDate: "2026-08-26",
        status: "RECEIVED",
        items: [{ sku: "MED-DOLO-650", qty: 100, unitCost: 22.0 }],
        grn: "GR-1021",
      },
    ];

    for (const po of purchasesData) {
      const suppId = supplierMap.get(po.supplierName) || defaultSupplierId;
      let purchaseId;
      const existingPo = await client.query(
        "SELECT id FROM purchases WHERE organisation_id = $1 AND purchase_number = $2 LIMIT 1",
        [CANONICAL_ORG_ID, po.purchaseNumber],
      );
      if (existingPo.rows.length > 0) {
        purchaseId = existingPo.rows[0].id;
        await client.query("UPDATE purchases SET status = $1 WHERE id = $2", [
          po.status,
          purchaseId,
        ]);
      } else {
        const newPo = await client.query(
          `
          INSERT INTO purchases (organisation_id, purchase_number, supplier_id, branch_id, order_date, expected_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id;
        `,
          [
            CANONICAL_ORG_ID,
            po.purchaseNumber,
            suppId,
            CANONICAL_BRANCH_ID,
            po.orderDate,
            po.expectedDate,
            po.status,
          ],
        );
        purchaseId = newPo.rows[0].id;
      }

      // Purchase Items
      for (const item of po.items) {
        const prodId = productMap.get(item.sku);
        if (!prodId) continue;
        let poItemId;
        const existingPoItem = await client.query(
          "SELECT id FROM purchase_items WHERE purchase_id = $1 AND product_id = $2 LIMIT 1",
          [purchaseId, prodId],
        );
        if (existingPoItem.rows.length > 0) {
          poItemId = existingPoItem.rows[0].id;
        } else {
          const newPoItem = await client.query(
            `
            INSERT INTO purchase_items (purchase_id, product_id, ordered_quantity, unit_cost)
            VALUES ($1, $2, $3, $4)
            RETURNING id;
          `,
            [purchaseId, prodId, item.qty, item.unitCost],
          );
          poItemId = newPoItem.rows[0].id;
        }

        // Goods Receipt if Received
        if (po.grn) {
          let grnId;
          const existingGrn = await client.query(
            "SELECT id FROM goods_receipts WHERE organisation_id = $1 AND receipt_number = $2 LIMIT 1",
            [CANONICAL_ORG_ID, po.grn],
          );
          if (existingGrn.rows.length > 0) {
            grnId = existingGrn.rows[0].id;
          } else {
            const newGrn = await client.query(
              `
              INSERT INTO goods_receipts (organisation_id, purchase_id, receipt_number, received_date, status)
              VALUES ($1, $2, $3, $4, 'VERIFIED')
              RETURNING id;
            `,
              [CANONICAL_ORG_ID, purchaseId, po.grn, po.expectedDate],
            );
            grnId = newGrn.rows[0].id;
          }

          await client.query(
            `
            INSERT INTO goods_receipt_items (goods_receipt_id, purchase_item_id, received_quantity, rejected_quantity)
            VALUES ($1, $2, $3, 0)
            ON CONFLICT (goods_receipt_id, purchase_item_id) DO NOTHING;
          `,
            [grnId, poItemId, item.qty],
          );
        }
      }
    }

    // -------------------------------------------------------------
    // 8. HISTORICAL INVOICES, ITEMS, PAYMENTS, & LEDGER
    // -------------------------------------------------------------
    console.log("8. Seeding Invoices, Items, Payments & Ledger Entries...");
    const historicalSales = [
      {
        invoiceNumber: "INV-2026-8942",
        customerNumber: "CUST-1041", // Rajesh Verma
        date: "2026-08-28T11:45:00Z",
        subtotal: 1240.0,
        total: 1240.0,
        status: "COMPLETED",
        paidAmount: 0.0, // Credit sale, unpaid
        paymentMode: null,
        items: [
          {
            sku: "MED-TEL-040",
            batch: "TEL-4001",
            qty: 2,
            price: 120.0,
            total: 240.0,
          },
          {
            sku: "MED-MET-500",
            batch: "MET-1001",
            qty: 10,
            price: 48.0,
            total: 480.0,
          },
          { sku: "PCM500", batch: "B001", qty: 10, price: 50.0, total: 500.0 },
        ],
      },
      {
        invoiceNumber: "INV-2026-8201",
        customerNumber: "CUST-1041", // Rajesh Verma
        date: "2026-08-14T10:00:00Z",
        subtotal: 2210.0,
        total: 2210.0,
        status: "COMPLETED",
        paidAmount: 0.0, // Unpaid
        paymentMode: null,
        items: [
          {
            sku: "MED-PAN-40",
            batch: "PAN-7419",
            qty: 10,
            price: 175.5,
            total: 1755.0,
          },
          { sku: "CET10", batch: "B003", qty: 11, price: 40.0, total: 440.0 },
        ],
      },
      {
        invoiceNumber: "INV-2026-7510",
        customerNumber: "CUST-1041", // Rajesh Verma
        date: "2026-07-29T14:30:00Z",
        subtotal: 1850.0,
        total: 1850.0,
        status: "PAID",
        paidAmount: 1850.0, // Fully paid via UPI
        paymentMode: "UPI",
        receiptNumber: "REC-2026-7510",
        items: [
          {
            sku: "MED-TEL-040",
            batch: "TEL-4001",
            qty: 10,
            price: 120.0,
            total: 1200.0,
          },
          { sku: "VTC100", batch: "B004", qty: 3, price: 200.0, total: 600.0 },
        ],
      },
      {
        invoiceNumber: "INV-2026-8812",
        customerNumber: "CUST-1042", // Sunita Mehra
        date: "2026-08-24T13:20:00Z",
        subtotal: 1850.0,
        total: 1850.0,
        status: "COMPLETED",
        paidAmount: 0.0,
        paymentMode: null,
        items: [
          {
            sku: "SKU-BRU-400",
            batch: "B-2001",
            qty: 20,
            price: 18.5,
            total: 370.0,
          },
          {
            sku: "MED-PAN-40",
            batch: "PAN-7419",
            qty: 8,
            price: 175.5,
            total: 1404.0,
          },
        ],
      },
      {
        invoiceNumber: "INV-2026-9014",
        customerNumber: "CUST-1044", // Meera Iyer
        date: "2026-08-30T16:30:00Z",
        subtotal: 8920.0,
        total: 8920.0,
        status: "COMPLETED",
        paidAmount: 0.0,
        paymentMode: null,
        items: [
          {
            sku: "MED-MLC-010",
            batch: "MLC-901",
            qty: 20,
            price: 180.0,
            total: 3600.0,
          },
          {
            sku: "MED-AUG-625",
            batch: "AUG-8821",
            qty: 20,
            price: 224.0,
            total: 4480.0,
          },
          { sku: "OTC-ORS", batch: "B005", qty: 30, price: 28.0, total: 840.0 },
        ],
      },
      {
        invoiceNumber: "INV-1020",
        customerNumber: "CUST-1040", // Ayesha Khan
        date: "2026-08-27T16:30:00Z",
        subtotal: 408.0,
        total: 408.0,
        status: "COMPLETED",
        paidAmount: 158.0, // partially paid, subject to return
        paymentMode: "CASH",
        receiptNumber: "REC-1020",
        items: [
          {
            sku: "MED-PAN-40",
            batch: "PAN-7419",
            qty: 1,
            price: 158.0,
            total: 158.0,
          },
          { sku: "OTC-ORS", batch: "B005", qty: 5, price: 50.0, total: 250.0 },
        ],
      },
    ];

    for (const inv of historicalSales) {
      const custId = customerMap.get(inv.customerNumber);
      if (!custId) continue;

      let invoiceId;
      const existingInv = await client.query(
        "SELECT id FROM invoices WHERE branch_id = $1 AND invoice_number = $2 LIMIT 1",
        [CANONICAL_BRANCH_ID, inv.invoiceNumber],
      );
      if (existingInv.rows.length > 0) {
        invoiceId = existingInv.rows[0].id;
        await client.query(
          "UPDATE invoices SET total_amount = $1, status = $2 WHERE id = $3",
          [inv.total, inv.status, invoiceId],
        );
      } else {
        const newInv = await client.query(
          `
          INSERT INTO invoices (organisation_id, branch_id, customer_id, invoice_number, invoice_date, subtotal, total_amount, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id;
        `,
          [
            CANONICAL_ORG_ID,
            CANONICAL_BRANCH_ID,
            custId,
            inv.invoiceNumber,
            inv.date,
            inv.subtotal,
            inv.total,
            inv.status,
          ],
        );
        invoiceId = newInv.rows[0].id;
      }

      // Invoice Items
      for (const item of inv.items) {
        const prodId = productMap.get(item.sku);
        const batchId = batchMap.get(`${item.sku}_${item.batch}`);
        if (!prodId) continue;

        await client.query(
          `
          INSERT INTO invoice_items (invoice_id, product_id, inventory_batch_id, product_name, batch_number, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING;
        `,
          [
            invoiceId,
            prodId,
            batchId,
            item.sku,
            item.batch,
            item.qty,
            item.price,
            item.total,
          ],
        );
      }

      // Customer Ledger Entry for Invoice Debit
      const existingLedgerDebit = await client.query(
        `
        SELECT id FROM customer_ledger_entries
        WHERE organisation_id = $1 AND customer_id = $2 AND reference_type = 'INVOICE' AND reference_id = $3
        LIMIT 1;
      `,
        [CANONICAL_ORG_ID, custId, invoiceId],
      );

      if (existingLedgerDebit.rows.length === 0) {
        await client.query(
          `
          INSERT INTO customer_ledger_entries (organisation_id, customer_id, branch_id, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, entry_date, description)
          VALUES ($1, $2, $3, 'INVOICE', 'INVOICE', $4, $5, 0, $5, $6, $7);
        `,
          [
            CANONICAL_ORG_ID,
            custId,
            CANONICAL_BRANCH_ID,
            invoiceId,
            inv.total,
            inv.date,
            `Invoice #${inv.invoiceNumber}`,
          ],
        );
      }

      // Payment if Paid
      if (inv.paidAmount > 0 && inv.receiptNumber) {
        let paymentId;
        const existingPmt = await client.query(
          "SELECT id FROM payments WHERE branch_id = $1 AND receipt_number = $2 LIMIT 1",
          [CANONICAL_BRANCH_ID, inv.receiptNumber],
        );
        if (existingPmt.rows.length > 0) {
          paymentId = existingPmt.rows[0].id;
        } else {
          const newPmt = await client.query(
            `
            INSERT INTO payments (organisation_id, branch_id, customer_id, receipt_number, payment_date, total_amount, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED')
            RETURNING id;
          `,
            [
              CANONICAL_ORG_ID,
              CANONICAL_BRANCH_ID,
              custId,
              inv.receiptNumber,
              inv.date,
              inv.paidAmount,
            ],
          );
          paymentId = newPmt.rows[0].id;
        }

        // Payment transaction
        await client.query(
          `
          INSERT INTO payment_transactions (payment_id, payment_method, amount)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING;
        `,
          [paymentId, inv.paymentMode || "CASH", inv.paidAmount],
        );

        // Payment allocation
        await client.query(
          `
          INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
          VALUES ($1, $2, $3)
          ON CONFLICT (payment_id, invoice_id) DO NOTHING;
        `,
          [paymentId, invoiceId, inv.paidAmount],
        );

        // Customer Ledger Entry for Payment Credit
        const existingLedgerCredit = await client.query(
          `
          SELECT id FROM customer_ledger_entries
          WHERE organisation_id = $1 AND customer_id = $2 AND reference_type = 'PAYMENT' AND reference_id = $3
          LIMIT 1;
        `,
          [CANONICAL_ORG_ID, custId, paymentId],
        );

        if (existingLedgerCredit.rows.length === 0) {
          await client.query(
            `
            INSERT INTO customer_ledger_entries (organisation_id, customer_id, branch_id, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, entry_date, description)
            VALUES ($1, $2, $3, 'PAYMENT', 'PAYMENT', $4, 0, $5, 0, $6, $7);
          `,
            [
              CANONICAL_ORG_ID,
              custId,
              CANONICAL_BRANCH_ID,
              paymentId,
              inv.paidAmount,
              inv.date,
              `Payment Receipt #${inv.receiptNumber}`,
            ],
          );
        }
      }
    }

    // -------------------------------------------------------------
    // 9. SALES RETURNS
    // -------------------------------------------------------------
    console.log("9. Seeding Sales Return (RET-2026-104)...");
    const returnInvRes = await client.query(
      "SELECT id, customer_id FROM invoices WHERE branch_id = $1 AND invoice_number = $2 LIMIT 1",
      [CANONICAL_BRANCH_ID, "INV-1020"],
    );
    if (returnInvRes.rows.length > 0) {
      const invId = returnInvRes.rows[0].id;
      const cId = returnInvRes.rows[0].customer_id;

      let returnId;
      const existingRet = await client.query(
        "SELECT id FROM returns WHERE branch_id = $1 AND return_number = $2 LIMIT 1",
        [CANONICAL_BRANCH_ID, "RET-2026-104"],
      );
      if (existingRet.rows.length > 0) {
        returnId = existingRet.rows[0].id;
      } else {
        const newRet = await client.query(
          `
          INSERT INTO returns (organisation_id, branch_id, customer_id, invoice_id, return_number, return_date, refund_amount, refund_method, reason, status)
          VALUES ($1, $2, $3, $4, 'RET-2026-104', '2026-08-27T16:30:00Z', 158.00, 'CASH', 'Doctor altered prescription', 'PROCESSED')
          RETURNING id;
        `,
          [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, cId, invId],
        );
        returnId = newRet.rows[0].id;
      }

      // Return Items
      const invItemRes = await client.query(
        "SELECT id FROM invoice_items WHERE invoice_id = $1 LIMIT 1",
        [invId],
      );
      if (invItemRes.rows.length > 0) {
        const invItemId = invItemRes.rows[0].id;
        await client.query(
          `
          INSERT INTO return_items (return_id, invoice_item_id, quantity_returned, refund_amount, return_condition, restock_quantity)
          VALUES ($1, $2, 1, 158.00, 'SEALED', 1)
          ON CONFLICT DO NOTHING;
        `,
          [returnId, invItemId],
        );
      }
    }

    // -------------------------------------------------------------
    // 10. CASH REGISTER, SESSIONS & CASH MOVEMENTS
    // -------------------------------------------------------------
    console.log("10. Seeding Cash Register, Sessions & Movements...");
    let registerId;
    const existingReg = await client.query(
      "SELECT id FROM cash_registers WHERE branch_id = $1 AND identifier = $2 LIMIT 1",
      [CANONICAL_BRANCH_ID, "REG-01"],
    );
    if (existingReg.rows.length > 0) {
      registerId = existingReg.rows[0].id;
    } else {
      const newReg = await client.query(
        `
        INSERT INTO cash_registers (organisation_id, branch_id, name, identifier, is_active)
        VALUES ($1, $2, 'Counter Terminal 1', 'REG-01', TRUE)
        RETURNING id;
      `,
        [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID],
      );
      registerId = newReg.rows[0].id;
    }

    let sessionId;
    const existingSession = await client.query(
      "SELECT id FROM cash_register_sessions WHERE cash_register_id = $1 AND session_number = $2 LIMIT 1",
      [registerId, "REG-2026-0829-01"],
    );
    if (existingSession.rows.length > 0) {
      sessionId = existingSession.rows[0].id;
    } else {
      const newSession = await client.query(
        `
        INSERT INTO cash_register_sessions (organisation_id, branch_id, cash_register_id, cashier_id, session_number, shift_name, opening_balance, status, opening_notes)
        VALUES ($1, $2, $3, $4, 'REG-2026-0829-01', 'Morning Shift', 2000.00, 'OPEN', 'Opening shift float verified by Cashier 01')
        RETURNING id;
      `,
        [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, registerId, CANONICAL_OWNER_ID],
      );
      sessionId = newSession.rows[0].id;
    }

    // Cash movement: Float in
    await client.query(
      `
      INSERT INTO cash_movements (organisation_id, branch_id, cash_register_session_id, cashier_id, movement_number, movement_type, amount, reason)
      VALUES ($1, $2, $3, $4, 'MOV-2026-001', 'IN', 2000.00, 'Opening Float Addition')
      ON CONFLICT DO NOTHING;
    `,
      [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, sessionId, CANONICAL_OWNER_ID],
    );

    // Cash movement: Expense payout
    await client.query(
      `
      INSERT INTO cash_movements (organisation_id, branch_id, cash_register_session_id, cashier_id, movement_number, movement_type, amount, reason)
      VALUES ($1, $2, $3, $4, 'MOV-2026-002', 'OUT', 350.00, 'Pharmacy Cleaning Supplies & Tea')
      ON CONFLICT DO NOTHING;
    `,
      [CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, sessionId, CANONICAL_OWNER_ID],
    );

    await client.query("COMMIT");
    console.log("\n✅ Canonical tenant successfully seeded and verified!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error seeding canonical tenant:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedCanonicalDemo()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedCanonicalDemo };
