/**
 * ------------------------------------------------------------
 * APPLICATION CACHE
 * ------------------------------------------------------------
 *
 * Provides a small abstraction around Redis so repositories do
 * not need to know how Redis commands or JSON serialization work.
 *
 * PostgreSQL remains the source of truth.
 * Redis is only used as a temporary read cache.
 */

const { redisClient } = require("./redis");

/**
 * ------------------------------------------------------------
 * GET CACHE
 * ------------------------------------------------------------
 *
 * Reads a value from Redis and converts the stored JSON back
 * into a JavaScript value.
 *
 * Returns null when the key does not exist.
 */
const getCache = async (key) => {
  const cachedValue = await redisClient.get(key);

  if (cachedValue === null) {
    return null;
  }

  return JSON.parse(cachedValue);
};

/**
 * ------------------------------------------------------------
 * SET CACHE
 * ------------------------------------------------------------
 *
 * Stores a JavaScript value in Redis as JSON.
 *
 * A TTL is applied so cached data does not remain indefinitely.
 */
const setCache = async (key, value, ttlSeconds = 60) => {
  await redisClient.set(key, JSON.stringify(value), {
    EX: ttlSeconds,
  });
};

/**
 * ------------------------------------------------------------
 * DELETE CACHE
 * ------------------------------------------------------------
 *
 * Removes a cached value.
 *
 * Repositories will use this after creating, updating, or
 * deleting data that has a corresponding cache entry.
 */
const deleteCache = async (key) => {
  await redisClient.del(key);
};

module.exports = {
  getCache,
  setCache,
  deleteCache,
};
