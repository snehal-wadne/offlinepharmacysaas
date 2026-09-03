/**
 * PostgreSQL Database Connection
 *
 * Purpose:
 * This module creates and manages the PostgreSQL connection pool
 * used by the backend application.
 *
 * Other parts of the application, such as repositories, should
 * use this module instead of creating their own PostgreSQL
 * connections.
 *
 * Database structure is maintained separately in schema.sql.
 */

const { Pool } = require("pg");
require("dotenv").config();

/**
 * PostgreSQL connection configuration.
 *
 * Values are read from environment variables so database
 * credentials are not hard-coded in the source code.
 */
const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

/**
 * Shared PostgreSQL connection pool.
 *
 * The pool maintains reusable database connections so that
 * multiple backend requests can access PostgreSQL efficiently.
 */
const pool = new Pool(dbConfig);

/**
 * Handle unexpected errors on idle connections in the pool.
 */
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

/**
 * Test the PostgreSQL connection.
 *
 * This function is useful during application startup or
 * development testing. It does not modify database data.
 */
const testConnection = async () => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                NOW() AS current_time;
        `);

    console.log("PostgreSQL connection successful.");
    console.log(`Database: ${result.rows[0].database_name}`);
    console.log(`User: ${result.rows[0].database_user}`);
    console.log(`Server time: ${result.rows[0].current_time}`);
  } finally {
    /*
     * Return the connection to the pool.
     * We do not close it here because the pool is shared
     * by the application.
     */
    client.release();
  }
};

module.exports = {
  pool,
  testConnection,
};
