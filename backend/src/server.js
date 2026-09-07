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
const { autoInitDatabase } = require("./db/auto-init");
const { connectRedis, disconnectRedis } = require("./cache/redis");

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
const branchRoutes = require('./routes/branch.routes');

app.use('/api/purchases', purchaseRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/branches', branchRoutes);




/**
 * ------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------
 *
 * Verify all required infrastructure before accepting API
 * traffic.
 *
 * PostgreSQL is the application's authoritative database.
 * Redis is used as the server-side cache.
 *
 * The API should not start if either required dependency
 * cannot be initialized successfully.
 */
const startServer = async () => {
  try {
    // --------------------------------------------------------
    // 0. Auto-initialize Database & Schema if required
    // --------------------------------------------------------
    await autoInitDatabase();

    // --------------------------------------------------------
    // 1. Verify PostgreSQL
    // --------------------------------------------------------
    //
    // Run a lightweight query to make sure the database is
    // reachable before the server starts accepting requests.
    //
    await pool.query("SELECT 1");

    console.log("PostgreSQL connection successful.");
    console.log(`Database: ${process.env.DB_DATABASE}`);

    // --------------------------------------------------------
    // 2. Connect to Redis
    // --------------------------------------------------------
    //
    // Redis is our server-side cache. PostgreSQL remains the
    // source of truth, but the application needs Redis
    // available before we begin handling API traffic.
    //
    await connectRedis();

    // --------------------------------------------------------
    // 3. Start the HTTP server
    // --------------------------------------------------------
    //
    // Only start accepting API requests after both
    // PostgreSQL and Redis are ready.
    //
    app.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed.");
    console.error(error);

    /**
     * Redis may already be connected if PostgreSQL succeeded
     * but a later startup step failed.
     *
     * disconnectRedis() safely does nothing when Redis is
     * already disconnected.
     */
    await disconnectRedis();

    /**
     * Do not start the API in a partially working state.
     *
     * The process manager/development environment can restart
     * the backend after the underlying problem is fixed.
     */
    process.exit(1);
  }
};

startServer();
