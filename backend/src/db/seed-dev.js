/**
 * Development Database Seed
 *
 * Purpose:
 * Creates the minimum set of development records required
 * to test the application's repositories locally.
 *
 * This script is for local development only.
 *
 * Current development data:
 *
 * User
 *   ↓
 * Organisation
 *   ├── Branch
 *   ├── Product
 *   └── Supplier
 *
 * The inventory repository can then use these records to
 * create and test inventory batches.
 */

const { pool } = require("./connection");

/**
 * Create development data required by the repositories.
 */
const seedDevelopmentData = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Create a development user.
     *
     * ON CONFLICT is used so that running the seed again
     * does not create another development user.
     */
    console.log("Creating development user...");

    const userResult = await client.query(
      `
            INSERT INTO users (
                email,
                password_hash,
                name,
                status
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email)
            DO UPDATE SET
                name = EXCLUDED.name
            RETURNING id;
            `,
      [
        "dev@falah.local",
        "development-only-password-hash",
        "Development User",
        "ACTIVE",
      ],
    );

    const userId = userResult.rows[0].id;

    console.log(`Development user: ${userId}`);

    /*
     * Create the development organisation.
     *
     * The organisation is owned by the development user.
     */
    console.log("Creating development organisation...");

    const organisationResult = await client.query(
      `
            INSERT INTO organisations (
                owner_id,
                name
            )
            VALUES ($1, $2)
            RETURNING id;
            `,
      [userId, "Falah Pharmacy - Development"],
    );

    const organisationId = organisationResult.rows[0].id;

    console.log(`Development organisation: ${organisationId}`);

    /*
     * Create the development branch.
     *
     * Inventory is maintained at branch level, so we need
     * at least one branch for inventory repository testing.
     */
    console.log("Creating development branch...");

    const branchResult = await client.query(
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
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
            `,
      [
        organisationId,
        "Main Branch",
        "12 Market Road",
        "Delhi",
        "Delhi",
        "110001",
        "9876543210",
      ],
    );

    const branchId = branchResult.rows[0].id;

    console.log(`Development branch: ${branchId}`);

    /*
     * Create a development product.
     *
     * The product will later be placed into inventory
     * through an inventory batch.
     */
    console.log("Creating development product...");

    const productResult = await client.query(
      `
            INSERT INTO products (
                organisation_id,
                medicine_name,
                brand_name,
                strength,
                pack_size,
                manufacturer,
                sku
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
            `,
      [
        organisationId,
        "Paracetamol",
        "Dolo",
        "650 mg",
        "15 tablets",
        "Micro Labs",
        "DOL-650-15",
      ],
    );

    const productId = productResult.rows[0].id;

    console.log(`Development product: ${productId}`);

    /*
     * Create a development supplier.
     *
     * Inventory batches reference suppliers, so a supplier
     * record is required before creating an inventory batch.
     */
    console.log("Creating development supplier...");

    const supplierResult = await client.query(
      `
            INSERT INTO suppliers (
                organisation_id,
                name,
                contact_person,
                phone,
                email,
                city,
                gstin,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
            `,
      [
        organisationId,
        "Medico Distributors",
        "Rajesh Kumar",
        "9876501234",
        "sales@medico.example",
        "Delhi",
        "07ABCDE1234F1Z5",
        "ACTIVE",
      ],
    );

    const supplierId = supplierResult.rows[0].id;

    console.log(`Development supplier: ${supplierId}`);

    await client.query("COMMIT");

    console.log("");
    console.log("Development seed completed successfully.");
    console.log("");
    console.log("Use these IDs when testing repositories:");
    console.log(`User ID:         ${userId}`);
    console.log(`Organisation ID: ${organisationId}`);
    console.log(`Branch ID:       ${branchId}`);
    console.log(`Product ID:      ${productId}`);
    console.log(`Supplier ID:     ${supplierId}`);
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Failed to seed development data.");
    console.error(error);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

seedDevelopmentData();
