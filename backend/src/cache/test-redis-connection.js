/**
 * Redis Connection Test
 *
 * Verifies that the backend can connect to Redis,
 * write a value, read it back, and delete it.
 */

require("dotenv").config();

const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const testRedisConnection = async () => {
  try {
    console.log("Connecting to Redis...");

    await connectRedis();

    console.log("Writing test value...");

    await redisClient.set("falah:test", "redis-working");

    console.log("Reading test value...");

    const value = await redisClient.get("falah:test");

    console.log("Redis returned:", value);

    if (value !== "redis-working") {
      throw new Error("Redis test value did not match.");
    }

    await redisClient.del("falah:test");

    console.log("Redis connection test passed.");
  } catch (error) {
    console.error("Redis connection test failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await disconnectRedis();
  }
};

testRedisConnection();
