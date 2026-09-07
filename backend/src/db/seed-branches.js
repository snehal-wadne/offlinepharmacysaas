/**
 * Seed FIT Pharmacy Network Branches into PostgreSQL Database
 * 
 * Purpose:
 * Creates or updates all 5 FIT Pharmacy network branches in the database:
 * 1. FIT Main Campus Hospital Pharmacy
 * 2. FIT Pune City OPD Pharmacy
 * 3. FIT Central Medical Warehouse
 * 4. FIT Student Health Center Dispensary
 * 5. FIT Kothrud Specialty Clinic Pharmacy
 */

const { pool } = require('./connection');

const FIT_BRANCHES = [
  {
    name: 'FIT Main Campus Hospital Pharmacy',
    address: 'Flora Institute of Technology Campus, Khopi, Near Khed-Shivapur Toll Plaza',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '412205',
    phone: '+91 98220 11450',
    status: 'ACTIVE',
  },
  {
    name: 'FIT Pune City OPD Pharmacy',
    address: 'Ground Floor, Flora Medical Complex, FC Road, Shivajinagar',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411005',
    phone: '+91 98224 88310',
    status: 'ACTIVE',
  },
  {
    name: 'FIT Central Medical Warehouse',
    address: 'Plot 45, MIDC Industrial Area, Hadapsar',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411028',
    phone: '+91 94223 55901',
    status: 'ACTIVE',
  },
  {
    name: 'FIT Student Health Center Dispensary',
    address: 'Block B, Flora Institute Hostel & Wellness Wing',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '412205',
    phone: '+91 98229 33211',
    status: 'ACTIVE',
  },
  {
    name: 'FIT Kothrud Specialty Clinic Pharmacy',
    address: 'Shop 12, Paud Road, Near Vanaz Metro Station, Kothrud',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411038',
    phone: '+91 98221 77490',
    status: 'INACTIVE',
  },
];

const seedBranches = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get or create development user
    let userResult = await client.query(`SELECT id FROM users WHERE email = $1;`, ['dev@falah.local']);
    let userId;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      userResult = await client.query(
        `INSERT INTO users (email, password_hash, name, status)
         VALUES ($1, $2, $3, $4) RETURNING id;`,
        ['dev@falah.local', 'development-only-password-hash', 'Development User', 'ACTIVE']
      );
      userId = userResult.rows[0].id;
    }

    // 2. Get or create development organisation
    let orgResult = await client.query(
      `SELECT id FROM organisations WHERE owner_id = $1 AND name = $2 LIMIT 1;`,
      [userId, 'Falah Pharmacy - Development']
    );
    let orgId;
    if (orgResult.rows.length > 0) {
      orgId = orgResult.rows[0].id;
    } else {
      orgResult = await client.query(
        `INSERT INTO organisations (owner_id, name) VALUES ($1, $2) RETURNING id;`,
        [userId, 'Falah Pharmacy - Development']
      );
      orgId = orgResult.rows[0].id;
    }

    console.log(`Seeding branches for Organisation ID: ${orgId}`);

    const seededBranches = [];

    // 3. Upsert each branch
    for (const b of FIT_BRANCHES) {
      const res = await client.query(
        `INSERT INTO branches (organisation_id, name, address, city, state, postal_code, phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (organisation_id, name)
         DO UPDATE SET
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           postal_code = EXCLUDED.postal_code,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, name, city, phone, status;`,
        [orgId, b.name, b.address, b.city, b.state, b.postalCode, b.phone, b.status]
      );
      seededBranches.push(res.rows[0]);
      console.log(`✓ Seeded branch: ${res.rows[0].name} (ID: ${res.rows[0].id}, Status: ${res.rows[0].status})`);
    }

    await client.query('COMMIT');
    console.log('\nBranch seeding completed successfully!');
    return seededBranches;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed branches:', error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedBranches()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedBranches };
