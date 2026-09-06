/**
 * Development Database Seed
 *
 * Purpose:
 * Creates/reuses development records required to test
 * Customer & Billing dashboard read queries locally.
 *
 * This script is for local development only.
 *
 * Development data:
 *
 * User
 *   ↓
 * Organisation
 *   ├── Branch
 *   ├── Products
 *   ├── Supplier
 *   ├── Customers
 *   │     ├── Prescriptions
 *   │     └── Credit Accounts
 *   └── Invoices
 *         ├── Invoice Items
 *         └── Customer Ledger Entries
 *
 * The seed is safe to run repeatedly.
 */

const { pool } = require("./connection");

const {
  getNextBusinessNumber,
} = require("../repositories/number-sequence.repository");

const DEVELOPMENT_USER_EMAIL = "dev@falah.local";
const DEVELOPMENT_ORGANISATION_NAME = "Falah Pharmacy - Development";
const DEVELOPMENT_BRANCH_NAME = "Main Branch";
const DEVELOPMENT_SUPPLIER_NAME = "Medico Distributors";

const DEVELOPMENT_CUSTOMERS = [
  {
    fullName: "Ayesha Khan",
    phone: "9876543210",
    email: "ayesha.khan@falah.local",
    dateOfBirth: "1994-06-15",
    gender: "FEMALE",
    category: "REGULAR",
    address: "B-404, Green Palms, Andheri West, Mumbai, MH - 400053",

    creditEnabled: true,
    creditLimit: 2000,

    doctorName: "Dr. Farooq Siddiqui",
    specialization: "General Physician",
    hospitalOrClinic: "Lifecare Clinic Mumbai",
    doctorRegistrationNumber: "MH-MED-100001",
    chronicConditions: "Mild Allergy, Migraine",
    drugAllergies: "Sulfa Drugs",
    prescriptionReference: "RX-REF-AYESHA-2026",

    invoices: [
      {
        date: "2026-08-22T16:30:00Z",
        total: 510,
        itemCount: 2,
      },
      {
        date: "2026-08-29T10:15:00Z",
        total: 850,
        itemCount: 4,
      },
    ],
  },

  {
    fullName: "Rajesh Verma",
    phone: "9820144521",
    email: "rajesh.verma@falah.local",
    dateOfBirth: "1972-03-10",
    gender: "MALE",
    category: "CHRONIC CARE",
    address: "21 Green Park, South Delhi, Delhi - 110016",

    creditEnabled: true,
    creditLimit: 25000,

    doctorName: "Dr. Amitabh Sharma",
    specialization: "Cardiologist",
    hospitalOrClinic: "Heart Care Centre Delhi",
    doctorRegistrationNumber: "DL-MED-100002",
    chronicConditions: "Hypertension, Type 2 Diabetes",
    drugAllergies: "None Reported",
    prescriptionReference: "RX-REF-RAJESH-2026",

    invoices: [
      {
        date: "2026-08-12T09:00:00Z",
        total: 2450,
        itemCount: 3,
      },
      {
        date: "2026-08-28T11:45:00Z",
        total: 3450,
        itemCount: 4,
      },
    ],
  },

  {
    fullName: "Sunita Mehra",
    phone: "9811193012",
    email: "sunita.mehra@falah.local",
    dateOfBirth: "1958-11-22",
    gender: "FEMALE",
    category: "SENIOR CITIZEN",
    address: "14 Lake View Apartments, East Delhi, Delhi - 110092",

    creditEnabled: true,
    creditLimit: 15000,

    doctorName: "Dr. Priya Nambiar",
    specialization: "Orthopedic",
    hospitalOrClinic: "City Orthopedic Hospital",
    doctorRegistrationNumber: "DL-MED-100003",
    chronicConditions: "Arthritis",
    drugAllergies: "Penicillin",
    prescriptionReference: "RX-REF-SUNITA-2026",

    invoices: [
      {
        date: "2026-08-01T14:00:00Z",
        total: 3200,
        itemCount: 2,
      },
      {
        date: "2026-08-24T13:20:00Z",
        total: 1850,
        itemCount: 3,
      },
    ],
  },

  {
    fullName: "Anil Deshmukh",
    phone: "9765411209",
    email: "anil.deshmukh@falah.local",
    dateOfBirth: "1984-09-04",
    gender: "MALE",
    category: "REGULAR",
    address: "8 Shivaji Nagar, Pune, Maharashtra - 411005",

    creditEnabled: false,
    creditLimit: 0,

    doctorName: "Dr. S. K. Kulkarni",
    specialization: "General Physician",
    hospitalOrClinic: "Kulkarni Clinic Pune",
    doctorRegistrationNumber: "MH-MED-100004",
    chronicConditions: null,
    drugAllergies: null,
    prescriptionReference: "RX-REF-ANIL-2026",

    invoices: [
      {
        date: "2026-08-15T10:30:00Z",
        total: 420,
        itemCount: 2,
      },
      {
        date: "2026-08-30T18:30:00Z",
        total: 750,
        itemCount: 3,
      },
    ],
  },

  {
    fullName: "Meera Iyer",
    phone: "9930987761",
    email: "meera.iyer@falah.local",
    dateOfBirth: "1990-01-18",
    gender: "FEMALE",
    category: "VIP",
    address: "55 Marine View, Bandra West, Mumbai, MH - 400050",

    creditEnabled: true,
    creditLimit: 50000,

    doctorName: "Dr. Farhan Merchant",
    specialization: "Pediatrician / Family Care",
    hospitalOrClinic: "Merchant Family Clinic Mumbai",
    doctorRegistrationNumber: "MH-MED-100005",
    chronicConditions: null,
    drugAllergies: "None Reported",
    prescriptionReference: "RX-REF-MEERA-2026",

    invoices: [
      {
        date: "2026-08-10T12:00:00Z",
        total: 6000,
        itemCount: 4,
      },
      {
        date: "2026-08-30T16:30:00Z",
        total: 8920,
        itemCount: 5,
      },
    ],
  },

  {
    fullName: "Farooq Qureshi",
    phone: "9867099812",
    email: "farooq.qureshi@falah.local",
    dateOfBirth: "1966-06-28",
    gender: "MALE",
    category: "CHRONIC CARE",
    address: "19 Noor Residency, Kurla West, Mumbai, MH - 400070",

    creditEnabled: true,
    creditLimit: 10000,

    doctorName: "Dr. Neha Khan",
    specialization: "Diabetologist",
    hospitalOrClinic: "Metro Health Mumbai",
    doctorRegistrationNumber: "MH-MED-100006",
    chronicConditions: "Type 2 Diabetes",
    drugAllergies: "Aspirin",
    prescriptionReference: "RX-REF-FAROOQ-2026",

    invoices: [
      {
        date: "2026-08-04T09:45:00Z",
        total: 5000,
        itemCount: 3,
      },
      {
        date: "2026-08-27T15:10:00Z",
        total: 10450,
        itemCount: 4,
      },
    ],
  },
];

const DEVELOPMENT_PRODUCTS = [
  {
    category: "MEDICINES",
    medicineName: "Paracetamol",
    brandName: "Dolo",
    strength: "650 mg",
    packSize: "15 tablets",
    manufacturer: "Micro Labs",
    sku: "DOL-650-15",
  },

  {
    category: "MEDICINES",
    medicineName: "Omeprazole",
    brandName: "Omez",
    strength: "20 mg",
    packSize: "10 capsules",
    manufacturer: "Dr. Reddy's",
    sku: "OME-20-10",
  },

  {
    category: "MEDICINES",
    medicineName: "Domperidone",
    brandName: "Domstal",
    strength: "10 mg",
    packSize: "10 tablets",
    manufacturer: "Torrent Pharma",
    sku: "DOM-10-10",
  },
];

/**
 * Get or create product.
 */
const getOrCreateProduct = async (client, organisationId, product) => {
  const existing = await client.query(
    `
      SELECT id
      FROM products
      WHERE organisation_id = $1
        AND sku = $2
      LIMIT 1;
    `,
    [organisationId, product.sku],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const result = await client.query(
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
      RETURNING id;
    `,
    [
      organisationId,
      product.category,
      product.medicineName,
      product.brandName,
      product.strength,
      product.packSize,
      product.manufacturer,
      product.sku,
    ],
  );

  return result.rows[0].id;
};

/**
 * Get or create customer.
 */
const getOrCreateCustomer = async (client, organisationId, customer) => {
  const existing = await client.query(
    `
      SELECT *
      FROM customers
      WHERE organisation_id = $1
        AND email = $2
      LIMIT 1;
    `,
    [organisationId, customer.email],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const customerNumber = await getNextBusinessNumber({
    organisationId,
    branchId: null,
    sequenceType: "CUSTOMER",
    client,
  });

  const result = await client.query(
    `
      INSERT INTO customers (
          organisation_id,
          customer_number,
          full_name,
          phone,
          email,
          date_of_birth,
          gender,
          category,
          address,
          status
      )
      VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, 'ACTIVE'
      )
      RETURNING *;
    `,
    [
      organisationId,
      customerNumber,
      customer.fullName,
      customer.phone,
      customer.email,
      customer.dateOfBirth,
      customer.gender,
      customer.category,
      customer.address,
    ],
  );

  return result.rows[0];
};

/**
 * Get or create prescription.
 */
const getOrCreatePrescription = async (
  client,
  organisationId,
  customerId,
  customer,
) => {
  const existing = await client.query(
    `
      SELECT *
      FROM prescriptions
      WHERE organisation_id = $1
        AND customer_id = $2
        AND prescription_reference = $3
      LIMIT 1;
    `,
    [organisationId, customerId, customer.prescriptionReference],
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const prescriptionNumber = await getNextBusinessNumber({
    organisationId,
    branchId: null,
    sequenceType: "PRESCRIPTION",
    client,
  });

  const result = await client.query(
    `
      INSERT INTO prescriptions (
          organisation_id,
          customer_id,
          prescription_number,
          prescription_reference,
          doctor_name,
          specialization,
          hospital_or_clinic,
          doctor_registration_number,
          chronic_conditions,
          drug_allergies,
          prescription_date,
          status,
          notes
      )
      VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13
      )
      RETURNING *;
    `,
    [
      organisationId,
      customerId,
      prescriptionNumber,
      customer.prescriptionReference,
      customer.doctorName,
      customer.specialization,
      customer.hospitalOrClinic,
      customer.doctorRegistrationNumber,
      customer.chronicConditions,
      customer.drugAllergies,
      "2026-08-01",
      "ACTIVE",
      "Development customer-directory prescription.",
    ],
  );

  return result.rows[0];
};

/**
 * Create or update customer credit account.
 */
const getOrCreateCreditAccount = async (
  client,
  organisationId,
  customerId,
  customer,
) => {
  const result = await client.query(
    `
      INSERT INTO customer_credit_accounts (
          organisation_id,
          customer_id,
          credit_enabled,
          credit_limit
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (customer_id)
      DO UPDATE SET
          credit_enabled = EXCLUDED.credit_enabled,
          credit_limit = EXCLUDED.credit_limit,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    [organisationId, customerId, customer.creditEnabled, customer.creditLimit],
  );

  return result.rows[0];
};

/**
 * Get or create an invoice and its invoice items.
 */
const getOrCreateInvoice = async (
  client,
  organisationId,
  branchId,
  customerId,
  prescriptionId,
  createdBy,
  invoice,
  invoiceIndex,
  productIds,
) => {
  const marker = `Customer directory seed ${customerId} invoice ${invoiceIndex + 1}`;

  const existing = await client.query(
    `
      SELECT *
      FROM invoices
      WHERE organisation_id = $1
        AND branch_id = $2
        AND customer_id = $3
        AND notes = $4
      LIMIT 1;
    `,
    [organisationId, branchId, customerId, marker],
  );

  let invoiceRow;

  if (existing.rowCount > 0) {
    invoiceRow = existing.rows[0];
  } else {
    const invoiceNumber = await getNextBusinessNumber({
      organisationId,
      branchId,
      sequenceType: "INVOICE",
      client,
    });

    const result = await client.query(
      `
        INSERT INTO invoices (
            organisation_id,
            branch_id,
            customer_id,
            prescription_id,
            invoice_number,
            invoice_date,
            subtotal,
            discount_amount,
            tax_amount,
            total_amount,
            status,
            notes,
            created_by
        )
        VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, 0, 0, $7, 'COMPLETED', $8, $9
        )
        RETURNING *;
      `,
      [
        organisationId,
        branchId,
        customerId,
        prescriptionId,
        invoiceNumber,
        invoice.date,
        invoice.total,
        marker,
        createdBy,
      ],
    );

    invoiceRow = result.rows[0];
  }

  const itemCheck = await client.query(
    `
      SELECT COUNT(*)::INT AS count
      FROM invoice_items
      WHERE invoice_id = $1;
    `,
    [invoiceRow.id],
  );

  if (Number(itemCheck.rows[0].count) === 0) {
    const invoiceTotal = Number(invoiceRow.total_amount);

    const baseItemTotal = Number((invoiceTotal / invoice.itemCount).toFixed(2));

    for (let index = 0; index < invoice.itemCount; index += 1) {
      const productId = productIds[index % productIds.length];

      const lineTotal =
        index === invoice.itemCount - 1
          ? Number(
              (invoiceTotal - baseItemTotal * (invoice.itemCount - 1)).toFixed(
                2,
              ),
            )
          : baseItemTotal;

      const productName =
        index % 3 === 0
          ? "Paracetamol 650mg"
          : index % 3 === 1
            ? "Omeprazole 20mg"
            : "Domperidone 10mg";

      await client.query(
        `
          INSERT INTO invoice_items (
              invoice_id,
              product_id,
              product_name,
              batch_number,
              quantity,
              unit_price,
              discount_amount,
              tax_amount,
              line_total
          )
          VALUES (
              $1, $2, $3, $4, $5,
              $6, 0, 0, $7
          );
        `,
        [
          invoiceRow.id,
          productId,
          productName,
          `DEV-${invoiceIndex + 1}-${index + 1}`,
          1,
          lineTotal,
          lineTotal,
        ],
      );
    }
  }

  return invoiceRow;
};

/**
 * Create an invoice debit ledger entry if it does not exist.
 */
const getOrCreateLedgerInvoiceEntry = async (
  client,
  organisationId,
  customerId,
  branchId,
  invoiceId,
  invoiceDate,
  invoiceAmount,
  balanceAfter,
) => {
  const existing = await client.query(
    `
      SELECT id
      FROM customer_ledger_entries
      WHERE organisation_id = $1
        AND customer_id = $2
        AND reference_type = 'INVOICE'
        AND reference_id = $3
      LIMIT 1;
    `,
    [organisationId, customerId, invoiceId],
  );

  if (existing.rowCount > 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO customer_ledger_entries (
          organisation_id,
          customer_id,
          branch_id,
          entry_type,
          reference_type,
          reference_id,
          debit_amount,
          credit_amount,
          balance_after,
          entry_date,
          description
      )
      VALUES (
          $1, $2, $3,
          'INVOICE',
          'INVOICE',
          $4,
          $5,
          0,
          $6,
          $7,
          $8
      );
    `,
    [
      organisationId,
      customerId,
      branchId,
      invoiceId,
      invoiceAmount,
      balanceAfter,
      invoiceDate,
      "Development seed invoice ledger entry.",
    ],
  );
};

/**
 * Seed development data.
 */
const seedDevelopmentData = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // --------------------------------------------------------
    // 1. DEVELOPMENT USER
    // --------------------------------------------------------

    console.log("Creating development user...");

    const userResult = await client.query(
      `
        INSERT INTO users (
            email,
            password_hash,
            name,
            status
        )
        VALUES ($1, $2, $3, 'ACTIVE')
        ON CONFLICT (email)
        DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status
        RETURNING id;
      `,
      [
        DEVELOPMENT_USER_EMAIL,
        "development-only-password-hash",
        "Development User",
      ],
    );

    const userId = userResult.rows[0].id;

    console.log(`Development user: ${userId}`);

    // --------------------------------------------------------
    // 2. DEVELOPMENT ORGANISATION
    // --------------------------------------------------------

    console.log("Creating development organisation...");

    let organisationResult = await client.query(
      `
        SELECT id
        FROM organisations
        WHERE owner_id = $1
          AND name = $2
        LIMIT 1;
      `,
      [userId, DEVELOPMENT_ORGANISATION_NAME],
    );

    let organisationId;

    if (organisationResult.rowCount > 0) {
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
        [userId, DEVELOPMENT_ORGANISATION_NAME],
      );

      organisationId = organisationResult.rows[0].id;
    }

    console.log(`Development organisation: ${organisationId}`);

    // --------------------------------------------------------
    // 3. ORGANISATION MEMBERSHIP
    // --------------------------------------------------------

    await client.query(
      `
        INSERT INTO organisation_memberships (
            organisation_id,
            user_id,
            status,
            joined_at
        )
        VALUES (
            $1,
            $2,
            'ACTIVE',
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (organisation_id, user_id)
        DO UPDATE SET
            status = 'ACTIVE',
            updated_at = CURRENT_TIMESTAMP;
      `,
      [organisationId, userId],
    );

    // --------------------------------------------------------
    // 4. DEVELOPMENT BRANCH
    // --------------------------------------------------------

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
        VALUES (
            $1, $2, $3, $4,
            $5, $6, $7
        )
        ON CONFLICT (organisation_id, name)
        DO UPDATE SET
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            postal_code = EXCLUDED.postal_code,
            phone = EXCLUDED.phone,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `,
      [
        organisationId,
        DEVELOPMENT_BRANCH_NAME,
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
    // 5. DEVELOPMENT SUPPLIER
    // --------------------------------------------------------

    console.log("Creating development supplier...");

    const supplierExisting = await client.query(
      `
          SELECT id
          FROM suppliers
          WHERE organisation_id = $1
            AND name = $2
          LIMIT 1;
        `,
      [organisationId, DEVELOPMENT_SUPPLIER_NAME],
    );

    let supplierId;

    if (supplierExisting.rowCount > 0) {
      supplierId = supplierExisting.rows[0].id;
    } else {
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
            VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, 'ACTIVE'
            )
            RETURNING id;
          `,
        [
          organisationId,
          DEVELOPMENT_SUPPLIER_NAME,
          "Rajesh Kumar",
          "9876501234",
          "sales@medico.example",
          "Delhi",
          "07ABCDE1234F1Z5",
        ],
      );

      supplierId = supplierResult.rows[0].id;
    }

    console.log(`Development supplier: ${supplierId}`);

    // --------------------------------------------------------
    // 6. DEVELOPMENT PRODUCTS
    // --------------------------------------------------------

    console.log("Creating development products...");

    const productIds = [];

    for (const product of DEVELOPMENT_PRODUCTS) {
      const productId = await getOrCreateProduct(
        client,
        organisationId,
        product,
      );

      productIds.push(productId);
    }

    // --------------------------------------------------------
    // 7. CUSTOMERS + PRESCRIPTIONS + CREDIT + INVOICES
    // --------------------------------------------------------

    console.log("Creating development customers...");

    for (const customerData of DEVELOPMENT_CUSTOMERS) {
      const customer = await getOrCreateCustomer(
        client,
        organisationId,
        customerData,
      );

      const prescription = await getOrCreatePrescription(
        client,
        organisationId,
        customer.id,
        customerData,
      );

      await getOrCreateCreditAccount(
        client,
        organisationId,
        customer.id,
        customerData,
      );

      let runningBalance = 0;

      for (let index = 0; index < customerData.invoices.length; index += 1) {
        const invoice = customerData.invoices[index];

        runningBalance += Number(invoice.total);

        const invoiceRow = await getOrCreateInvoice(
          client,
          organisationId,
          branchId,
          customer.id,
          prescription.id,
          userId,
          invoice,
          index,
          productIds,
        );

        await getOrCreateLedgerInvoiceEntry(
          client,
          organisationId,
          customer.id,
          branchId,
          invoiceRow.id,
          invoice.date,
          Number(invoice.total),
          runningBalance,
        );
      }
    }

    // --------------------------------------------------------
    // 8. COMMIT
    // --------------------------------------------------------

    await client.query("COMMIT");

    console.log("");
    console.log("Development seed completed successfully.");
    console.log("");

    console.log(`User ID:         ${userId}`);
    console.log(`Organisation ID: ${organisationId}`);
    console.log(`Branch ID:       ${branchId}`);
    console.log(`Supplier ID:     ${supplierId}`);

    console.log("");
    console.log("Development customers:");

    for (const customerData of DEVELOPMENT_CUSTOMERS) {
      const result = await pool.query(
        `
          SELECT id, customer_number
          FROM customers
          WHERE organisation_id = $1
            AND email = $2
          LIMIT 1;
        `,
        [organisationId, customerData.email],
      );

      if (result.rowCount > 0) {
        console.log(
          `- ${customerData.fullName}: ` +
            `${result.rows[0].customer_number} ` +
            `(${result.rows[0].id})`,
        );
      }
    }

    console.log("");
    console.log("Development products:");

    console.log(`- ${productIds.length} products`);
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
