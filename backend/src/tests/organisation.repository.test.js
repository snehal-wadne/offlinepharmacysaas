/**
 * Organisation Repository Test
 *
 * Purpose:
 * Verifies organisation repository operations against the
 * real PostgreSQL development database.
 *
 * Test flow:
 *
 * 1. Create a temporary owner user.
 * 2. Create an organisation for that user.
 * 3. Retrieve the organisation by ID.
 * 4. Retrieve organisations by owner.
 * 5. Update the organisation.
 * 6. Delete the organisation.
 * 7. Verify that the organisation no longer exists.
 * 8. Delete the temporary owner user.
 */

const {
  createOrganisation,
  getOrganisationById,
  getOrganisationsByOwnerId,
  updateOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const {
  createUser,
  getUserById,
  deleteUser,
} = require("../repositories/user.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let ownerUserId;
  let organisationId;

  /*
   * Use a unique email so the test can be executed repeatedly
   * without conflicting with previous development data.
   */
  const timestamp = Date.now();

  const testEmail = `test-org-owner-${timestamp}@example.com`;

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE TEMPORARY OWNER USER
     * ------------------------------------------------------
     *
     * organisations.owner_id references users.id.
     * Therefore, a valid user must exist before we can
     * create the organisation.
     */
    console.log("--- Creating temporary owner user ---");

    const ownerUser = await createUser({
      email: testEmail,
      passwordHash: "$2b$10$organisation-test-password",
      googleSub: null,
      name: "Organisation Test Owner",
      status: "ACTIVE",
    });

    ownerUserId = ownerUser.id;

    console.log(ownerUser);

    /*
     * ------------------------------------------------------
     * 2. VERIFY OWNER USER EXISTS
     * ------------------------------------------------------
     */
    console.log("--- Verifying owner user ---");

    const verifiedOwner = await getUserById(ownerUserId);

    console.log(verifiedOwner);

    /*
     * ------------------------------------------------------
     * 3. CREATE ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Creating organisation ---");

    const organisation = await createOrganisation({
      ownerId: ownerUserId,
      name: "Test Pharmacy Organisation",
    });

    organisationId = organisation.id;

    console.log(organisation);

    /*
     * ------------------------------------------------------
     * 4. GET ORGANISATION BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting organisation by ID ---");

    const organisationById = await getOrganisationById(organisationId);

    console.log(organisationById);

    /*
     * ------------------------------------------------------
     * 5. GET ORGANISATIONS BY OWNER
     * ------------------------------------------------------
     */
    console.log("--- Getting organisations by owner ---");

    const organisationsByOwner = await getOrganisationsByOwnerId(ownerUserId);

    console.log(organisationsByOwner);

    /*
     * ------------------------------------------------------
     * 6. UPDATE ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Updating organisation ---");

    const updatedOrganisation = await updateOrganisation(
      organisationId,
      "Updated Test Pharmacy Organisation",
    );

    console.log(updatedOrganisation);

    /*
     * ------------------------------------------------------
     * 7. GET UPDATED ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Getting updated organisation ---");

    const updatedOrganisationCheck = await getOrganisationById(organisationId);

    console.log(updatedOrganisationCheck);

    /*
     * ------------------------------------------------------
     * 8. DELETE ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 9. VERIFY ORGANISATION WAS DELETED
     * ------------------------------------------------------
     */
    console.log("--- Verifying organisation deletion ---");

    const deletedOrganisation = await getOrganisationById(organisationId);

    console.log(deletedOrganisation);

    /*
     * ------------------------------------------------------
     * 10. DELETE TEMPORARY OWNER USER
     * ------------------------------------------------------
     */
    console.log("--- Deleting temporary owner user ---");

    const ownerDeleted = await deleteUser(ownerUserId);

    console.log({
      ownerDeleted,
    });

    /*
     * ------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------
     */
    console.log("");
    console.log("Organisation repository tests completed successfully.");
  } catch (error) {
    console.error("Organisation repository test failed.");

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
