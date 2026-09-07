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
const { Client } = require("pg");
require("dotenv").config();
const { pool } = require("./connection");

const ensureDatabaseExists = async () => {
  const targetDb = process.env.DB_DATABASE || "falah_pharmacy";
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });

  try {
    await client.connect();
    const res = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );
    if (res.rowCount === 0) {
      console.log(`Database "${targetDb}" does not exist. Creating it...`);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`Database "${targetDb}" created successfully.`);
    } else {
      console.log(`Database "${targetDb}" found.`);
    }
  } catch (err) {
    console.warn(`Database check/create note: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
};

const runSchema = async () => {
  await ensureDatabaseExists();

  const schemaPath = path.join(__dirname, "schema.sql");

  try {
    console.log("Reading database schema from schema.sql...");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    console.log("Executing schema.sql on PostgreSQL database...");
    await pool.query(schemaSql);

    // Ensure category column exists on suppliers even if table was created previously
    await pool.query("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Medicines & Injections';");

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
