# PharmaFlow Offline-First Persistence Layer Documentation

## 1. Architectural Overview & Guiding Principle

The PharmaFlow offline persistence architecture strictly adheres to the core offline-first synchronization rule:

> **"PUSH WHAT HAPPENED. PULL WHAT IS NOW TRUE."**

### Key Principles

1. **Cloud Authority:** PostgreSQL in the cloud is the authoritative, immutable source of truth for business audits, compliance, GST reporting, and global ledger state.
2. **Local Persistence Role:** The local IndexedDB database (`pharmaflow_local`) acts as:
   - A fast, low-latency local read cache for the product catalog, customer registry, and branch inventory batches.
   - An append-only local transaction log recording billing events.
   - A durable outbound mutation outbox queue (`sync_outbox`) tracking state changes to sync with the cloud.
3. **Selective Schema (No Blind Mirroring):** Local IndexedDB does not mirror all PostgreSQL relational tables or internal constraints. Only stores required for local offline POS operation are maintained.
4. **Multi-Store Atomicity:** Sales checkouts atomically write to the transaction aggregate, enqueue the sync outbox mutation, and decrement batch inventory in a single Dexie transaction. Partial writes are impossible.
5. **Durable & Non-Destructive:** Pending transactions and mutations survive page reloads and browser closures. Failed or conflicted sync items are preserved with detailed diagnostics for auditing and resolution—they are never silently purged.

---

## 2. Database Schema: `pharmaflow_local` (Version 1)

Implemented using Dexie.js for reactive, indexed, type-safe IndexedDB access.

| Store Name      | Primary Key             | Key Indexes                                                                                                                                              | Description                                                                             |
| :-------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `products`      | `productId` (string)    | `organisationId`, `barcode`, `sku`, `name`, `active`, `[organisationId+barcode]`, `[organisationId+name]`                                                | Local replica of server product catalog for rapid POS search and barcode lookup.        |
| `customers`     | `customerId` (string)   | `organisationId`, `phone`, `name`, `[organisationId+phone]`                                                                                              | Customer lookup cache and offline-created customer registry (`isLocallyCreated: true`). |
| `inventory`     | `id` (string)           | `organisationId`, `branchId`, `productId`, `batchNumber`, `expiryDate`, `[organisationId+branchId]`, `[branchId+productId]`                              | Local batch projection per branch. Supports FIFO/FEFO sorting and stock decrements.     |
| `transactions`  | `transactionId` (UUID)  | `mutationId`, `type`, `organisationId`, `branchId`, `userId`, `deviceId`, `occurredAt`, `status`, `syncStatus`, `createdAt`, `[organisationId+branchId]` | Append-only record of all business transactions executed on this terminal.              |
| `sync_outbox`   | `++sequence` (auto-inc) | `mutationId`, `mutationType`, `organisationId`, `branchId`, `status`, `nextRetryAt`, `createdAt`, `[organisationId+branchId]`                            | Durable FIFO queue of pending mutations to be pushed to the backend sync engine.        |
| `sync_metadata` | `key` (string)          | Primary key index                                                                                                                                        | Configuration storage (persistent `deviceId` UUID, pull sync cursors, timestamps).      |

---

## 3. Transaction & Outbox State Machines

### 3.1 Transaction Lifecycle (`TransactionRecord`)

```
               +------------------+
               |      DRAFT       |
               +--------+---------+
                        |
            [Local Commit at POS]
                        |
                        v
         +-----------------------------+
         |      LOCAL_COMMITTED        |
         |    (syncStatus: PENDING)    |
         +--------------+--------------+
                        |
             [Sync Worker Pushes]
                        |
                        v
         +-----------------------------+
         |           SYNCING           |
         +-------+-------------+-------+
                 |             |
         (200 OK)|             | (409 Conflict / Error)
                 v             v
         +---------------+  +---------------------+
         |    SYNCED     |  |   FAILED / CONFLICT |
         +---------------+  | (Preserves Details) |
                            +---------------------+
```

### 3.2 Outbox Mutation Queue (`SyncOutboxRecord`)

```
         +-----------------------------+
         |           PENDING           |
         |      (FIFO by sequence)     |
         +--------------+--------------+
                        |
            [Sync Engine Dispatches]
                        |
                        v
         +-----------------------------+
         |          IN_FLIGHT          |
         +-------+-------------+-------+
                 |             |
        (Success)|             | (Network / Server Error)
                 v             v
         +---------------+  +------------------------------------+
         |   COMPLETED   |  |          FAILED_RETRYABLE          |
         +---------------+  | (nextRetryAt = now + exp_backoff)  |
                            +-----------------+------------------+
                                              |
                                     (Max attempts / fatal)
                                              v
                                    +-------------------+
                                    |   FAILED_FATAL    |
                                    |    or CONFLICT    |
                                    +-------------------+
```

---

## 4. Multi-Store Atomic POS Checkout

When a cashier clicks **Pay Now** in the POS:

```
[POS UI Checkout]
       |
       v
LocalPersistenceService.commitLocalSale(saleData, context)
       |
       v
db.transaction('rw', [db.transactions, db.sync_outbox, db.inventory], async () => {
    1. Generate transactionId (UUID) & mutationId (UUID)
    2. Write TransactionRecord (status: 'LOCAL_COMMITTED', syncStatus: 'PENDING')
    3. Write SyncOutboxRecord (mutationType: 'CREATE_SALE', status: 'PENDING')
    4. For each sold item: decrement batch in `inventory` store
})
```

- **Atomicity Guarantee:** If any step encounters an exception (e.g. storage error, malformed item), Dexie automatically rejects and rolls back all changes.
- **Zero Incomplete Writes:** The system never writes a transaction without an outbox record, nor updates inventory without recording the transaction.

---

## 5. Persistent Device Identity (`deviceId`)

- On first run, `SyncMetadataRepository.getDeviceId()` generates an RFC4122 v4 UUID and persists it in `sync_metadata` under key `'deviceId'`.
- This `deviceId` is permanently stamped onto every `TransactionRecord` and `SyncOutboxRecord`.
- Enables backend idempotency deduplication: `(deviceId, mutationId)` guarantees that network retries never duplicate sales in PostgreSQL.

---

## 6. Integration Guide for the Future Sync Engine

When implementing the background Sync Engine (Push and Pull workers):

### 6.1 Push Worker (Outbound Sync)

1. **Query Pending Mutations:** Call `outboxRepo.peekPendingMutations(batchSize)`.
2. **Mark In-Flight:** Call `outboxRepo.markInFlight(seq)`.
3. **POST to Backend:** Send batch to `/api/sync/push`.
4. **On Success (HTTP 200 / 201):**
   - Call `outboxRepo.markCompleted(seq)`.
   - Call `txRepo.updateTransactionSyncStatus(txId, 'SYNCED')`.
5. **On Transient Error (HTTP 502/503/timeout):**
   - Call `outboxRepo.markFailed(seq, error.message, true)`. Exponential backoff will delay the next attempt.
6. **On Business Conflict (HTTP 409):**
   - Call `outboxRepo.markConflict(seq, response.conflictDetails)`.
   - Call `txRepo.updateTransactionSyncStatus(txId, 'CONFLICT', error.message, response.conflictDetails)`.
   - Raise alert in UI for resolution; **do NOT delete the local transaction**.

### 6.2 Pull Worker (Inbound Sync)

1. **Fetch Cursor:** Call `syncMetaRepo.getLastPullCursor('inventory')`.
2. **GET from Backend:** Call `/api/sync/pull?cursor=...`.
3. **Bulk Upsert:**
   - Call `productRepo.bulkUpsertProducts(data.products)`.
   - Call `invRepo.bulkUpsertInventory(data.batches)`.
   - Call `customerRepo.bulkUpsertCustomers(data.customers)`.
4. **Update Cursor:** Call `syncMetaRepo.setLastPullCursor(data.nextCursor, 'inventory')`.
5. **Record Timestamp:** Call `syncMetaRepo.setLastSuccessfulSyncAt()`.

---

## 7. Verification & Automated Test Suite

All 16 design requirements are verified using the automated test suite located at:
`frontend/scripts/test-persistence.ts`

### Running the Test Suite:

```bash
cd frontend
npm run test:persistence
```

### Verification Criteria Checklist:

- [x] **1. Initialization:** `pharmaflow_local` v1 initializes cleanly.
- [x] **2. Store Creation:** All 6 stores created with declared keys and indexes.
- [x] **3. Schema Versioning:** Compound indexes configured without data risk.
- [x] **4. Product Queries:** Bulk-upsert, ID lookup, barcode compound query, text search.
- [x] **5. Inventory Batches:** FEFO sorting by expiry date, branch batch lookup, stock decrement.
- [x] **6. Customer Management:** Search by phone, offline creation with `isLocallyCreated: true`.
- [x] **7. POS Sale Finalization:** Simultaneous atomic write to transactions, outbox, and inventory.
- [x] **8. Transaction Properties:** `status: 'LOCAL_COMMITTED'`, `syncStatus: 'PENDING'`.
- [x] **9. Outbox Properties:** Matching `mutationId`, `mutationType: 'CREATE_SALE'`, payload snapshot.
- [x] **10. Persistent Device ID:** UUID generated once and stamped on all mutations.
- [x] **11. Multi-Tenant Safety:** Strict partition isolation across `organisationId` and `branchId`.
- [x] **12. Atomic Rollback:** Simulated crash rolls back 100% of partial mutations.
- [x] **13. Offline Recovery:** Transactions survive simulated page reload/restart.
- [x] **14. Non-Destructive Errors:** Conflicted/failed transactions retain diagnostics without deletion.
- [x] **15. FIFO & Backoff:** Auto-increment queue order and retry backoff scheduling.
- [x] **16. Headless Platform Safety:** Works in Node/test environments and React Native Web.
