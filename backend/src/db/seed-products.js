/**
 * Seed Products and Inventory Batches into PostgreSQL Database
 * 
 * Seeds all 11 medicines/products shown on the Stock Adjustments screen image.
 */

const { pool } = require('./connection');

const SEED_ITEMS = [
  {
    medicineName: 'Paracetamol',
    brandName: 'Crocin 500',
    strength: '500mg',
    packSize: '15 Tablets',
    manufacturer: 'GSK',
    supplierName: 'GSK Pharmaceuticals',
    sku: 'SKU-CRO-500',
    batchNo: 'B-1001',
    quantity: 500,
    mrp: 15.00,
    shelfLocation: 'A1-S1',
  },
  {
    medicineName: 'Paracetamol',
    brandName: 'Calpol 500',
    strength: '500mg',
    packSize: '15 Tablets',
    manufacturer: 'GSK',
    supplierName: 'GSK Pharmaceuticals',
    sku: 'SKU-CAL-500',
    batchNo: 'B-1002',
    quantity: 420,
    mrp: 15.00,
    shelfLocation: 'A1-S2',
  },
  {
    medicineName: 'Paracetamol',
    brandName: 'Dolo 650',
    strength: '650mg',
    packSize: '15 Tablets',
    manufacturer: 'Micro Labs',
    supplierName: 'Micro Labs Ltd',
    sku: 'SKU-DOLO-650',
    batchNo: 'B-1003',
    quantity: 750,
    mrp: 24.00,
    shelfLocation: 'A1-S3',
  },
  {
    medicineName: 'Ibuprofen',
    brandName: 'Brufen 400',
    strength: '400mg',
    packSize: '10 Tablets',
    manufacturer: 'Abbott',
    supplierName: 'Abbott Healthcare',
    sku: 'SKU-BRU-400',
    batchNo: 'B-2001',
    quantity: 35,
    mrp: 18.50,
    shelfLocation: 'B1-S1',
  },
  {
    medicineName: 'Ibuprofen',
    brandName: 'Advill',
    strength: '400mg',
    packSize: '10 Tablets',
    manufacturer: 'Novartis',
    supplierName: 'Novartis Pharma',
    sku: 'SKU-ADV-400',
    batchNo: 'B-2002',
    quantity: 180,
    mrp: 22.00,
    shelfLocation: 'B1-S2',
  },
  {
    medicineName: 'Amoxicillin',
    brandName: 'Amoxil 500',
    strength: '500mg',
    packSize: '10 Capsules',
    manufacturer: 'GSK',
    supplierName: 'GSK Pharmaceuticals',
    sku: 'SKU-AMX-500',
    batchNo: 'B-3001',
    quantity: 320,
    mrp: 45.00,
    shelfLocation: 'C1-S1',
  },
  {
    medicineName: 'Amoxicillin',
    brandName: 'Mox 500',
    strength: '500mg',
    packSize: '10 Capsules',
    manufacturer: 'Alkem',
    supplierName: 'Alkem Laboratories',
    sku: 'SKU-MOX-500',
    batchNo: 'B-3002',
    quantity: 260,
    mrp: 38.00,
    shelfLocation: 'C1-S2',
  },
  {
    medicineName: 'Cetirizine',
    brandName: 'Cetcip 10mg',
    strength: '10mg',
    packSize: '10 Tablets',
    manufacturer: 'Cipla',
    supplierName: 'Cipla Ltd',
    sku: 'SKU-CET-010',
    batchNo: 'B-4001',
    quantity: 440,
    mrp: 12.00,
    shelfLocation: 'D1-S1',
  },
  {
    medicineName: 'Cetirizine',
    brandName: 'Zyrtec 10mg',
    strength: '10mg',
    packSize: '10 Tablets',
    manufacturer: 'UCB',
    supplierName: 'UCB India',
    sku: 'SKU-ZYR-010',
    batchNo: 'B-4002',
    quantity: 190,
    mrp: 35.00,
    shelfLocation: 'D1-S2',
  },
  {
    medicineName: 'Omeprazole',
    brandName: 'Omez 20mg',
    strength: '20mg',
    packSize: '15 Capsules',
    manufacturer: "Dr Reddy's",
    supplierName: "Dr. Reddy's Laboratories",
    sku: 'SKU-OMZ-020',
    batchNo: 'B-5001',
    quantity: 210,
    mrp: 42.00,
    shelfLocation: 'E1-S1',
  },
  {
    medicineName: 'Omeprazole',
    brandName: 'Razole 20mg',
    strength: '20mg',
    packSize: '15 Capsules',
    manufacturer: 'Sun Pharma',
    supplierName: 'Sun Pharma Ltd',
    sku: 'SKU-RAZ-020',
    batchNo: 'B-5002',
    quantity: 22,
    mrp: 40.00,
    shelfLocation: 'E1-S2',
  },
];

const seedProducts = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get Organisation
    let orgRes = await client.query('SELECT id FROM organisations LIMIT 1;');
    let orgId;
    if (orgRes.rows.length > 0) {
      orgId = orgRes.rows[0].id;
    } else {
      let uRes = await client.query('SELECT id FROM users LIMIT 1;');
      let userId;
      if (uRes.rows.length > 0) {
        userId = uRes.rows[0].id;
      } else {
        const newU = await client.query(
          `INSERT INTO users (email, name, status) VALUES ($1, $2, $3) RETURNING id;`,
          ['dev@falah.local', 'Development User', 'ACTIVE']
        );
        userId = newU.rows[0].id;
      }

      const newOrg = await client.query(
        `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
        [userId, 'Falah Pharmacy - Development']
      );
      orgId = newOrg.rows[0].id;
    }

    // 2. Get Branch
    let bRes = await client.query('SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1;', [orgId]);
    let branchId;
    if (bRes.rows.length > 0) {
      branchId = bRes.rows[0].id;
    } else {
      const newB = await client.query(
        `INSERT INTO branches (organisation_id, name, address, city, state, postal_code, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
        [orgId, 'Main Branch', '12 Market Road', 'Delhi', 'Delhi', '110001', '9876543210']
      );
      branchId = newB.rows[0].id;
    }

    console.log(`Seeding products for Organisation: ${orgId}, Branch: ${branchId}`);

    for (const item of SEED_ITEMS) {
      // Upsert product
      let pRes = await client.query(
        `SELECT id FROM products WHERE organisation_id = $1 AND sku = $2;`,
        [orgId, item.sku]
      );
      let productId;
      if (pRes.rows.length > 0) {
        productId = pRes.rows[0].id;
        await client.query(
          `UPDATE products SET medicine_name = $1, brand_name = $2, strength = $3, pack_size = $4, manufacturer = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6;`,
          [item.medicineName, item.brandName, item.strength, item.packSize, item.manufacturer, productId]
        );
      } else {
        const newP = await client.query(
          `INSERT INTO products (organisation_id, medicine_name, brand_name, strength, pack_size, manufacturer, sku)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
          [orgId, item.medicineName, item.brandName, item.strength, item.packSize, item.manufacturer, item.sku]
        );
        productId = newP.rows[0].id;
      }

      // Upsert supplier
      let sRes = await client.query(
        `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2);`,
        [orgId, item.supplierName]
      );
      let supplierId;
      if (sRes.rows.length > 0) {
        supplierId = sRes.rows[0].id;
      } else {
        const newS = await client.query(
          `INSERT INTO suppliers (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
          [orgId, item.supplierName]
        );
        supplierId = newS.rows[0].id;
      }

      // Upsert inventory_batches
      let ibRes = await client.query(
        `SELECT id FROM inventory_batches WHERE product_id = $1 AND batch_number = $2;`,
        [productId, item.batchNo]
      );
      if (ibRes.rows.length > 0) {
        await client.query(
          `UPDATE inventory_batches SET supplier_id = $1, mrp = $2, quantity = $3, shelf_location = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5;`,
          [supplierId, item.mrp, item.quantity, item.shelfLocation, ibRes.rows[0].id]
        );
      } else {
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 2);
        await client.query(
          `INSERT INTO inventory_batches (product_id, branch_id, supplier_id, batch_number, expiry_date, mrp, quantity, shelf_location)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [productId, branchId, supplierId, item.batchNo, expiryDate.toISOString().split('T')[0], item.mrp, item.quantity, item.shelfLocation]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Product and Inventory Batch seeding completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed products:', error);
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedProducts().then(() => pool.end());
}

module.exports = { seedProducts };
