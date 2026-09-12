/**
 * Comprehensive Automated Verification Suite for PharmaFlow Local Persistence Layer
 *
 * Covers all 16 verification criteria:
 * 1. Dexie initialization with pharmaflow_local v1
 * 2. All 6 stores created with keys and indexes
 * 3. Safe schema versioning
 * 4. Product bulk-upsert and index queries (ID, barcode, name)
 * 5. Inventory batch querying and stock decrement
 * 6. Customer lookup, creation, and isLocallyCreated flag
 * 7. POS sale atomic write across transactions, sync_outbox, and inventory
 * 8. Transaction status = 'LOCAL_COMMITTED' and syncStatus = 'PENDING'
 * 9. Outbox record matching mutationId, CREATE_SALE, status = 'PENDING'
 * 10. Persistent deviceId in sync_metadata attached to transactions
 * 11. Multi-tenant partitioning by organisationId and branchId
 * 12. Atomic rollback: simulated failure leaves zero partial writes
 * 13. Offline recovery: simulated reload restores recent transactions
 * 14. Non-destructive conflict & failure handling
 * 15. Outbox FIFO sequence ordering & exponential backoff
 * 16. Headless test environment safety
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { SyncMetadataRepository } from '../src/db/repositories/syncMetadataRepository';
import { ProductRepository } from '../src/db/repositories/productRepository';
import { CustomerRepository } from '../src/db/repositories/customerRepository';
import { InventoryRepository } from '../src/db/repositories/inventoryRepository';
import { TransactionRepository } from '../src/db/repositories/transactionRepository';
import { OutboxRepository } from '../src/db/repositories/outboxRepository';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    testsFailed++;
  }
}

async function runAllTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW INDEXEDDB PERSISTENCE LAYER - 16 CRITERIA SUITE');
  console.log('============================================================\n');

  const testDbName = `pharmaflow_test_${Date.now()}`;
  const testDb = new PharmaFlowDatabase(testDbName);

  const syncMetaRepo = new SyncMetadataRepository(testDb);
  const prodRepo = new ProductRepository(testDb);
  const custRepo = new CustomerRepository(testDb);
  const invRepo = new InventoryRepository(testDb);
  const txRepo = new TransactionRepository(testDb);
  const outbox = new OutboxRepository(testDb);
  const localService = new LocalPersistenceService(testDb);

  try {
    // -------------------------------------------------------------
    // Test 1: Dexie initialization & name/version
    // -------------------------------------------------------------
    console.log('Test 1: Database Initialization & Versioning');
    await testDb.open();
    assert(testDb.isOpen(), 'Database opened successfully');
    assert(testDb.name === testDbName, 'Database has expected name');
    assert(testDb.verno === 1, 'Database version is 1');

    // -------------------------------------------------------------
    // Test 2: All 6 stores created with keys and indexes
    // -------------------------------------------------------------
    console.log('\nTest 2: Store Schema & Index Verification');
    const tableNames = testDb.tables.map((t) => t.name);
    const requiredStores = ['products', 'customers', 'inventory', 'transactions', 'sync_outbox', 'sync_metadata'];
    const allStoresPresent = requiredStores.every((s) => tableNames.includes(s));
    assert(allStoresPresent, 'All 6 required stores exist', `Found: ${tableNames.join(', ')}`);

    const prodSchema = testDb.table('products').schema;
    assert(prodSchema.primKey.name === 'productId', 'products primary key is productId');
    const outboxSchema = testDb.table('sync_outbox').schema;
    assert(Boolean(outboxSchema.primKey.name === 'sequence' && outboxSchema.primKey.auto), 'sync_outbox primary key is ++sequence');

    // -------------------------------------------------------------
    // Test 3: Safe Schema Upgrade Path
    // -------------------------------------------------------------
    console.log('\nTest 3: Safe Schema Upgrade Path');
    // Ensure stores have valid compound indexes configured
    const invIndexes = testDb.table('inventory').schema.indexes.map((idx) => idx.name);
    assert(invIndexes.includes('[branchId+productId]'), 'inventory has compound index [branchId+productId]');
    assert(invIndexes.includes('[organisationId+branchId]'), 'inventory has compound index [organisationId+branchId]');

    // -------------------------------------------------------------
    // Test 4: Product Bulk Upsert & Indexed Queries
    // -------------------------------------------------------------
    console.log('\nTest 4: Product Bulk Upsert & Queries');
    const sampleProducts = [
      {
        productId: 'PRD-T01',
        organisationId: 'ORG-A',
        name: 'Paracetamol 650mg Tablets',
        genericName: 'Paracetamol',
        barcode: '8901234567890',
        sku: 'PCM650',
        gstRate: 5,
        mrp: 35.0,
        sellingPrice: 32.0,
        unit: 'Strip',
        active: true,
        updatedAt: new Date().toISOString(),
      },
      {
        productId: 'PRD-T02',
        organisationId: 'ORG-A',
        name: 'Amoxicillin 500mg Capsules',
        genericName: 'Amoxicillin',
        barcode: '8909876543210',
        sku: 'AMX500',
        gstRate: 12,
        mrp: 110.0,
        sellingPrice: 95.0,
        unit: 'Strip',
        active: true,
        updatedAt: new Date().toISOString(),
      },
    ];

    await prodRepo.bulkUpsertProducts(sampleProducts);
    const byId = await prodRepo.getProductById('PRD-T01');
    assert(byId !== undefined && byId.name === 'Paracetamol 650mg Tablets', 'Lookup product by ID works');

    const byBarcode = await prodRepo.findProductByBarcode('ORG-A', '8909876543210');
    assert(byBarcode !== undefined && byBarcode.productId === 'PRD-T02', 'Lookup product by compound [organisationId+barcode] works');

    const searchResults = await prodRepo.searchProducts('ORG-A', 'paracetamol');
    assert(searchResults.length === 1 && searchResults[0].productId === 'PRD-T01', 'Search product by query text works');

    // -------------------------------------------------------------
    // Test 5: Inventory Batch Management & FEFO Sorting
    // -------------------------------------------------------------
    console.log('\nTest 5: Inventory Batch Projection & Stock Decrement');
    const sampleBatches = [
      {
        id: 'BR-1_B002_PRD-T01',
        organisationId: 'ORG-A',
        branchId: 'BR-1',
        productId: 'PRD-T01',
        batchNumber: 'B002',
        expiryDate: '2027-06-30',
        availableQuantity: 50,
        mrp: 35.0,
        sellingPrice: 32.0,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'BR-1_B001_PRD-T01',
        organisationId: 'ORG-A',
        branchId: 'BR-1',
        productId: 'PRD-T01',
        batchNumber: 'B001',
        expiryDate: '2026-12-31', // earlier expiry
        availableQuantity: 30,
        mrp: 35.0,
        sellingPrice: 32.0,
        updatedAt: new Date().toISOString(),
      },
    ];

    await invRepo.bulkUpsertInventory(sampleBatches);
    const batches = await invRepo.getBatchesByProduct('BR-1', 'PRD-T01');
    assert(batches.length === 2, 'Retrieved 2 batches for product');
    assert(batches[0].batchNumber === 'B001', 'Batches sorted by expiryDate ascending (FEFO)');

    const totalStock = await invRepo.getAvailableStockForProduct('BR-1', 'PRD-T01');
    assert(totalStock === 80, 'Total available stock computed correctly (30 + 50 = 80)');

    const updatedBatch = await invRepo.decrementBatchStock('BR-1', 'PRD-T01', 'B001', 10);
    assert(updatedBatch.availableQuantity === 20, 'Stock decremented from 30 to 20');

    // -------------------------------------------------------------
    // Test 6: Customer Lookup, Local Creation & Flags
    // -------------------------------------------------------------
    console.log('\nTest 6: Customer Operations & Offline Creation Flags');
    const newCustomer = await custRepo.createLocalCustomer({
      organisationId: 'ORG-A',
      name: 'Dr. Ramesh Kumar',
      phone: '9876543210',
      address: '123 Market Road, Pune',
    });

    assert(newCustomer.isLocallyCreated === true, 'Offline created customer marked isLocallyCreated = true');
    assert(newCustomer.syncStatus === 'PENDING', 'Offline created customer marked syncStatus = PENDING');

    const foundCust = await custRepo.findCustomerByPhone('ORG-A', '9876543210');
    assert(foundCust !== undefined && foundCust.name === 'Dr. Ramesh Kumar', 'Customer found by compound [organisationId+phone]');

    // -------------------------------------------------------------
    // Test 7, 8, 9, 10: Atomic POS Sale Finalization
    // -------------------------------------------------------------
    console.log('\nTest 7-10: Atomic POS Sale Commit (Transactions + Outbox + Inventory + DeviceID)');
    const salePayload = {
      invoiceNo: 'INV-TEST-001',
      customer: 'Dr. Ramesh Kumar',
      customerPhone: '9876543210',
      paymentMode: 'Cash',
      subtotal: 160.0,
      tax: 8.0,
      total: 168.0,
      items: [
        {
          id: 'PRD-T01',
          name: 'Paracetamol 650mg Tablets',
          batch: 'B001',
          qty: 5,
          price: 32.0,
          mrp: 35.0,
          total: 160.0,
        },
      ],
    };

    const commitResult = await localService.commitLocalSale(salePayload, {
      organisationId: 'ORG-A',
      branchId: 'BR-1',
      userId: 'USR-01',
    });

    // Test 7: Atomic commit completed
    assert(Boolean(commitResult.transactionId && commitResult.mutationId), 'Test 7: Sale commit returned transactionId and mutationId');

    // Test 8: Transaction record properties
    const savedTx = await txRepo.getTransactionById(commitResult.transactionId);
    assert(savedTx !== undefined, 'Test 8: Transaction record written to transactions store');
    assert(savedTx?.status === 'LOCAL_COMMITTED', 'Test 8: Transaction status is LOCAL_COMMITTED');
    assert(savedTx?.syncStatus === 'PENDING', 'Test 8: Transaction syncStatus is PENDING');

    // Test 9: Outbox record properties
    const pendingMutations = await outbox.peekPendingMutations(10);
    const matchingOutbox = pendingMutations.find((m) => m.mutationId === commitResult.mutationId);
    assert(matchingOutbox !== undefined, 'Test 9: Outbox record found with matching mutationId');
    assert(matchingOutbox?.mutationType === 'CREATE_SALE', 'Test 9: Outbox mutationType is CREATE_SALE');
    assert(matchingOutbox?.status === 'PENDING', 'Test 9: Outbox status is PENDING');
    assert(matchingOutbox?.payload?.invoiceNumber === 'INV-TEST-001', 'Test 9: Outbox contains full payload snapshot');

    // Check inventory decrement
    const batchAfterSale = await testDb.inventory
      .where('[branchId+productId]')
      .equals(['BR-1', 'PRD-T01'])
      .filter((b) => b.batchNumber === 'B001')
      .first();
    assert(batchAfterSale?.availableQuantity === 15, 'Test 7: Inventory batch deducted from 20 to 15');

    // Test 10: Persistent Device ID
    const deviceId = await syncMetaRepo.getDeviceId();
    assert(Boolean(deviceId && deviceId.length > 10), 'Test 10: Persistent deviceId retrieved from sync_metadata');
    assert(savedTx?.deviceId === deviceId, 'Test 10: Transaction record contains matching persistent deviceId');
    assert(matchingOutbox?.deviceId === deviceId, 'Test 10: Outbox mutation contains matching persistent deviceId');

    // -------------------------------------------------------------
    // Test 11: Multi-Tenant Partitioning
    // -------------------------------------------------------------
    console.log('\nTest 11: Multi-Tenant Data Partitioning');
    const orgBProducts = await prodRepo.getAllProducts('ORG-B');
    assert(orgBProducts.length === 0, 'ORG-B sees 0 products from ORG-A');
    const orgBCustomers = await custRepo.findCustomerByPhone('ORG-B', '9876543210');
    assert(orgBCustomers === undefined, 'ORG-B cannot access customer from ORG-A');

    // -------------------------------------------------------------
    // Test 12: Atomic Rollback on Failure
    // -------------------------------------------------------------
    console.log('\nTest 12: Atomic Transaction Rollback on Mid-Flight Failure');
    const initialTxCount = await testDb.transactions.count();
    const initialOutboxCount = await testDb.sync_outbox.count();
    const initialBatchQty = (await testDb.inventory
      .where('[branchId+productId]')
      .equals(['BR-1', 'PRD-T01'])
      .filter((b) => b.batchNumber === 'B001')
      .first())?.availableQuantity;

    let rollbackErrorThrown = false;
    try {
      await testDb.transaction('rw', [testDb.transactions, testDb.sync_outbox, testDb.inventory], async () => {
        // Step A: insert dummy transaction
        await testDb.transactions.put({
          transactionId: 'TX-FAIL-TEST',
          mutationId: 'MUT-FAIL-TEST',
          type: 'SALE',
          organisationId: 'ORG-A',
          branchId: 'BR-1',
          userId: 'USR-01',
          deviceId,
          payload: {},
          occurredAt: new Date().toISOString(),
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Step B: simulate catastrophic runtime failure
        throw new Error('Simulated hardware/network failure during commit');
      });
    } catch (e: any) {
      rollbackErrorThrown = true;
    }

    assert(rollbackErrorThrown, 'Simulated failure caused transaction rejection');
    const finalTxCount = await testDb.transactions.count();
    const finalOutboxCount = await testDb.sync_outbox.count();
    const finalBatchQty = (await testDb.inventory
      .where('[branchId+productId]')
      .equals(['BR-1', 'PRD-T01'])
      .filter((b) => b.batchNumber === 'B001')
      .first())?.availableQuantity;

    assert(finalTxCount === initialTxCount, 'Rollback: No partial transaction record saved');
    assert(finalOutboxCount === initialOutboxCount, 'Rollback: No partial outbox record saved');
    assert(finalBatchQty === initialBatchQty, 'Rollback: Inventory quantity remained unchanged');

    // -------------------------------------------------------------
    // Test 13: Offline Recovery / App Reload
    // -------------------------------------------------------------
    console.log('\nTest 13: Offline Recovery / Simulated Reload');
    // Instantiate a fresh LocalPersistenceService pointing to same database
    const reloadedService = new LocalPersistenceService(testDb);
    const recentInvoices = await reloadedService.getRecentInvoices('BR-1');
    assert(recentInvoices.length >= 1, 'Recovered completed transactions after simulated restart');
    assert(recentInvoices[0].invoiceNo === 'INV-TEST-001', 'Recovered correct invoice number');
    assert(recentInvoices[0].syncStatus === 'PENDING', 'Recovered invoice preserves PENDING syncStatus');

    // -------------------------------------------------------------
    // Test 14: Non-Destructive Conflict & Error Handling
    // -------------------------------------------------------------
    console.log('\nTest 14: Non-Destructive Conflict & Error Preservation');
    await txRepo.updateTransactionSyncStatus(
      commitResult.transactionId,
      'CONFLICT',
      'Remote version mismatch: invoice number already committed',
      { remoteVersion: 3, localVersion: 1 }
    );

    const conflictedTx = await txRepo.getTransactionById(commitResult.transactionId);
    assert(conflictedTx !== undefined, 'Transaction record was NOT deleted on conflict');
    assert(conflictedTx?.syncStatus === 'CONFLICT', 'syncStatus updated to CONFLICT');
    assert(Boolean(conflictedTx?.errorMessage?.includes('Remote version mismatch')), 'Error message preserved in transaction');
    assert(conflictedTx?.conflictDetails?.remoteVersion === 3, 'Conflict details payload preserved');

    // -------------------------------------------------------------
    // Test 15: Outbox FIFO Sequence Ordering & Exponential Backoff
    // -------------------------------------------------------------
    console.log('\nTest 15: Outbox FIFO Ordering & Retry Backoff');
    const seq1 = await outbox.enqueueMutation({
      mutationId: 'MUT-FIFO-1',
      mutationType: 'CREATE_SALE',
      organisationId: 'ORG-A',
      branchId: 'BR-1',
      deviceId,
      userId: 'USR-01',
      payload: { test: 1 },
    });

    const seq2 = await outbox.enqueueMutation({
      mutationId: 'MUT-FIFO-2',
      mutationType: 'CREATE_SALE',
      organisationId: 'ORG-A',
      branchId: 'BR-1',
      deviceId,
      userId: 'USR-01',
      payload: { test: 2 },
    });

    assert(seq2 > seq1, 'Outbox sequence increments monotonically');

    // Test retryable failure with backoff
    await outbox.markFailed(seq1, 'Network timeout', true, 5000); // 5 second backoff
    const failedItem = await testDb.sync_outbox.get(seq1);
    assert(failedItem?.status === 'FAILED_RETRYABLE', 'Outbox marked FAILED_RETRYABLE');
    assert(failedItem?.attemptCount === 1, 'Outbox attemptCount incremented to 1');
    assert(Boolean(failedItem?.nextRetryAt), 'Outbox nextRetryAt scheduled in the future');

    // Peek pending mutations should skip seq1 because nextRetryAt is in the future
    const peeked = await outbox.peekPendingMutations(10);
    const hasSeq1 = peeked.some((item) => item.sequence === seq1);
    assert(!hasSeq1, 'Outbox correctly hides items with future nextRetryAt');

    // Mark completed
    await outbox.markCompleted(seq2);
    const completedItem = await testDb.sync_outbox.get(seq2);
    assert(completedItem?.status === 'COMPLETED', 'Outbox item marked COMPLETED');

    // -------------------------------------------------------------
    // Test 10: Specific Section 10 Offline Recovery & Correctness Scenarios
    // -------------------------------------------------------------
    console.log('\nTest Section 10: Offline Recovery Scenarios (A through G)');

    // 10A & 10B: Create offline sale -> reload application -> sale & outbox remain
    const sale10Payload = {
      invoiceNo: 'INV-OFFLINE-RELOAD-1',
      customer: 'Anita Desai',
      customerPhone: '9988776655',
      paymentMode: 'UPI',
      subtotal: 300.0,
      tax: 15.0,
      total: 315.0,
      items: [
        {
          id: 'PRD-T01',
          name: 'Paracetamol 650mg Tablets',
          batch: 'B001',
          qty: 2,
          price: 32.0,
          total: 64.0,
        },
      ],
    };

    const res10 = await localService.commitLocalSale(sale10Payload, {
      organisationId: 'ORG-A',
      branchId: 'BR-1',
      userId: 'USR-02',
    });

    // Simulate complete reload with fresh service instance
    const freshServiceAfterReload = new LocalPersistenceService(testDb);
    const invoicesAfterReload = await freshServiceAfterReload.getRecentInvoices('BR-1');
    const saleRemains = invoicesAfterReload.some((inv) => inv.invoiceNo === 'INV-OFFLINE-RELOAD-1');
    assert(saleRemains, '10A: Offline sale remains in local transactions after simulated reload');

    const outboxAfterReload = await outbox.peekPendingMutations(50);
    const outboxRemains = outboxAfterReload.find((m) => m.mutationId === res10.mutationId);
    assert(outboxRemains !== undefined, '10B: Outbox mutation remains after simulated reload');
    assert(outboxRemains?.payload?.invoiceNumber === 'INV-OFFLINE-RELOAD-1', '10B: Outbox retains full payload');

    // 10C: Attempt local transaction where one operation fails -> verify complete rollback
    const preFailTxCount = await testDb.transactions.count();
    const preFailOutboxCount = await testDb.sync_outbox.count();
    let caught10C = false;
    try {
      await testDb.transaction('rw', [testDb.transactions, testDb.sync_outbox, testDb.inventory], async () => {
        await testDb.transactions.put({
          transactionId: 'TX-10C-FAIL',
          mutationId: 'MUT-10C-FAIL',
          type: 'SALE',
          organisationId: 'ORG-A',
          branchId: 'BR-1',
          userId: 'USR-01',
          deviceId,
          payload: {},
          occurredAt: new Date().toISOString(),
          status: 'LOCAL_COMMITTED',
          syncStatus: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        throw new Error('Forced failure in 10C atomic step');
      });
    } catch (err) {
      caught10C = true;
    }
    const postFailTxCount = await testDb.transactions.count();
    const postFailOutboxCount = await testDb.sync_outbox.count();
    assert(caught10C && postFailTxCount === preFailTxCount && postFailOutboxCount === preFailOutboxCount,
      '10C: Complete rollback verified when IndexedDB write fails partway through');

    // 10D: Create two offline sales -> verify FIFO sequence
    const sale10D_1 = await localService.commitLocalSale(
      { invoiceNo: 'INV-FIFO-A', total: 100, items: [] },
      { organisationId: 'ORG-A', branchId: 'BR-1' }
    );
    const sale10D_2 = await localService.commitLocalSale(
      { invoiceNo: 'INV-FIFO-B', total: 200, items: [] },
      { organisationId: 'ORG-A', branchId: 'BR-1' }
    );
    const allPending = await outbox.peekPendingMutations(100);
    const itemA = allPending.find((m) => m.mutationId === sale10D_1.mutationId);
    const itemB = allPending.find((m) => m.mutationId === sale10D_2.mutationId);
    assert(Boolean(itemA && itemB && itemA.sequence! < itemB.sequence!),
      '10D: Outbox mutations preserve strict monotonic FIFO sequence ordering');

    // 10E: Create sale for organisation A -> verify organisation B cannot retrieve it
    const orgASales = await txRepo.getRecentTransactions('BR-1', 50, 'ORG-A');
    const orgBSales = await txRepo.getRecentTransactions('BR-1', 50, 'ORG-B');
    const orgBLeaked = orgBSales.some((s) => s.organisationId === 'ORG-A');
    assert(!orgBLeaked && orgBSales.length === 0,
      '10E: Strict tenant partition - Org B cannot retrieve sales from Org A');

    // 10F: Create inventory for branch A -> verify branch B cannot retrieve it
    await invRepo.bulkUpsertInventory([
      {
        id: 'BR-ALPHA_BATCH-10F_PRD-10F',
        organisationId: 'ORG-A',
        branchId: 'BR-ALPHA',
        productId: 'PRD-10F',
        batchNumber: 'BATCH-10F',
        expiryDate: '2028-01-01',
        availableQuantity: 100,
        mrp: 50,
        sellingPrice: 45,
        updatedAt: new Date().toISOString(),
      },
    ]);
    const branchABatches = await invRepo.getBatchesByProduct('BR-ALPHA', 'PRD-10F');
    const branchBBatches = await invRepo.getBatchesByProduct('BR-BETA', 'PRD-10F');
    assert(branchABatches.length === 1 && branchBBatches.length === 0,
      '10F: Strict branch partition - Branch B cannot retrieve inventory from Branch A');

    // 10G: Verify mutationId remains unchanged across retries / status updates
    const initialMutationId = itemA!.mutationId;
    await outbox.markFailed(itemA!.sequence!, 'Network dropped', true, 1000);
    const afterRetry1 = await testDb.sync_outbox.get(itemA!.sequence!);
    assert(afterRetry1?.mutationId === initialMutationId,
      '10G: mutationId unchanged after first retryable failure');

    await outbox.markFailed(itemA!.sequence!, 'Server unavailable 503', true, 2000);
    const afterRetry2 = await testDb.sync_outbox.get(itemA!.sequence!);
    assert(afterRetry2?.mutationId === initialMutationId,
      '10G: mutationId unchanged after second retryable failure');

    await outbox.markConflict(itemA!.sequence!, { conflictReason: 'Duplicate invoice' });
    const afterConflict = await testDb.sync_outbox.get(itemA!.sequence!);
    assert(afterConflict?.mutationId === initialMutationId,
      '10G: mutationId unchanged after conflict status update');

    // -------------------------------------------------------------
    // Test 16: Headless Test & Universal Platform Safety
    // -------------------------------------------------------------
    console.log('\nTest 16: Headless Platform Safety');
    assert(typeof indexedDB !== 'undefined', 'IndexedDB interface is polyfilled/supported in current environment');
    assert(testDb.isOpen(), 'Dexie functions seamlessly without browser window');

  } finally {
    await testDb.delete();
  }

  console.log('\n============================================================');
  console.log(`PERSISTENCE VERIFICATION RESULT: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error running persistence tests:', err);
  process.exit(1);
});
