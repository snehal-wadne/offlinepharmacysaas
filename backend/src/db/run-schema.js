/**
 * Database Schema Runner
 *
 * Purpose:
 * Executes schema.sql against the configured PostgreSQL database.
 *
 * This script is intended for local development while the
 * database schema is being established. It is NOT called
 * automatically when the backend server starts.
 */

const fs = require("fs");
const path = require("path");
const { pool } = require("./connection");

const runSchema = async () => {
  const schemaPath = path.join(__dirname, "schema.sql");

  try {
    console.log("Reading database schema from schema.sql...");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("Executing schema.sql on PostgreSQL database...");
    await pool.query(schemaSql);

    console.log("Database schema created successfully.");
  } catch (error) {
    console.error("Failed to create database schema.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runSchema();
