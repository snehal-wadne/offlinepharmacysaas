/**
 * Customer Service
 *
 * Business logic for Customer / Patient operations.
 */

const { pool } = require('../db/connection');

const normalizeCustomerStatus = (s) => {
  if (!s) return 'ACTIVE';
  const upper = String(s).toUpperCase().trim();
  if (upper === 'OVERDUE') return 'OVERDUE';
  if (upper === 'INACTIVE') return 'INACTIVE';
  return 'ACTIVE';
};

const getCustomers = async ({ organisationId, search, category, limit = 100, offset = 0 }) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  let query = `
    SELECT
      id,
      organisation_id,
      customer_number AS "customerNumber",
      full_name AS "name",
      category,
      phone,
      email,
      age,
      gender,
      address,
      city,
      doctor_name AS "doctorName",
      doctor_specialty AS "doctorSpecialty",
      active_rx_no AS "activeRxNo",
      credit_limit AS "creditLimit",
      outstanding_balance AS "outstandingBalance",
      total_spent AS "totalSpent",
      loyalty_points AS "loyaltyPoints",
      status,
      created_at AS "createdAt"
    FROM customers
    WHERE organisation_id = $1
  `;

  const values = [organisationId];
  let paramIdx = 2;

  if (category && category !== 'All Customers' && category !== 'All Patients') {
    query += ` AND LOWER(category) = LOWER($${paramIdx})`;
    values.push(category);
    paramIdx++;
  }

  if (search) {
    query += ` AND (
      LOWER(full_name) LIKE LOWER($${paramIdx}) OR
      LOWER(customer_number) LIKE LOWER($${paramIdx}) OR
      LOWER(phone) LIKE LOWER($${paramIdx}) OR
      LOWER(doctor_name) LIKE LOWER($${paramIdx}) OR
      LOWER(city) LIKE LOWER($${paramIdx})
    )`;
    values.push(`%${search}%`);
    paramIdx++;
  }

  query += ` ORDER BY created_at DESC, id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1};`;
  values.push(limit, offset);

  const res = await pool.query(query, values);

  return res.rows.map((cust) => ({
    id: cust.id,
    customerNumber: cust.customerNumber || `CUST-${cust.id.slice(0, 4)}`,
    name: cust.name,
    category: cust.category || 'Regular',
    phone: cust.phone || 'N/A',
    email: cust.email || '',
    age: cust.age || 30,
    gender: cust.gender || 'F',
    ageGender: `${cust.age || 30} / ${cust.gender || 'F'}`,
    address: cust.address || 'Mumbai, MH',
    city: cust.city || 'Mumbai',
    doctorName: cust.doctorName || 'Dr. Farooq Siddiqui',
    doctorSpecialty: cust.doctorSpecialty || 'General Physician',
    activeRxNo: cust.activeRxNo || 'Rx-2026-1025',
    creditLimit: parseFloat(cust.creditLimit || 0),
    outstandingBalance: parseFloat(cust.outstandingBalance || 0),
    totalSpent: parseFloat(cust.totalSpent || 0),
    loyaltyPoints: parseInt(cust.loyaltyPoints || 0, 10),
    status: cust.status === 'OVERDUE' ? 'Overdue' : cust.status === 'INACTIVE' ? 'Inactive' : 'Active',
  }));
};

const getCustomersSummary = async (organisationId) => {
  if (!organisationId) {
    throw new Error('organisationId is required');
  }

  const res = await pool.query(
    `SELECT
       COUNT(*) AS "totalCustomers",
       COUNT(CASE WHEN LOWER(category) = 'chronic care' THEN 1 END) AS "chronicCarePatients",
       COUNT(CASE WHEN credit_limit > 0 OR outstanding_balance > 0 THEN 1 END) AS "activeCreditAccounts",
       COALESCE(SUM(outstanding_balance), 0) AS "totalOutstanding",
       COALESCE(SUM(loyalty_points), 0) AS "loyaltyPointsPool"
     FROM customers
     WHERE organisation_id = $1;`,
    [organisationId]
  );

  const row = res.rows[0] || {};
  return {
    totalCustomers: Number(row.totalCustomers || 0),
    chronicCarePatients: Number(row.chronicCarePatients || 0),
    activeCreditAccounts: Number(row.activeCreditAccounts || 0),
    totalOutstanding: parseFloat(row.totalOutstanding || 0),
    loyaltyPointsPool: Number(row.loyaltyPointsPool || 0),
  };
};

const createCustomer = async (customerData) => {
  const {
    organisationId,
    name,
    category = 'Regular',
    phone = '',
    email = '',
    age = 30,
    gender = 'F',
    address = 'Mumbai, MH',
    city = 'Mumbai',
    doctorName = 'Dr. Farooq Siddiqui',
    doctorSpecialty = 'General Physician',
    activeRxNo = 'Rx-2026-1025',
    creditLimit = 0.00,
    outstandingBalance = 0.00,
    status = 'ACTIVE',
  } = customerData;

  if (!organisationId || !name) {
    throw new Error('organisationId and name are required');
  }

  // Count existing to generate customer number
  const countRes = await pool.query('SELECT COUNT(*) FROM customers WHERE organisation_id = $1;', [organisationId]);
  const seqNum = parseInt(countRes.rows[0].count, 10) + 1040;
  const customerNumber = `CUST-${seqNum}`;

  const res = await pool.query(
    `INSERT INTO customers (
       organisation_id, customer_number, full_name, category, phone, email,
       age, gender, address, city, doctor_name, doctor_specialty, active_rx_no,
       credit_limit, outstanding_balance, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *;`,
    [
      organisationId,
      customerNumber,
      name.trim(),
      category || 'Regular',
      phone.trim() || '+91 98000 00000',
      email.trim() || `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
      parseInt(age, 10) || 30,
      gender || 'F',
      address || 'Mumbai, MH',
      city || 'Mumbai',
      doctorName || 'Dr. Farooq Siddiqui',
      doctorSpecialty || 'General Physician',
      activeRxNo || `Rx-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      parseFloat(creditLimit) || 0.00,
      parseFloat(outstandingBalance) || 0.00,
      normalizeCustomerStatus(status),
    ]
  );

  return res.rows[0];
};

const updateCustomer = async (organisationId, customerId, updateData) => {
  if (!organisationId || !customerId) {
    throw new Error('organisationId and customerId are required');
  }

  const {
    name,
    category,
    phone,
    email,
    age,
    gender,
    doctorName,
    doctorSpecialty,
    activeRxNo,
    creditLimit,
    outstandingBalance,
    status,
  } = updateData;

  const res = await pool.query(
    `UPDATE customers
     SET full_name = COALESCE($1, full_name),
         category = COALESCE($2, category),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         age = COALESCE($5, age),
         gender = COALESCE($6, gender),
         doctor_name = COALESCE($7, doctor_name),
         doctor_specialty = COALESCE($8, doctor_specialty),
         active_rx_no = COALESCE($9, active_rx_no),
         credit_limit = COALESCE($10, credit_limit),
         outstanding_balance = COALESCE($11, outstanding_balance),
         status = COALESCE($12, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE (id::text = $13 OR customer_number = $13 OR LOWER(full_name) = LOWER($13))
       AND organisation_id = $14
     RETURNING *;`,
    [
      name,
      category,
      phone,
      email,
      age ? parseInt(age, 10) : null,
      gender,
      doctorName,
      doctorSpecialty,
      activeRxNo,
      creditLimit !== undefined ? parseFloat(creditLimit) : null,
      outstandingBalance !== undefined ? parseFloat(outstandingBalance) : null,
      status ? normalizeCustomerStatus(status) : null,
      customerId,
      organisationId,
    ]
  );

  if (res.rows.length === 0) {
    const err = new Error(`Customer ${customerId} not found`);
    err.statusCode = 404;
    throw err;
  }

  return res.rows[0];
};

const deleteCustomer = async (organisationId, customerId) => {
  if (!organisationId || !customerId) {
    throw new Error('organisationId and customerId are required');
  }

  const res = await pool.query(
    `DELETE FROM customers
     WHERE (id::text = $1 OR customer_number = $1 OR LOWER(full_name) = LOWER($1))
       AND organisation_id = $2
     RETURNING id;`,
    [customerId, organisationId]
  );

  return res.rowCount > 0;
};

module.exports = {
  getCustomers,
  getCustomersSummary,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
