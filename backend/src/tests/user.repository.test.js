/**
 * User Repository Integration Tests
 *
 * Tests the User Repository against the real PostgreSQL database
 * and local Redis instance.
 *
 * The tests verify:
 * - User creation
 * - Redis cache miss and hit by ID
 * - Redis cache hit by email
 * - Redis cache hit by Google subject
 * - Cache invalidation after updates
 * - Cache invalidation after authentication changes
 * - Cache invalidation after deletion
 * - PostgreSQL remains the source of truth
 */

require("dotenv").config();

const assert = require("assert");

const {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleSub,
  updateUser,
  updatePasswordHash,
  linkGoogleAccount,
  unlinkGoogleAccount,
  markEmailAsVerified,
  updateLastLogin,
  updateUserStatus,
  deleteUser,
} = require("../repositories/user.repository");

const { pool } = require("../db/connection");
const {
  redisClient,
  connectRedis,
  disconnectRedis,
} = require("../cache/redis");

const { getCache, deleteCache } = require("../cache/cache");

const USER_ID_PREFIX = "user:";

const uniqueValue = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildUserIdCacheKey = (userId) => `${USER_ID_PREFIX}${userId}`;

const buildUserEmailCacheKey = (email) => `user:email:${email}`;

const buildUserGoogleCacheKey = (googleSub) => `user:google:${googleSub}`;

const runTests = async () => {
  let user = null;
  let userId = null;

  const email = `${uniqueValue("user")}@test.local`;
  const googleSub = uniqueValue("google-sub");

  const initialPasswordHash = "initial-password-hash";
  const updatedPasswordHash = "updated-password-hash";

  try {
    await pool.query("SELECT 1");
    await connectRedis();

    console.log("\nRunning User Repository tests...\n");

    // ---------------------------------------------------------
    // Create user
    // ---------------------------------------------------------

    user = await createUser({
      email,
      passwordHash: initialPasswordHash,
      googleSub,
      name: "Redis Test User",
      status: "ACTIVE",
    });

    userId = user.id;

    assert.ok(user);
    assert.ok(user.id);
    assert.strictEqual(user.email, email);
    assert.strictEqual(user.password_hash, initialPasswordHash);
    assert.strictEqual(user.google_sub, googleSub);
    assert.strictEqual(user.name, "Redis Test User");
    assert.strictEqual(user.status, "ACTIVE");

    console.log("✓ 1. Create user");

    // ---------------------------------------------------------
    // Ensure Redis starts clean
    // ---------------------------------------------------------

    await Promise.all([
      deleteCache(buildUserIdCacheKey(userId)),
      deleteCache(buildUserEmailCacheKey(email)),
      deleteCache(buildUserGoogleCacheKey(googleSub)),
    ]);

    // ---------------------------------------------------------
    // Get by ID - first call should be PostgreSQL
    // ---------------------------------------------------------

    const userByIdFirst = await getUserById(userId);

    assert.ok(userByIdFirst);
    assert.strictEqual(userByIdFirst.id, userId);
    assert.strictEqual(userByIdFirst.email, email);

    const cachedById = await getCache(buildUserIdCacheKey(userId));

    assert.ok(cachedById);
    assert.strictEqual(cachedById.id, userId);
    assert.strictEqual(cachedById.email, email);

    console.log("✓ 2. User ID cache miss populates Redis");

    // ---------------------------------------------------------
    // Get by ID - second call should use Redis
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE users
        SET name = $1
        WHERE id = $2;
      `,
      ["Database Name Change", userId],
    );

    const userByIdCacheHit = await getUserById(userId);

    assert.strictEqual(userByIdCacheHit.name, "Redis Test User");

    console.log("✓ 3. User ID cache hit returns cached data");

    // Restore database value before continuing.
    await pool.query(
      `
        UPDATE users
        SET name = $1
        WHERE id = $2;
      `,
      ["Redis Test User", userId],
    );

    // ---------------------------------------------------------
    // Get by email
    // ---------------------------------------------------------

    await deleteCache(buildUserEmailCacheKey(email));

    const userByEmail = await getUserByEmail(email);

    assert.ok(userByEmail);
    assert.strictEqual(userByEmail.id, userId);

    const cachedByEmail = await getCache(buildUserEmailCacheKey(email));

    assert.ok(cachedByEmail);
    assert.strictEqual(cachedByEmail.id, userId);

    console.log("✓ 4. Email lookup populates Redis");

    // ---------------------------------------------------------
    // Verify email cache hit
    // ---------------------------------------------------------

    await pool.query(
      `
        UPDATE users
        SET name = $1
        WHERE id = $2;
      `,
      ["Database Email Name Change", userId],
    );

    const emailCacheHit = await getUserByEmail(email);

    assert.strictEqual(emailCacheHit.name, "Redis Test User");

    await pool.query(
      `
        UPDATE users
        SET name = $1
        WHERE id = $2;
      `,
      ["Redis Test User", userId],
    );

    console.log("✓ 5. Email lookup uses Redis cache");

    // ---------------------------------------------------------
    // Get by Google subject
    // ---------------------------------------------------------

    await deleteCache(buildUserGoogleCacheKey(googleSub));

    const userByGoogle = await getUserByGoogleSub(googleSub);

    assert.ok(userByGoogle);
    assert.strictEqual(userByGoogle.id, userId);

    const cachedByGoogle = await getCache(buildUserGoogleCacheKey(googleSub));

    assert.ok(cachedByGoogle);
    assert.strictEqual(cachedByGoogle.id, userId);

    console.log("✓ 6. Google lookup populates Redis");

    // ---------------------------------------------------------
    // Update basic profile
    // ---------------------------------------------------------

    const updatedUser = await updateUser(userId, {
      name: "Updated Redis User",
    });

    assert.ok(updatedUser);
    assert.strictEqual(updatedUser.name, "Updated Redis User");

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    assert.strictEqual(await getCache(buildUserEmailCacheKey(email)), null);

    assert.strictEqual(
      await getCache(buildUserGoogleCacheKey(googleSub)),
      null,
    );

    console.log("✓ 7. Profile update invalidates user caches");

    // ---------------------------------------------------------
    // Repopulate caches
    // ---------------------------------------------------------

    await getUserById(userId);
    await getUserByEmail(email);
    await getUserByGoogleSub(googleSub);

    assert.ok(await getCache(buildUserIdCacheKey(userId)));

    assert.ok(await getCache(buildUserEmailCacheKey(email)));

    assert.ok(await getCache(buildUserGoogleCacheKey(googleSub)));

    console.log("✓ 8. Updated user is cached again");

    // ---------------------------------------------------------
    // Update password
    // ---------------------------------------------------------

    const passwordUpdatedUser = await updatePasswordHash(
      userId,
      updatedPasswordHash,
    );

    assert.strictEqual(passwordUpdatedUser.password_hash, updatedPasswordHash);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    console.log("✓ 9. Password update invalidates cache");

    // ---------------------------------------------------------
    // Link Google account
    // ---------------------------------------------------------

    const newGoogleSub = uniqueValue("new-google-sub");

    const linkedUser = await linkGoogleAccount(userId, newGoogleSub);

    assert.strictEqual(linkedUser.google_sub, newGoogleSub);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    assert.strictEqual(await getCache(buildUserEmailCacheKey(email)), null);

    assert.ok((await getCache(buildUserGoogleCacheKey(newGoogleSub))) === null);

    console.log("✓ 10. Google account linking invalidates current caches");

    // ---------------------------------------------------------
    // Unlink Google account
    // ---------------------------------------------------------

    const unlinkedUser = await unlinkGoogleAccount(userId);

    assert.strictEqual(unlinkedUser.google_sub, null);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    assert.strictEqual(await getCache(buildUserEmailCacheKey(email)), null);

    console.log("✓ 11. Google account unlink invalidates cache");

    // ---------------------------------------------------------
    // Mark email verified
    // ---------------------------------------------------------

    const verifiedUser = await markEmailAsVerified(userId);

    assert.ok(verifiedUser.email_verified_at);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    console.log("✓ 12. Email verification invalidates cache");

    // ---------------------------------------------------------
    // Update last login
    // ---------------------------------------------------------

    const loginUpdatedUser = await updateLastLogin(userId);

    assert.ok(loginUpdatedUser.last_login_at);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    console.log("✓ 13. Last login update invalidates cache");

    // ---------------------------------------------------------
    // Update status
    // ---------------------------------------------------------

    const statusUpdatedUser = await updateUserStatus(userId, "SUSPENDED");

    assert.strictEqual(statusUpdatedUser.status, "SUSPENDED");

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    console.log("✓ 14. Status update invalidates cache");

    // ---------------------------------------------------------
    // Repopulate before delete
    // ---------------------------------------------------------

    const currentUser = await getUserById(userId);

    assert.strictEqual(currentUser.status, "SUSPENDED");

    assert.ok(await getCache(buildUserIdCacheKey(userId)));

    // ---------------------------------------------------------
    // Delete user
    // ---------------------------------------------------------

    const deleted = await deleteUser(userId);

    assert.strictEqual(deleted, true);

    assert.strictEqual(await getCache(buildUserIdCacheKey(userId)), null);

    assert.strictEqual(await getCache(buildUserEmailCacheKey(email)), null);

    assert.strictEqual(
      await getCache(buildUserGoogleCacheKey(newGoogleSub)),
      null,
    );

    const deletedUser = await getUserById(userId);

    assert.strictEqual(deletedUser, null);

    console.log("✓ 15. User deletion removes database and cache data");

    console.log("\n✓ All User Repository tests passed.\n");
  } catch (error) {
    console.error("\n✗ User Repository test failed.");
    console.error(error);

    throw error;
  } finally {
    if (userId) {
      try {
        await pool.query("DELETE FROM users WHERE id = $1;", [userId]);
      } catch (error) {
        console.error("User test cleanup failed:", error);
      }
    }

    try {
      if (redisClient.isOpen) {
        await disconnectRedis();
      }
    } catch (error) {
      console.error("Redis disconnect failed:", error);
    }

    await pool.end();
  }
};

runTests().catch(() => {
  process.exit(1);
});
