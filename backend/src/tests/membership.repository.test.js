/**
 * Membership Repository Test
 *
 * Purpose:
 * Verifies organisation membership operations against the
 * real PostgreSQL development database.
 *
 * Test structure:
 *
 * User 1 ──────┐
 *              ├── Organisation
 * User 2 ──────┘
 *
 * Memberships:
 *
 * User 1 → Organisation
 * User 2 → Organisation
 *
 * Important:
 *
 * An organisation membership only represents the relationship
 * between a user and an organisation.
 *
 * The membership does NOT contain a role.
 *
 * Roles are assigned at the branch level through
 * branch_assignments.
 *
 * This allows the same employee to work at multiple branches
 * with different roles.
 */

const {
  createMembership,
  getMembershipById,
  getMembership,
  getUserMemberships,
  getOrganisationMembers,
  updateMembershipStatus,
  deleteMembership,
} = require("../repositories/membership.repository");

const { createUser, deleteUser } = require("../repositories/user.repository");

const {
  createOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let firstUserId;
  let secondUserId;

  let organisationId;

  let secondOrganisationId;

  let firstMembershipId;
  let secondMembershipId;
  let secondOrganisationMembershipId;

  const timestamp = Date.now();

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE FIRST TEST USER
     * ------------------------------------------------------
     */
    console.log("--- Creating first test user ---");

    const firstUser = await createUser({
      email: `test-member-1-${timestamp}@example.com`,
      passwordHash: "$2b$10$membership-test-password-1",
      googleSub: null,
      name: "Rahul Test User",
      status: "ACTIVE",
    });

    firstUserId = firstUser.id;

    console.log(firstUser);

    /*
     * ------------------------------------------------------
     * 2. CREATE SECOND TEST USER
     * ------------------------------------------------------
     */
    console.log("--- Creating second test user ---");

    const secondUser = await createUser({
      email: `test-member-2-${timestamp}@example.com`,
      passwordHash: "$2b$10$membership-test-password-2",
      googleSub: null,
      name: "Amit Test User",
      status: "ACTIVE",
    });

    secondUserId = secondUser.id;

    console.log(secondUser);

    /*
     * ------------------------------------------------------
     * 3. CREATE FIRST TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Creating first test organisation ---");

    const organisation = await createOrganisation({
      ownerId: firstUserId,
      name: `Membership Test Organisation ${timestamp}`,
    });

    organisationId = organisation.id;

    console.log(organisation);

    /*
     * ------------------------------------------------------
     * 4. CREATE SECOND TEST ORGANISATION
     * ------------------------------------------------------
     *
     * This organisation is used to verify that the same
     * user can belong to multiple organisations.
     */
    console.log("--- Creating second test organisation ---");

    const secondOrganisation = await createOrganisation({
      ownerId: secondUserId,
      name: `Second Membership Test Organisation ${timestamp}`,
    });

    secondOrganisationId = secondOrganisation.id;

    console.log(secondOrganisation);

    /*
     * ------------------------------------------------------
     * 5. CREATE FIRST MEMBERSHIP
     * ------------------------------------------------------
     *
     * Rahul becomes a member of the first organisation.
     *
     * Notice that there is NO roleId here.
     *
     * The role will be assigned later through
     * branch_assignments.
     */
    console.log("--- Creating Rahul membership ---");

    const firstMembership = await createMembership({
      organisationId,
      userId: firstUserId,
      status: "ACTIVE",
    });

    firstMembershipId = firstMembership.id;

    console.log(firstMembership);

    /*
     * ------------------------------------------------------
     * 6. VERIFY MEMBERSHIP DOES NOT CONTAIN A ROLE
     * ------------------------------------------------------
     */
    console.log("--- Verifying membership has no role ---");

    console.log({
      roleId: firstMembership.role_id,
    });

    /*
     * ------------------------------------------------------
     * 7. CREATE SECOND MEMBERSHIP
     * ------------------------------------------------------
     *
     * Amit becomes a member of the same organisation.
     */
    console.log("--- Creating Amit membership ---");

    const secondMembership = await createMembership({
      organisationId,
      userId: secondUserId,
      status: "ACTIVE",
    });

    secondMembershipId = secondMembership.id;

    console.log(secondMembership);

    /*
     * ------------------------------------------------------
     * 8. TEST DUPLICATE MEMBERSHIP
     * ------------------------------------------------------
     *
     * Rahul already belongs to this organisation.
     *
     * The database UNIQUE constraint on
     * (organisation_id, user_id) should prevent
     * another membership from being created.
     */
    console.log("--- Testing duplicate Rahul membership ---");

    try {
      await createMembership({
        organisationId,
        userId: firstUserId,
        status: "ACTIVE",
      });

      throw new Error("Duplicate membership was unexpectedly created.");
    } catch (error) {
      if (error.message === "Duplicate membership was unexpectedly created.") {
        throw error;
      }

      console.log("Duplicate membership correctly rejected.");

      console.log({
        postgresErrorCode: error.code,
      });

      if (error.code !== "23505") {
        throw new Error(
          `Expected PostgreSQL unique violation (23505), received ${error.code}.`,
        );
      }
    }

    /*
     * ------------------------------------------------------
     * 9. CREATE RAHUL MEMBERSHIP IN SECOND ORGANISATION
     * ------------------------------------------------------
     *
     * The same user can belong to another organisation.
     *
     * This should succeed because the organisation_id
     * is different.
     */
    console.log("--- Creating Rahul membership in second organisation ---");

    const secondOrganisationMembership = await createMembership({
      organisationId: secondOrganisationId,
      userId: firstUserId,
      status: "ACTIVE",
    });

    secondOrganisationMembershipId = secondOrganisationMembership.id;

    console.log(secondOrganisationMembership);

    /*
     * ------------------------------------------------------
     * 10. GET MEMBERSHIP BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul membership by ID ---");

    const membershipById = await getMembershipById(firstMembershipId);

    console.log(membershipById);

    /*
     * ------------------------------------------------------
     * 11. GET SPECIFIC USER MEMBERSHIP
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul membership in organisation ---");

    const specificMembership = await getMembership(firstUserId, organisationId);

    console.log(specificMembership);

    /*
     * ------------------------------------------------------
     * 12. GET ALL MEMBERSHIPS FOR RAHUL
     * ------------------------------------------------------
     *
     * Rahul now belongs to two organisations.
     */
    console.log("--- Getting Rahul organisation memberships ---");

    const rahulMemberships = await getUserMemberships(firstUserId);

    console.log(rahulMemberships);

    /*
     * ------------------------------------------------------
     * 13. GET ALL ORGANISATION MEMBERS
     * ------------------------------------------------------
     */
    console.log("--- Getting all organisation members ---");

    const organisationMembers = await getOrganisationMembers(organisationId);

    console.log(organisationMembers);

    /*
     * ------------------------------------------------------
     * 14. UPDATE MEMBERSHIP STATUS
     * ------------------------------------------------------
     *
     * Role is no longer updated through membership.
     *
     * Only membership-level information such as status
     * is managed here.
     */
    console.log("--- Suspending Rahul membership ---");

    const updatedStatus = await updateMembershipStatus(
      firstMembershipId,
      "SUSPENDED",
    );

    console.log(updatedStatus);

    /*
     * ------------------------------------------------------
     * 15. RESTORE RAHUL MEMBERSHIP
     * ------------------------------------------------------
     *
     * Restore the membership before cleanup.
     */
    console.log("--- Restoring Rahul membership ---");

    const restoredStatus = await updateMembershipStatus(
      firstMembershipId,
      "ACTIVE",
    );

    console.log(restoredStatus);

    /*
     * ------------------------------------------------------
     * 16. DELETE SECOND ORGANISATION MEMBERSHIP
     * ------------------------------------------------------
     */
    console.log("--- Deleting Rahul membership from second organisation ---");

    const secondOrganisationMembershipDeleted = await deleteMembership(
      secondOrganisationMembershipId,
    );

    console.log({
      secondOrganisationMembershipDeleted,
    });

    /*
     * ------------------------------------------------------
     * 17. VERIFY SECOND ORGANISATION MEMBERSHIP DELETION
     * ------------------------------------------------------
     */
    console.log(
      "--- Verifying Rahul second organisation membership deletion ---",
    );

    const deletedSecondOrganisationMembership = await getMembershipById(
      secondOrganisationMembershipId,
    );

    console.log(deletedSecondOrganisationMembership);

    /*
     * ------------------------------------------------------
     * 18. DELETE SECOND MEMBERSHIP
     * ------------------------------------------------------
     *
     * Removing a membership does not delete the user.
     */
    console.log("--- Deleting Amit membership ---");

    const membershipDeleted = await deleteMembership(secondMembershipId);

    console.log({
      membershipDeleted,
    });

    /*
     * ------------------------------------------------------
     * 19. VERIFY SECOND MEMBERSHIP WAS DELETED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Amit membership deletion ---");

    const deletedMembership = await getMembershipById(secondMembershipId);

    console.log(deletedMembership);

    /*
     * ------------------------------------------------------
     * 20. DELETE FIRST MEMBERSHIP
     * ------------------------------------------------------
     */
    console.log("--- Deleting Rahul membership ---");

    const firstMembershipDeleted = await deleteMembership(firstMembershipId);

    console.log({
      firstMembershipDeleted,
    });

    /*
     * ------------------------------------------------------
     * 21. DELETE SECOND TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting second test organisation ---");

    const secondOrganisationDeleted =
      await deleteOrganisation(secondOrganisationId);

    console.log({
      secondOrganisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 22. DELETE FIRST TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting first test organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 23. DELETE TEST USERS
     * ------------------------------------------------------
     */
    console.log("--- Deleting first test user ---");

    const firstUserDeleted = await deleteUser(firstUserId);

    console.log({
      firstUserDeleted,
    });

    console.log("--- Deleting second test user ---");

    const secondUserDeleted = await deleteUser(secondUserId);

    console.log({
      secondUserDeleted,
    });

    /*
     * ------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------
     */
    console.log("");
    console.log("Membership repository tests completed successfully.");
  } catch (error) {
    console.error("Membership repository test failed.");

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
