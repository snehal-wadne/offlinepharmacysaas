/**
 * BACKEND SERVER ENTRY POINT
 *
 * Clean, production-ready Express API server for Pharmacy Billing SaaS.
 * Provides RESTful endpoints for Inventory, Billing, Purchases, Taxes, Reports,
 * Superadmin, and Authoritative Offline Sync.
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  pool,
  testConnection,
  isDbOnline,
  getDbStatus,
} = require("./db/connection");
const { autoInitDatabase } = require("./db/auto-init");

const app = express();
const PORT = Number(process.env.PORT || 5000);

/**
 * Middleware
 */
// CORS_ORIGINS is a comma-separated allow-list (e.g. "https://app.example.com,https://admin.example.com").
// Left unset by default so local/dev/mobile clients keep working out of the box - set it in
// production to stop arbitrary web pages from being able to call this API from a browser.
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    corsOrigins.length > 0
      ? {
          origin: corsOrigins,
        }
      : {}
  )
);
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * Root & Health Check Endpoints
 */
app.get("/", (req, res) => {
  if (req.accepts("html")) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Falah Pharmacy Billing SaaS — API Portal</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0; }
            .card { max-width: 720px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
            h1 { color: #10b981; font-size: 24px; margin: 8px 0 16px; }
            .badge { display: inline-block; background: #065f46; color: #34d399; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 13px; }
            .desc { color: #94a3b8; font-size: 15px; margin-bottom: 24px; }
            .endpoint { background: #0f172a; padding: 12px 16px; border-radius: 6px; margin: 8px 0; font-family: monospace; font-size: 14px; border: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
            a { color: #38bdf8; text-decoration: none; font-weight: 500; }
            a:hover { text-decoration: underline; }
            .meta { color: #64748b; font-size: 12px; }
            .btn { display: inline-block; background: #059669; color: #fff; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 15px; margin-top: 20px; text-decoration: none; text-align: center; }
            .btn:hover { background: #10b981; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">● REST API Server Online</span>
            <h1>Pharmacy Billing SaaS — API Portal</h1>
            <p class="desc">The Express REST API server is active on <strong>port ${PORT}</strong>, connected to PostgreSQL database <code>falah_pharmacy</code>.</p>
            
            <h3 style="margin-bottom: 12px; font-size: 16px; color: #e2e8f0;">Quick Links & Endpoints:</h3>
            <div class="endpoint"><a href="/health">GET /health</a> <span class="meta">System Health Probe</span></div>
            <div class="endpoint"><a href="/api/cashier/products?search=Paracetamol">GET /api/cashier/products</a> <span class="meta">Medicine & Batch Search</span></div>
            <div class="endpoint"><a href="/api/customers">GET /api/customers</a> <span class="meta">Patients & Credit Accounts</span></div>
            <div class="endpoint"><a href="/api/taxes">GET /api/taxes</a> <span class="meta">GST Slabs (0%, 5%, 12%, 18%, 28%)</span></div>
            <div class="endpoint"><a href="/api/reports/sales">GET /api/reports/sales</a> <span class="meta">Sales & Revenue Analytics</span></div>
            <div class="endpoint"><a href="/api/sync">GET /api/sync</a> <span class="meta">Authoritative Offline Sync Status</span></div>
            
            <div style="margin-top: 24px;">
              <a href="http://localhost:8081" class="btn" target="_blank">Open Web POS Application (Port 8081) ↗</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  res.status(200).json({
    status: "OK",
    system: "Pharmacy Billing SaaS Backend",
    port: PORT,
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      posCashier: "/api/cashier",
      customers: "/api/customers",
      prescriptions: "/api/prescriptions",
      stockTransfers: "/api/stock-transfers",
      inventory: "/api/inventory",
      purchases: "/api/purchases",
      goodsReceipts: "/api/goods-receipts",
      taxes: "/api/taxes",
      reports: "/api/reports",
      superadmin: "/api/superadmin",
      offlineSync: "/api/sync",
    },
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    system: "Pharmacy Billing SaaS Backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    system: "Pharmacy Billing SaaS Backend",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Route Registration
 */
const purchaseRoutes = require("./routes/purchase.routes");
const goodsReceiptRoutes = require("./routes/goods-receipt.routes");
const supplierRoutes = require("./routes/supplier.routes");
const inventoryRoutes = require("./routes/inventory.routes");
const cashierRoutes = require("./routes/cashier.routes");
const syncRoutes = require("./routes/sync.routes");
const authRoutes = require("./routes/auth.routes");
const authController = require("./controllers/auth.controller");
const branchRoutes = require("./routes/branch.routes");
const customerRoutes = require("./routes/customer.routes");
const prescriptionRoutes = require("./routes/prescription.routes");
const stockTransferRoutes = require("./routes/stock-transfer.routes");
const taxRoutes = require("./routes/tax.routes");
const reportRoutes = require("./routes/report.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const auditRoutes = require("./routes/audit.routes");

app.use("/api/purchases", purchaseRoutes);
app.use("/api/goods-receipts", goodsReceiptRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/sync", syncRoutes);
app.use("/sync", syncRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/branches", branchRoutes);
app.use("/api/customers", customerRoutes);
app.use("/customers", customerRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/stock-transfers", stockTransferRoutes);
app.use("/api/taxes", taxRoutes);
app.use("/taxes", taxRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/audit-logs", auditRoutes);
app.post("/api/login", authController.login);
app.post("/api/login/google", authController.googleLogin);
app.post("/api/auth/google", authController.googleLogin);


/**
 * Server Startup
 */
const startServer = () => {
  console.log("=================================================");
  console.log("  🚀 PHARMACY BILLING SAAS - BACKEND SERVER");
  console.log("=================================================");

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✨ Backend server is listening on port ${PORT}`);
    console.log(`🏪 Cashier API:    http://localhost:${PORT}/api/cashier`);
    console.log(`🔄 Sync API:       http://localhost:${PORT}/api/sync`);
    console.log(`🩺 Health API:     http://localhost:${PORT}/health`);
    console.log(`👑 Superadmin API: http://localhost:${PORT}/api/superadmin`);
    console.log("=================================================");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use by another process.`);
      console.error(
        `Close the existing process on port ${PORT} or change PORT in .env`
      );
    } else {
      console.error(`❌ Server error:`, err.message);
    }
  });

  // Non-blocking background database test
  testConnection()
    .then((connected) => {
      if (connected) {
        console.log(
          `✅ PostgreSQL connected: ${process.env.DB_DATABASE || "falah_pharmacy"}`
        );
      } else {
        console.log(
          "ℹ️  PostgreSQL offline: Running seamlessly in offline mode."
        );
      }
    })
    .catch(() => {});
};

startServer();
