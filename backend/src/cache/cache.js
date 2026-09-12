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
  if (!redisClient.isOpen) {
    return null;
  }

  try {
    const cachedValue = await redisClient.get(key);

    if (cachedValue === null) {
      return null;
    }

    return JSON.parse(cachedValue);
  } catch (error) {
    console.error(`Cache read error [${key}]:`, error.message);
    return null;
  }
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
  if (!redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  } catch (error) {
    console.error(`Cache write error [${key}]:`, error.message);
  }
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
  if (!redisClient.isOpen) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`Cache delete error [${key}]:`, error.message);
  }
};

/**
 * ------------------------------------------------------------
 * DELETE MATCHING KEYS
 * ------------------------------------------------------------
 *
 * Removes all cached keys matching a wildcard pattern.
 */
const deleteMatchingKeys = async (pattern) => {
  if (!redisClient.isOpen) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys && keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(`Cache pattern delete error [${pattern}]:`, error.message);
  }
};

module.exports = {
  getCache,
  setCache,
  deleteCache,
  deleteMatchingKeys,
};
