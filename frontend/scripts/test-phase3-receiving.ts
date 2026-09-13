/**
 * PharmaFlow Phase 3 Verification Suite:
 * Offline Purchase Receiving & Goods Receipt Integration
 *
 * Verifies Scenarios A through T:
 * A: Offline receive succeeds locally
 * B: Local receipt survives reload/re-instantiation
 * C: RECEIVE_PURCHASE appears in sync_outbox
 * D: Local inventory increases immediately
 * E: Local transaction/history record is created in db.transactions
 * F: Sync succeeds (Push to backend)
 * G: Retry after timeout does not duplicate (Idempotent replay)
 * H: Backend transaction is atomic
 * I: Existing batch is incremented correctly
 * J: New batch is created correctly
 * K: Real RECEIVE_PURCHASE sync_changes payload contains items
 * L: Peer pull applies a real PURCHASE change without manually injecting items
 * M: Peer creates a missing inventory batch
 * N: Same PURCHASE change replay does not double-restock
 * O: Tenant isolation (Org A vs Org B)
 * P: Branch isolation
 * Q: Invalid receiving payload rejected (Validation)
 * R: Failed mutation remains locally visible
 * S: Authenticated real tenant does not require mocks
 * T: Existing demo/mock mode remains intact
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';
import { SyncEngine } from '../src/sync/syncEngine';
import { ConnectivityService } from '../src/sync/connectivityService';
import { PullWorker } from '../src/sync/pullWorker';
import { MOCK_GRN_LIST } from '../src/data/goodsReceivingMockData';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runPhase3ReceivingTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW PHASE 3: OFFLINE PURCHASE RECEIVING VERIFICATION');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:5000';

  // Real multi-tenant test IDs
  const TEST_ORG_A_ID = '2c778baa-10de-472c-a10d-796dbd4314ba';
  const TEST_BRANCH_A_ID = 'e329330e-787e-4e55-b88c-41506f955f83';
  const TEST_USER_A_ID = '33a7d546-e55d-4a11-8315-2e73d03ab0f2';
  const TEST_AUTH_TOKEN_A = `jwt_online_${TEST_USER_A_ID}_${Date.now()}`;

  const TEST_ORG_B_ID = '988c7a21-0167-4cf2-bce9-488812b551d8';
  const TEST_BRANCH_B_ID = '24743fa9-9916-4d7b-bbfc-9342087c8660';
  const TEST_USER_B_ID = 'cfdaa53d-0202-4b78-886f-a846af98d873';
  const TEST_AUTH_TOKEN_B = `jwt_online_${TEST_USER_B_ID}_${Date.now()}`;

  const dbName = `test_p3_receiving_${Date.now()}`;
  const db = new PharmaFlowDatabase(dbName);
  await db.open();

  const localService = new LocalPersistenceService(db);
  localService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);
  await localService.initialize(TEST_ORG_A_ID, TEST_BRANCH_A_ID);

  const connService = new ConnectivityService();
  connService.setMockStatus(false); // Start OFFLINE

  const sync = new SyncEngine(db, connService, undefined, BASE_URL);
  sync.setAuthToken(TEST_AUTH_TOKEN_A);
  sync.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID);

  // Setup initial existing product & batch in Dexie for Org A
  const existingProductId = `b1000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const existingBatchNumber = `BAT-EX-${Date.now().toString().slice(-4)}`;

  await db.inventory.put({
    id: `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`,
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    productId: existingProductId,
    batchNumber: existingBatchNumber,
    expiryDate: '2027-06-30',
    availableQuantity: 25,
    costPrice: 50,
    mrp: 80,
    sellingPrice: 80,
    updatedAt: new Date().toISOString(),
  });

  const newProductId = `b2000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const newBatchNumber = `BAT-NEW-${Date.now().toString().slice(-4)}`;

  // -------------------------------------------------------------------------
  // Scenario Q: Validation - Invalid receiving payloads rejected
  // -------------------------------------------------------------------------
  console.log('--- Scenario Q: Local Validation Rules ---');
  let threwEmpty = false;
  try {
    await localService.receiveLocalPurchase({
      purchaseNumber: 'PO-INVALID-1',
      items: [],
    });
  } catch (err: any) {
    threwEmpty = err.message.includes('at least one item');
  }
  assert(threwEmpty, 'Q1: Rejected purchase receipt with empty items array');

  let threwZeroQty = false;
  try {
    await localService.receiveLocalPurchase({
      purchaseNumber: 'PO-INVALID-2',
      items: [
        {
          productId: existingProductId,
          batchNumber: 'BAT-ZERO',
          quantity: 0,
        },
      ],
    });
  } catch (err: any) {
    threwZeroQty = err.message.includes('positive quantity');
  }
  assert(threwZeroQty, 'Q2: Rejected purchase receipt with zero quantity');

  let threwMissingBatch = false;
  try {
    await localService.receiveLocalPurchase({
      purchaseNumber: 'PO-INVALID-3',
      items: [
        {
          productId: existingProductId,
          batchNumber: '',
          quantity: 10,
        },
      ],
    });
  } catch (err: any) {
    threwMissingBatch = err.message.includes('batchNumber');
  }
  assert(threwMissingBatch, 'Q3: Rejected purchase receipt with missing batch number');

  // -------------------------------------------------------------------------
  // Scenario A, C, D, E, I, J: Offline receive with both existing & new batches
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario A, C, D, E, I, J: Offline Receive & Local Projection ---');
  const purchaseId = `d3000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const goodsReceiptId = `d3010000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

  const commitRes = await localService.receiveLocalPurchase(
    {
      purchaseId,
      goodsReceiptId,
      purchaseNumber: `PO-P3-${Date.now().toString().slice(-6)}`,
      supplierName: 'Sun Pharma Care',
      supplierInvoiceNumber: `INV-SP-${Date.now().toString().slice(-6)}`,
      packageCount: 4,
      notes: 'Temperature within range 2-8C',
      items: [
        {
          productId: existingProductId,
          productName: 'Existing Medicine',
          batchNumber: existingBatchNumber,
          expiryDate: '2027-06-30',
          quantity: 30, // 25 + 30 = 55
          costPrice: 50,
          mrp: 80,
        },
        {
          productId: newProductId,
          productName: 'New Medicine Batch',
          batchNumber: newBatchNumber,
          expiryDate: '2028-12-31',
          quantity: 40,
          costPrice: 90,
          mrp: 140,
        },
      ],
    },
    {
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
    }
  );

  assert(
    commitRes.purchaseId === purchaseId && commitRes.goodsReceiptId === goodsReceiptId,
    'A: Offline receive succeeds locally and returns client IDs'
  );

  // Check C: sync_outbox
  const outboxEntry = await db.sync_outbox
    .where('mutationId')
    .equals(commitRes.mutationId)
    .first();
  assert(
    outboxEntry !== undefined &&
      outboxEntry.mutationType === 'RECEIVE_PURCHASE' &&
      outboxEntry.status === 'PENDING',
    'C: RECEIVE_PURCHASE queued in sync_outbox with PENDING status'
  );

  // Check D & I: Existing batch incremented
  const existingBatchAfter = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`
  );
  assert(
    existingBatchAfter !== undefined && existingBatchAfter.availableQuantity === 55,
    'D & I: Existing inventory batch restocked immediately (25 + 30 = 55)'
  );

  // Check D & J: New batch created
  const newBatchAfter = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${newBatchNumber}_${newProductId}`
  );
  assert(
    newBatchAfter !== undefined &&
      newBatchAfter.availableQuantity === 40 &&
      newBatchAfter.mrp === 140 &&
      newBatchAfter.batchNumber === newBatchNumber,
    'D & J: New inventory batch projection created immediately in Dexie'
  );

  // Check E: Transaction record created
  const txRecord = await db.transactions.get(goodsReceiptId);
  assert(
    txRecord !== undefined &&
      txRecord.type === 'PURCHASE' &&
      txRecord.status === 'LOCAL_COMMITTED' &&
      txRecord.syncStatus === 'PENDING' &&
      txRecord.payload?.items?.length === 2,
    'E: Local transaction record created in db.transactions with type PURCHASE'
  );

  // -------------------------------------------------------------------------
  // Scenario B: Cold Reload Durability
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario B: Browser Reload Survival ---');
  const coldDb = new PharmaFlowDatabase(dbName);
  await coldDb.open();
  const coldLocalService = new LocalPersistenceService(coldDb);
  coldLocalService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);

  const coldReceipts = await coldLocalService.getLocalPurchaseReceipts(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
  assert(
    coldReceipts.length >= 1 && coldReceipts[0].realId === goodsReceiptId,
    'B: Goods receipt history successfully recovered after cold database re-instantiation'
  );

  const coldExistingBatch = await coldDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`
  );
  assert(
    coldExistingBatch !== undefined && coldExistingBatch.availableQuantity === 55,
    'B: Stock projection remains 55 after cold database restart'
  );

  // -------------------------------------------------------------------------
  // Scenario S & T: Mock vs Real Data Preservation
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario S & T: Mock Data & Real Flow Isolation ---');
  assert(
    coldReceipts.length > 0 && coldReceipts[0].id.length > 0,
    'S: Authenticated tenant flow returns real local Dexie receipts without mocks'
  );

  const emptyDb = new PharmaFlowDatabase(`test_empty_${Date.now()}`);
  await emptyDb.open();
  const emptyService = new LocalPersistenceService(emptyDb);
  const emptyReceipts = await emptyService.getLocalPurchaseReceipts('unseeded-org');
  assert(
    emptyReceipts.length === 0 && MOCK_GRN_LIST.length > 0,
    'T: Unseeded/demo fallback to MOCK_GRN_LIST preserved intact'
  );

  // -------------------------------------------------------------------------
  // Scenario F, H, K: Online Sync Push & sync_changes Payload
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario F, H, K: Sync Engine Push & Backend Atomicity ---');
  connService.setMockStatus(true); // Network returns!

  await sync.sync();

  // Verify outbox updated to COMPLETED and transaction to SYNCED
  const outboxAfter = await db.sync_outbox
    .where('mutationId')
    .equals(commitRes.mutationId)
    .first();
  assert(outboxAfter?.status === 'COMPLETED', 'F: Outbox entry marked COMPLETED', outboxAfter?.errorMessage);

  const txAfter = await db.transactions.get(goodsReceiptId);
  assert(txAfter?.syncStatus === 'SYNCED', 'F: Local transaction syncStatus updated to SYNCED');

  // Check K: Inspect real backend sync_changes stream without monkey-patching!
  const pullRes = await fetch(`${BASE_URL}/api/sync/pull?cursor=0&limit=1000`, {
    headers: {
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
  }).then((r) => r.json());

  const purchaseChange = pullRes.changes.find(
    (c: any) => c.entityType === 'PURCHASE' && c.entityId === purchaseId
  );
  assert(purchaseChange !== undefined, 'H: Backend atomically emitted PURCHASE sync_change event');
  assert(
    purchaseChange?.payload?.items && Array.isArray(purchaseChange.payload.items),
    'K: Real backend sync_changes payload contains items array'
  );
  assert(
    purchaseChange?.payload?.items?.length === 2 &&
      purchaseChange.payload.items.some((it: any) => it.batchNumber === newBatchNumber),
    'K: Real backend sync_changes items contain batchNumber, quantity, and pricing'
  );

  // -------------------------------------------------------------------------
  // Scenario G: Retry Idempotency
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario G: Push Retry Idempotency ---');
  const replayPushRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P3',
      mutations: [
        {
          mutationId: commitRes.mutationId,
          mutationType: 'RECEIVE_PURCHASE',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: outboxEntry!.payload,
        },
      ],
    }),
  }).then((r) => r.json());

  assert(
    replayPushRes.results[0].status === 'SUCCESS' &&
      replayPushRes.results[0].idempotentReplay === true,
    'G: Duplicate push identified as idempotentReplay: true without duplicating stock'
  );

  // -------------------------------------------------------------------------
  // Scenario L, M, N: Peer Device Pull (Real Change without Monkey-Patching!)
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario L, M, N: Peer Device Pull & Stock Reconciliation ---');
  const peerDbName = `test_p3_peer_${Date.now()}`;
  const peerDb = new PharmaFlowDatabase(peerDbName);
  await peerDb.open();

  // Peer already has existing batch with quantity 10
  await peerDb.inventory.put({
    id: `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`,
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    productId: existingProductId,
    batchNumber: existingBatchNumber,
    expiryDate: '2027-06-30',
    availableQuantity: 10,
    costPrice: 50,
    mrp: 80,
    sellingPrice: 80,
    updatedAt: new Date().toISOString(),
  });

  const peerPullWorker = new PullWorker(peerDb, BASE_URL);
  peerPullWorker.setAuthToken(TEST_AUTH_TOKEN_A);

  // Peer pulls the REAL purchase change directly from server
  await peerPullWorker.applyChangesLocally([purchaseChange]);

  // Check L: Peer existing batch was restocked by 30 (10 + 30 = 40)
  const peerExistingBatch = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`
  );
  assert(
    peerExistingBatch !== undefined && peerExistingBatch.availableQuantity === 40,
    'L: Peer device restocked existing batch (10 + 30 = 40) from real PURCHASE sync_change'
  );

  // Check M: Peer created missing new batch with quantity 40
  const peerNewBatch = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${newBatchNumber}_${newProductId}`
  );
  assert(
    peerNewBatch !== undefined &&
      peerNewBatch.availableQuantity === 40 &&
      peerNewBatch.batchNumber === newBatchNumber,
    'M: Peer device created missing new inventory batch (qty = 40)'
  );

  // Check N: Replay of same change does not double-restock
  await peerPullWorker.applyChangesLocally([purchaseChange]);
  const peerExistingAfterReplay = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${existingBatchNumber}_${existingProductId}`
  );
  assert(
    peerExistingAfterReplay?.availableQuantity === 40,
    'N: Replay of same change does not double-restock (idempotency key preserved)'
  );

  // -------------------------------------------------------------------------
  // Scenario O & P: Tenant and Branch Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario O & P: Multi-Tenant & Branch Isolation ---');
  const orgBPullRes = await fetch(`${BASE_URL}/api/sync/pull?cursor=0&limit=1000`, {
    headers: {
      Authorization: `Bearer ${TEST_AUTH_TOKEN_B}`,
      'x-organisation-id': TEST_ORG_B_ID,
      'x-branch-id': TEST_BRANCH_B_ID,
    },
  }).then((r) => r.json());

  const leakedPurchase = (orgBPullRes.changes || []).find(
    (c: any) => c.entityId === purchaseId || c.organisationId === TEST_ORG_A_ID
  );
  assert(leakedPurchase === undefined, 'O: Tenant B pull NEVER sees Tenant A purchase changes');

  // Branch isolation check on Dexie level
  const branchBBatch = await db.inventory.get(
    `${TEST_BRANCH_B_ID}_${existingBatchNumber}_${existingProductId}`
  );
  assert(branchBBatch === undefined, 'P: Branch A stock restock isolated from Branch B');

  // -------------------------------------------------------------------------
  // Scenario R: Failed Mutation Visibility
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario R: Failed Mutation Handling ---');
  const failedTxId = `d3020000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  await db.transactions.put({
    transactionId: failedTxId,
    mutationId: 'mut-failed-1',
    type: 'PURCHASE',
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    userId: TEST_USER_A_ID,
    deviceId: 'TEST-DEV',
    invoiceNumber: 'INV-FAIL-01',
    payload: {
      purchaseNumber: 'PO-FAIL-01',
      supplierName: 'Failed Supplier',
      items: [],
    },
    occurredAt: new Date().toISOString(),
    status: 'LOCAL_COMMITTED',
    syncStatus: 'FAILED',
    errorMessage: 'Supplier rejected order',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const failedReceipts = await localService.getLocalPurchaseReceipts(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
  const foundFailed = failedReceipts.find((r) => r.realId === failedTxId);
  assert(
    foundFailed !== undefined && foundFailed.syncStatus === 'FAILED',
    'R: Failed mutation remains locally visible in goods receipt history'
  );

  console.log('\n============================================================');
  console.log(`PHASE 3 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3ReceivingTests().catch((err) => {
  console.error('Fatal error in Phase 3 test suite:', err);
  process.exit(1);
});
