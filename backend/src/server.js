/**
 * BACKEND SERVER ENTRY POINT
 *
 * Purpose:
 * Starts the Express API server, configures application middleware,
 * verifies the PostgreSQL connection, and registers API routes.
 *
 * Database structure is maintained separately in schema.sql.
 * Database connectivity is handled by db/connection.js.
 * Business logic and database queries will be handled by the
 * service and repository layers respectively.
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { pool } = require("./db/connection");

const app = express();
const PORT = Number(process.env.PORT || 5000);

/**
 * ------------------------------------------------------------
 * MIDDLEWARE
 * ------------------------------------------------------------
 */

/*
 * Allow requests from the frontend application.
 *
 * During development, the Expo web application normally runs
 * on a different port from the backend API, so CORS is required.
 */
app.use(cors());

/*
 * Parse incoming JSON request bodies.
 *
 * After this middleware, JSON request data is available through
 * req.body.
 */
app.use(express.json());

/**
 * ------------------------------------------------------------
 * HEALTH CHECK
 * ------------------------------------------------------------
 */

/**
 * GET /health
 *
 * Basic application health check.
 *
 * This confirms that the Express server is running.
 * It does not verify database connectivity.
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
  });
});

/**
 * ------------------------------------------------------------
 * DATABASE HEALTH CHECK
 * ------------------------------------------------------------
 */

/**
 * GET /health/db
 *
 * Checks whether the backend can currently communicate with
 * PostgreSQL.
 *
 * This is useful during development and can also be used by
 * deployment infrastructure for database connectivity checks.
 */
app.get("/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "OK",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      status: "ERROR",
      database: "unavailable",
    });
  }
});

const purchaseRoutes = require('./routes/purchase.routes');
const goodsReceiptRoutes = require('./routes/goods-receipt.routes');
const supplierRoutes = require('./routes/supplier.routes');
const inventoryRoutes = require('./routes/inventory.routes');

app.use('/api/purchases', purchaseRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);




/**
 * ------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------
 *
 * Verify the database connection before accepting API traffic.
 *
 * If PostgreSQL is unavailable, the backend should fail to
 * start rather than running in a partially working state.
 */
const startServer = async () => {
  try {
    await pool.query("SELECT 1");

    console.log("PostgreSQL connection successful.");
    console.log(`Database: ${process.env.DB_DATABASE}`);

    app.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to PostgreSQL.");
    console.error(error);

    /*
     * Do not start the API when the database is unavailable.
     * Most of the application's functionality depends on it.
     */
    process.exit(1);
  }
};

startServer();
