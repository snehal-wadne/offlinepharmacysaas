/**
 * Seed Suppliers into PostgreSQL Database
 * Cleans up invalid/dummy data and inserts clean supplier records with categories.
 */

const { pool } = require('./connection');

const CLEAN_SUPPLIERS = [
  {
    name: 'Sun Pharma Care',
    contactPerson: 'Rajesh Sharma',
    phone: '+91 98201 44512',
    email: 'orders@sunpharma.example.com',
    city: 'Mumbai, MH',
    gstin: '27AABCS1429B1Z1',
    status: 'ACTIVE',
    category: 'Medicines & Injections',
  },
  {
    name: 'Cipla Healthcare Ltd',
    contactPerson: 'Anjali Verma',
    phone: '+91 98450 11234',
    email: 'supply@cipla.example.com',
    city: 'Ahmedabad, GJ',
    gstin: '24AAACC4451C1Z8',
    status: 'ACTIVE',
    category: 'Generic Medicines',
  },
  {
    name: 'Abbott Laboratories',
    contactPerson: 'Vikram Mehta',
    phone: '+91 99100 88765',
    email: 'contact@abbott.example.com',
    city: 'New Delhi, DL',
    gstin: '07AABCA9981D1Z4',
    status: 'ACTIVE',
    category: 'Nutrition & Diagnostics',
  },
  {
    name: 'NutriLife Care',
    contactPerson: 'Priya Nair',
    phone: '+91 97411 33210',
    email: 'sales@nutrilife.example.com',
    city: 'Bengaluru, KA',
    gstin: '29AABCN3312E1Z2',
    status: 'ACTIVE',
    category: 'Supplements & Vitamins',
  },
  {
    name: 'GenSupply Dist.',
    contactPerson: 'Amit Patel',
    phone: '+91 98790 66543',
    email: 'info@gensupply.example.com',
    city: 'Surat, GJ',
    gstin: '24AABCG5541F1Z9',
    status: 'ACTIVE',
    category: 'Medical Consumables',
  },
  {
    name: 'GSK Pharmaceuticals',
    contactPerson: 'Ramesh Kumar',
    phone: '+91 98765 01234',
    email: 'contact@gsk.example.com',
    city: 'Delhi, DL',
    gstin: '07AABCG1234A1Z0',
    status: 'ACTIVE',
    category: 'Medicines & Injections',
  },
  {
    name: 'Micro Labs Ltd',
    contactPerson: 'Suresh Gupta',
    phone: '+91 98123 45678',
    email: 'info@microlabs.example.com',
    city: 'Bengaluru, KA',
    gstin: '29AABCM5678B1Z1',
    status: 'ACTIVE',
    category: 'Generic Medicines',
  },
  {
    name: 'Alkem Laboratories',
    contactPerson: 'Dinesh Singh',
    phone: '+91 98234 56789',
    email: 'sales@alkem.example.com',
    city: 'Mumbai, MH',
    gstin: '27AABCA2345C1Z2',
    status: 'ACTIVE',
    category: 'Medicines & Injections',
  },
  {
    name: 'Torrent Pharma Care',
    contactPerson: 'Ramesh Gupta',
    phone: '+91 98123 45678',
    email: 'contact@torrent.example.com',
    city: 'Ahmedabad, GJ',
    gstin: '24AABCT9988D1Z5',
    status: 'PENDING',
    category: 'Generic Medicines',
  },
  {
    name: 'Medico Distributors',
    contactPerson: 'Rajesh Kumar',
    phone: '+91 98765 01234',
    email: 'sales@medico.example.com',
    city: 'Delhi, DL',
    gstin: '07ABCDE1234F1Z5',
    status: 'ACTIVE',
    category: 'Nutrition & Diagnostics',
  },
];

const seedSuppliers = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure category column exists
    await client.query("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Medicines & Injections';");

    const orgRes = await client.query('SELECT id FROM organisations LIMIT 1;');
    if (orgRes.rows.length === 0) {
      console.log('No organisation found for supplier seeding.');
      return;
    }
    const orgId = orgRes.rows[0].id;

    // Delete dummy test suppliers with invalid/short names
    await client.query(
      `DELETE FROM suppliers
       WHERE organisation_id = $1
         AND (
           LOWER(name) IN ('more', 'vbc', 'sd,bfs', 'al gloa', 'suraj more')
           OR LENGTH(TRIM(name)) < 3
         )
         AND NOT EXISTS (SELECT 1 FROM purchases WHERE supplier_id = suppliers.id)
         AND NOT EXISTS (SELECT 1 FROM inventory_batches WHERE supplier_id = suppliers.id);`,
      [orgId]
    );

    // Upsert clean suppliers with category
    for (const sup of CLEAN_SUPPLIERS) {
      const sRes = await client.query(
        `SELECT id FROM suppliers WHERE organisation_id = $1 AND LOWER(name) = LOWER($2);`,
        [orgId, sup.name]
      );

      if (sRes.rows.length > 0) {
        await client.query(
          `UPDATE suppliers
           SET contact_person = COALESCE($1, contact_person),
               phone = COALESCE($2, phone),
               email = COALESCE($3, email),
               city = COALESCE($4, city),
               gstin = COALESCE($5, gstin),
               status = $6,
               category = $7,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8;`,
          [sup.contactPerson, sup.phone, sup.email, sup.city, sup.gstin, sup.status, sup.category, sRes.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO suppliers (organisation_id, name, contact_person, phone, email, city, gstin, status, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [orgId, sup.name, sup.contactPerson, sup.phone, sup.email, sup.city, sup.gstin, sup.status, sup.category]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Suppliers seeding with categories completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Supplier seed failed:', err);
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedSuppliers().then(() => pool.end());
}

module.exports = { seedSuppliers };
