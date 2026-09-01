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
 * Rahul  -> Manager -> Main Branch + City Branch
 * Amit   -> Cashier -> Main Branch
 *
 * The test also verifies that assigning the same branch twice
 * does not create a duplicate relationship.
 */

const {
  assignBranchToMembership,
  getAssignment,
  getMembershipAssignments,
  getBranchMembers,
  isBranchAssigned,
  removeBranchAssignment,
  removeAllBranchAssignments,
} = require("../repositories/branch-assignment.repository");

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
     * 4. CREATE BRANCHES
     * ------------------------------------------------------
     *
     * Branches are created directly because this repository
     * test focuses on branch assignments.
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
     * 5. CREATE ROLES
     * ------------------------------------------------------
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
     * 6. CREATE MEMBERSHIPS
     * ------------------------------------------------------
     */
    console.log("--- Creating Rahul membership ---");

    const firstMembershipResult = await pool.query(
      `
            INSERT INTO organisation_memberships (
                organisation_id,
                user_id,
                role_id,
                status,
                joined_at
            )
            VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP)
            RETURNING *;
            `,
      [organisationId, firstUserId, managerRoleId],
    );

    firstMembershipId = firstMembershipResult.rows[0].id;

    console.log(firstMembershipResult.rows[0]);

    console.log("--- Creating Amit membership ---");

    const secondMembershipResult = await pool.query(
      `
            INSERT INTO organisation_memberships (
                organisation_id,
                user_id,
                role_id,
                status,
                joined_at
            )
            VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP)
            RETURNING *;
            `,
      [organisationId, secondUserId, cashierRoleId],
    );

    secondMembershipId = secondMembershipResult.rows[0].id;

    console.log(secondMembershipResult.rows[0]);

    /*
     * ------------------------------------------------------
     * 7. ASSIGN RAHUL TO MAIN BRANCH
     * ------------------------------------------------------
     */
    console.log("--- Assigning Rahul to Main Branch ---");

    const firstAssignment = await assignBranchToMembership(
      firstMembershipId,
      mainBranchId,
    );

    console.log(firstAssignment);

    /*
     * ------------------------------------------------------
     * 8. ASSIGN RAHUL TO CITY BRANCH
     * ------------------------------------------------------
     */
    console.log("--- Assigning Rahul to City Branch ---");

    const secondAssignment = await assignBranchToMembership(
      firstMembershipId,
      cityBranchId,
    );

    console.log(secondAssignment);

    /*
     * ------------------------------------------------------
     * 9. ASSIGN AMIT TO MAIN BRANCH
     * ------------------------------------------------------
     */
    console.log("--- Assigning Amit to Main Branch ---");

    const thirdAssignment = await assignBranchToMembership(
      secondMembershipId,
      mainBranchId,
    );

    console.log(thirdAssignment);

    /*
     * ------------------------------------------------------
     * 10. TEST DUPLICATE ASSIGNMENT
     * ------------------------------------------------------
     *
     * Rahul is already assigned to Main Branch.
     *
     * The second assignment should therefore return null
     * instead of creating another row.
     */
    console.log("--- Testing duplicate branch assignment ---");

    const duplicateAssignment = await assignBranchToMembership(
      firstMembershipId,
      mainBranchId,
    );

    console.log({
      duplicateAssignment,
    });

    /*
     * ------------------------------------------------------
     * 11. GET ASSIGNMENT
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul Main Branch assignment ---");

    const assignment = await getAssignment(firstMembershipId, mainBranchId);

    console.log(assignment);

    /*
     * ------------------------------------------------------
     * 12. GET RAHUL'S BRANCHES
     * ------------------------------------------------------
     */
    console.log("--- Getting Rahul assigned branches ---");

    const rahulBranches = await getMembershipAssignments(firstMembershipId);

    console.log(rahulBranches);

    /*
     * ------------------------------------------------------
     * 13. GET MAIN BRANCH MEMBERS
     * ------------------------------------------------------
     */
    console.log("--- Getting Main Branch members ---");

    const mainBranchMembers = await getBranchMembers(mainBranchId);

    console.log(mainBranchMembers);

    /*
     * ------------------------------------------------------
     * 14. CHECK BRANCH ACCESS
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

    console.log("--- Checking Rahul City Branch access ---");

    const rahulCityAccess = await isBranchAssigned(
      firstMembershipId,
      cityBranchId,
    );

    console.log({
      rahulCityAccess,
    });

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
     * 15. REMOVE RAHUL'S CITY BRANCH ACCESS
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
     * 16. VERIFY CITY BRANCH ACCESS WAS REMOVED
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
     * 17. REMOVE ALL REMAINING RAHUL ASSIGNMENTS
     * ------------------------------------------------------
     */
    console.log("--- Removing all Rahul branch assignments ---");

    const removedCount = await removeAllBranchAssignments(firstMembershipId);

    console.log({
      removedCount,
    });

    /*
     * ------------------------------------------------------
     * 18. VERIFY ALL RAHUL ASSIGNMENTS ARE REMOVED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Rahul has no branch assignments ---");

    const remainingAssignments =
      await getMembershipAssignments(firstMembershipId);

    console.log(remainingAssignments);

    /*
     * ------------------------------------------------------
     * 19. CLEAN UP AMIT'S ASSIGNMENT
     * ------------------------------------------------------
     */
    console.log("--- Removing Amit branch assignments ---");

    await removeAllBranchAssignments(secondMembershipId);

    /*
     * ------------------------------------------------------
     * 20. DELETE MEMBERSHIPS
     * ------------------------------------------------------
     */
    console.log("--- Deleting memberships ---");

    await pool.query(
      `
            DELETE FROM organisation_memberships
            WHERE id IN ($1, $2);
            `,
      [firstMembershipId, secondMembershipId],
    );

    /*
     * ------------------------------------------------------
     * 21. DELETE TEST BRANCHES
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
     * 22. DELETE TEST ROLES
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
     * 23. DELETE TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting test organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 24. DELETE TEST USERS
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
    await pool.end();
  }
};

runTests();
