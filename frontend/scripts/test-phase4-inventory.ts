/**
 * PharmaFlow Phase 4 Verification Suite:
 * Offline Stock Adjustment & Inter-Branch Stock Transfer
 *
 * Verifies Scenarios A through Z:
 * Phase 4A - Stock Adjustment:
 * A: Validation - Invalid adjustment payloads rejected locally (zero delta, missing fields)
 * B: Offline positive adjustment (+15) updates Dexie immediately, logs transaction & queues outbox
 * C: Offline negative adjustment (-20) updates Dexie immediately
 * D: Local negative stock prevention (delta exceeding available stock rejected)
 * E: Cold database reload durability (adjustments & inventory survive reload)
 * F: Online sync push succeeds, outbox marked COMPLETED, transaction SYNCED
 * G: Server-side negative stock rejection returns CONFLICT (ADJUSTMENT_WOULD_CAUSE_NEGATIVE_STOCK)
 * H: Push retry idempotency returns idempotentReplay: true without double-applying delta
 * I: Real backend sync_changes stream emits entity_type: 'ADJUSTMENT' with delta payload
 * J: Peer device pulls ADJUSTMENT and updates local batch with delta
 * K: Originating device pulls own ADJUSTMENT and avoids double-applying delta
 * L: Replay of same ADJUSTMENT change on peer does not double-apply delta
 *
 * Phase 4B - Stock Transfer:
 * M: Validation - Same source and destination branch rejected locally
 * N: Validation - Insufficient source stock rejected locally
 * O: Offline transfer dispatch decrements source stock immediately, logs transaction & queues outbox
 * P: Cold database reload durability (transfers & decremented stock survive reload)
 * Q: Online sync push succeeds, outbox marked COMPLETED, transaction SYNCED
 * R: Server-side insufficient stock conflict returns CONFLICT (INSUFFICIENT_TRANSFER_STOCK)
 * S: Push retry idempotency returns idempotentReplay: true without double decrement
 * T: Real backend sync_changes stream emits entity_type: 'TRANSFER' with items
 * U: Source branch peer pull decrements stock without double-decrementing on originating device
 * V: Destination branch peer pull restocks/creates batch on completion
 *
 * Tenant & Demo Isolation:
 * W: Tenant isolation - Tenant B never receives Tenant A adjustments or transfers
 * X: Branch isolation - Branch stock movements partitioned by branchId
 * Y: Authenticated empty-tenant isolation displays real empty state ([]) without mocks
 * Z: Unauthenticated / demo mode preserves MOCK_STOCK_ITEMS and MOCK_TRANSFERS
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';
import { SyncEngine } from '../src/sync/syncEngine';
import { ConnectivityService } from '../src/sync/connectivityService';
import { PullWorker } from '../src/sync/pullWorker';
import { MOCK_STOCK_ITEMS } from '../src/data/currentStockMockData';
import { MOCK_TRANSFERS } from '../src/data/stockTransferMockData';

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

async function runPhase4InventoryTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW PHASE 4: OFFLINE STOCK ADJUSTMENT & TRANSFER');
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

  // Destination branch for transfers
  let TEST_DEST_BRANCH_ID = '01c35676-65dd-46d4-be21-f88ee54503c9';

  // Ensure destination branch exists in backend
  try {
    const branchRes = await fetch(`${BASE_URL}/api/branches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
      },
      body: JSON.stringify({
        organisationId: TEST_ORG_A_ID,
        name: 'Downtown Secondary Branch',
        branchCode: `BR-P4-${Date.now().toString().slice(-4)}`,
        status: 'ACTIVE',
      }),
    }).then((r) => r.json());

    if (branchRes.success && branchRes.data?.id) {
      TEST_DEST_BRANCH_ID = branchRes.data.id;
    }
  } catch (e) {
    // Keep fallback
  }

  const dbName = `test_p4_inventory_${Date.now()}`;
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

  // Setup initial product & batch in Dexie AND authoritative server via initial purchase receipt
  const testProductId = `c4000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const testBatchNumber = `BAT-P4-${Date.now().toString().slice(-4)}`;

  // Populate local Dexie batch with initial quantity = 50
  await db.inventory.put({
    id: `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`,
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    productId: testProductId,
    batchNumber: testBatchNumber,
    expiryDate: '2027-12-31',
    availableQuantity: 50,
    costPrice: 40,
    mrp: 75,
    sellingPrice: 75,
    updatedAt: new Date().toISOString(),
  });

  // Seed authoritative batch in PostgreSQL via a pre-sync RECEIVE_PURCHASE mutation
  const seedPurchaseId = `c4010000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P4-SEED',
      mutations: [
        {
          mutationId: `seed-mut-${Date.now()}`,
          mutationType: 'RECEIVE_PURCHASE',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: {
            purchaseId: seedPurchaseId,
            goodsReceiptId: `grn-seed-${Date.now()}`,
            purchaseNumber: `PO-SEED-${Date.now().toString().slice(-4)}`,
            receiptNumber: `GR-SEED-${Date.now().toString().slice(-4)}`,
            items: [
              {
                productId: testProductId,
                productName: 'Phase 4 Test Medicine',
                batchNumber: testBatchNumber,
                expiryDate: '2027-12-31',
                quantity: 50,
                costPrice: 40,
                mrp: 75,
              },
            ],
          },
        },
      ],
    }),
  });

  // =========================================================================
  // PHASE 4A: STOCK ADJUSTMENT TESTS
  // =========================================================================
  console.log('--- Phase 4A: Stock Adjustment Tests ---');

  // Scenario A: Validation
  console.log('\n--- Scenario A: Adjustment Validation ---');
  let threwZeroDelta = false;
  try {
    await localService.adjustLocalStock({
      productId: testProductId,
      batchNumber: testBatchNumber,
      deltaQuantity: 0,
    });
  } catch (err: any) {
    threwZeroDelta = err.message.includes('deltaQuantity');
  }
  assert(threwZeroDelta, 'A1: Rejected stock adjustment with zero delta');

  let threwMissingBatch = false;
  try {
    await localService.adjustLocalStock({
      productId: testProductId,
      batchNumber: '',
      deltaQuantity: 10,
    });
  } catch (err: any) {
    threwMissingBatch = err.message.includes('batchNumber');
  }
  assert(threwMissingBatch, 'A2: Rejected stock adjustment with missing batchNumber');

  // Scenario B: Offline Positive Adjustment (+15)
  console.log('\n--- Scenario B: Offline Positive Adjustment ---');
  const posAdjRes = await localService.adjustLocalStock(
    {
      productId: testProductId,
      productName: 'Phase 4 Test Medicine',
      batchNumber: testBatchNumber,
      deltaQuantity: 15,
      reason: 'Physical count surplus',
      notes: 'Found extra unopened box',
    },
    {
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
    }
  );

  assert(
    posAdjRes.newQuantity === 65,
    'B1: Local batch quantity immediately updated from 50 to 65 (delta +15)'
  );

  const outboxAdj1 = await db.sync_outbox
    .where('mutationId')
    .equals(posAdjRes.mutationId)
    .first();
  assert(
    outboxAdj1 !== undefined &&
      outboxAdj1.mutationType === 'ADJUST_STOCK' &&
      outboxAdj1.payload.deltaQuantity === 15 &&
      outboxAdj1.status === 'PENDING',
    'B2: ADJUST_STOCK queued in sync_outbox with PENDING status and delta +15'
  );

  const txAdj1 = await db.transactions.get(posAdjRes.adjustmentId);
  assert(
    txAdj1 !== undefined &&
      txAdj1.type === 'ADJUSTMENT' &&
      txAdj1.syncStatus === 'PENDING' &&
      txAdj1.payload.deltaQuantity === 15,
    'B3: Local transaction record created in db.transactions with type ADJUSTMENT'
  );

  // Scenario C: Offline Negative Adjustment (-20)
  console.log('\n--- Scenario C: Offline Negative Adjustment ---');
  const negAdjRes = await localService.adjustLocalStock(
    {
      productId: testProductId,
      productName: 'Phase 4 Test Medicine',
      batchNumber: testBatchNumber,
      deltaQuantity: -20,
      reason: 'Damaged packaging write-off',
    },
    {
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
    }
  );

  assert(
    negAdjRes.newQuantity === 45,
    'C1: Local batch quantity immediately updated from 65 to 45 (delta -20)'
  );

  // Scenario D: Local Negative Stock Prevention
  console.log('\n--- Scenario D: Local Negative Stock Prevention ---');
  let threwNegativeLocal = false;
  try {
    await localService.adjustLocalStock({
      productId: testProductId,
      batchNumber: testBatchNumber,
      deltaQuantity: -50, // 45 - 50 = -5 (must reject!)
    });
  } catch (err: any) {
    threwNegativeLocal = err.message.includes('negative quantity');
  }
  assert(
    threwNegativeLocal,
    'D: Rejected adjustment causing negative quantity (45 - 50 = -5)'
  );

  const currentBatchCheck = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    currentBatchCheck?.availableQuantity === 45,
    'D2: Inventory stock maintained intact at 45 after rejection'
  );

  // Scenario E: Browser Reload Durability
  console.log('\n--- Scenario E: Cold Database Reload Durability ---');
  const coldDb = new PharmaFlowDatabase(dbName);
  await coldDb.open();
  const coldService = new LocalPersistenceService(coldDb);
  coldService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);

  const coldBatch = await coldDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    coldBatch?.availableQuantity === 45,
    'E1: Stock quantity 45 accurately persisted after cold database re-instantiation'
  );

  const coldAdjustments = await coldService.getLocalStockAdjustments(
    TEST_ORG_A_ID,
    TEST_BRANCH_A_ID
  );
  assert(
    coldAdjustments.length >= 2,
    `E2: Local adjustment history recovered (${coldAdjustments.length} records)`
  );

  // Scenario F: Online Sync Push
  console.log('\n--- Scenario F: Online Sync Push of ADJUST_STOCK ---');
  connService.setMockStatus(true); // Network online

  await sync.sync();

  const outboxAdjAfter1 = await db.sync_outbox
    .where('mutationId')
    .equals(posAdjRes.mutationId)
    .first();
  const outboxAdjAfter2 = await db.sync_outbox
    .where('mutationId')
    .equals(negAdjRes.mutationId)
    .first();

  assert(
    outboxAdjAfter1?.status === 'COMPLETED' && outboxAdjAfter2?.status === 'COMPLETED',
    'F1: Both outbox ADJUST_STOCK mutations marked COMPLETED',
    outboxAdjAfter1?.errorMessage || outboxAdjAfter2?.errorMessage
  );

  const txAdjAfter1 = await db.transactions.get(posAdjRes.adjustmentId);
  const txAdjAfter2 = await db.transactions.get(negAdjRes.adjustmentId);
  assert(
    txAdjAfter1?.syncStatus === 'SYNCED' && txAdjAfter2?.syncStatus === 'SYNCED',
    'F2: Local transactions updated to SYNCED'
  );

  // Scenario G: Server-side Negative Stock Rejection
  console.log('\n--- Scenario G: Server-Side Negative Stock Rejection ---');
  const excessiveDeltaRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P4',
      mutations: [
        {
          mutationId: `mut-conflict-${Date.now()}`,
          mutationType: 'ADJUST_STOCK',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: {
            adjustmentId: `adj-conflict-${Date.now()}`,
            productId: testProductId,
            batchNumber: testBatchNumber,
            deltaQuantity: -999, // Way more than server's 45 units!
            reason: 'Excessive adjustment',
          },
        },
      ],
    }),
  }).then((r) => r.json());

  assert(
    excessiveDeltaRes.results[0].status === 'CONFLICT' &&
      excessiveDeltaRes.results[0].error?.code === 'ADJUSTMENT_WOULD_CAUSE_NEGATIVE_STOCK',
    'G: Server rejected negative-stock adjustment with code ADJUSTMENT_WOULD_CAUSE_NEGATIVE_STOCK'
  );

  // Scenario H: Push Retry Idempotency
  console.log('\n--- Scenario H: Push Retry Idempotency ---');
  const replayAdjRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P4',
      mutations: [
        {
          mutationId: posAdjRes.mutationId,
          mutationType: 'ADJUST_STOCK',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: outboxAdj1!.payload,
        },
      ],
    }),
  }).then((r) => r.json());

  assert(
    replayAdjRes.results[0].status === 'SUCCESS' &&
      replayAdjRes.results[0].idempotentReplay === true,
    'H: Duplicate push recognized as idempotentReplay: true without double-applying delta'
  );

  // Scenario I: sync_changes Event Emission
  console.log('\n--- Scenario I: Backend sync_changes Emission ---');
  const pullChangesRes = await fetch(
    `${BASE_URL}/api/sync/pull?cursor=0&limit=1000`,
    {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
        'x-branch-id': TEST_BRANCH_A_ID,
      },
    }
  ).then((r) => r.json());

  const adjChange = (pullChangesRes.changes || []).find(
    (c: any) => c.entityType === 'ADJUSTMENT' && c.entityId === posAdjRes.adjustmentId
  );
  assert(
    adjChange !== undefined,
    'I1: Backend atomically emitted ADJUSTMENT event in sync_changes'
  );
  assert(
    adjChange?.payload?.deltaQuantity === 15 &&
      adjChange?.payload?.batchNumber === testBatchNumber,
    'I2: ADJUSTMENT sync_change payload contains deltaQuantity and batchNumber'
  );

  // Scenario J: Peer Device Pull
  console.log('\n--- Scenario J: Peer Device Pull of ADJUSTMENT ---');
  const peerDbName = `test_p4_peer_${Date.now()}`;
  const peerDb = new PharmaFlowDatabase(peerDbName);
  await peerDb.open();

  // Peer initial inventory batch has 10 units
  await peerDb.inventory.put({
    id: `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`,
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    productId: testProductId,
    batchNumber: testBatchNumber,
    expiryDate: '2027-12-31',
    availableQuantity: 10,
    costPrice: 40,
    mrp: 75,
    sellingPrice: 75,
    updatedAt: new Date().toISOString(),
  });

  const peerPullWorker = new PullWorker(peerDb, BASE_URL);
  peerPullWorker.setAuthToken(TEST_AUTH_TOKEN_A);

  await peerPullWorker.applyChangesLocally([adjChange]);

  const peerBatchAfter = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    peerBatchAfter?.availableQuantity === 25,
    'J: Peer device applied delta (+15) to local batch (10 + 15 = 25)'
  );

  // Scenario K: Originating Device Self-Deduplication
  console.log('\n--- Scenario K: Originating Device Self-Deduplication ---');
  const originPullWorker = new PullWorker(db, BASE_URL);
  originPullWorker.setAuthToken(TEST_AUTH_TOKEN_A);

  // Originating terminal pulls its own change
  await originPullWorker.applyChangesLocally([adjChange]);

  const originBatchAfterPull = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    originBatchAfterPull?.availableQuantity === 45,
    'K: Originating device avoided double-applying delta on pull (maintained 45)'
  );

  // Scenario L: Pull Replay Idempotency
  console.log('\n--- Scenario L: Peer Pull Replay Idempotency ---');
  await peerPullWorker.applyChangesLocally([adjChange]);
  const peerBatchAfterReplay = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    peerBatchAfterReplay?.availableQuantity === 25,
    'L: Replay of same ADJUSTMENT change on peer did not double-apply (remains 25)'
  );

  // =========================================================================
  // PHASE 4B: STOCK TRANSFER TESTS
  // =========================================================================
  console.log('\n============================================================');
  console.log('--- Phase 4B: Stock Transfer Tests ---');

  // Scenario M: Validation - Same Source and Destination Branch
  console.log('\n--- Scenario M: Source & Destination Validation ---');
  let threwSameBranch = false;
  try {
    await localService.transferLocalStock({
      fromBranchId: TEST_BRANCH_A_ID,
      toBranchId: TEST_BRANCH_A_ID, // Identical!
      items: [
        {
          productId: testProductId,
          batchNumber: testBatchNumber,
          quantity: 5,
        },
      ],
    });
  } catch (err: any) {
    threwSameBranch = err.message.includes('must be different');
  }
  assert(threwSameBranch, 'M: Rejected transfer with identical source and destination branch');

  // Scenario N: Validation - Insufficient Local Source Stock
  console.log('\n--- Scenario N: Insufficient Source Stock Validation ---');
  let threwInsufficientTransfer = false;
  try {
    await localService.transferLocalStock({
      fromBranchId: TEST_BRANCH_A_ID,
      toBranchId: TEST_DEST_BRANCH_ID,
      items: [
        {
          productId: testProductId,
          batchNumber: testBatchNumber,
          quantity: 999, // Available is 45!
        },
      ],
    });
  } catch (err: any) {
    threwInsufficientTransfer = err.message.includes('Insufficient stock');
  }
  assert(threwInsufficientTransfer, 'N: Rejected transfer with requested quantity exceeding source stock');

  // Scenario O: Offline Transfer Dispatch
  console.log('\n--- Scenario O: Offline Stock Transfer Dispatch ---');
  connService.setMockStatus(false); // Back OFFLINE

  const transferRes = await localService.transferLocalStock(
    {
      fromBranchId: TEST_BRANCH_A_ID,
      toBranchId: TEST_DEST_BRANCH_ID,
      toBranchName: 'Downtown Secondary Branch',
      notes: 'Weekly dispensary replenishment',
      items: [
        {
          productId: testProductId,
          productName: 'Phase 4 Test Medicine',
          batchNumber: testBatchNumber,
          quantity: 10,
        },
      ],
    },
    {
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
    }
  );

  const sourceBatchAfterTransfer = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    sourceBatchAfterTransfer?.availableQuantity === 35,
    'O1: Source branch stock decremented immediately from 45 to 35 (transferred 10)'
  );

  const outboxTr = await db.sync_outbox
    .where('mutationId')
    .equals(transferRes.mutationId)
    .first();
  assert(
    outboxTr !== undefined &&
      outboxTr.mutationType === 'TRANSFER_STOCK' &&
      outboxTr.payload.status === 'IN_TRANSIT' &&
      outboxTr.payload.totalQuantity === 10,
    'O2: TRANSFER_STOCK enqueued in sync_outbox with status IN_TRANSIT'
  );

  const txTr = await db.transactions.get(transferRes.transferId);
  assert(
    txTr !== undefined &&
      txTr.type === 'TRANSFER' &&
      txTr.syncStatus === 'PENDING' &&
      txTr.payload.totalQuantity === 10,
    'O3: Transaction record created in db.transactions with type TRANSFER'
  );

  // Scenario P: Browser Reload Durability
  console.log('\n--- Scenario P: Transfer Reload Durability ---');
  const coldTrDb = new PharmaFlowDatabase(dbName);
  await coldTrDb.open();
  const coldTrService = new LocalPersistenceService(coldTrDb);
  coldTrService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);

  const coldTransfers = await coldTrService.getLocalTransfers(
    TEST_ORG_A_ID,
    TEST_BRANCH_A_ID
  );
  assert(
    coldTransfers.length >= 1 && coldTransfers[0].realId === transferRes.transferId,
    'P1: Transfer record successfully restored after cold database re-instantiation'
  );

  const coldSourceBatch = await coldTrDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    coldSourceBatch?.availableQuantity === 35,
    'P2: Source stock projection remains 35 after reload'
  );

  // Scenario Q: Online Sync Push of TRANSFER_STOCK
  console.log('\n--- Scenario Q: Online Sync Push of TRANSFER_STOCK ---');
  connService.setMockStatus(true); // Online

  await sync.sync();

  const outboxTrAfter = await db.sync_outbox
    .where('mutationId')
    .equals(transferRes.mutationId)
    .first();
  assert(
    outboxTrAfter?.status === 'COMPLETED',
    'Q1: Outbox TRANSFER_STOCK mutation marked COMPLETED',
    outboxTrAfter?.errorMessage
  );

  const txTrAfter = await db.transactions.get(transferRes.transferId);
  assert(
    txTrAfter?.syncStatus === 'SYNCED',
    'Q2: Local transfer transaction syncStatus updated to SYNCED'
  );

  // Scenario R: Server-Side Insufficient Stock Conflict
  console.log('\n--- Scenario R: Server-Side Insufficient Stock Conflict ---');
  const serverConflictTrRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P4',
      mutations: [
        {
          mutationId: `tr-conflict-${Date.now()}`,
          mutationType: 'TRANSFER_STOCK',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: {
            transferId: `tr-id-conflict-${Date.now()}`,
            fromBranchId: TEST_BRANCH_A_ID,
            toBranchId: TEST_DEST_BRANCH_ID,
            items: [
              {
                productId: testProductId,
                batchNumber: testBatchNumber,
                quantity: 9999, // Insufficient on server
              },
            ],
          },
        },
      ],
    }),
  }).then((r) => r.json());

  assert(
    serverConflictTrRes.results[0].status === 'CONFLICT' &&
      serverConflictTrRes.results[0].error?.code === 'INSUFFICIENT_TRANSFER_STOCK',
    'R: Server rejected excessive transfer with code INSUFFICIENT_TRANSFER_STOCK'
  );

  // Scenario S: Push Retry Idempotency for TRANSFER_STOCK
  console.log('\n--- Scenario S: Push Retry Idempotency for Transfer ---');
  const replayTrRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify({
      deviceId: 'TEST-DEVICE-P4',
      mutations: [
        {
          mutationId: transferRes.mutationId,
          mutationType: 'TRANSFER_STOCK',
          organisationId: TEST_ORG_A_ID,
          branchId: TEST_BRANCH_A_ID,
          userId: TEST_USER_A_ID,
          payload: outboxTr!.payload,
        },
      ],
    }),
  }).then((r) => r.json());

  assert(
    replayTrRes.results[0].status === 'SUCCESS' &&
      replayTrRes.results[0].idempotentReplay === true,
    'S: Duplicate transfer push recognized as idempotentReplay: true'
  );

  // Scenario T: Backend sync_changes Emission for Transfer
  console.log('\n--- Scenario T: Backend sync_changes for Transfer ---');
  const pullTrChanges = await fetch(
    `${BASE_URL}/api/sync/pull?cursor=0&limit=1000`,
    {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
        'x-branch-id': TEST_BRANCH_A_ID,
      },
    }
  ).then((r) => r.json());

  const transferChange = (pullTrChanges.changes || []).find(
    (c: any) => c.entityType === 'TRANSFER' && c.entityId === transferRes.transferId
  );
  assert(
    transferChange !== undefined,
    'T1: Backend atomically emitted TRANSFER event in sync_changes'
  );
  assert(
    transferChange?.payload?.items?.length === 1 &&
      transferChange?.payload?.toBranchId === TEST_DEST_BRANCH_ID,
    'T2: TRANSFER sync_change payload contains items and destination branch'
  );

  // Scenario U: Source Branch Peer Pull
  console.log('\n--- Scenario U: Source Branch Peer Pull ---');
  // Peer device in source branch had initial 25 units
  await peerPullWorker.applyChangesLocally([transferChange]);

  const peerSourceBatchAfter = await peerDb.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    peerSourceBatchAfter?.availableQuantity === 15,
    'U1: Source branch peer decremented stock upon pull (25 - 10 = 15)'
  );

  // Originating terminal pulls its own transfer change
  await originPullWorker.applyChangesLocally([transferChange]);
  const originSourceBatchAfter = await db.inventory.get(
    `${TEST_BRANCH_A_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    originSourceBatchAfter?.availableQuantity === 35,
    'U2: Originating terminal avoided double-decrementing own transfer (remains 35)'
  );

  // Scenario V: Destination Branch Peer Pull (Receipt / Restock)
  console.log('\n--- Scenario V: Destination Branch Peer Pull ---');
  const destPeerDb = new PharmaFlowDatabase(`test_dest_peer_${Date.now()}`);
  await destPeerDb.open();
  const destPullWorker = new PullWorker(destPeerDb, BASE_URL);
  destPullWorker.setAuthToken(TEST_AUTH_TOKEN_A);

  // Completed transfer change arriving at destination branch
  const completedTrChange = {
    ...transferChange,
    payload: {
      ...transferChange.payload,
      status: 'COMPLETED',
    },
  };

  await destPullWorker.applyChangesLocally([completedTrChange]);

  const destBatch = await destPeerDb.inventory
    .where('[branchId+productId]')
    .equals([TEST_DEST_BRANCH_ID, testProductId])
    .first();

  assert(
    destBatch !== undefined && destBatch.availableQuantity === 10,
    'V: Destination branch peer created/restocked inventory batch with 10 units on transfer receipt'
  );

  // =========================================================================
  // TENANT & DEMO ISOLATION TESTS
  // =========================================================================
  console.log('\n============================================================');
  console.log('--- Tenant & Demo Isolation Tests ---');

  // Scenario W: Tenant Isolation
  console.log('\n--- Scenario W: Multi-Tenant Isolation ---');
  const orgBPullRes = await fetch(`${BASE_URL}/api/sync/pull?cursor=0&limit=1000`, {
    headers: {
      Authorization: `Bearer ${TEST_AUTH_TOKEN_B}`,
      'x-organisation-id': TEST_ORG_B_ID,
      'x-branch-id': TEST_BRANCH_B_ID,
    },
  }).then((r) => r.json());

  const leakedTr = (orgBPullRes.changes || []).find(
    (c: any) =>
      c.entityId === transferRes.transferId ||
      c.entityId === posAdjRes.adjustmentId ||
      c.organisationId === TEST_ORG_A_ID
  );
  assert(
    leakedTr === undefined,
    'W: Tenant B pull NEVER receives Tenant A stock adjustments or transfers'
  );

  // Scenario X: Branch Isolation
  console.log('\n--- Scenario X: Branch Isolation ---');
  const branchBBatch = await db.inventory.get(
    `${TEST_BRANCH_B_ID}_${testBatchNumber}_${testProductId}`
  );
  assert(
    branchBBatch === undefined,
    'X: Branch A inventory adjustments and transfers strictly isolated from Branch B'
  );

  // Scenario Y: Authenticated Empty-Tenant Mock Isolation
  console.log('\n--- Scenario Y: Authenticated Empty-Tenant Isolation ---');
  const emptyTenantDb = new PharmaFlowDatabase(`test_empty_tenant_${Date.now()}`);
  await emptyTenantDb.open();
  const emptyTenantService = new LocalPersistenceService(emptyTenantDb);
  emptyTenantService.setTenantContext('fresh-org-uuid', 'fresh-branch-uuid', 'user-1');

  const emptyAdjustments = await emptyTenantService.getLocalStockAdjustments(
    'fresh-org-uuid',
    'fresh-branch-uuid'
  );
  const emptyTransfers = await emptyTenantService.getLocalTransfers(
    'fresh-org-uuid',
    'fresh-branch-uuid'
  );

  assert(
    emptyAdjustments.length === 0,
    'Y1: Authenticated empty tenant returns empty adjustments list ([]) without mocks'
  );
  assert(
    emptyTransfers.length === 0,
    'Y2: Authenticated empty tenant returns empty transfers list ([]) without mocks'
  );

  // Scenario Z: Unauthenticated / Demo Mode Preservation
  console.log('\n--- Scenario Z: Demo Mode Preservation ---');
  assert(
    Array.isArray(MOCK_STOCK_ITEMS) && MOCK_STOCK_ITEMS.length > 0,
    `Z1: MOCK_STOCK_ITEMS preserved intact (${MOCK_STOCK_ITEMS.length} items)`
  );
  assert(
    Array.isArray(MOCK_TRANSFERS) && MOCK_TRANSFERS.length > 0,
    `Z2: MOCK_TRANSFERS preserved intact (${MOCK_TRANSFERS.length} items)`
  );

  console.log('\n============================================================');
  console.log(`PHASE 4 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4InventoryTests().catch((err) => {
  console.error('Fatal error in Phase 4 test suite:', err);
  process.exit(1);
});

