/**
 * Role Repository Test
 *
 * Purpose:
 * Verifies role and role-permission repository operations
 * against the real PostgreSQL development database.
 *
 * Test flow:
 *
 * 1. Create temporary user.
 * 2. Create temporary organisation.
 * 3. Create Manager role.
 * 4. Create Cashier role.
 * 5. Create test permissions.
 * 6. Assign permissions to roles.
 * 7. Retrieve roles.
 * 8. Retrieve permissions assigned to a role.
 * 9. Find roles having a permission.
 * 10. Check whether a role has a permission.
 * 11. Remove a permission.
 * 12. Update a role.
 * 13. Delete roles.
 * 14. Clean up test data.
 */

const {
  createRole,
  getRoleById,
  getOrganisationRoles,
  updateRole,
  deleteRole,
  assignPermissionToRole,
  removePermissionFromRole,
  getRolePermissions,
  getRolesWithPermission,
  hasRolePermission,
} = require("../repositories/role.repository");

const { createUser, deleteUser } = require("../repositories/user.repository");

const {
  createOrganisation,
  deleteOrganisation,
} = require("../repositories/organisation.repository");

const { pool } = require("../db/connection");

const runTests = async () => {
  let userId;
  let organisationId;

  let managerRoleId;
  let cashierRoleId;

  let createInvoicePermissionId;
  let viewInventoryPermissionId;
  let refundPermissionId;

  const timestamp = Date.now();

  try {
    /*
     * ------------------------------------------------------
     * 1. CREATE TEMPORARY USER
     * ------------------------------------------------------
     *
     * The organisation requires a valid owner_id.
     */
    console.log("--- Creating temporary owner user ---");

    const user = await createUser({
      email: `test-role-owner-${timestamp}@example.com`,
      passwordHash: "$2b$10$role-test-password",
      googleSub: null,
      name: "Role Test Owner",
      status: "ACTIVE",
    });

    userId = user.id;

    console.log(user);

    /*
     * ------------------------------------------------------
     * 2. CREATE TEMPORARY ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Creating temporary organisation ---");

    const organisation = await createOrganisation({
      ownerId: userId,
      name: "Role Test Organisation",
    });

    organisationId = organisation.id;

    console.log(organisation);

    /*
     * ------------------------------------------------------
     * 3. CREATE MANAGER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Manager role ---");

    const managerRole = await createRole({
      organisationId,
      name: "Manager",
      description: "Pharmacy manager",
      isSystemRole: false,
    });

    managerRoleId = managerRole.id;

    console.log(managerRole);

    /*
     * ------------------------------------------------------
     * 4. CREATE CASHIER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Creating Cashier role ---");

    const cashierRole = await createRole({
      organisationId,
      name: "Cashier",
      description: "Pharmacy cashier",
      isSystemRole: false,
    });

    cashierRoleId = cashierRole.id;

    console.log(cashierRole);

    /*
     * ------------------------------------------------------
     * 5. CREATE TEST PERMISSIONS
     * ------------------------------------------------------
     *
     * Permissions are normally system-defined and would
     * eventually be seeded. For this repository test we
     * create temporary permissions directly.
     */
    console.log("--- Creating test permissions ---");

    const permissionQueries = [
      {
        name: `CREATE_INVOICE_TEST_${timestamp}`,
        description: "Create invoices",
      },
      {
        name: `VIEW_INVENTORY_TEST_${timestamp}`,
        description: "View inventory",
      },
      {
        name: `ALLOW_REFUND_TEST_${timestamp}`,
        description: "Process refunds",
      },
    ];

    const permissionResults = [];

    for (const permission of permissionQueries) {
      const result = await pool.query(
        `
                    INSERT INTO permissions (
                        name,
                        description
                    )
                    VALUES ($1, $2)
                    RETURNING
                        id,
                        name,
                        description,
                        created_at,
                        updated_at;
                `,
        [permission.name, permission.description],
      );

      permissionResults.push(result.rows[0]);
    }

    createInvoicePermissionId = permissionResults[0].id;

    viewInventoryPermissionId = permissionResults[1].id;

    refundPermissionId = permissionResults[2].id;

    console.log(permissionResults);

    /*
     * ------------------------------------------------------
     * 6. GET ROLE BY ID
     * ------------------------------------------------------
     */
    console.log("--- Getting Manager role by ID ---");

    const roleById = await getRoleById(managerRoleId);

    console.log(roleById);

    /*
     * ------------------------------------------------------
     * 7. GET ALL ORGANISATION ROLES
     * ------------------------------------------------------
     */
    console.log("--- Getting organisation roles ---");

    const organisationRoles = await getOrganisationRoles(organisationId);

    console.log(organisationRoles);

    /*
     * ------------------------------------------------------
     * 8. ASSIGN PERMISSIONS TO MANAGER
     * ------------------------------------------------------
     *
     * Manager gets:
     *
     * CREATE_INVOICE
     * VIEW_INVENTORY
     * ALLOW_REFUND
     */
    console.log("--- Assigning permissions to Manager ---");

    const managerPermission1 = await assignPermissionToRole(
      managerRoleId,
      createInvoicePermissionId,
    );

    const managerPermission2 = await assignPermissionToRole(
      managerRoleId,
      viewInventoryPermissionId,
    );

    const managerPermission3 = await assignPermissionToRole(
      managerRoleId,
      refundPermissionId,
    );

    console.log({
      managerPermission1,
      managerPermission2,
      managerPermission3,
    });

    /*
     * ------------------------------------------------------
     * 9. ASSIGN PERMISSIONS TO CASHIER
     * ------------------------------------------------------
     *
     * Cashier gets:
     *
     * CREATE_INVOICE
     * VIEW_INVENTORY
     */
    console.log("--- Assigning permissions to Cashier ---");

    const cashierPermission1 = await assignPermissionToRole(
      cashierRoleId,
      createInvoicePermissionId,
    );

    const cashierPermission2 = await assignPermissionToRole(
      cashierRoleId,
      viewInventoryPermissionId,
    );

    console.log({
      cashierPermission1,
      cashierPermission2,
    });

    /*
     * ------------------------------------------------------
     * 10. TEST DUPLICATE PERMISSION ASSIGNMENT
     * ------------------------------------------------------
     *
     * The junction table's composite primary key prevents
     * duplicate role-permission relationships.
     *
     * ON CONFLICT DO NOTHING means this should return null
     * rather than creating another relationship.
     */
    console.log("--- Testing duplicate permission assignment ---");

    const duplicateAssignment = await assignPermissionToRole(
      managerRoleId,
      createInvoicePermissionId,
    );

    console.log({
      duplicateAssignment,
    });

    /*
     * ------------------------------------------------------
     * 11. GET MANAGER PERMISSIONS
     * ------------------------------------------------------
     */
    console.log("--- Getting Manager permissions ---");

    const managerPermissions = await getRolePermissions(managerRoleId);

    console.log(managerPermissions);

    /*
     * ------------------------------------------------------
     * 12. GET ROLES WITH CREATE_INVOICE
     * ------------------------------------------------------
     *
     * Both Manager and Cashier should appear here.
     */
    console.log("--- Getting roles with CREATE_INVOICE permission ---");

    const invoiceRoles = await getRolesWithPermission(
      createInvoicePermissionId,
    );

    console.log(invoiceRoles);

    /*
     * ------------------------------------------------------
     * 13. CHECK MANAGER PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Checking whether Manager has ALLOW_REFUND ---");

    const managerCanRefund = await hasRolePermission(
      managerRoleId,
      refundPermissionId,
    );

    console.log({
      managerCanRefund,
    });

    /*
     * ------------------------------------------------------
     * 14. CHECK CASHIER PERMISSION
     * ------------------------------------------------------
     */
    console.log("--- Checking whether Cashier has ALLOW_REFUND ---");

    const cashierCanRefund = await hasRolePermission(
      cashierRoleId,
      refundPermissionId,
    );

    console.log({
      cashierCanRefund,
    });

    /*
     * ------------------------------------------------------
     * 15. REMOVE REFUND PERMISSION FROM MANAGER
     * ------------------------------------------------------
     */
    console.log("--- Removing ALLOW_REFUND from Manager ---");

    const permissionRemoved = await removePermissionFromRole(
      managerRoleId,
      refundPermissionId,
    );

    console.log({
      permissionRemoved,
    });

    /*
     * ------------------------------------------------------
     * 16. VERIFY REFUND PERMISSION WAS REMOVED
     * ------------------------------------------------------
     */
    console.log("--- Verifying Manager no longer has ALLOW_REFUND ---");

    const managerCanRefundAfterRemoval = await hasRolePermission(
      managerRoleId,
      refundPermissionId,
    );

    console.log({
      managerCanRefundAfterRemoval,
    });

    /*
     * ------------------------------------------------------
     * 17. UPDATE MANAGER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Updating Manager role ---");

    const updatedRole = await updateRole(managerRoleId, {
      name: "Senior Manager",
      description: "Updated pharmacy manager role",
    });

    console.log(updatedRole);

    /*
     * ------------------------------------------------------
     * 18. DELETE CASHIER ROLE
     * ------------------------------------------------------
     *
     * role_permissions belonging to Cashier should also
     * be removed automatically because of ON DELETE CASCADE.
     */
    console.log("--- Deleting Cashier role ---");

    const cashierDeleted = await deleteRole(cashierRoleId);

    console.log({
      cashierDeleted,
    });

    /*
     * ------------------------------------------------------
     * 19. DELETE MANAGER ROLE
     * ------------------------------------------------------
     */
    console.log("--- Deleting Manager role ---");

    const managerDeleted = await deleteRole(managerRoleId);

    console.log({
      managerDeleted,
    });

    /*
     * ------------------------------------------------------
     * 20. CLEAN UP TEST PERMISSIONS
     * ------------------------------------------------------
     */
    console.log("--- Cleaning up test permissions ---");

    await pool.query(
      `
                DELETE FROM permissions
                WHERE id IN ($1, $2, $3);
            `,
      [
        createInvoicePermissionId,
        viewInventoryPermissionId,
        refundPermissionId,
      ],
    );

    console.log("Test permissions removed.");

    /*
     * ------------------------------------------------------
     * 21. DELETE TEST ORGANISATION
     * ------------------------------------------------------
     */
    console.log("--- Deleting test organisation ---");

    const organisationDeleted = await deleteOrganisation(organisationId);

    console.log({
      organisationDeleted,
    });

    /*
     * ------------------------------------------------------
     * 22. DELETE TEST USER
     * ------------------------------------------------------
     */
    console.log("--- Deleting test owner user ---");

    const userDeleted = await deleteUser(userId);

    console.log({
      userDeleted,
    });

    /*
     * ------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------
     */
    console.log("");
    console.log("Role repository tests completed successfully.");
  } catch (error) {
    console.error("Role repository test failed.");

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
