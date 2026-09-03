/**
 * Permission Repository Test
 *
 * Purpose:
 * Verifies permission repository operations against the
 * real PostgreSQL development database.
 *
 * Test flow:
 *
 * 1. Create test permissions.
 * 2. Retrieve permissions by ID.
 * 3. Retrieve permissions by name.
 * 4. Retrieve all permissions.
 * 5. Update a permission.
 * 6. Verify the updated permission.
 * 7. Delete the permissions.
 * 8. Verify deletion.
 *
 * Permissions are global records, so this test does not need
 * an organisation or user.
 */

const {
  createPermission,
  getPermissionById,
  getPermissionByName,
  getAllPermissions,
  updatePermission,
  deletePermission,
} = require("../repositories/permission.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let permissionId;
  let secondPermissionId;

  const timestamp = Date.now();

  const permissionName = `TEST_CREATE_INVOICE_${timestamp}`;

  const secondPermissionName = `TEST_VIEW_INVENTORY_${timestamp}`;

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE FIRST PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Creating first permission ---");

    const permission = await createPermission({
      name: permissionName,
      description: "Test permission for creating invoices",
    });

    permissionId = permission.id;

    console.log(permission);

    /*
     * ------------------------------------------------------
     * 2. CREATE SECOND PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Creating second permission ---");

    const secondPermission = await createPermission({
      name: secondPermissionName,
      description: "Test permission for viewing inventory",
    });

    secondPermissionId = secondPermission.id;

    console.log(secondPermission);

    /*
     * ------------------------------------------------------
     * 3. GET PERMISSION BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting permission by ID ---");

    const permissionById = await getPermissionById(permissionId);

    console.log(permissionById);

    /*
     * ------------------------------------------------------
     * 4. GET PERMISSION BY NAME
     * ------------------------------------------------------
     */
    console.log("--- Getting permission by name ---");

    const permissionByName = await getPermissionByName(permissionName);

    console.log(permissionByName);

    /*
     * ------------------------------------------------------
     * 5. GET ALL PERMISSIONS
     * ------------------------------------------------------
     *
     * The development database may already contain other
     * permissions, so the output can contain more than the
     * two permissions created by this test.
     */
    console.log("--- Getting all permissions ---");

    const allPermissions = await getAllPermissions();

    console.log(allPermissions);

    /*
     * ------------------------------------------------------
     * 6. UPDATE FIRST PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Updating first permission ---");

    const updatedPermission = await updatePermission(permissionId, {
      name: `TEST_CREATE_INVOICE_UPDATED_${timestamp}`,
      description: "Updated invoice creation permission",
    });

    console.log(updatedPermission);

    /*
     * ------------------------------------------------------
     * 7. VERIFY UPDATED PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Verifying updated permission ---");

    const updatedPermissionCheck = await getPermissionById(permissionId);

    console.log(updatedPermissionCheck);

    /*
     * ------------------------------------------------------
     * 8. DELETE FIRST PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Deleting first permission ---");

    const firstDeleted = await deletePermission(permissionId);

    console.log({
      firstDeleted,
    });

    /*
     * ------------------------------------------------------
     * 9. DELETE SECOND PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Deleting second permission ---");

    const secondDeleted = await deletePermission(secondPermissionId);

    console.log({
      secondDeleted,
    });

    /*
     * ------------------------------------------------------
     * 10. VERIFY FIRST PERMISSION WAS DELETED
     * ------------------------------------------------------
     */
    console.log("--- Verifying first permission deletion ---");

    const deletedFirstPermission = await getPermissionById(permissionId);

    console.log(deletedFirstPermission);

    /*
     * ------------------------------------------------------
     * 11. VERIFY SECOND PERMISSION WAS DELETED
     * ------------------------------------------------------
     */
    console.log("--- Verifying second permission deletion ---");

    const deletedSecondPermission = await getPermissionById(secondPermissionId);

    console.log(deletedSecondPermission);

    /*
     * ------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------
     */
    console.log("");
    console.log("Permission repository tests completed successfully.");
  } catch (error) {
    console.error("Permission repository test failed.");

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
