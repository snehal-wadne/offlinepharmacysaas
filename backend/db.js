/**
 * DATABASE INITIALIZATION & CONNECTION MODULE
 * 
 * Purpose:
 * This module connects to the local PostgreSQL database server, verifies/recreates 
 * the target database, executes the SQL schema definition to create the user/authentication 
 * tables, and seeds the initial tenant organization, branch, roles, and default administrator user.
 */

const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt'); // Used for secure password hashing and encryption
require('dotenv').config(); // Loads environment variables from the backend/.env file

// Retrieve configurations from environment variables
const dbName = process.env.DB_DATABASE || 'falah_pharmacy';
const saltRounds = 10; // Number of hashing rounds for bcrypt password encryption

// Shared connection pool instance (lazy-loaded after the database has been created)
let pool;

/**
 * Lazily instantiates and returns a connection pool for the falah_pharmacy database.
 * We use connection pooling (pg.Pool) for handling multi-user Express requests efficiently.
 */
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      database: dbName,
      port: parseInt(process.env.DB_PORT || '5432'),
    });
  }
  return pool;
};

/**
 * Main database setup routine. Runs synchronously on backend server start.
 * Accomplishes:
 *  1. Connecting to the administrative "postgres" DB.
 *  2. Terminating existing stale connections to falah_pharmacy.
 *  3. Dropping and recreating the database falah_pharmacy (to ensure clean tables).
 *  4. Loading and executing schema.sql.
 *  5. Generating salt and hashing the admin password before seeding records in a SQL transaction.
 */
const initDb = async () => {
  // 1. CONNECT TO ADMIn DB (postgres)
  // We must connect to the default 'postgres' database first because we cannot 
  // drop or create the target database 'falah_pharmacy' while connected directly to it.
  const adminClient = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    database: 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
  });

  try {
    await adminClient.connect();
    
    // TERMINATE OPEN STALE SESSIONS
    // PostgreSQL prevents dropping a database if active client sessions (like pgAdmin or old node processes)
    // are connected. This query forcefully terminates all other backend connection processes for this DB.
    console.log(`Terminating active connections to "${dbName}"...`);
    await adminClient.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);

    // DROP AND CREATE DATABASE
    // Recreate the database from scratch to clean up any leftover tables or old testing schemas.
    console.log(`Recreating database "${dbName}"...`);
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminClient.query(`CREATE DATABASE ${dbName}`);
    console.log(`Database "${dbName}" recreated successfully.`);
  } catch (err) {
    console.error('Error recreating database:', err);
    throw err;
  } finally {
    // Make sure we release the connection to the admin db
    await adminClient.end();
  }

  // 2. CONNECT TO NEW TARGET DATABASE & EXECUTE SCHEMA
  // Now we connect to our newly created 'falah_pharmacy' database and read the schema file.
  const activePool = getPool();
  const client = await activePool.connect();
  try {
    console.log(`Loading user-only database tables from schema.sql into "${dbName}"...`);
    // Read the database structure instructions from backend/schema.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    // Execute SQL queries to create tables: organizations, branches, users, roles, memberships, etc.
    await client.query(schemaSql);
    console.log('User and authentication tables loaded successfully.');

    // 3. SECURE SEEDING OF SYSTEM DATA
    // We check if the users table is empty. If it is, we seed default configurations and the admin user.
    const userCountRes = await client.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(userCountRes.rows[0].count);
    
    if (userCount === 0) {
      console.log('Encrypting default password and seeding system data...');
      
      // PASSWORD ENCRYPTION
      // Hash the plain text password 'more#78548' using bcrypt.
      // This saves a randomized hash representation in the DB rather than plain text for security.
      const hashedPassword = await bcrypt.hash('more#78548', saltRounds);
      
      // SQL TRANSACTION BEGIN
      // We wrap the seeding operations in a transaction (BEGIN / COMMIT) to ensure 
      // they either all succeed or fail cleanly (Atomicity).
      await client.query('BEGIN');
      
      // A. Create default Tenant Organization
      const orgRes = await client.query(
        "INSERT INTO organizations (name) VALUES ('Falah Pharmacy Org') RETURNING id"
      );
      const orgId = orgRes.rows[0].id;
      
      // B. Create default Branch under the organization
      const branchRes = await client.query(
        "INSERT INTO branches (organization_id, name, code) VALUES ($1, 'Main Branch', 'MAIN') RETURNING id",
        [orgId]
      );
      const branchId = branchRes.rows[0].id;
      
      // C. Create default Admin User (saving the hashed password string)
      const userRes = await client.query(
        "INSERT INTO users (email, phone, display_name, password) VALUES ('root@falah.com', 'root', 'root', $1) RETURNING id",
        [hashedPassword]
      );
      const userId = userRes.rows[0].id;
      
      // D. Create default Admin role
      const roleRes = await client.query(
        "INSERT INTO roles (organization_id, name, description, is_system_role) VALUES ($1, 'Admin', 'System Administrator', true) RETURNING id",
        [orgId]
      );
      const roleId = roleRes.rows[0].id;
      
      // E. Link user to organization and role (Membership)
      const membershipRes = await client.query(
        "INSERT INTO memberships (organization_id, user_id, role_id, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [orgId, userId, roleId]
      );
      const membershipId = membershipRes.rows[0].id;
      
      // F. Grant access to User for the Main Branch
      await client.query(
        "INSERT INTO user_branch_access (membership_id, branch_id) VALUES ($1, $2)",
        [membershipId, branchId]
      );
      
      // SQL TRANSACTION COMMIT
      await client.query('COMMIT');
      console.log('Database seeding complete. Default Admin Credential: root / more#78548 (password encrypted with bcrypt)');
    }
  } catch (err) {
    // If any database operation fails, rollback all changes made during the transaction
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error initializing tables and seeding database:', err);
    throw err;
  } finally {
    // Release the client connection back to the pool
    client.release();
  }
};

module.exports = {
  get pool() {
    return getPool();
  },
  initDb,
};
