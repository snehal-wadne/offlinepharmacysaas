/**
 * Connection Status Diagnostics Utility
 *
 * Checks connectivity across all tiers:
 * 1. Client <-> Express Backend API
 * 2. Express Backend API <-> Supabase PostgreSQL Database
 */

const { API_URL } = require("../config");

async function checkBackendAndDbHealth() {
  const startTime = Date.now();
  try {
    const response = await fetch(`${API_URL}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        backendOnline: false,
        dbOnline: false,
        status: `Backend returned HTTP ${response.status}`,
        apiUrl: API_URL,
        latencyMs,
      };
    }

    const data = await response.json();
    return {
      backendOnline: true,
      dbOnline: Boolean(data.database?.online),
      databaseMode: data.database?.mode || "unknown",
      databaseProvider: data.database?.provider || "PostgreSQL",
      tablesCount: data.database?.tablesCount || 0,
      dbLatencyMs: data.database?.latencyMs || null,
      apiUrl: API_URL,
      clientLatencyMs: latencyMs,
      timestamp: data.timestamp,
    };
  } catch (error) {
    return {
      backendOnline: false,
      dbOnline: false,
      status: `Unable to reach backend: ${error.message}`,
      apiUrl: API_URL,
      clientLatencyMs: Date.now() - startTime,
    };
  }
}

module.exports = { checkBackendAndDbHealth, default: checkBackendAndDbHealth };

