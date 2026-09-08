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

const { pool, testConnection, isDbOnline, getDbStatus } = require("./db/connection");
const { connectRedis, disconnectRedis } = require("./cache/redis");
const localStore = require("./db/localStore");

const app = express();
const PORT = Number(process.env.PORT || 5000);

/**
 * ------------------------------------------------------------
 * MIDDLEWARE
 * ------------------------------------------------------------
 */
app.use(cors());
app.use(express.json());

/**
 * ------------------------------------------------------------
 * HEALTH & CONNECTIVITY CHECKS
 * ------------------------------------------------------------
 */

/**
 * GET /health
 * Basic application health & offline capability status.
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    mode: isDbOnline() ? "online" : "offline_local",
    offlineReady: true,
    system: "Pharmacy Billing SaaS",
    storeStats: localStore.getStats(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/db
 * Returns database status without breaking when offline.
 */
app.get("/health/db", async (req, res) => {
  const dbStatus = getDbStatus();
  res.status(200).json({
    status: "OK",
    database: dbStatus.online ? "connected" : "offline_local",
    details: dbStatus,
  });
});

/**
 * ------------------------------------------------------------
 * ROUTE REGISTRATION
 * ------------------------------------------------------------
 */
const purchaseRoutes = require('./routes/purchase.routes');
const goodsReceiptRoutes = require('./routes/goods-receipt.routes');
const supplierRoutes = require('./routes/supplier.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const cashierRoutes = require('./routes/cashier.routes');
const syncRoutes = require('./routes/sync.routes');
const authRoutes = require('./routes/auth.routes');
const authController = require('./controllers/auth.controller');

app.use('/api/purchases', purchaseRoutes);
app.use('/api/goods-receipts', goodsReceiptRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/auth', authRoutes);
app.post('/api/login', authController.login);


/**
 * ------------------------------------------------------------
 * START SERVER (OFFLINE-FIRST INSTANT START)
 * ------------------------------------------------------------
 *
 * Starts the HTTP server IMMEDIATELY so localhost:5000 is reachable
 * within milliseconds, then probes PostgreSQL and Redis in the background.
 */
const startServer = () => {
  console.log("=================================================");
  console.log("  🚀 PHARMACY BILLING SAAS - BACKEND STARTING");
  console.log("=================================================");

  // 1. Start HTTP Server immediately (listen on all interfaces)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✨ Backend server is listening on port ${PORT}`);
    console.log(`📡 Local Offline Engine: ACTIVE (Zero internet dependency)`);
    console.log(`🏪 Cashier API: http://localhost:${PORT}/api/cashier`);
    console.log(`🔄 Sync API:    http://localhost:${PORT}/api/sync`);
    console.log(`🩺 Health API:  http://localhost:${PORT}/health`);
    console.log("=================================================");
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use by another process.`);
      console.error(`Close the existing process on port ${PORT} or change PORT in .env`);
    } else {
      console.error(`❌ Server startup error:`, err.message);
    }
  });

  // 2. Probe PostgreSQL in background without blocking API
  testConnection()
    .then((connected) => {
      if (connected) {
        console.log(`✅ PostgreSQL connected: ${process.env.DB_DATABASE || 'falah_pharmacy'}`);
      } else {
        console.log("ℹ️  PostgreSQL offline: Running seamlessly in LocalStore offline mode.");
      }
    })
    .catch(() => {});

  // 3. Connect Redis in background if available
  connectRedis().catch(() => {});
};

startServer();


