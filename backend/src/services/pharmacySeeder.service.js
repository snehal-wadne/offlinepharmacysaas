/**
 * Pharmacy Seeder Service
 * 
 * Automatically provisions initial pharmacy inventory, standard products catalog,
 * suppliers, purchase orders, and stock movements for newly onboarded organisations
 * (including Single Shop Direct Inventory mode and Multi-branch chains).
 */

const { pool } = require("../db/connection");

const DEFAULT_PRODUCTS = [
  {
    medicineName: "Paracetamol",
    brandName: "Crocin 500",
    category: "Analgesic & Antipyretic",
    strength: "500mg",
    packSize: "15 Tablets",
    manufacturer: "GSK",
    supplierName: "GSK Pharmaceuticals",
    sku: "SKU-CRO-500",
    batchNo: "B-1001",
    quantity: 500,
    mrp: 15.00,
    shelfLocation: "A1-S1",
    daysToExpiry: 720,
  },
  {
    medicineName: "Paracetamol",
    brandName: "Calpol 500",
    category: "Analgesic & Antipyretic",
    strength: "500mg",
    packSize: "15 Tablets",
    manufacturer: "GSK",
    supplierName: "GSK Pharmaceuticals",
    sku: "SKU-CAL-500",
    batchNo: "B-1002",
    quantity: 420,
    mrp: 15.00,
    shelfLocation: "A1-S2",
    daysToExpiry: 650,
  },
  {
    medicineName: "Paracetamol",
    brandName: "Dolo 650",
    category: "Analgesic & Antipyretic",
    strength: "650mg",
    packSize: "15 Tablets",
    manufacturer: "Micro Labs",
    supplierName: "Micro Labs Ltd",
    sku: "SKU-DOLO-650",
    batchNo: "B-1003",
    quantity: 750,
    mrp: 24.00,
    shelfLocation: "A1-S3",
    daysToExpiry: 800,
  },
  {
    medicineName: "Ibuprofen",
    brandName: "Brufen 400",
    category: "Anti-Inflammatory (NSAID)",
    strength: "400mg",
    packSize: "10 Tablets",
    manufacturer: "Abbott",
    supplierName: "Abbott Healthcare",
    sku: "SKU-BRU-400",
    batchNo: "B-2001",
    quantity: 3, // LOW STOCK ALERT (<= 5)
    mrp: 18.50,
    shelfLocation: "B1-S1",
    daysToExpiry: 400,
  },
  {
    medicineName: "Ibuprofen",
    brandName: "Advil 400",
    category: "Anti-Inflammatory (NSAID)",
    strength: "400mg",
    packSize: "10 Tablets",
    manufacturer: "Novartis",
    supplierName: "Novartis Pharma",
    sku: "SKU-ADV-400",
    batchNo: "B-2002",
    quantity: 180,
    mrp: 22.00,
    shelfLocation: "B1-S2",
    daysToExpiry: 35, // NEAR EXPIRY (< 60 DAYS)
  },
  {
    medicineName: "Amoxicillin",
    brandName: "Amoxil 500",
    category: "Antibiotics",
    strength: "500mg",
    packSize: "10 Capsules",
    manufacturer: "GSK",
    supplierName: "GSK Pharmaceuticals",
    sku: "SKU-AMX-500",
    batchNo: "B-3001",
    quantity: 320,
    mrp: 45.00,
    shelfLocation: "C1-S1",
    daysToExpiry: 540,
  },
  {
    medicineName: "Amoxicillin",
    brandName: "Mox 500",
    category: "Antibiotics",
    strength: "500mg",
    packSize: "10 Capsules",
    manufacturer: "Alkem",
    supplierName: "Alkem Laboratories",
    sku: "SKU-MOX-500",
    batchNo: "B-3002",
    quantity: 260,
    mrp: 38.00,
    shelfLocation: "C1-S2",
    daysToExpiry: 600,
  },
  {
    medicineName: "Cetirizine",
    brandName: "Cetcip 10mg",
    category: "Antihistamine / Allergy",
    strength: "10mg",
    packSize: "10 Tablets",
    manufacturer: "Cipla",
    supplierName: "Cipla Healthcare Ltd",
    sku: "SKU-CET-010",
    batchNo: "B-4001",
    quantity: 440,
    mrp: 12.00,
    shelfLocation: "D1-S1",
    daysToExpiry: 700,
  },
  {
    medicineName: "Cetirizine",
    brandName: "Zyrtec 10mg",
    category: "Antihistamine / Allergy",
    strength: "10mg",
    packSize: "10 Tablets",
    manufacturer: "UCB",
    supplierName: "UCB India",
    sku: "SKU-ZYR-010",
    batchNo: "B-4002",
    quantity: 190,
    mrp: 35.00,
    shelfLocation: "D1-S2",
    daysToExpiry: 550,
  },
  {
    medicineName: "Omeprazole",
    brandName: "Omez 20mg",
    category: "Gastrointestinal (Antacid)",
    strength: "20mg",
    packSize: "15 Capsules",
    manufacturer: "Dr Reddy's",
    supplierName: "Dr. Reddy's Laboratories",
    sku: "SKU-OMZ-020",
    batchNo: "B-5001",
    quantity: 210,
    mrp: 42.00,
    shelfLocation: "E1-S1",
    daysToExpiry: 630,
  },
  {
    medicineName: "Omeprazole",
    brandName: "Razole 20mg",
    category: "Gastrointestinal (Antacid)",
    strength: "20mg",
    packSize: "15 Capsules",
    manufacturer: "Sun Pharma",
    supplierName: "Sun Pharma Care",
    sku: "SKU-RAZ-020",
    batchNo: "B-5002",
    quantity: 0, // EXPIRED / OUT OF STOCK (0)
    mrp: 40.00,
    shelfLocation: "E1-S2",
    daysToExpiry: -10, // already expired
  },
];

async function seedInitialPharmacyData(organisationId, branchId, dbClient = null) {
  if (!organisationId) return;

  const client = dbClient || (await pool.connect());
  const isInternalTx = !dbClient;

  try {
    if (isInternalTx) await client.query("BEGIN");

    // 1. Resolve branch if not provided
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const bRes = await client.query(
        "SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at ASC LIMIT 1;",
        [organisationId]
      );
      targetBranchId = bRes.rows[0]?.id;
    }

    if (!targetBranchId) {
      console.warn(`[PharmacySeeder] No branch found for org ${organisationId}.`);
      if (isInternalTx) await client.query("COMMIT");
      return;
    }

    // 2. Check if products already exist
    const prodCountRes = await client.query(
      "SELECT COUNT(*) FROM products WHERE organisation_id = $1;",
      [organisationId]
    );
    const existingCount = parseInt(prodCountRes.rows[0].count, 10);

    if (existingCount > 0) {
      console.log(`[PharmacySeeder] Org ${organisationId} already has ${existingCount} products.`);
      if (isInternalTx) await client.query("COMMIT");
      return;
    }

    console.log(`[PharmacySeeder] Seeding catalog & inventory for Org ${organisationId}, Branch ${targetBranchId}...`);

    const supplierMap = {};
    const productMap = {};

    for (const item of DEFAULT_PRODUCTS) {
      // A. Supplier
      if (!supplierMap[item.supplierName]) {
        let sRes = await client.query(
          "SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2);",
          [organisationId, item.supplierName]
        );
        if (sRes.rows.length > 0) {
          supplierMap[item.supplierName] = sRes.rows[0].id;
        } else {
          const newS = await client.query(
            `INSERT INTO suppliers (organisation_id, name, status)
             VALUES ($1, $2, 'ACTIVE')
             RETURNING id;`,
            [organisationId, item.supplierName]
          );
          supplierMap[item.supplierName] = newS.rows[0].id;
        }
      }
      const supplierId = supplierMap[item.supplierName];

      // B. Product
      const newP = await client.query(
        `INSERT INTO products (
           organisation_id, medicine_name, brand_name, category, strength,
           pack_size, manufacturer, sku, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING id;`,
        [
          organisationId,
          item.medicineName,
          item.brandName,
          item.category,
          item.strength,
          item.packSize,
          item.manufacturer,
          `${item.sku}-${organisationId.slice(0, 4)}`,
        ]
      );
      const productId = newP.rows[0].id;
      productMap[item.brandName] = { id: productId, supplierId, item };

      // C. Inventory Batch
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + item.daysToExpiry);
      const expStr = expDate.toISOString().split("T")[0];

      await client.query(
        `INSERT INTO inventory_batches (
           product_id, branch_id, supplier_id, batch_number, expiry_date,
           mrp, quantity, shelf_location
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          productId,
          targetBranchId,
          supplierId,
          item.batchNo,
          expStr,
          item.mrp,
          item.quantity,
          item.shelfLocation,
        ]
      );
    }

    // 3. Seed Sample Purchase Orders
    const samplePoSupplierId = Object.values(supplierMap)[0];
    if (samplePoSupplierId) {
      const poRes = await client.query(
        `INSERT INTO purchases (
           organisation_id, purchase_number, supplier_id, branch_id,
           order_date, expected_date, status
         )
         VALUES ($1, 'PO-1001', $2, $3, CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '3 days', 'PENDING')
         RETURNING id;`,
        [organisationId, samplePoSupplierId, targetBranchId]
      );
      const poId = poRes.rows[0].id;

      const firstProduct = Object.values(productMap)[0];
      if (firstProduct) {
        await client.query(
          `INSERT INTO purchase_items (
             purchase_id, product_id, ordered_quantity, unit_cost, tax_amount, discount_amount
           )
           VALUES ($1, $2, 50, 18.00, 45.00, 0);`,
          [poId, firstProduct.id]
        );
      }
    }

    // 4. Seed Sample Completed Sale & Movement
    let custRes = await client.query(
      "SELECT id FROM customers WHERE organisation_id = $1 LIMIT 1;",
      [organisationId]
    );
    let customerId;
    if (custRes.rows.length > 0) {
      customerId = custRes.rows[0].id;
    } else {
      const newCust = await client.query(
        `INSERT INTO customers (organisation_id, customer_number, full_name, phone)
         VALUES ($1, 'CUST-1001', 'Walk-in Customer', '9999999999')
         RETURNING id;`,
        [organisationId]
      );
      customerId = newCust.rows[0].id;
    }

    const invRes = await client.query(
      `INSERT INTO invoices (
         organisation_id, branch_id, customer_id, invoice_number, invoice_date, status,
         subtotal, discount_amount, tax_amount, total_amount
       )
       VALUES ($1, $2, $3, 'INV-1001', CURRENT_TIMESTAMP, 'COMPLETED', 120.00, 0.00, 0.00, 120.00)
       RETURNING id;`,
      [organisationId, targetBranchId, customerId]
    );
    const invoiceId = invRes.rows[0].id;

    const soldProduct = Object.values(productMap)[0];
    if (soldProduct) {
      await client.query(
        `INSERT INTO invoice_items (
           invoice_id, product_id, product_name, quantity, unit_price, line_total, discount_amount, tax_amount
         )
         VALUES ($1, $2, $3, 2, 60.00, 120.00, 0.00, 0.00);`,
        [invoiceId, soldProduct.id, soldProduct.item.brandName]
      );
    }

    if (isInternalTx) await client.query("COMMIT");
    console.log(`[PharmacySeeder] Successfully seeded initial inventory for Org ${organisationId}`);
  } catch (error) {
    if (isInternalTx) await client.query("ROLLBACK");
    console.error(`[PharmacySeeder] Failed to seed data for Org ${organisationId}:`, error);
  } finally {
    if (isInternalTx) client.release();
  }
}

module.exports = {
  seedInitialPharmacyData,
  DEFAULT_PRODUCTS,
};
