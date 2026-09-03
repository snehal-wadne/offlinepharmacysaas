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
  },
});

redisClient.on("error", (error) => {
  console.error("Redis Client Error:", error);
});

const connectRedis = async () => {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();

  console.log("Redis connected successfully.");
};

const disconnectRedis = async () => {
  if (!redisClient.isOpen) {
    return;
  }

  await redisClient.quit();

  console.log("Redis disconnected.");
};

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
