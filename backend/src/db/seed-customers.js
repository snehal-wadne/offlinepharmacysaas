/**
 * Seed script for Customers table
 */

const { pool } = require('./connection');

const seedCustomers = async (targetPool = pool) => {
  console.log('📦 Ensuring customers table schema exists...');

  // Create table if not exists
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL,
      customer_number VARCHAR(50) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      category VARCHAR(50) DEFAULT 'Regular',
      phone VARCHAR(50),
      email VARCHAR(255),
      age INT DEFAULT 30,
      gender VARCHAR(10) DEFAULT 'F',
      address TEXT DEFAULT 'Mumbai, MH',
      city VARCHAR(100) DEFAULT 'Mumbai',
      doctor_name VARCHAR(255) DEFAULT 'Dr. Farooq Siddiqui',
      doctor_specialty VARCHAR(255) DEFAULT 'General Physician',
      active_rx_no VARCHAR(100) DEFAULT 'Rx-2026-1025',
      credit_limit NUMERIC(12, 2) DEFAULT 0.00,
      outstanding_balance NUMERIC(12, 2) DEFAULT 0.00,
      total_spent NUMERIC(12, 2) DEFAULT 0.00,
      loyalty_points INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get active organisation ID
  const orgRes = await targetPool.query('SELECT id FROM organisations LIMIT 1;');
  const orgId = orgRes.rows[0]?.id || 'c206390c-2dae-41e5-a698-bf8259a73912';

  // Check if customers table has data
  const countRes = await targetPool.query('SELECT COUNT(*) FROM customers;');
  if (parseInt(countRes.rows[0].count, 10) > 0) {
    console.log(`✓ Customers table already has ${countRes.rows[0].count} records.`);
    return;
  }

  console.log('🌱 Seeding initial customer records matching design mock...');

  const initialCustomers = [
    {
      customer_number: 'CUST-1040',
      full_name: 'Ayesha Khan',
      category: 'Regular',
      phone: '98765 43210',
      email: 'ayesha.khan@example.com',
      age: 32,
      gender: 'F',
      doctor_name: 'Dr. Farooq Siddiqui',
      doctor_specialty: 'General Physician',
      active_rx_no: 'Rx-2026-1025',
      credit_limit: 2000.00,
      outstanding_balance: 250.00,
      total_spent: 18450.00,
      loyalty_points: 340,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1041',
      full_name: 'Rajesh Verma',
      category: 'Chronic Care',
      phone: '+91 98201 44521',
      email: 'rajesh.verma@example.com',
      age: 54,
      gender: 'M',
      doctor_name: 'Dr. Amitabh Sharma',
      doctor_specialty: 'Cardiologist',
      active_rx_no: 'Rx-2026-0841',
      credit_limit: 25000.00,
      outstanding_balance: 3450.00,
      total_spent: 42300.00,
      loyalty_points: 850,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1042',
      full_name: 'Sunita Mehra',
      category: 'Senior Citizen',
      phone: '+91 98112 39012',
      email: 'sunita.mehra@example.com',
      age: 68,
      gender: 'F',
      doctor_name: 'Dr. Priya Nambiar',
      doctor_specialty: 'Orthopedic',
      active_rx_no: 'Rx-2026-0799',
      credit_limit: 15000.00,
      outstanding_balance: 1850.00,
      total_spent: 29100.00,
      loyalty_points: 520,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1043',
      full_name: 'Anil Deshmukh',
      category: 'Regular',
      phone: '+91 97654 11209',
      email: 'anil.deshmukh@example.com',
      age: 42,
      gender: 'M',
      doctor_name: 'Dr. S. K. Kulkarni',
      doctor_specialty: 'General Physician',
      active_rx_no: 'Rx-2026-0912',
      credit_limit: 0.00,
      outstanding_balance: 0.00,
      total_spent: 8400.00,
      loyalty_points: 110,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1044',
      full_name: 'Meera Iyer',
      category: 'VIP',
      phone: '+91 99308 77610',
      email: 'meera.iyer@example.com',
      age: 36,
      gender: 'F',
      doctor_name: 'Dr. Farhan Merchant',
      doctor_specialty: 'Pediatrician / Family Care',
      active_rx_no: 'Rx-2026-0880',
      credit_limit: 50000.00,
      outstanding_balance: 8920.00,
      total_spent: 67800.00,
      loyalty_points: 1420,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1045',
      full_name: 'Vikramaditya Roy',
      category: 'Chronic Care',
      phone: '+91 98450 88219',
      email: 'vikram.roy@example.com',
      age: 61,
      gender: 'M',
      doctor_name: 'Dr. Amitabh Sharma',
      doctor_specialty: 'Cardiologist',
      active_rx_no: 'Rx-2026-0610',
      credit_limit: 30000.00,
      outstanding_balance: 14600.00,
      total_spent: 51200.00,
      loyalty_points: 980,
      status: 'OVERDUE',
    },
    {
      customer_number: 'CUST-1046',
      full_name: 'Pooja Agarwal',
      category: 'Regular',
      phone: '+91 97110 54321',
      email: 'pooja.agarwal@example.com',
      age: 29,
      gender: 'F',
      doctor_name: 'Dr. Rashmi Sen',
      doctor_specialty: 'Dermatologist',
      active_rx_no: 'Rx-2026-0925',
      credit_limit: 0.00,
      outstanding_balance: 0.00,
      total_spent: 12150.00,
      loyalty_points: 260,
      status: 'ACTIVE',
    },
    {
      customer_number: 'CUST-1047',
      full_name: 'Gopal Krishna Pillai',
      category: 'Senior Citizen',
      phone: '+91 94470 65120',
      email: 'gopal.pillai@example.com',
      age: 72,
      gender: 'M',
      doctor_name: 'Dr. Anand Joshi',
      doctor_specialty: 'Pulmonologist',
      active_rx_no: 'Rx-2026-0740',
      credit_limit: 20000.00,
      outstanding_balance: 5200.00,
      total_spent: 38600.00,
      loyalty_points: 740,
      status: 'ACTIVE',
    },
  ];

  for (const c of initialCustomers) {
    await targetPool.query(
      `INSERT INTO customers (
        organisation_id, customer_number, full_name, category, phone, email, age, gender,
        doctor_name, doctor_specialty, active_rx_no, credit_limit, outstanding_balance,
        total_spent, loyalty_points, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        orgId, c.customer_number, c.full_name, c.category, c.phone, c.email, c.age, c.gender,
        c.doctor_name, c.doctor_specialty, c.active_rx_no, c.credit_limit, c.outstanding_balance,
        c.total_spent, c.loyalty_points, c.status
      ]
    );
  }

  console.log(`✓ Seeded ${initialCustomers.length} initial customer records.`);
};

if (require.main === module) {
  seedCustomers()
    .then(() => {
      console.log('Customer seeding finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Customer seeding error:', err);
      process.exit(1);
    });
}

module.exports = { seedCustomers };
