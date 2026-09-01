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
 *                    |
 *                    +── Manager
 *                    +── Cashier
 *
 * Memberships:
 *
 * User 1 → Organisation → Manager
 * User 2 → Organisation → Cashier
 */

const {
  createMembership,
  getMembershipById,
  getMembership,
  getUserMemberships,
  getOrganisationMembers,
  updateMembershipRole,
  updateMembershipStatus,
  deleteMembership,
} = require("../repositories/membership.repository");

const { createUser, deleteUser } = require("../repositories/user.repository");

const {
  createOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const { createRole, deleteRole } = require("../repositories/role.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let firstUserId;
  let secondUserId;

  let organisationId;

  let managerRoleId;
  let cashierRoleId;

  let firstMembershipId;
  let secondMembershipId;

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
     * 3. CREATE TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Creating test organisation ---");

    const organisation = await createOrganisation({
      ownerId: firstUserId,
      name: "Membership Test Organisation",
    });

    organisationId = organisation.id;

    console.log(organisation);

    /*
     * ------------------------------------------------------
     * 4. CREATE MANAGER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Manager role ---");

    const managerRole = await createRole({
      organisationId,
      name: "Manager",
      description: "Test manager role",
      isSystemRole: false,
    });

    managerRoleId = managerRole.id;

    console.log(managerRole);

    /*
     * ------------------------------------------------------
     * 5. CREATE CASHIER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Cashier role ---");

    const cashierRole = await createRole({
      organisationId,
      name: "Cashier",
      description: "Test cashier role",
      isSystemRole: false,
    });

    cashierRoleId = cashierRole.id;

    console.log(cashierRole);

    /*
     * ------------------------------------------------------
     * 6. CREATE FIRST MEMBERSHIP
     * ------------------------------------------------------
     *
     * Rahul becomes a Manager.
     */
    console.log("--- Creating first membership ---");

    const firstMembership = await createMembership({
      organisationId,
      userId: firstUserId,
      roleId: managerRoleId,
      status: "ACTIVE",
    });

    firstMembershipId = firstMembership.id;

    console.log(firstMembership);

    /*
     * ------------------------------------------------------
     * 7. CREATE SECOND MEMBERSHIP
     * ------------------------------------------------------
     *
     * Amit becomes a Cashier.
     */
    console.log("--- Creating second membership ---");

    const secondMembership = await createMembership({
      organisationId,
      userId: secondUserId,
      roleId: cashierRoleId,
      status: "ACTIVE",
    });

    secondMembershipId = secondMembership.id;

    console.log(secondMembership);

    /*
     * ------------------------------------------------------
     * 8. GET MEMBERSHIP BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting first membership by ID ---");

    const membershipById = await getMembershipById(firstMembershipId);

    console.log(membershipById);

    /*
     * ------------------------------------------------------
     * 9. GET SPECIFIC USER MEMBERSHIP
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul membership in organisation ---");

    const specificMembership = await getMembership(firstUserId, organisationId);

    console.log(specificMembership);

    /*
     * ------------------------------------------------------
     * 10. GET ALL MEMBERSHIPS FOR RAHUL
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul organisation memberships ---");

    const rahulMemberships = await getUserMemberships(firstUserId);

    console.log(rahulMemberships);

    /*
     * ------------------------------------------------------
     * 11. GET ALL ORGANISATION MEMBERS
     * ------------------------------------------------------
     */
    console.log("--- Getting all organisation members ---");

    const organisationMembers = await getOrganisationMembers(organisationId);

    console.log(organisationMembers);

    /*
     * ------------------------------------------------------
     * 12. CHANGE RAHUL'S ROLE
     * ------------------------------------------------------
     *
     * Rahul changes from Manager to Cashier.
     */
    console.log("--- Changing Rahul role to Cashier ---");

    const updatedRole = await updateMembershipRole(
      firstMembershipId,
      cashierRoleId,
    );

    console.log(updatedRole);

    /*
     * ------------------------------------------------------
     * 13. UPDATE MEMBERSHIP STATUS
     * ------------------------------------------------------
     */
    console.log("--- Suspending Rahul membership ---");

    const updatedStatus = await updateMembershipStatus(
      firstMembershipId,
      "SUSPENDED",
    );

    console.log(updatedStatus);

    /*
     * ------------------------------------------------------
     * 14. DELETE SECOND MEMBERSHIP
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
     * 15. VERIFY SECOND MEMBERSHIP WAS DELETED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Amit membership deletion ---");

    const deletedMembership = await getMembershipById(secondMembershipId);

    console.log(deletedMembership);

    /*
     * ------------------------------------------------------
     * 16. DELETE FIRST MEMBERSHIP
     * ------------------------------------------------------
     */
    console.log("--- Deleting Rahul membership ---");

    const firstMembershipDeleted = await deleteMembership(firstMembershipId);

    console.log({
      firstMembershipDeleted,
    });

    /*
     * ------------------------------------------------------
     * 17. DELETE TEST ROLES
     * ------------------------------------------------------
     */
    console.log("--- Deleting test roles ---");

    const cashierDeleted = await deleteRole(cashierRoleId);

    const managerDeleted = await deleteRole(managerRoleId);

    console.log({
      cashierDeleted,
      managerDeleted,
    });

    /*
     * ------------------------------------------------------
     * 18. DELETE TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting test organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 19. DELETE TEST USERS
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
