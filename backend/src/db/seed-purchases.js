/**
 * Seed Purchases and Purchase Items into PostgreSQL Database
 */

const { pool } = require('./connection');

const SEED_POS = [
  {
    poNumber: 'PO-1025',
    supplierName: 'Sun Pharma Care',
    orderDate: '2026-08-29',
    expectedDate: '2026-09-02',
    branchName: 'Main Branch',
    status: 'PENDING',
    items: [
      { medicineName: 'Paracetamol', brandName: 'Crocin 500', qty: 5, unitCost: 2490.00 },
    ],
  },
  {
    poNumber: 'PO-1024',
    supplierName: 'Cipla Healthcare',
    orderDate: '2026-08-28',
    expectedDate: '2026-08-31',
    branchName: 'Downtown Branch',
    status: 'RECEIVED',
    items: [
      { medicineName: 'Cetirizine', brandName: 'Cetcip 10mg', qty: 3, unitCost: 2733.33 },
    ],
  },
  {
    poNumber: 'PO-1023',
    supplierName: 'Abbott Laboratories',
    orderDate: '2026-08-27',
    expectedDate: '2026-09-01',
    branchName: 'Main Branch',
    status: 'PENDING',
    items: [
      { medicineName: 'Ibuprofen', brandName: 'Brufen 400', qty: 8, unitCost: 1975.00 },
    ],
  },
  {
    poNumber: 'PO-1022',
    supplierName: 'GenSupply Dist.',
    orderDate: '2026-08-25',
    expectedDate: '2026-08-28',
    branchName: 'East Clinic',
    status: 'RECEIVED',
    items: [
      { medicineName: 'Omeprazole', brandName: 'Omez 20mg', qty: 2, unitCost: 3200.00 },
    ],
  },
  {
    poNumber: 'PO-1021',
    supplierName: 'PharmaCo Ltd',
    orderDate: '2026-08-24',
    expectedDate: '2026-08-27',
    branchName: 'Downtown Branch',
    status: 'APPROVED',
    items: [
      { medicineName: 'Amoxicillin', brandName: 'Amoxil 500', qty: 4, unitCost: 2450.00 },
    ],
  },
  {
    poNumber: 'PO-1020',
    supplierName: 'MedLife Distribution',
    orderDate: '2026-08-22',
    expectedDate: '2026-08-25',
    branchName: 'Main Branch',
    status: 'RECEIVED',
    items: [
      { medicineName: 'Paracetamol', brandName: 'Dolo 650', qty: 6, unitCost: 3033.33 },
    ],
  },
  {
    poNumber: 'PO-1019',
    supplierName: 'Sun Pharma Care',
    orderDate: '2026-08-20',
    expectedDate: '2026-08-23',
    branchName: 'Main Branch',
    status: 'CANCELLED',
    items: [
      { medicineName: 'Omeprazole', brandName: 'Razole 20mg', qty: 4, unitCost: 3625.00 },
    ],
  },
  {
    poNumber: 'PO-1018',
    supplierName: 'GSK Pharmaceuticals',
    orderDate: '2026-08-18',
    expectedDate: '2026-08-21',
    branchName: 'Main Branch',
    status: 'CANCELLED',
    items: [
      { medicineName: 'Paracetamol', brandName: 'Calpol 500', qty: 10, unitCost: 2210.00 },
    ],
  },
];

const seedPurchases = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get Organisation
    let orgRes = await client.query('SELECT id FROM organisations LIMIT 1;');
    if (orgRes.rows.length === 0) {
      console.log('No organisation found, aborting purchase seed.');
      return;
    }
    const orgId = orgRes.rows[0].id;

    for (const po of SEED_POS) {
      // Resolve Supplier
      let sRes = await client.query(
        `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2);`,
        [orgId, po.supplierName]
      );
      let supplierId;
      if (sRes.rows.length > 0) {
        supplierId = sRes.rows[0].id;
      } else {
        const newS = await client.query(
          `INSERT INTO suppliers (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
          [orgId, po.supplierName]
        );
        supplierId = newS.rows[0].id;
      }

      // Resolve Branch
      let bRes = await client.query(
        `SELECT id FROM branches WHERE organisation_id = $1 AND LOWER(name) = LOWER($2);`,
        [orgId, po.branchName]
      );
      let branchId;
      if (bRes.rows.length > 0) {
        branchId = bRes.rows[0].id;
      } else {
        const newB = await client.query(
          `INSERT INTO branches (organisation_id, name) VALUES ($1, $2) RETURNING id;`,
          [orgId, po.branchName]
        );
        branchId = newB.rows[0].id;
      }

      // Check existing purchase
      let pRes = await client.query(
        `SELECT id FROM purchases WHERE organisation_id = $1 AND purchase_number = $2;`,
        [orgId, po.poNumber]
      );
      let purchaseId;
      if (pRes.rows.length > 0) {
        purchaseId = pRes.rows[0].id;
        await client.query(
          `UPDATE purchases SET supplier_id = $1, branch_id = $2, order_date = $3, expected_date = $4, status = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6;`,
          [supplierId, branchId, po.orderDate, po.expectedDate, po.status, purchaseId]
        );
      } else {
        const newP = await client.query(
          `INSERT INTO purchases (organisation_id, purchase_number, supplier_id, branch_id, order_date, expected_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
          [orgId, po.poNumber, supplierId, branchId, po.orderDate, po.expectedDate, po.status]
        );
        purchaseId = newP.rows[0].id;
      }

      // Insert purchase items
      for (const item of po.items) {
        let prRes = await client.query(
          `SELECT id FROM products WHERE organisation_id = $1 AND (LOWER(brand_name) = LOWER($2) OR LOWER(medicine_name) = LOWER($3)) LIMIT 1;`,
          [orgId, item.brandName, item.medicineName]
        );
        let productId;
        if (prRes.rows.length > 0) {
          productId = prRes.rows[0].id;
        } else {
          const newPr = await client.query(
            `INSERT INTO products (organisation_id, medicine_name, brand_name, sku) VALUES ($1, $2, $3, $4) RETURNING id;`,
            [orgId, item.medicineName, item.brandName, `SKU-${Date.now()}`]
          );
          productId = newPr.rows[0].id;
        }

        let piRes = await client.query(
          `SELECT id FROM purchase_items WHERE purchase_id = $1 AND product_id = $2;`,
          [purchaseId, productId]
        );
        if (piRes.rows.length > 0) {
          await client.query(
            `UPDATE purchase_items SET ordered_quantity = $1, unit_cost = $2 WHERE id = $3;`,
            [item.qty, item.unitCost, piRes.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO purchase_items (purchase_id, product_id, ordered_quantity, unit_cost) VALUES ($1, $2, $3, $4);`,
            [purchaseId, productId, item.qty, item.unitCost]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('Purchase orders seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed purchases:', err);
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedPurchases().then(() => pool.end());
}

module.exports = { seedPurchases };
