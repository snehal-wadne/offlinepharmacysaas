# Falah Pharmacy Billing — Backend & Database Setup Guide

This document explains how to set up the backend locally, connect it to PostgreSQL, create the database schema, prepare development data, understand the backend architecture, and run the repository tests.

The backend is built with **Node.js, Express.js and PostgreSQL**.

The database layer is being developed progressively. The current repository layer covers products, suppliers, inventory, stock transfers, purchases, and goods receipts.

---

## 1. Backend Technology

The backend currently uses:

- Node.js
- Express.js
- PostgreSQL
- `pg` for PostgreSQL connections
- `bcrypt` for password hashing
- `dotenv` for environment configuration
- `cors` for cross-origin requests

The backend follows a layered structure:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
PostgreSQL
```

The service layer is the place where business rules will live. Repositories should primarily contain database queries and persistence logic.

---

## 2. Backend Folder Structure

Current backend structure:

```text
backend/
├── package-lock.json
├── package.json
├── README.md
└── src/
    ├── db/
    │   ├── connection.js
    │   ├── run-schema.js
    │   ├── schema.backup.sql
    │   ├── schema.sql
    │   ├── seed-dev.js
    │   └── test-db-connection.js
    │
    ├── repositories/
    │   ├── goods-receipt.repository.js
    │   ├── inventory.repository.js
    │   ├── product.repository.js
    │   ├── purchase.repository.js
    │   ├── stock-transfer.repository.js
    │   └── supplier.repository.js
    │
    ├── tests/
    │   ├── goods-receipt.repository.test.js
    │   ├── inventory.repository.test.js
    │   ├── product.repository.test.js
    │   ├── purchase.repository.test.js
    │   ├── stock-transfer.repository.test.js
    │   └── supplier.repository.test.js
    │
    └── server.js
```

### `src/db/`

Contains database-specific setup and development utilities.

- `connection.js` — creates and exports the PostgreSQL connection pool.
- `schema.sql` — current database schema.
- `schema.backup.sql` — backup copy of the schema during development.
- `run-schema.js` — executes `schema.sql` against the configured database.
- `seed-dev.js` — creates development records required for local repository testing.
- `test-db-connection.js` — verifies that Node.js can connect to PostgreSQL.

### `src/repositories/`

Contains SQL queries and database access functions.

For example:

```text
product.repository.js
    → product SQL operations

inventory.repository.js
    → inventory SQL operations

purchase.repository.js
    → purchase SQL operations
```

A repository should not decide application business rules such as whether a user is allowed to perform an operation. Those decisions belong in the service layer.

### `src/tests/`

Contains development tests for repository functions. These tests directly exercise the repositories against the local PostgreSQL database using development data.

### `server.js`

The Express application entry point. It configures middleware and starts the HTTP server. Database schema execution is intentionally not performed automatically by the server.

---

## 3. Configure PostgreSQL

PostgreSQL must be installed and running on the development machine.

Create:

```text
backend/.env
```

Example:

```env
PORT=5000

DB_USER=postgres
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=falah_pharmacy
```

Use the PostgreSQL username and password configured on your own machine.

**Do not commit `.env` to GitHub.**

---

## 4. Create the Database

The database itself is created separately from the application schema.

Using pgAdmin:

1. Open PostgreSQL in pgAdmin.
2. Right-click `Databases`.
3. Select `Create` → `Database`.
4. Create:

```text
falah_pharmacy
```

5. Set the appropriate database owner for your local PostgreSQL setup.

The application connects to this database using the values in `.env`.

---

## 5. Test the PostgreSQL Connection

From the `backend/` directory:

```bash
node src/db/test-db-connection.js
```

A successful result confirms that Node.js can connect to PostgreSQL.

If it fails, verify:

- PostgreSQL is running.
- `DB_USER` is correct.
- `DB_PASSWORD` is correct.
- `DB_HOST` is correct.
- `DB_PORT` is correct.
- `DB_DATABASE` exists.

---

## 6. Create the Database Schema

The current schema is:

```text
src/db/schema.sql
```

Execute it during development with:

```bash
node src/db/run-schema.js
```

This script reads `schema.sql` and executes it against the configured database.

### Important

`run-schema.js` is currently a **development schema runner**, not a production migration system.

It does not calculate differences between an old and new schema or safely migrate existing production data. A proper migration system will be introduced before production deployment.

---

## 7. Seed Development Data

Repository tests require related records such as users, organisations, branches, products and suppliers.

Run:

```bash
node src/db/seed-dev.js
```

The seed creates development data required to exercise repository functions against real PostgreSQL foreign-key relationships.

The seed script prints useful IDs that can be placed into repository test files.

---

## 8. Start the Backend

Install dependencies:

```bash
npm install
```

Start the development server using the script defined in `package.json`, normally:

```bash
npm run dev
```

The server normally runs on:

```text
http://localhost:5000
```

The health endpoint is:

```text
GET /health
```

Expected response:

```json
{
  "status": "OK"
}
```

---

## 9. Backend Request Flow

The intended architecture is:

```text
Frontend
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
PostgreSQL
```

### Controller

The controller handles HTTP concerns:

- receives the request
- reads request data
- calls the appropriate service
- returns the HTTP response

Controllers should not contain large SQL queries or database logic.

### Service

The service contains business rules.

For example, creating inventory may require:

1. Verify that the product belongs to the organisation.
2. Verify that the supplier belongs to the organisation.
3. Verify that the branch belongs to the organisation.
4. Check the user's permission.
5. Create or reuse the product.
6. Create the inventory batch.

These are business decisions and belong in the service layer.

### Repository

The repository communicates with PostgreSQL.

For example:

```js
const product = await productRepository.getProductById(
  organisationId,
  productId,
);
```

The repository executes the SQL required to retrieve the product. It should not handle HTTP responses.

---

## 10. Current Repository Layer

The following repositories are implemented and tested.

### Product

```text
src/repositories/product.repository.js
```

Handles product CRUD and search operations.

Test:

```bash
node src/tests/product.repository.test.js
```

### Supplier

```text
src/repositories/supplier.repository.js
```

Handles supplier CRUD and search operations.

Test:

```bash
node src/tests/supplier.repository.test.js
```

### Inventory

```text
src/repositories/inventory.repository.js
```

Handles:

- inventory batch creation
- batch retrieval
- branch inventory listing
- product batches
- inventory search
- expiry queries
- batch updates
- stock quantity updates
- batch deletion

Test:

```bash
node src/tests/inventory.repository.test.js
```

### Stock Transfer

```text
src/repositories/stock-transfer.repository.js
```

Handles stock transfers and transfer items.

Structure:

```text
stock_transfers
       ↓
stock_transfer_items
```

Creating the transfer and its items uses a PostgreSQL transaction.

Test:

```bash
node src/tests/stock-transfer.repository.test.js
```

### Purchase

```text
src/repositories/purchase.repository.js
```

Handles purchases and purchase items.

Structure:

```text
purchases
    ↓
purchase_items
```

Purchase creation uses a PostgreSQL transaction.

Test:

```bash
node src/tests/purchase.repository.test.js
```

### Goods Receipt

```text
src/repositories/goods-receipt.repository.js
```

Handles goods receipts and receipt items.

Structure:

```text
goods_receipts
       ↓
goods_receipt_items
```

A goods receipt represents goods physically received against a purchase.

Test:

```bash
node src/tests/goods-receipt.repository.test.js
```

---

## 11. Testing All Repositories

The current repository tests are plain Node.js scripts rather than a Jest/Mocha suite.

Run each test from `backend/`:

```bash
node src/tests/product.repository.test.js
node src/tests/supplier.repository.test.js
node src/tests/inventory.repository.test.js
node src/tests/stock-transfer.repository.test.js
node src/tests/purchase.repository.test.js
node src/tests/goods-receipt.repository.test.js
```

These tests use the real local PostgreSQL database rather than mocks.

They verify:

- SQL syntax
- foreign-key relationships
- joins
- transactions
- returned data
- updates
- deletions
- repository behavior against actual PostgreSQL

---

## 12. How Repository Tests Work

The general testing flow is:

```text
PostgreSQL
    ↓
schema.sql
    ↓
seed-dev.js
    ↓
Repository test
    ↓
Repository
    ↓
PostgreSQL
```

For example, an inventory test requires:

```text
User
Organisation
Branch
Product
Supplier
```

before an inventory batch can be created.

The test then creates an inventory batch and exercises repository operations against it.

Tests should clean up temporary records where appropriate.

---

## 13. Parent and Child Tables

Several database areas use parent-child relationships.

### Purchase

```text
purchases
    │
    └── purchase_items
```

One purchase can contain multiple products.

### Stock Transfer

```text
stock_transfers
    │
    └── stock_transfer_items
```

One transfer can contain multiple inventory batches.

### Goods Receipt

```text
goods_receipts
    │
    └── goods_receipt_items
```

One receipt can contain multiple received purchase items.

Parent and child creation is performed inside transactions where both records form one logical operation.

---

## 14. Important Business Flow

Purchasing and inventory are intentionally separated:

```text
Purchase
   ↓
Supplier ships goods
   ↓
Goods Receipt
   ↓
Inventory
```

Creating a purchase does **not** increase inventory.

Goods receipt processing will eventually coordinate the receipt and inventory operations according to the business rules.

A purchase can also be received in multiple shipments:

```text
ORDERED
   ↓
PARTIALLY_RECEIVED
   ↓
RECEIVED
```

---

## 15. Multi-Tenant Data Isolation

This is a SaaS application.

The organisation represents the tenant:

```text
Organisation A
    ├── branches
    ├── products
    ├── suppliers
    └── inventory

Organisation B
    ├── branches
    ├── products
    ├── suppliers
    └── inventory
```

Organisation-owned repository queries should use the organisation context.

For example:

```sql
WHERE organisation_id = $1
```

Services must also verify that related records belong to the same organisation before creating or modifying records.

Never trust organisation, branch, product or supplier IDs supplied by the frontend without server-side validation.

---

## 16. Inventory Concurrency

Inventory quantity is shared state.

For example:

```text
Batch A
Quantity = 10
```

Two billing terminals could attempt to sell from the same batch at nearly the same time.

The application must therefore avoid an unsafe pattern where two requests independently:

```text
read quantity
    ↓
calculate new quantity
    ↓
write quantity
```

Inventory-changing operations will require appropriate PostgreSQL transaction and locking strategies before production billing operations are implemented.

---

## 17. Useful pgAdmin Queries

### List all tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### List columns for every table

```sql
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

### Inspect products

```sql
SELECT *
FROM products;
```

### Inspect suppliers

```sql
SELECT *
FROM suppliers;
```

### Inspect inventory

```sql
SELECT *
FROM inventory_batches;
```

### Inspect purchases

```sql
SELECT *
FROM purchases;
```

### Inspect goods receipts

```sql
SELECT *
FROM goods_receipts;
```

### Inspect stock transfers

```sql
SELECT *
FROM stock_transfers;
```

---

## 18. Development Workflow for Database Changes

When adding database functionality:

```text
1. Understand the business workflow
          ↓
2. Decide whether a new entity/table is required
          ↓
3. Update schema.sql
          ↓
4. Run the schema against the local database
          ↓
5. Update development seed if required
          ↓
6. Create/update repository functions
          ↓
7. Test repository operations
          ↓
8. Review tenant isolation and constraints
          ↓
9. Build service-layer business logic
          ↓
10. Add controller/API endpoints
```

Do not jump directly from a frontend requirement to a SQL query. First identify the business entity and relationships involved.

---

## 19. Important Development Rules

### `schema.sql` is not a production migration system

`run-schema.js` is useful during local development while the schema is being established.

Before production, introduce a proper migration system so schema changes can be applied incrementally and safely to existing databases.

### Do not use pgAdmin as the application's data layer

pgAdmin is useful for inspecting the local database and performing development checks.

Normal application operations should go through the backend.

### Do not commit credentials

Never commit:

```text
.env
database passwords
API keys
production credentials
```

### Commit repository tests

Repository tests are source code and should be committed to GitHub. They document expected behavior and allow other developers to reproduce local testing.

---

## 20. Current Development Status

```text
PostgreSQL connection
    ✓

Database schema
    ✓

Development schema runner
    ✓

Development seed
    ✓

Product repository
    ✓ tested

Supplier repository
    ✓ tested

Inventory repository
    ✓ tested

Stock transfer repository
    ✓ tested

Purchase repository
    ✓ tested

Goods receipt repository
    ✓ tested

Service layer
    → upcoming

Controllers/API
    → upcoming

Production migrations
    → required before production deployment
```

---

## 21. Quick Setup for a New Developer

From the repository root:

```bash
cd backend
npm install
```

Create:

```text
backend/.env
```

with the local PostgreSQL credentials.

Then:

```bash
node src/db/test-db-connection.js
```

If successful:

```bash
node src/db/run-schema.js
```

Then:

```bash
node src/db/seed-dev.js
```

Finally, repository tests can be run individually:

```bash
node src/tests/product.repository.test.js
node src/tests/supplier.repository.test.js
node src/tests/inventory.repository.test.js
node src/tests/stock-transfer.repository.test.js
node src/tests/purchase.repository.test.js
node src/tests/goods-receipt.repository.test.js
```

If the required tests pass, the local database and repository layer are ready for backend development.

---

## 22. Final Architecture

```text
                    Frontend
                       │
                       ▼
                 ┌───────────┐
                 │ Controller│
                 └─────┬─────┘
                       │
                       ▼
                 ┌───────────┐
                 │  Service  │
                 │           │
                 │ Business  │
                 │  Rules    │
                 └─────┬─────┘
                       │
                       ▼
                 ┌───────────┐
                 │ Repository│
                 │           │
                 │ SQL / DB  │
                 │  Access   │
                 └─────┬─────┘
                       │
                       ▼
                 ┌───────────┐
                 │ PostgreSQL│
                 └───────────┘
```

The main responsibility split is:

> **Controllers handle HTTP, services handle business rules, repositories handle database access, and PostgreSQL stores the data.**

As new pharmacy workflows are implemented, new tables and repositories should be introduced only when the business requirements justify them.
