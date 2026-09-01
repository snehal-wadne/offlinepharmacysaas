/**
 * User Repository Test
 *
 * Purpose:
 * Verifies the user repository against the real PostgreSQL
 * development database.
 *
 * Authentication scenarios tested:
 *
 * 1. Local-only user
 * 2. Google-only user
 * 3. Local + Google user
 * 4. Google account linking
 * 5. Google account unlinking
 * 6. Email verification
 * 7. Last-login update
 * 8. Profile update
 * 9. Password hash update
 * 10. User status update
 * 11. User deletion
 */

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

const runTests = async () => {
  let localUserId;
  let googleUserId;
  let linkedUserId;

  /*
   * Unique email addresses are used so the test can be
   * executed repeatedly without conflicting with previous
   * development data.
   */
  const timestamp = Date.now();

  const localEmail = `test-local-${timestamp}@example.com`;

  const googleEmail = `test-google-${timestamp}@example.com`;

  const linkedEmail = `test-linked-${timestamp}@example.com`;

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE LOCAL-ONLY USER
     * ------------------------------------------------------
     */
    console.log("--- Creating local-only user ---");

    const localUser = await createUser({
      email: localEmail,
      passwordHash: "$2b$10$test-local-password-hash",
      googleSub: null,
      name: "Local Test User",
      status: "ACTIVE",
    });

    localUserId = localUser.id;

    console.log(localUser);

    /*
     * ------------------------------------------------------
     * 2. GET USER BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting user by ID ---");

    const userById = await getUserById(localUserId);

    console.log(userById);

    /*
     * ------------------------------------------------------
     * 3. GET USER BY EMAIL
     * ------------------------------------------------------
     */
    console.log("--- Getting user by email ---");

    const userByEmail = await getUserByEmail(localEmail);

    console.log(userByEmail);

    /*
     * ------------------------------------------------------
     * 4. UPDATE PROFILE
     * ------------------------------------------------------
     */
    console.log("--- Updating user profile ---");

    const updatedUser = await updateUser(localUserId, {
      name: "Updated Local User",
    });

    console.log(updatedUser);

    /*
     * ------------------------------------------------------
     * 5. UPDATE PASSWORD HASH
     * ------------------------------------------------------
     */
    console.log("--- Updating password hash ---");

    const passwordUpdated = await updatePasswordHash(
      localUserId,
      "$2b$10$updated-password-hash",
    );

    console.log(passwordUpdated);

    /*
     * ------------------------------------------------------
     * 6. MARK EMAIL AS VERIFIED
     * ------------------------------------------------------
     */
    console.log("--- Marking email as verified ---");

    const verifiedUser = await markEmailAsVerified(localUserId);

    console.log(verifiedUser);

    /*
     * ------------------------------------------------------
     * 7. UPDATE LAST LOGIN
     * ------------------------------------------------------
     */
    console.log("--- Updating last login ---");

    const loginUpdated = await updateLastLogin(localUserId);

    console.log(loginUpdated);

    /*
     * ------------------------------------------------------
     * 8. UPDATE USER STATUS
     * ------------------------------------------------------
     */
    console.log("--- Updating user status ---");

    const statusUpdated = await updateUserStatus(localUserId, "SUSPENDED");

    console.log(statusUpdated);

    /*
     * ------------------------------------------------------
     * 9. CREATE GOOGLE-ONLY USER
     * ------------------------------------------------------
     */
    console.log("--- Creating Google-only user ---");

    const googleUser = await createUser({
      email: googleEmail,
      passwordHash: null,
      googleSub: `google-test-${timestamp}`,
      name: "Google Test User",
      status: "ACTIVE",
    });

    googleUserId = googleUser.id;

    console.log(googleUser);

    /*
     * ------------------------------------------------------
     * 10. GET USER BY GOOGLE SUBJECT
     * ------------------------------------------------------
     */
    console.log("--- Getting user by Google subject ---");

    const userByGoogle = await getUserByGoogleSub(`google-test-${timestamp}`);

    console.log(userByGoogle);

    /*
     * ------------------------------------------------------
     * 11. CREATE LOCAL USER FOR ACCOUNT LINKING
     * ------------------------------------------------------
     */
    console.log("--- Creating user for Google linking ---");

    const linkedUser = await createUser({
      email: linkedEmail,
      passwordHash: "$2b$10$link-test-password-hash",
      googleSub: null,
      name: "Link Test User",
      status: "ACTIVE",
    });

    linkedUserId = linkedUser.id;

    console.log(linkedUser);

    /*
     * ------------------------------------------------------
     * 12. LINK GOOGLE ACCOUNT
     * ------------------------------------------------------
     */
    console.log("--- Linking Google account ---");

    const linkedGoogleUser = await linkGoogleAccount(
      linkedUserId,
      `google-linked-${timestamp}`,
    );

    console.log(linkedGoogleUser);

    /*
     * ------------------------------------------------------
     * 13. VERIFY GOOGLE ACCOUNT CAN BE FOUND
     * ------------------------------------------------------
     */
    console.log("--- Finding linked Google account ---");

    const linkedGoogleAccount = await getUserByGoogleSub(
      `google-linked-${timestamp}`,
    );

    console.log(linkedGoogleAccount);

    /*
     * ------------------------------------------------------
     * 14. UNLINK GOOGLE ACCOUNT
     * ------------------------------------------------------
     */
    console.log("--- Unlinking Google account ---");

    const unlinkedUser = await unlinkGoogleAccount(linkedUserId);

    console.log(unlinkedUser);

    /*
     * ------------------------------------------------------
     * 15. DELETE LOCAL USER
     * ------------------------------------------------------
     */
    console.log("--- Deleting local-only user ---");

    const localDeleted = await deleteUser(localUserId);

    console.log({
      localDeleted,
    });

    /*
     * ------------------------------------------------------
     * 16. DELETE GOOGLE USER
     * ------------------------------------------------------
     */
    console.log("--- Deleting Google-only user ---");

    const googleDeleted = await deleteUser(googleUserId);

    console.log({
      googleDeleted,
    });

    /*
     * ------------------------------------------------------
     * 17. DELETE LINKED USER
     * ------------------------------------------------------
     */
    console.log("--- Deleting linked user ---");

    const linkedDeleted = await deleteUser(linkedUserId);

    console.log({
      linkedDeleted,
    });

    console.log("");
    console.log("User repository tests completed successfully.");
  } catch (error) {
    console.error("User repository test failed.");

    console.error(error);

    process.exitCode = 1;
  } finally {
    /*
     * Close the PostgreSQL connection pool so the Node.js
     * process can terminate cleanly.
     */
    await pool.end();
  }
};

runTests();
