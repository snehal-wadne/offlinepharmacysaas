/**
 * Supplier Repository Test
 *
 * Purpose:
 * Manually verifies the supplier repository against the
 * development PostgreSQL database.
 *
 * This test is for local development only.
 */

const {
  createSupplier,
  getSupplierById,
  getSuppliersByOrganisation,
  searchSuppliers,
  updateSupplier,
  deleteSupplier,
} = require("../repositories/supplier.repository");

const { pool } = require("../db/connection");

/*
 * Replace this with the development organisation ID created
 * by seed-dev.js.
 */
const organisationId = "PUT_YOUR_DEVELOPMENT_ORGANISATION_ID_HERE";

const runTests = async () => {
  let supplierId;

  try {
    console.log("--- Creating supplier ---");

    const supplier = await createSupplier({
      organisationId,
      name: "Medico Distributors",
      contactPerson: "Rajesh Kumar",
      phone: "9876543210",
      email: "sales@medicodistributors.example",
      city: "Delhi",
      gstin: "07ABCDE1234F1Z5",
    });

    supplierId = supplier.id;

    console.log(supplier);

    console.log("--- Getting supplier by ID ---");

    const fetchedSupplier = await getSupplierById(organisationId, supplierId);

    console.log(fetchedSupplier);

    console.log("--- Getting suppliers by organisation ---");

    const suppliers = await getSuppliersByOrganisation(organisationId);

    console.log(suppliers);

    console.log("--- Searching suppliers ---");

    const searchResults = await searchSuppliers(organisationId, "Medico");

    console.log(searchResults);

    console.log("--- Updating supplier ---");

    const updatedSupplier = await updateSupplier(organisationId, supplierId, {
      name: "Medico Distributors Pvt Ltd",
      contactPerson: "Rajesh Kumar",
      phone: "9876543210",
      email: "sales@medicodistributors.example",
      city: "New Delhi",
      gstin: "07ABCDE1234F1Z5",
      status: "ACTIVE",
    });

    console.log(updatedSupplier);

    console.log("--- Deleting supplier ---");

    const deleted = await deleteSupplier(organisationId, supplierId);

    console.log({
      deleted,
    });

    console.log("");
    console.log("Supplier repository tests completed successfully.");
  } catch (error) {
    console.error("Supplier repository test failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();
