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
 *
 * The seed is safe to run repeatedly. Existing development
 * records are reused instead of creating duplicates.
 */

const { pool } = require("./connection");

/**
 * Create or reuse development data required by the repositories.
 */
const seedDevelopmentData = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // --------------------------------------------------------
    // 1. DEVELOPMENT USER
    // --------------------------------------------------------
    //
    // Use a fixed development email so the same user can be
    // reused whenever this seed is executed.
    //
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
          name = EXCLUDED.name,
          status = EXCLUDED.status
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

    // --------------------------------------------------------
    // 2. DEVELOPMENT ORGANISATION
    // --------------------------------------------------------
    //
    // Organisations do not currently have a unique constraint
    // on name, so we explicitly look for our development
    // organisation before creating it.
    //
    console.log("Creating development organisation...");

    let organisationResult = await client.query(
      `
        SELECT id
        FROM organisations
        WHERE owner_id = $1
          AND name = $2
        LIMIT 1;
      `,
      [userId, "Falah Pharmacy - Development"],
    );

    let organisationId;

    if (organisationResult.rows.length > 0) {
      organisationId = organisationResult.rows[0].id;
    } else {
      organisationResult = await client.query(
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

      organisationId = organisationResult.rows[0].id;
    }

    console.log(`Development organisation: ${organisationId}`);

    // --------------------------------------------------------
    // 3. DEVELOPMENT BRANCH
    // --------------------------------------------------------
    //
    // Branch names are unique within an organisation, so the
    // existing branch can be reused.
    //
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
        ON CONFLICT (organisation_id, name)
        DO UPDATE SET
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_code = EXCLUDED.postal_code,
          phone = EXCLUDED.phone
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

    // --------------------------------------------------------
    // 4. DEVELOPMENT PRODUCT
    // --------------------------------------------------------
    //
    // Category belongs to the product because it describes
    // what type of product it is. It is not duplicated in
    // inventory_batches.
    //
    // The SKU is unique within the organisation, so it can be
    // used to reuse the same development product.
    //
    console.log("Creating development product...");

    const productResult = await client.query(
      `
        INSERT INTO products (
          organisation_id,
          category,
          medicine_name,
          brand_name,
          strength,
          pack_size,
          manufacturer,
          sku
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (organisation_id, sku)
        DO UPDATE SET
          category = EXCLUDED.category,
          medicine_name = EXCLUDED.medicine_name,
          brand_name = EXCLUDED.brand_name,
          strength = EXCLUDED.strength,
          pack_size = EXCLUDED.pack_size,
          manufacturer = EXCLUDED.manufacturer,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `,
      [
        organisationId,
        "Medicines",
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

    // --------------------------------------------------------
    // 5. DEVELOPMENT SUPPLIER
    // --------------------------------------------------------
    //
    // The current suppliers table does not have a unique
    // business identifier such as GSTIN enforced by the schema.
    //
    // Therefore, find the development supplier first and create
    // it only when it does not already exist.
    //
    console.log("Creating development supplier...");

    let supplierResult = await client.query(
      `
        SELECT id
        FROM suppliers
        WHERE organisation_id = $1
          AND name = $2
        LIMIT 1;
      `,
      [organisationId, "Medico Distributors"],
    );

    let supplierId;

    if (supplierResult.rows.length > 0) {
      supplierId = supplierResult.rows[0].id;
    } else {
      supplierResult = await client.query(
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

      supplierId = supplierResult.rows[0].id;
    }

    console.log(`Development supplier: ${supplierId}`);

    // --------------------------------------------------------
    // 6. COMMIT
    // --------------------------------------------------------

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
    console.log("");
    console.log("Product category: Medicines");
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
