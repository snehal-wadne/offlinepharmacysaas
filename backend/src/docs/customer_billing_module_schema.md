# Pharmacy Billing SaaS — Customer & Billing Module

## 1. Purpose

This document explains the database design for the Customer & Billing module of the Pharmacy Billing SaaS.

The module is designed around these business concepts:

- Customer identity and profile
- Customer prescriptions and doctor information
- Customer credit facility
- Sales invoices
- Invoice line items
- Customer payments
- Split payment methods
- Payment-to-invoice allocation
- Customer financial ledger

The design is multi-tenant: an organisation is the tenant/business boundary, while billing transactions such as invoices and receipts are associated with the branch where they occur.

---

# 2. Core Design Decisions

## 2.1 Customer belongs to an organisation, not a branch

A customer is an organisation-level identity.

Example:

```text
Falah Pharmacy
│
├── Main Branch
├── East Branch
└── City Branch
```

If Rajesh is registered as:

```text
CUST-1001 → Rajesh Verma
```

he remains the same customer when purchasing from any branch belonging to Falah Pharmacy.

Therefore:

```text
Organisation 1 ─── N Customers
```

---

## 2.2 Prescription and doctor information are kept in one table

The current design intentionally does not create a separate `prescribers` table.

`prescriptions` stores:

- System-generated prescription number
- External prescription reference
- Doctor name
- Specialization
- Hospital/clinic
- Doctor registration number
- Chronic conditions
- Drug allergies
- Prescription date
- Status
- Notes

Relationship:

```text
Customer 1 ─── N Prescriptions
```

---

## 2.3 Invoice and Payment are different entities

An invoice represents a sale/financial obligation.

A payment represents money received from the customer.

They must not be treated as the same entity.

```text
INVOICE
"The customer owes ₹5,000 because of this sale."

PAYMENT
"The pharmacy received ₹5,000 from the customer."
```

An invoice can exist before payment, because the customer may purchase on credit.

---

# 3. Business Number Strategy

PostgreSQL UUIDs are used as technical primary keys.

Human-readable business numbers are generated separately through `number_sequences`.

Examples:

```text
CUST-1001
RX-1001
INV-1001
REC-1001
```

## 3.1 Number scope

| Business entity | Business number | Scope |
|---|---|---|
| Customer | `customer_number` | Organisation |
| Prescription | `prescription_number` | Organisation |
| Invoice | `invoice_number` | Branch |
| Payment receipt | `receipt_number` | Branch |

Therefore:

```text
Organisation A:
CUST-1001
CUST-1002

Organisation B:
CUST-1001
CUST-1002
```

is valid.

Likewise:

```text
Main Branch:
INV-1001
INV-1002

East Branch:
INV-1001
INV-1002
```

is valid.

## 3.2 Database uniqueness

The database enforces:

```sql
UNIQUE (organisation_id, customer_number)

UNIQUE (organisation_id, prescription_number)

UNIQUE (branch_id, invoice_number)

UNIQUE (branch_id, receipt_number)
```

## 3.3 Number generation

`number_sequences` contains the next number to issue.

Organisation-scoped sequence:

```text
organisation_id
branch_id = NULL
sequence_type = CUSTOMER
next_number = 1001
```

Branch-scoped sequence:

```text
organisation_id
branch_id = Main Branch
sequence_type = INVOICE
next_number = 1001
```

The application must increment the sequence inside a PostgreSQL transaction using row-level locking (`SELECT ... FOR UPDATE`).

Business numbers should not be reused. Gaps are acceptable.

---

# 4. Entity Overview

The module contains these tables:

1. `number_sequences`
2. `customers`
3. `prescriptions`
4. `customer_credit_accounts`
5. `invoices`
6. `invoice_items`
7. `payments`
8. `payment_transactions`
9. `payment_allocations`
10. `customer_ledger_entries`

Returns will be added later when the Returns workflow is implemented.

---

# 5. Relationship Overview

```text
                         ORGANISATION
                              │
                              │
                         ┌────┴─────┐
                         │          │
                         ▼          ▼
                     CUSTOMERS   BRANCHES
                         │          │
          ┌──────────────┼──────┐   │
          │              │      │   │
          ▼              ▼      ▼   │
   PRESCRIPTIONS    CREDIT     INVOICES
                    ACCOUNT       │
                                  ▼
                            INVOICE ITEMS
                                  │
                                  ▼
                               PRODUCTS
```

Payment side:

```text
                    CUSTOMER
                       │
                       ▼
                    PAYMENTS
                       │
              ┌────────┴────────┐
              ▼                 ▼
 PAYMENT_TRANSACTIONS    PAYMENT_ALLOCATIONS
       │                       │
   ┌───┼────┐                  │
   ▼   ▼    ▼                  ▼
 CASH UPI  BANK              INVOICES
```

Financial side:

```text
              INVOICE
                 │
                 │ DEBIT
                 ▼
        CUSTOMER LEDGER
                 ▲
                 │ CREDIT
                 │
              PAYMENT
```

---

# 6. `number_sequences`

## Responsibility

Generates human-readable business numbers independently for each required scope.

Supported sequence types:

```text
CUSTOMER
PRESCRIPTION
INVOICE
RECEIPT
```

### Relationship

```text
Organisation ─── N Number Sequences
Branch ─── N Branch-scoped Number Sequences
```

`branch_id = NULL` means the sequence is organisation-scoped.

Example:

```text
Organisation A | NULL      | CUSTOMER     | 1004
Organisation A | NULL      | PRESCRIPTION| 1008
Organisation A | Branch 1  | INVOICE      | 1021
Organisation A | Branch 1  | RECEIPT      | 1015
```

---

# 7. `customers`

## Responsibility

Stores the organisation-level customer identity and profile.

Important fields:

```text
id
organisation_id
customer_number
full_name
phone
email
date_of_birth
gender
category
address
status
created_at
updated_at
```

### Relationship

```text
Organisation 1 ─── N Customers
Customer 1 ─── N Prescriptions
Customer 1 ─── 0..1 Credit Account
Customer 1 ─── N Invoices
Customer 1 ─── N Payments
Customer 1 ─── N Ledger Entries
```

### Example

```text
Customer
-----------------------
id: UUID
organisation_id: Falah Pharmacy
customer_number: CUST-1001
full_name: Rajesh Verma
phone: 9876543210
status: ACTIVE
```

### Important constraint

```sql
UNIQUE (organisation_id, customer_number)
```

---

# 8. `prescriptions`

## Responsibility

Stores a customer's prescription together with doctor/prescriber information.

Important fields:

```text
id
organisation_id
customer_id
prescription_number
prescription_reference
doctor_name
specialization
hospital_or_clinic
doctor_registration_number
chronic_conditions
drug_allergies
prescription_date
status
notes
```

### Relationship

```text
Customer 1 ─── N Prescriptions
```

### Example

```text
CUST-1001
│
├── RX-1001
│     Doctor: Dr. Rahul Sharma
│     Specialization: General Physician
│
└── RX-1002
      Doctor: Dr. Priya Patel
      Specialization: Cardiologist
```

`prescription_number` is generated by the organisation-scoped sequence.

`prescription_reference` is an external reference supplied by the doctor/hospital and is not generated by our system.

---

# 9. `customer_credit_accounts`

## Responsibility

Represents the customer's credit facility.

It is configuration, not transaction history.

Important fields:

```text
id
organisation_id
customer_id
credit_enabled
credit_limit
created_at
updated_at
```

### Relationship

```text
Customer 1 ─── 0..1 Credit Account
```

### Example

```text
Customer: Rajesh

Credit Account
-----------------------
Credit Enabled: YES
Credit Limit: ₹10,000
```

The credit account says:

> "Rajesh is allowed to have up to ₹10,000 of outstanding credit."

It does NOT say how much Rajesh currently owes.

The current financial position comes from invoices/payments and the customer ledger.

### Constraint

```sql
UNIQUE (customer_id)
```

This ensures one credit account per customer.

---

# 10. `invoices`

## Responsibility

Represents a sale/bill issued by a pharmacy branch.

Important fields:

```text
id
organisation_id
branch_id
customer_id
prescription_id
invoice_number
invoice_date
subtotal
discount_amount
tax_amount
total_amount
status
notes
created_by
created_at
updated_at
```

### Relationship

```text
Customer 1 ─── N Invoices
Branch 1 ─── N Invoices
Prescription 1 ─── N Invoices (optional)
Invoice 1 ─── N Invoice Items
```

### Important principle

An invoice is independent of payment.

Example:

```text
INV-1001
Total = ₹5,000
```

The customer may:

- pay immediately
- pay partially
- pay later
- pay using multiple payment methods

Therefore there is no requirement that an invoice have exactly one payment.

### Constraint

```sql
UNIQUE (branch_id, invoice_number)
```

---

# 11. `invoice_items`

## Responsibility

Stores the individual products sold on an invoice.

Important fields:

```text
id
invoice_id
product_id
inventory_batch_id
product_name
batch_number
quantity
unit_price
discount_amount
tax_amount
line_total
created_at
```

### Relationship

```text
Invoice 1 ─── N Invoice Items
Product 1 ─── N Invoice Items
Inventory Batch 1 ─── N Invoice Items (optional)
```

### Example

```text
INV-1001
│
├── Crocin 500 × 2
├── Omeprazole × 1
└── Syrup × 1
```

`product_name` and `batch_number` are retained as historical snapshot information so later product changes do not alter the historical invoice.

---

# 12. `payments`

## Responsibility

Represents one overall payment received from a customer.

Important fields:

```text
id
organisation_id
branch_id
customer_id
receipt_number
payment_date
total_amount
status
notes
received_by
created_at
updated_at
```

### Important principle

The payment itself does NOT contain a single `payment_method`.

This is intentional because the client requires split payments.

Example:

```text
REC-1001
Total = ₹5,000
```

The payment can contain:

```text
Cash = ₹2,000
UPI  = ₹3,000
```

### Relationship

```text
Customer 1 ─── N Payments
Payment 1 ─── N Payment Transactions
Payment 1 ─── N Payment Allocations
```

### Constraint

```sql
UNIQUE (branch_id, receipt_number)
```

---

# 13. `payment_transactions`

## Responsibility

Represents the individual payment-method components of one payment.

This table directly implements the client's split-payment requirement.

Example:

```text
Payment REC-1001
Total = ₹5,000

Payment Transactions:

CASH → ₹2,000
UPI  → ₹3,000
```

Table fields:

```text
id
payment_id
payment_method
amount
transaction_reference
created_at
```

Supported methods:

```text
CASH
UPI
BANK_TRANSFER
CARD
CHEQUE
```

### Example

```text
payment_id     method          amount      reference
----------------------------------------------------
REC-1001       CASH            ₹2,000      NULL
REC-1001       UPI             ₹3,000      UPI-839472
```

The sum of payment transaction amounts must equal `payments.total_amount`.

This aggregate rule is enforced by the application/service transaction because a normal PostgreSQL CHECK constraint cannot validate a SUM across child rows.

---

# 14. `payment_allocations`

## Responsibility

Connects payments to invoices.

It answers:

> "Which invoice did this payment settle?"

It does NOT describe the payment method.

Payment method splitting belongs to `payment_transactions`.

### Relationship

```text
Payment N ─── M Invoice
       through
Payment Allocations
```

### Example

Suppose:

```text
INV-1001 = ₹5,000
INV-1002 = ₹4,000
```

Customer pays:

```text
REC-1001 = ₹7,000
```

The payment can be allocated:

```text
REC-1001 → INV-1001 → ₹5,000
REC-1001 → INV-1002 → ₹2,000
```

Table fields:

```text
id
payment_id
invoice_id
allocated_amount
created_at
```

### Constraint

```sql
UNIQUE (payment_id, invoice_id)
```

The same payment should not contain duplicate allocation rows for the same invoice.

---

# 15. Payment Method vs Payment Allocation

This distinction is fundamental.

## Payment Transactions

Answers:

> How did the customer pay?

```text
Payment ₹7,000
│
├── Cash ₹2,000
└── UPI  ₹5,000
```

## Payment Allocations

Answers:

> What did the customer pay?

```text
Payment ₹7,000
│
├── INV-1001 → ₹5,000
└── INV-1002 → ₹2,000
```

These are two independent dimensions.

---

# 16. `customer_ledger_entries`

## Responsibility

Represents the customer's financial statement.

Typical financial movements:

```text
Invoice    → Debit
Payment    → Credit
Return     → Credit (future)
Adjustment → Debit/Credit (future)
```

Important fields:

```text
id
organisation_id
customer_id
branch_id
entry_type
reference_type
reference_id
debit_amount
credit_amount
balance_after
entry_date
description
created_at
```

### Why `reference_type` + `reference_id`?

The ledger may eventually reference different transaction types:

```text
INVOICE
PAYMENT
RETURN
ADJUSTMENT
```

Therefore a conventional single foreign key cannot cover all possible source entities.

The service layer must verify that the referenced record belongs to the same organisation/customer.

---

# 17. Credit Account vs Ledger

This distinction must remain clear.

## Credit Account

Defines the allowed facility:

```text
Credit Enabled: YES
Credit Limit: ₹10,000
```

## Ledger

Shows actual financial movement:

```text
Invoice → Debit ₹5,000
Payment → Credit ₹2,000
Balance → ₹3,000
```

Therefore:

```text
Credit Limit = ₹10,000
Current Outstanding = ₹3,000
Available Credit = ₹7,000
```

Conceptually:

```text
CREDIT ACCOUNT
      │
      └── "How much credit may this customer use?"

LEDGER
      │
      └── "How much does this customer currently owe?"
```

---

# 18. Complete Example — Credit Sale

Assume:

```text
Customer: Rajesh
Customer Number: CUST-1001

Credit Limit: ₹10,000
Current Outstanding: ₹0
```

## Step 1 — Customer purchases ₹6,000

Invoice:

```text
INV-1001
Total = ₹6,000
```

No payment is made.

Ledger:

```text
Date       Type       Debit     Credit    Balance
-------------------------------------------------
01 Sep     Invoice    ₹6,000    ₹0        ₹6,000
```

Credit position:

```text
Credit Limit       ₹10,000
Outstanding          ₹6,000
Available Credit     ₹4,000
```

---

# 19. Step 2 — Customer makes a split payment

Rajesh pays:

```text
Cash = ₹2,000
UPI  = ₹1,000
Total = ₹3,000
```

Create one payment:

```text
REC-1001
Total = ₹3,000
```

Create two payment transactions:

```text
REC-1001 | CASH | ₹2,000 | NULL
REC-1001 | UPI  | ₹1,000 | UPI-928374
```

Create one payment allocation:

```text
REC-1001 → INV-1001 → ₹3,000
```

Ledger:

```text
Date       Type       Debit     Credit    Balance
-------------------------------------------------
01 Sep     Invoice    ₹6,000    ₹0        ₹6,000
03 Sep     Payment    ₹0        ₹3,000    ₹3,000
```

Now:

```text
Outstanding = ₹3,000
Available Credit = ₹7,000
```

---

# 20. Step 3 — Customer makes another purchase

Rajesh purchases another ₹4,000.

```text
INV-1002
Total = ₹4,000
```

No payment yet.

Ledger:

```text
Date       Type       Debit     Credit    Balance
-------------------------------------------------
01 Sep     Invoice    ₹6,000    ₹0        ₹6,000
03 Sep     Payment    ₹0        ₹3,000    ₹3,000
05 Sep     Invoice    ₹4,000    ₹0        ₹7,000
```

Now:

```text
Credit Limit       ₹10,000
Outstanding          ₹7,000
Available Credit     ₹3,000
```

---

# 21. Step 4 — Customer clears all outstanding

Rajesh pays:

```text
Cash = ₹2,000
UPI  = ₹5,000
Total = ₹7,000
```

Payment:

```text
REC-1002
Total = ₹7,000
```

Payment transactions:

```text
REC-1002 | CASH | ₹2,000
REC-1002 | UPI  | ₹5,000
```

Payment allocations:

```text
REC-1002 → INV-1001 → ₹3,000
REC-1002 → INV-1002 → ₹4,000
```

Ledger:

```text
Date       Type       Debit     Credit    Balance
-------------------------------------------------
01 Sep     Invoice    ₹6,000    ₹0        ₹6,000
03 Sep     Payment    ₹0        ₹3,000    ₹3,000
05 Sep     Invoice    ₹4,000    ₹0        ₹7,000
10 Sep     Payment    ₹0        ₹7,000    ₹0
```

Final:

```text
Credit Limit       ₹10,000
Outstanding              ₹0
Available Credit     ₹10,000
```

---

# 22. Important Dependency Diagram

```text
                         CUSTOMER
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
      PRESCRIPTIONS    CREDIT ACCOUNT     INVOICES
                                             │
                                             ▼
                                       INVOICE ITEMS
                                             │
                                             ▼
                                          PRODUCTS


                         CUSTOMER
                            │
                            ▼
                         PAYMENTS
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
       PAYMENT TRANSACTIONS      PAYMENT ALLOCATIONS
                │                       │
          ┌─────┼─────┐                 ▼
          ▼     ▼     ▼              INVOICES
        CASH   UPI   BANK


             INVOICE ───────────────► LEDGER
                                        ▲
                                        │
             PAYMENT ──────────────────┘
```

---

# 23. Transaction Rules

Financial operations should be performed atomically.

For example, recording a payment should conceptually happen inside one PostgreSQL transaction:

```text
BEGIN
   │
   ├── validate customer
   ├── validate invoice(s)
   ├── validate payment amount
   ├── create payment
   ├── create payment transactions
   ├── create payment allocations
   ├── calculate resulting balance
   ├── create ledger entry
   │
COMMIT
```

If any validation fails:

```text
ROLLBACK
```

No partial financial state should remain.

---

# 24. Multi-Tenant Safety

`organisation_id` and `branch_id` are important tenant boundaries.

PostgreSQL foreign keys guarantee that referenced records exist, but ordinary foreign keys do not automatically prove that independently supplied organisation, branch, customer, invoice and payment IDs belong to the same organisation.

Therefore the service layer must validate tenant/branch consistency before creating or modifying financial records.

For example:

```text
Payment.organisation_id
        must match
Customer.organisation_id

Payment.branch_id
        must belong to
Payment.organisation_id
```

Likewise:

```text
Invoice.customer_id
        must belong to
Invoice.organisation_id

Invoice.branch_id
        must belong to
Invoice.organisation_id
```

---

# 25. Indexing Strategy

The schema indexes the primary access paths.

## Customers

```text
(organisation_id)
(organisation_id, full_name)
(organisation_id, phone)
```

Useful for customer directory and phone/name search.

## Prescriptions

```text
(customer_id, prescription_date DESC)
(organisation_id)
(organisation_id, prescription_reference)
```

Useful for customer prescription history and reference searches.

## Credit Accounts

```text
(organisation_id)
```

Useful for organisation-level credit reporting.

## Invoices

```text
(customer_id, invoice_date DESC)
(branch_id, invoice_date DESC)
(organisation_id, invoice_date DESC)
(prescription_id)
```

Useful for purchase history, branch billing history and reporting.

## Invoice Items

```text
(invoice_id)
(product_id)
(inventory_batch_id)
```

Useful for invoice details, product sales reporting and batch traceability.

## Payments

```text
(customer_id, payment_date DESC)
(branch_id, payment_date DESC)
(organisation_id, payment_date DESC)
```

Useful for customer payment history and branch/organisation reporting.

## Payment Transactions

```text
(payment_id)
(transaction_reference)
```

Useful for receipt breakdown and UPI/UTR/reference searches.

## Payment Allocations

```text
(payment_id)
(invoice_id)
```

Useful in both directions:

```text
Payment → invoices settled
Invoice → payments received
```

## Ledger

```text
(customer_id, entry_date DESC)
(organisation_id, entry_date DESC)
(reference_type, reference_id)
(branch_id, entry_date DESC)
```

Useful for customer statements, financial reporting and opening the source transaction.

---

# 26. Why Returns Are Not Included Yet

Returns are intentionally not part of the current module schema.

When the Returns workflow is implemented, we will introduce:

```text
returns
return_items
```

A return can then affect:

```text
Customer
Invoice
Inventory
Ledger
Refund / customer credit
```

The ledger already supports future:

```text
RETURN
```

entries so the current design does not need to be redesigned when returns are added.

---

# 27. Final Mental Model

Remember these definitions:

```text
CUSTOMER
Who is the customer?

CREDIT ACCOUNT
How much credit is this customer allowed to use?

INVOICE
What did the customer buy / what financial obligation was created?

INVOICE ITEMS
Which products were sold?

PAYMENT
How much money did the pharmacy receive in one payment event?

PAYMENT TRANSACTIONS
How was that payment split?
Cash / UPI / Bank / Card / Cheque

PAYMENT ALLOCATIONS
Which invoice(s) did the payment settle?

LEDGER
How did the customer's financial balance change?
```

The core financial flow is:

```text
SALE
  │
  ▼
INVOICE
  │
  │ creates debt
  ▼
LEDGER DEBIT
  │
  │
  │ customer pays
  ▼
PAYMENT
  │
  ├── PAYMENT TRANSACTIONS
  │       ├── CASH
  │       ├── UPI
  │       └── BANK
  │
  └── PAYMENT ALLOCATIONS
          │
          └── INVOICE
                │
                ▼
          LEDGER CREDIT
```

The central rule is:

> **One sale produces one invoice regardless of how the customer pays. One payment can be split across multiple payment methods. One payment can settle one or multiple invoices. The ledger records the resulting financial movement.**
