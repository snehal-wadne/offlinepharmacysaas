# Customer & Billing Query Repository

## Overview

The `customer-billing-queries.repository.js` repository contains cross-entity read queries required by the Customer & Billing module dashboards and customer-facing screens.

File:

```text
backend/src/repositories/customer-billing-queries.repository.js
```

The purpose of this repository is to keep dashboard-specific joins, aggregations, filtering, and read projections separate from the individual entity repositories.

### Individual repositories

The individual repositories remain responsible for their own entities:

- `customer.repository.js`
- `prescription.repository.js`
- `customer-credit-account.repository.js`
- `invoice.repository.js`
- `invoice-item.repository.js`
- `payment.repository.js`
- `payment-transaction.repository.js`
- `payment-allocation.repository.js`
- `customer-ledger.repository.js`
- `return.repository.js`
- `return-item.repository.js`

The Customer & Billing Query Repository combines information from these entities when a screen requires a read model spanning multiple tables.

This repository is **read-only**.

It must not create, update, delete, approve, process, allocate, refund, or otherwise mutate business records.

---

# 1. Architecture

The expected request flow is:

```text
Controller
    ↓
Service
    ↓
customer-billing-queries.repository.js
    ↓
PostgreSQL
```

For cached dashboard statistics:

```text
Controller
    ↓
Service
    ↓
customer-billing-queries.repository.js
    ↓
Redis cache
    ↓
PostgreSQL on cache miss
```

Business rules, authorization, transaction orchestration, and mutations remain outside this repository.

---

# 2. Service-Layer Responsibilities

Before calling any function in this repository, the service layer must:

1. Validate the authenticated user/session.
2. Resolve the authenticated organisation.
3. Validate that `organisationId` belongs to the authenticated tenant/context.
4. Authorize the user to access Customer & Billing information.
5. Validate `customerId` when required.
6. Ensure the requested customer belongs to the organisation.
7. Apply application-level visibility/status rules.
8. Validate search and filter parameters.
9. Validate pagination parameters.
10. Validate date ranges where applicable.
11. Decide whether the operation requires a PostgreSQL transaction.
12. Never use these read queries as a replacement for business validation during mutations.

The repository performs tenant-scoped database reads. It does not determine whether the authenticated user is allowed to access the requested data.

---

# 3. Exported Functions

The repository currently provides the following functions.

## Customer Directory

```js
getCustomerDirectoryStats();
getCustomerDirectoryRows();
```

## Customer Details

```js
getCustomerDetailsSummary();
getCustomerPurchaseHistory();
getCustomerPurchaseSummary();
getCustomerReturnHistory();
```

## Customer Ledger

```js
getCustomerLedgerSummary();
getCustomerLedgerDashboardStats();
getCustomerCreditLedgerRows();
```

## Payment Receipts

```js
getPaymentReceiptDashboardStats();
getPaymentReceiptDashboardRows();
```

---

# 4. Customer Directory

## 4.1 `getCustomerDirectoryStats()`

Returns the summary statistics displayed on the Customer Directory dashboard.

### Usage

```js
const stats = await getCustomerDirectoryStats(organisationId);
```

### Returns

```js
{
  (total_customers, chronic_care_patients, active_credit_accounts);
}
```

Example:

```js
{
  total_customers: 6,
  chronic_care_patients: 2,
  active_credit_accounts: 5
}
```

### Chronic Care Definition

The current Customer Directory definition of a chronic care patient is based on the customer's category:

```text
customers.category = 'CHRONIC CARE'
```

It does not infer the Customer Directory category from `prescriptions.chronic_conditions`.

`prescriptions.chronic_conditions` remains clinical information.

### Redis Cache

This query uses cache-aside Redis caching.

Cache key:

```text
organisation:<organisationId>:customer-billing:directory-stats
```

TTL:

```text
60 seconds
```

Normal flow:

```text
Redis cache hit
    ↓
return cached result
```

Cache miss:

```text
Redis cache miss
    ↓
PostgreSQL query
    ↓
store result in Redis
    ↓
return result
```

---

# 5. Customer Directory Rows

## 5.1 `getCustomerDirectoryRows()`

Returns the rows required by the Customer Directory table.

### Usage

```js
const rows = await getCustomerDirectoryRows({
  organisationId,
  searchTerm,
  category,
  creditEnabled,
  limit,
  offset,
});
```

### Returned Information

The query combines customer, prescription, credit, and financial information.

Typical fields include:

```text
Customer
- id
- organisation_id
- customer_number
- full_name
- phone
- email
- date_of_birth
- age
- gender
- category
- address
- status

Prescription
- active_prescription_number
- doctor_name
- doctor_specialization

Credit
- credit_enabled
- credit_limit

Financial
- total_spent
- outstanding_balance
```

### Supported Filters

The query supports:

- search
- customer category
- credit-enabled filtering
- pagination

The search is intended for relevant Customer Directory information, including customer identity/contact information and prescriber information.

The current customer schema stores the complete address rather than a separate city field. Therefore city-style searching currently relies on the address value.

### Redis Cache

Customer Directory rows are **not cached**.

Only the dashboard statistics are cached.

This is intentional because row queries have many combinations of:

- search terms
- filters
- pagination

Caching all combinations would introduce unnecessary cache invalidation complexity.

---

# 6. Customer Details

## 6.1 `getCustomerDetailsSummary()`

Returns the summary information required by the Customer Details page.

The Customer Details page contains:

1. Contact & Demographics
2. Prescriber & Medical Reference
3. Account & Credit Terms

The summary query therefore combines customer, financial, credit, and current prescription information.

### Usage

```js
const summary = await getCustomerDetailsSummary(organisationId, customerId);
```

### Customer Information

The result includes:

```text
Customer identity
- id
- organisation_id
- customer_number
- full_name
- phone
- email
- date_of_birth
- age
- gender
- category
- address
- status
- created_at
- updated_at
```

### Financial Information

```text
- total_purchases
- total_spent
- outstanding_balance
```

### Credit Information

```text
- credit_enabled
- credit_limit
```

### Prescription / Medical Information

The summary also provides the current active prescription projection:

```text
- active_prescription_id
- active_prescription_number
- active_prescription_date
- doctor_name
- doctor_specialization
- hospital_or_clinic
- doctor_registration_number
- chronic_conditions
- drug_allergies
```

### Active Prescription Rule

When multiple active prescriptions exist, the query selects the most recent active prescription using:

```text
prescription_date DESC
created_at DESC
id DESC
```

Only one prescription is returned in the summary projection.

Complete prescription history should continue to be retrieved through the prescription-specific repository/query.

### Important

This query is a **summary projection**.

It should not be treated as the complete prescription-history query.

### Redis Cache

This query is **not cached**.

The result depends on customer-specific financial and prescription state, which can change through several independent write paths.

---

# 7. Customer Purchase History

## 7.1 `getCustomerPurchaseHistory()`

Returns purchase/invoice history for a customer.

### Usage

```js
const rows = await getCustomerPurchaseHistory({
  organisationId,
  customerId,
  searchTerm,
  limit,
  offset,
});
```

### Purpose

This query supports the Purchase History section of the Customer Details page.

It combines invoice and invoice-item information with completed payment information required by the UI.

### Payment Method Handling

A payment may contain multiple payment transactions.

Example:

```text
Payment REC-1001

Cash       ₹2,000
UPI        ₹3,000
----------------
Total      ₹5,000
```

The query represents this as a single payment.

Payment method display follows:

```text
No completed payment
    → Unpaid

One payment method
    → That payment method

Multiple payment methods
    → Mixed
```

The query must not treat split payment transactions as separate payments.

### Search

Purchase history supports relevant invoice/customer searching.

### Pagination

Use:

```js
limit;
offset;
```

for paginated UI results.

---

# 8. Customer Purchase Summary

## 8.1 `getCustomerPurchaseSummary()`

Returns aggregate purchase information for a customer.

### Usage

```js
const summary = await getCustomerPurchaseSummary(organisationId, customerId);
```

### Returns

```text
- total_invoices
- total_spent
- total_returns
- outstanding_balance
```

This function is intended for Customer Details summary cards and other aggregate purchase information.

---

# 9. Customer Return History

## 9.1 `getCustomerReturnHistory()`

Returns return history for a customer.

### Usage

```js
const rows = await getCustomerReturnHistory({
  organisationId,
  customerId,
  limit,
  offset,
});
```

### Returned Information

The query provides information such as:

```text
Return
- return number
- return date
- original invoice
- refund amount
- refund method
- status
- reason

Items
- returned items
```

### Empty Result

If the customer has no returns, an empty result is a valid result.

It should not be treated as an application error.

---

# 10. Customer Ledger

## 10.1 `getCustomerLedgerSummary()`

Returns the financial summary of one customer's ledger.

### Usage

```js
const summary = await getCustomerLedgerSummary(organisationId, customerId);
```

### Returns

```text
Customer
- customer identity

Credit
- credit_enabled
- credit_limit

Ledger
- current outstanding balance
- total debit
- total credit
```

### Current Balance

The current balance is obtained from the latest ledger entry.

The query orders ledger entries by:

```text
entry_date DESC
created_at DESC
id DESC
```

The numerically largest `balance_after` must not be used to determine the current balance.

A customer's balance may increase and decrease over time.

---

# 11. Customer Ledger Dashboard Statistics

## 11.1 `getCustomerLedgerDashboardStats()`

Returns organisation-wide statistics for the Customer Ledger dashboard.

### Usage

```js
const stats = await getCustomerLedgerDashboardStats(organisationId);
```

### Returns

```js
{
  (totalOutstanding,
    overdueAmount,
    totalCreditLimit,
    creditUtilization,
    customersWithOutstanding,
    customersWithOverdue);
}
```

Example:

```js
{
  totalOutstanding: 43850,
  overdueAmount: 8200,
  totalCreditLimit: 102000,
  creditUtilization: 42.99,
  customersWithOutstanding: 6,
  customersWithOverdue: 2
}
```

---

# 12. Overdue Ageing Rule

The current invoice schema does not contain a `due_date`.

Therefore the current implementation uses invoice age as the temporary overdue rule.

Current rule:

```text
Outstanding invoice
+
invoice_date is at least 30 days old
=
overdue
```

Therefore:

```text
29 days old + outstanding
    → Not overdue

30 days old + outstanding
    → Overdue

31 days old + outstanding
    → Overdue

Old invoice + fully paid
    → Not overdue

Old invoice + partially paid
    → Only remaining outstanding amount is overdue
```

Example:

```text
Invoice total:       ₹5,000
Completed payment:   ₹2,500
Outstanding:         ₹2,500

If invoice is at least 30 days old:

Overdue amount = ₹2,500
```

### Future Consideration

If the invoice schema later introduces a proper `due_date`, the overdue calculation should be reviewed and changed to use the actual due date.

### Redis Cache

This dashboard statistic is cached.

Cache key:

```text
organisation:<organisationId>:customer-billing:ledger-dashboard-stats
```

TTL:

```text
60 seconds
```

---

# 13. Customer Ledger Rows

## 13.1 `getCustomerCreditLedgerRows()`

Returns ledger entries for the Customer Ledger table.

### Usage

```js
const rows = await getCustomerCreditLedgerRows({
  organisationId,
  searchTerm,
  entryType,
  referenceType,
  dateFrom,
  dateTo,
  limit,
  offset,
});
```

### Supported Filters

- search
- ledger entry type
- ledger reference type
- date from
- date to
- pagination

### Returned Information

The result includes ledger information together with customer and branch context.

Typical fields include:

```text
Ledger
- date
- type
- reference
- description
- debit
- credit
- balance

Customer
- customer number
- customer name
- phone

Branch
- branch information
```

This query is read-only.

Do not use it to determine whether a new invoice, payment, return, or adjustment should be created.

---

# 14. Payment Receipt Dashboard

## 14.1 `getPaymentReceiptDashboardStats()`

Returns summary statistics for the Payment Receipts dashboard.

### Usage

```js
const stats = await getPaymentReceiptDashboardStats(organisationId);
```

### Returns

```text
- total_receipts
- completed_receipts
- total_collected
- today_collected
- pending_amount
- refunded_amount
```

### Split Payment Rule

The statistics are based on the `payments` table.

Do not sum `payment_transactions` directly when calculating total payment amounts.

For example:

```text
Payment REC-1001

Cash       ₹2,000
UPI        ₹3,000

Payment total = ₹5,000
```

The payment must be counted once as ₹5,000.

The existence of multiple payment transactions must not cause the payment amount to be double-counted.

### Redis Cache

This dashboard statistic is cached.

Cache key:

```text
organisation:<organisationId>:customer-billing:payment-receipt-dashboard-stats
```

TTL:

```text
60 seconds
```

---

# 15. Payment Receipt Dashboard Rows

## 15.1 `getPaymentReceiptDashboardRows()`

Returns rows required by the Payment Receipts table.

### Usage

```js
const rows = await getPaymentReceiptDashboardRows({
  organisationId,
  searchTerm,
  status,
  paymentMethod,
  dateFrom,
  dateTo,
  limit,
  offset,
});
```

### Returned Information

The query provides:

```text
Receipt
- receipt number
- payment date
- amount
- status

Customer
- customer name

Invoice
- invoice reference

Payment
- payment method
- transaction reference

User
- received by
```

### Split Payment Display

Multiple payment methods are aggregated into one display value.

Example:

```text
CASH + UPI
```

Transaction references are also aggregated where applicable.

### Search

The query supports searching by:

```text
- receipt number
- customer
- invoice reference
- transaction reference
```

### Filters

The query supports:

```text
- status
- payment method
- date range
- pagination
```

### Redis Cache

Payment Receipt rows are **not cached**.

Only the dashboard statistics are cached.

The row query has many possible combinations of:

- search
- status
- payment method
- date range
- pagination

Caching these combinations would create unnecessary cache invalidation complexity.

---

# 16. Redis Cache Strategy

Only stable dashboard statistics are cached.

## Cached

```text
Customer Directory statistics
Customer Ledger dashboard statistics
Payment Receipt dashboard statistics
```

## Not Cached

```text
Customer Directory rows
Customer Details summary
Purchase History
Purchase Summary
Return History
Customer Ledger summary
Customer Ledger rows
Payment Receipt rows
```

The purpose of this strategy is to cache high-value dashboard aggregates without creating a large number of difficult-to-invalidate filtered cache entries.

---

# 17. Redis Cache Keys

Every Customer & Billing dashboard cache key must contain the organisation ID.

Current keys:

```text
organisation:<organisationId>:customer-billing:directory-stats

organisation:<organisationId>:customer-billing:ledger-dashboard-stats

organisation:<organisationId>:customer-billing:payment-receipt-dashboard-stats
```

Never use a global cache key such as:

```text
customer-billing:directory-stats
```

The organisation ID is required to prevent data collisions between tenants.

---

# 18. Multi-Tenant Isolation

All queries must remain organisation-scoped.

For example:

```sql
WHERE c.id = $1
  AND c.organisation_id = $2
```

Cross-tenant access must never be possible simply because the caller knows a valid UUID belonging to another organisation.

The repository therefore uses both:

```text
customerId
+
organisationId
```

where customer-specific access is required.

Related entities are also joined through the customer's organisation.

---

# 19. Transactions and Redis

All relevant repository functions support an optional PostgreSQL transaction client.

Normal usage:

```js
const result = await getCustomerDetailsSummary(organisationId, customerId);
```

Transactional usage:

```js
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const result = await getCustomerDetailsSummary(
    organisationId,
    customerId,
    client,
  );

  await client.query("COMMIT");

  return result;
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}
```

## Redis Bypass During Transactions

When a transaction client is supplied, Redis is bypassed.

This is intentional.

Suppose a transaction creates or modifies data:

```text
BEGIN
    ↓
INSERT / UPDATE
    ↓
query using transaction client
```

The transaction can see its own uncommitted PostgreSQL changes.

Redis cannot.

Therefore:

```text
Normal pool-based read
    ↓
Redis cache
    ↓
PostgreSQL on miss
```

but:

```text
Transaction client read
    ↓
PostgreSQL directly
```

This prevents stale cached data from being returned when the transaction needs to see its own uncommitted changes.

---

# 20. Cache Invalidation

This repository is read-only.

It does not own business-event cache invalidation.

Write services are responsible for invalidating affected dashboard caches after successful mutations.

For example, after a customer-affecting mutation:

```js
await deleteCache(
  `organisation:${organisationId}:customer-billing:directory-stats`,
);
```

After a ledger-affecting mutation:

```js
await deleteCache(
  `organisation:${organisationId}:customer-billing:ledger-dashboard-stats`,
);
```

After a payment-affecting mutation:

```js
await deleteCache(
  `organisation:${organisationId}:customer-billing:payment-receipt-dashboard-stats`,
);
```

The PostgreSQL database remains the source of truth.

Redis is only a performance optimization.

---

# 21. Repository vs Service Responsibility

## Repository

The repository is responsible for:

```text
SQL
Joins
Aggregations
Tenant-scoped reads
Filtering
Pagination
Read projections
Designated cache-aside reads
Returning database results
```

## Service

The service is responsible for:

```text
Authentication
Authorization
Business rules
Business workflow orchestration
Input validation
Application-level visibility rules
Transaction orchestration
Mutation decisions
Cache invalidation after writes
```

## Controller

The controller is responsible for:

```text
HTTP request
Request parsing
Calling the service
HTTP response
Response formatting
```

---

# 22. Example Customer Directory Service

```js
const {
  getCustomerDirectoryStats,
  getCustomerDirectoryRows,
} = require("../repositories/customer-billing-queries.repository");

const getCustomerDirectory = async ({
  organisationId,
  searchTerm,
  category,
  creditEnabled,
  limit,
  offset,
}) => {
  // Authenticate user.
  // Resolve authenticated organisation.
  // Authorize Customer Directory access.
  // Validate filters.
  // Validate pagination.

  const [stats, rows] = await Promise.all([
    getCustomerDirectoryStats(organisationId),

    getCustomerDirectoryRows({
      organisationId,
      searchTerm,
      category,
      creditEnabled,
      limit,
      offset,
    }),
  ]);

  return {
    stats,
    rows,
  };
};
```

The controller should call the service instead of calling the repository directly.

---

# 23. Example Customer Details Service

```js
const {
  getCustomerDetailsSummary,
  getCustomerPurchaseHistory,
  getCustomerPurchaseSummary,
  getCustomerReturnHistory,
} = require("../repositories/customer-billing-queries.repository");

const getCustomerDetails = async ({
  organisationId,
  customerId,
  searchTerm,
  limit,
  offset,
}) => {
  // Authenticate user.
  // Resolve authenticated organisation.
  // Authorize Customer Details access.
  // Validate customerId.
  // Validate customer belongs to organisation.
  // Validate search/pagination.

  const [summary, purchases, purchaseSummary, returns] = await Promise.all([
    getCustomerDetailsSummary(organisationId, customerId),

    getCustomerPurchaseHistory({
      organisationId,
      customerId,
      searchTerm,
      limit,
      offset,
    }),

    getCustomerPurchaseSummary(organisationId, customerId),

    getCustomerReturnHistory({
      organisationId,
      customerId,
      limit,
      offset,
    }),
  ]);

  return {
    summary,
    purchases,
    purchaseSummary,
    returns,
  };
};
```

---

# 24. What This Repository Must NOT Do

Do not use this repository for mutations.

### Customers

```text
Do not create customers here.
Do not update customers here.
Do not delete customers here.
```

Use:

```text
customer.repository.js
```

through the appropriate service.

### Prescriptions

```text
Do not create or update prescriptions here.
```

Use:

```text
prescription.repository.js
```

### Invoices

```text
Do not create invoices here.
Do not complete invoices here.
Do not void invoices here.
```

Use:

```text
invoice.repository.js
```

through the invoice service/workflow.

### Payments

```text
Do not create payments here.
Do not create payment transactions here.
Do not allocate payments here.
```

Use the corresponding payment repositories and payment service.

### Returns

```text
Do not process returns here.
Do not restore inventory here.
Do not issue refunds here.
Do not create return ledger entries here.
```

Return processing belongs to the return service/workflow.

### Ledger

```text
Do not create ledger entries here.
Do not manually update customer balances here.
```

Ledger mutations belong to the appropriate financial service workflow.

---

# 25. Testing

The complete repository test is:

```text
backend/src/tests/customer-billing-queries.repository.test.js
```

Run:

```bash
node src/tests/customer-billing-queries.repository.test.js
```

The test covers:

```text
Customer Directory
Customer Directory filters

Customer Details
Purchase History
Purchase History search
Purchase History pagination
Purchase Summary
Return History

Customer Ledger
Ledger filters
Ledger pagination
Ledger dashboard statistics

Overdue ageing
31-day overdue invoice
29-day non-overdue invoice
Fully paid old invoice
Partial payment
Transaction rollback

Payment Receipt dashboard statistics
Payment Receipt rows
Receipt search
Customer search
Invoice search
Transaction reference search
Status filtering
Payment method filtering
Date filtering
Pagination
Split-payment aggregation

Customer Details tenant isolation
Customer Ledger tenant isolation
Customer Directory tenant isolation
Payment Receipt tenant isolation

Redis connection
Redis cache miss
Redis cache write
Redis cache read
Redis cache deletion

Directory statistics caching
Directory statistics cache hit

Ledger dashboard caching
Ledger dashboard cache hit

Payment Receipt statistics caching
Payment Receipt statistics cache hit

Tenant-safe Redis cache keys

Transaction-client Redis bypass
Transaction sees uncommitted PostgreSQL data
Redis snapshot preservation

Dashboard cache invalidation
```

The repository's Redis-integrated end-to-end test must pass before the repository is considered complete.

---

# 26. Quick Reference

| Screen / Feature              | Function                            | Cached |
| ----------------------------- | ----------------------------------- | -----: |
| Customer Directory statistics | `getCustomerDirectoryStats()`       |    Yes |
| Customer Directory rows       | `getCustomerDirectoryRows()`        |     No |
| Customer Details summary      | `getCustomerDetailsSummary()`       |     No |
| Purchase History              | `getCustomerPurchaseHistory()`      |     No |
| Purchase Summary              | `getCustomerPurchaseSummary()`      |     No |
| Return History                | `getCustomerReturnHistory()`        |     No |
| Customer Ledger summary       | `getCustomerLedgerSummary()`        |     No |
| Ledger dashboard statistics   | `getCustomerLedgerDashboardStats()` |    Yes |
| Ledger rows                   | `getCustomerCreditLedgerRows()`     |     No |
| Payment Receipt statistics    | `getPaymentReceiptDashboardStats()` |    Yes |
| Payment Receipt rows          | `getPaymentReceiptDashboardRows()`  |     No |

---

# 27. Recommended Usage by Screen

## Customer Directory

Use:

```js
getCustomerDirectoryStats();
getCustomerDirectoryRows();
```

## Customer Details

Use:

```js
getCustomerDetailsSummary();
getCustomerPurchaseHistory();
getCustomerPurchaseSummary();
getCustomerReturnHistory();
```

## Customer Ledger

Use:

```js
getCustomerLedgerDashboardStats();
getCustomerLedgerSummary();
getCustomerCreditLedgerRows();
```

## Payment Receipts

Use:

```js
getPaymentReceiptDashboardStats();
getPaymentReceiptDashboardRows();
```

---

# 28. Final Architecture Rule

When building a Customer & Billing screen:

```text
Need combined read-only dashboard data?
        ↓
Use customer-billing-queries.repository.js

Need entity-specific persistence?
        ↓
Use the appropriate entity repository

Need to mutate business data?
        ↓
Use the appropriate service + repository

Need authorization?
        ↓
Service layer

Need business rules?
        ↓
Service layer

Need a transaction?
        ↓
Service owns transaction orchestration
        ↓
Pass the PostgreSQL transaction client

Need cached dashboard statistics?
        ↓
Use the normal pool-based query
        ↓
Repository handles Redis

Need a read inside an active transaction?
        ↓
Pass the PostgreSQL transaction client
        ↓
Redis is bypassed

Need to invalidate dashboard cache after a write?
        ↓
Write service invalidates the affected cache
```

The Customer & Billing Query Repository is the **read-model layer** for the Customer & Billing module.

It provides the combined data required by the UI while keeping business logic, mutations, authorization, and workflow orchestration in their proper layers.
