const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function listUsers() {
  try {
    const res = await pool.query('SELECT id, email, phone, display_name, password, is_active FROM users;');
    console.log('\n====================== USERS DATABASE TABLE ======================');
    console.table(res.rows);
    console.log('==================================================================\n');
    await pool.end();
  } catch (err) {
    console.error('Error fetching users from database:', err.message);
  }
}

listUsers();
