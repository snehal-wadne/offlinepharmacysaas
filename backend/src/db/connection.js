/**
 * PostgreSQL Database Connection (Offline-First Resilient)
 *
 * Purpose:
 * Manages the PostgreSQL connection pool with automatic offline detection.
 * If PostgreSQL or the network is unavailable, the backend gracefully
 * continues running in offline mode without crashing.
 */

const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

const isRemoteOrSsl = Boolean(
  connectionString ||
  process.env.DB_SSL === "true" ||
  (process.env.DB_HOST && !["localhost", "127.0.0.1"].includes(process.env.DB_HOST))
);

/**
 * PostgreSQL connection configuration.
 * Supports both local PostgreSQL and Supabase / Cloud Postgres (with SSL).
 */
const dbConfig = connectionString
  ? {
      connectionString,
      ssl: isRemoteOrSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "Snehal",
      database: process.env.DB_DATABASE || "falah_pharmacy",
      ssl: isRemoteOrSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(dbConfig);

// Internal state tracking
let isOnline = false;
let lastCheckTime = null;
let lastError = null;
let reconnectTimer = null;

/**
 * Handle unexpected errors on idle connections in the pool.
 */
pool.on("error", (error) => {
  // Catch idle client errors so the application does not crash
  isOnline = false;
  lastError = error.message;
});

/**
 * Check if PostgreSQL is currently reachable.
 * Never throws an unhandled error.
 */
const checkDbConnection = async () => {
  lastCheckTime = new Date().toISOString();
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1;");
      if (!isOnline) {
        console.log("✅ PostgreSQL is ONLINE and reachable.");
      }
      isOnline = true;
      lastError = null;
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    if (isOnline) {
      console.warn("⚠️ PostgreSQL connection lost. Running in OFFLINE local mode.");
    }
    isOnline = false;
    lastError = error.message;
    return false;
  }
};

/**
 * Start background reconnect watcher
 */
const startReconnectWatcher = (intervalMs = 20000) => {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    const wasOnline = isOnline;
    const nowOnline = await checkDbConnection();
    if (!wasOnline && nowOnline) {
      console.log("🔄 PostgreSQL reconnected. Ready to synchronize offline transactions.");
    }
  }, intervalMs);

  // Do not keep Node process alive solely for this timer
  if (reconnectTimer.unref) {
    reconnectTimer.unref();
  }
};

/**
 * Test connection during startup.
 * Non-fatal: returns boolean instead of crashing.
 */
const testConnection = async () => {
  const connected = await checkDbConnection();
  startReconnectWatcher();
  return connected;
};

/**
 * Safe query executor: tries PostgreSQL if online, returns null or throws caught error
 */
const safeQuery = async (text, params) => {
  if (!isOnline) {
    return null;
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.warn("Query failed on PostgreSQL, marking offline:", err.message);
    isOnline = false;
    lastError = err.message;
    return null;
  }
};

module.exports = {
  pool,
  testConnection,
  checkDbConnection,
  startReconnectWatcher,
  safeQuery,
  isDbOnline: () => isOnline,
  getDbStatus: () => ({
    online: isOnline,
    mode: isOnline ? "online" : "offline_local",
    lastChecked: lastCheckTime,
    error: lastError,
    database: process.env.DB_DATABASE || "falah_pharmacy",
  }),
};

