/**
 * Branch Assignment Repository Test
 *
 * Purpose:
 * Verifies branch assignment operations against the real
 * PostgreSQL development database.
 *
 * Test scenario:
 *
 * Organisation
 *   |
 *   +-- Main Branch
 *   +-- City Branch
 *
 * Rahul
 *   |
 *   +-- Falah Pharmacy membership
 *          |
 *          +-- Main Branch ---- Cashier
 *          |
 *          +-- City Branch ---- Accountant
 *
 * Amit
 *   |
 *   +-- Falah Pharmacy membership
 *          |
 *          +-- Main Branch ---- Cashier
 *
 * Important:
 *
 * The organisation membership identifies which organisation
 * the employee belongs to.
 *
 * The branch assignment identifies:
 *
 *   1. Which branch the employee can access.
 *   2. Which role the employee has at that branch.
 *
 * Therefore, the same employee can have different roles
 * at different branches without creating multiple
 * organisation memberships.
 */

const {
  assignBranchToMembership,
  getAssignment,
  getMembershipAssignments,
  getBranchMembers,
  isBranchAssigned,
  removeBranchAssignment,
  removeAllBranchAssignments,
  updateBranchAssignmentRole,
} = require("../repositories/branch-assignment.repository");

const { createUser, deleteUser } = require("../repositories/user.repository");

const {
  createOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const { createRole, deleteRole } = require("../repositories/role.repository");

const {
  createMembership,
  deleteMembership,
} = require("../repositories/membership.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let firstUserId;
  let secondUserId;

  let organisationId;

  let managerRoleId;
  let cashierRoleId;
  let accountantRoleId;

  let firstMembershipId;
  let secondMembershipId;

  let mainBranchId;
  let cityBranchId;

  const timestamp = Date.now();

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE FIRST TEST USER
     * ------------------------------------------------------
     */
    console.log("--- Creating first test user ---");

    const firstUser = await createUser({
      email: `test-branch-user-1-${timestamp}@example.com`,
      passwordHash: "$2b$10$branch-test-password-1",
      googleSub: null,
      name: "Rahul Branch Test User",
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
      email: `test-branch-user-2-${timestamp}@example.com`,
      passwordHash: "$2b$10$branch-test-password-2",
      googleSub: null,
      name: "Amit Branch Test User",
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
      name: `Branch Assignment Test Organisation ${timestamp}`,
    });

    organisationId = organisation.id;

    console.log(organisation);

    /*
     * ------------------------------------------------------
     * 4. CREATE MAIN BRANCH
     * ------------------------------------------------------
     */
    console.log("--- Creating Main Branch ---");

    const mainBranchResult = await pool.query(
      `
        INSERT INTO branches (
            organisation_id,
            name,
            address,
            city,
            state,
            postal_code,
            phone
        )
        VALUES (
            $1,
            'Main Branch',
            '10 Main Road',
            'Mumbai',
            'Maharashtra',
            '400001',
            '9000000001'
        )
        RETURNING *;
      `,
      [organisationId],
    );

    mainBranchId = mainBranchResult.rows[0].id;

    console.log(mainBranchResult.rows[0]);

    /*
     * ------------------------------------------------------
     * 5. CREATE CITY BRANCH
     * ------------------------------------------------------
     */
    console.log("--- Creating City Branch ---");

    const cityBranchResult = await pool.query(
      `
        INSERT INTO branches (
            organisation_id,
            name,
            address,
            city,
            state,
            postal_code,
            phone
        )
        VALUES (
            $1,
            'City Branch',
            '20 City Road',
            'Mumbai',
            'Maharashtra',
            '400002',
            '9000000002'
        )
        RETURNING *;
      `,
      [organisationId],
    );

    cityBranchId = cityBranchResult.rows[0].id;

    console.log(cityBranchResult.rows[0]);

    /*
     * ------------------------------------------------------
     * 6. CREATE CASHIER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Cashier role ---");

    const cashierRole = await createRole({
      organisationId,
      name: "Cashier",
      description: "Branch assignment test cashier",
      isSystemRole: false,
    });

    cashierRoleId = cashierRole.id;

    console.log(cashierRole);

    /*
     * ------------------------------------------------------
     * 7. CREATE ACCOUNTANT ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Accountant role ---");

    const accountantRole = await createRole({
      organisationId,
      name: "Accountant",
      description: "Branch assignment test accountant",
      isSystemRole: false,
    });

    accountantRoleId = accountantRole.id;

    console.log(accountantRole);

    /*
     * ------------------------------------------------------
     * 8. CREATE MANAGER ROLE
     * ------------------------------------------------------
     *
     * This is used to verify that role information belongs
     * to branch assignments rather than memberships.
     */
    console.log("--- Creating Manager role ---");

    const managerRole = await createRole({
      organisationId,
      name: "Manager",
      description: "Branch assignment test manager",
      isSystemRole: false,
    });

    managerRoleId = managerRole.id;

    console.log(managerRole);

    /*
     * ------------------------------------------------------
     * 9. CREATE RAHUL MEMBERSHIP
     * ------------------------------------------------------
     *
     * Rahul has ONE membership in Falah Pharmacy.
     *
     * No role is stored on the membership.
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
     * 10. CREATE AMIT MEMBERSHIP
     * ------------------------------------------------------
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
     * 11. ASSIGN RAHUL TO MAIN BRANCH AS CASHIER
     * ------------------------------------------------------
     */
    console.log("--- Assigning Rahul to Main Branch as Cashier ---");

    const firstAssignment = await assignBranchToMembership(
      firstMembershipId,
      mainBranchId,
      cashierRoleId,
    );

    console.log(firstAssignment);

    /*
     * ------------------------------------------------------
     * 12. ASSIGN RAHUL TO CITY BRANCH AS ACCOUNTANT
     * ------------------------------------------------------
     *
     * This is the most important test in this repository.
     *
     * Rahul has the SAME organisation membership but a
     * DIFFERENT role at a DIFFERENT branch.
     */
    console.log("--- Assigning Rahul to City Branch as Accountant ---");

    const secondAssignment = await assignBranchToMembership(
      firstMembershipId,
      cityBranchId,
      accountantRoleId,
    );

    console.log(secondAssignment);

    /*
     * ------------------------------------------------------
     * 13. ASSIGN AMIT TO MAIN BRANCH AS MANAGER
     * ------------------------------------------------------
     */
    console.log("--- Assigning Amit to Main Branch as Manager ---");

    const thirdAssignment = await assignBranchToMembership(
      secondMembershipId,
      mainBranchId,
      managerRoleId,
    );

    console.log(thirdAssignment);

    /*
     * ------------------------------------------------------
     * 14. TEST DUPLICATE BRANCH ASSIGNMENT
     * ------------------------------------------------------
     *
     * Rahul is already assigned to Main Branch.
     *
     * The same membership + branch combination cannot be
     * inserted twice.
     */
    console.log("--- Testing duplicate branch assignment ---");

    const duplicateAssignment = await assignBranchToMembership(
      firstMembershipId,
      mainBranchId,
      cashierRoleId,
    );

    console.log({
      duplicateAssignment,
    });

    /*
     * ------------------------------------------------------
     * 15. GET RAHUL MAIN BRANCH ASSIGNMENT
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul Main Branch assignment ---");

    const mainAssignment = await getAssignment(firstMembershipId, mainBranchId);

    console.log(mainAssignment);

    /*
     * ------------------------------------------------------
     * 16. GET RAHUL CITY BRANCH ASSIGNMENT
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul City Branch assignment ---");

    const cityAssignment = await getAssignment(firstMembershipId, cityBranchId);

    console.log(cityAssignment);

    /*
     * ------------------------------------------------------
     * 17. GET RAHUL'S BRANCH ASSIGNMENTS
     * ------------------------------------------------------
     *
     * Rahul should have:
     *
     * Main Branch -> Cashier
     * City Branch  -> Accountant
     */
    console.log("--- Getting Rahul assigned branches ---");

    const rahulAssignments = await getMembershipAssignments(firstMembershipId);

    console.log(rahulAssignments);

    /*
     * ------------------------------------------------------
     * 18. CHANGE RAHUL'S CITY BRANCH ROLE
     * ------------------------------------------------------
     *
     * Rahul changes from Accountant to Manager at City Branch.
     *
     * His organisation membership does not change.
     * His Main Branch role does not change.
     */
    console.log("--- Changing Rahul City Branch role to Manager ---");

    const updatedCityRole = await updateBranchAssignmentRole(
      firstMembershipId,
      cityBranchId,
      managerRoleId,
    );

    console.log(updatedCityRole);

    /*
     * ------------------------------------------------------
     * 19. GET CITY ASSIGNMENT AFTER ROLE CHANGE
     * ------------------------------------------------------
     */
    console.log("--- Verifying Rahul City Branch role change ---");

    const updatedCityAssignment = await getAssignment(
      firstMembershipId,
      cityBranchId,
    );

    console.log(updatedCityAssignment);

    /*
     * ------------------------------------------------------
     * 20. GET MAIN BRANCH MEMBERS
     * ------------------------------------------------------
     *
     * Main Branch should contain:
     *
     * Rahul -> Cashier
     * Amit  -> Manager
     */
    console.log("--- Getting Main Branch members ---");

    const mainBranchMembers = await getBranchMembers(mainBranchId);

    console.log(mainBranchMembers);

    /*
     * ------------------------------------------------------
     * 21. GET CITY BRANCH MEMBERS
     * ------------------------------------------------------
     *
     * City Branch should contain:
     *
     * Rahul -> Manager
     */
    console.log("--- Getting City Branch members ---");

    const cityBranchMembers = await getBranchMembers(cityBranchId);

    console.log(cityBranchMembers);

    /*
     * ------------------------------------------------------
     * 22. CHECK RAHUL MAIN BRANCH ACCESS
     * ------------------------------------------------------
     */
    console.log("--- Checking Rahul Main Branch access ---");

    const rahulMainAccess = await isBranchAssigned(
      firstMembershipId,
      mainBranchId,
    );

    console.log({
      rahulMainAccess,
    });

    /*
     * ------------------------------------------------------
     * 23. CHECK RAHUL CITY BRANCH ACCESS
     * ------------------------------------------------------
     */
    console.log("--- Checking Rahul City Branch access ---");

    const rahulCityAccess = await isBranchAssigned(
      firstMembershipId,
      cityBranchId,
    );

    console.log({
      rahulCityAccess,
    });

    /*
     * ------------------------------------------------------
     * 24. CHECK AMIT CITY BRANCH ACCESS
     * ------------------------------------------------------
     *
     * Amit was never assigned to City Branch.
     */
    console.log("--- Checking Amit City Branch access ---");

    const amitCityAccess = await isBranchAssigned(
      secondMembershipId,
      cityBranchId,
    );

    console.log({
      amitCityAccess,
    });

    /*
     * ------------------------------------------------------
     * 25. REMOVE RAHUL CITY BRANCH ACCESS
     * ------------------------------------------------------
     */
    console.log("--- Removing Rahul City Branch assignment ---");

    const cityAssignmentRemoved = await removeBranchAssignment(
      firstMembershipId,
      cityBranchId,
    );

    console.log({
      cityAssignmentRemoved,
    });

    /*
     * ------------------------------------------------------
     * 26. VERIFY CITY BRANCH ACCESS WAS REMOVED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Rahul City Branch access removal ---");

    const rahulCityAccessAfterRemoval = await isBranchAssigned(
      firstMembershipId,
      cityBranchId,
    );

    console.log({
      rahulCityAccessAfterRemoval,
    });

    /*
     * ------------------------------------------------------
     * 27. REMOVE ALL REMAINING RAHUL ASSIGNMENTS
     * ------------------------------------------------------
     */
    console.log("--- Removing all Rahul branch assignments ---");

    const removedCount = await removeAllBranchAssignments(firstMembershipId);

    console.log({
      removedCount,
    });

    /*
     * ------------------------------------------------------
     * 28. VERIFY ALL RAHUL ASSIGNMENTS ARE REMOVED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Rahul has no branch assignments ---");

    const remainingAssignments =
      await getMembershipAssignments(firstMembershipId);

    console.log(remainingAssignments);

    /*
     * ------------------------------------------------------
     * 29. REMOVE AMIT ASSIGNMENTS
     * ------------------------------------------------------
     */
    console.log("--- Removing Amit branch assignments ---");

    await removeAllBranchAssignments(secondMembershipId);

    /*
     * ------------------------------------------------------
     * 30. DELETE MEMBERSHIPS
     * ------------------------------------------------------
     */
    console.log("--- Deleting Rahul membership ---");

    const rahulMembershipDeleted = await deleteMembership(firstMembershipId);

    console.log({
      rahulMembershipDeleted,
    });

    console.log("--- Deleting Amit membership ---");

    const amitMembershipDeleted = await deleteMembership(secondMembershipId);

    console.log({
      amitMembershipDeleted,
    });

    /*
     * ------------------------------------------------------
     * 31. DELETE TEST BRANCHES
     * ------------------------------------------------------
     */
    console.log("--- Deleting test branches ---");

    await pool.query(
      `
        DELETE FROM branches
        WHERE id IN ($1, $2);
      `,
      [mainBranchId, cityBranchId],
    );

    /*
     * ------------------------------------------------------
     * 32. DELETE TEST ROLES
     * ------------------------------------------------------
     */
    console.log("--- Deleting test roles ---");

    const cashierDeleted = await deleteRole(cashierRoleId);

    const accountantDeleted = await deleteRole(accountantRoleId);

    const managerDeleted = await deleteRole(managerRoleId);

    console.log({
      cashierDeleted,
      accountantDeleted,
      managerDeleted,
    });

    /*
     * ------------------------------------------------------
     * 33. DELETE TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting test organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 34. DELETE TEST USERS
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
    console.log("Branch assignment repository tests completed successfully.");
  } catch (error) {
    console.error("Branch assignment repository test failed.");

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
