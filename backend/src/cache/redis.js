/**
 * Redis Cache Connection
 *
 * Redis is used as the server-side cache.
 * PostgreSQL remains the authoritative source of truth.
 *
 * Repositories will use this shared client for
 * cache-aside reads and cache invalidation.
 */

const { createClient } = require("redis");

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    reconnectStrategy: (retries) => {
      if (retries >= 3) {
        return false;
      }
      return 500;
    },
  },
});

redisClient.on("error", (error) => {
  if (redisClient.isOpen && error) {
    console.error("Redis Client Error:", error.message || error);
  }
});

const connectRedis = async () => {
  if (redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.connect();
    console.log("Redis connected successfully.");
  } catch (error) {
    console.warn("⚠️ Redis server is offline. Running backend without cache (PostgreSQL primary).");
  }
};

const disconnectRedis = async () => {
  if (!redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.quit();
    console.log("Redis disconnected.");
  } catch (error) {
    // Ignore error on disconnect
  }
};

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
