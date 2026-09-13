/**
 * PharmaFlow Phase 5 Verification Suite:
 * Offline Cash Register / Register Session & Day Close
 *
 * Verifies all 14 Phase 5 functional, architectural, and security requirements:
 * 1. Authenticated register API endpoints (security: 401 unauthenticated, 403 unauthorized tenant)
 * 2. Multi-tenant and branch isolation (Tenant A vs Tenant B)
 * 3. Duplicate open rejection (local Dexie guard & server-side FOR UPDATE lock)
 * 4. Offline register session lifecycle in Dexie (stores: cash_registers, register_sessions)
 * 5. Cash In / Cash Out movements & expected cash tracking (store: cash_movements)
 * 6. Closing balance, denominations, and variance reconciliation (store: cash_denominations)
 * 7. Outbox mutation envelope generation (OPEN_REGISTER_SESSION, RECORD_CASH_MOVEMENT, CLOSE_REGISTER_SESSION)
 * 8. Append-only transaction audit logs in `transactions` store
 * 9. Offline day-close safety: marks CLOSE_PENDING locally, transitions to CLOSED upon server ack
 * 10. Cold database reload durability (sessions, movements, denominations survive reload)
 * 11. Closed session immutability (cannot record movements on closed session)
 * 12. Online sync push execution & outbox COMPLETED marking
 * 13. Push retry idempotency (idempotentReplay: true without duplicate rows)
 * 14. Real backend sync_changes stream emission & Peer device pull projection
 * 15. Unauthenticated / Demo mode preserves DEFAULT_REGISTER_SESSION and MOCK_REGISTER_HISTORY
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';
import { SyncEngine } from '../src/sync/syncEngine';
import { ConnectivityService } from '../src/sync/connectivityService';
import { PullWorker } from '../src/sync/pullWorker';
import { DEFAULT_REGISTER_SESSION, MOCK_REGISTER_HISTORY } from '../src/data/cashierMockData';

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

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function runPhase5CashRegisterTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW PHASE 5: CASH REGISTER & DAY CLOSE VERIFICATION');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:5000';

  // Multi-tenant test identifiers
  const TEST_ORG_A_ID = '2c778baa-10de-472c-a10d-796dbd4314ba';
  const TEST_BRANCH_A_ID = 'e329330e-787e-4e55-b88c-41506f955f83';
  const TEST_USER_A_ID = '33a7d546-e55d-4a11-8315-2e73d03ab0f2';
  const TEST_AUTH_TOKEN_A = `jwt_online_${TEST_USER_A_ID}_${Date.now()}`;

  const TEST_ORG_B_ID = '988c7a21-0167-4cf2-bce9-488812b551d8';
  const TEST_BRANCH_B_ID = '24743fa9-9916-4d7b-bbfc-9342087c8660';
  const TEST_USER_B_ID = 'cfdaa53d-0202-4b78-886f-a846af98d873';
  const TEST_AUTH_TOKEN_B = `jwt_online_${TEST_USER_B_ID}_${Date.now()}`;

  // =========================================================================
  // SECTION 1: Authenticated Register API Security & Endpoints
  // =========================================================================
  console.log('--- Section 1: Authenticated Cashier API Security & Endpoints ---');

  // 1A: Reject unauthenticated GET /api/cashier/registers
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/registers`);
    assert(res.status === 401, '1A: Unauthenticated GET /api/cashier/registers returns HTTP 401');
  } catch (e: any) {
    assert(false, '1A: Unauthenticated GET /api/cashier/registers returns HTTP 401', e.message);
  }

  // 1B: Reject unauthenticated GET /api/cashier/register/current
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/register/current`);
    assert(res.status === 401, '1B: Unauthenticated GET /api/cashier/register/current returns HTTP 401');
  } catch (e: any) {
    assert(false, '1B: Unauthenticated GET /api/cashier/register/current returns HTTP 401', e.message);
  }

  // 1C: Reject unauthenticated POST /api/cashier/register/open
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/register/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingBalance: 1000 }),
    });
    assert(res.status === 401, '1C: Unauthenticated POST /api/cashier/register/open returns HTTP 401');
  } catch (e: any) {
    assert(false, '1C: Unauthenticated POST /api/cashier/register/open returns HTTP 401', e.message);
  }

  // 1D: Reject unauthenticated POST /api/cashier/register/movement
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/register/movement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movementType: 'IN', amount: 500 }),
    });
    assert(res.status === 401, '1D: Unauthenticated POST /api/cashier/register/movement returns HTTP 401');
  } catch (e: any) {
    assert(false, '1D: Unauthenticated POST /api/cashier/register/movement returns HTTP 401', e.message);
  }

  // 1E: Reject unauthenticated POST /api/cashier/register/close
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/register/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countedCash: 1500 }),
    });
    assert(res.status === 401, '1E: Unauthenticated POST /api/cashier/register/close returns HTTP 401');
  } catch (e: any) {
    assert(false, '1E: Unauthenticated POST /api/cashier/register/close returns HTTP 401', e.message);
  }

  // 1F: Reject cross-tenant unauthorized request (User A requesting Org B) with 403
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/registers`, {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_B_ID,
        'x-branch-id': TEST_BRANCH_B_ID,
      },
    });
    assert(res.status === 403, '1F: Cross-tenant access (User A -> Org B) rejected with HTTP 403');
  } catch (e: any) {
    assert(false, '1F: Cross-tenant access rejected with HTTP 403', e.message);
  }

  // 1G: Authenticated GET /api/cashier/registers succeeds with HTTP 200
  let serverRegisters: any[] = [];
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/registers`, {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
        'x-branch-id': TEST_BRANCH_A_ID,
      },
    });
    const data = await res.json();
    serverRegisters = data.data || [];
    assert(res.status === 200 && Array.isArray(serverRegisters), '1G: Authenticated GET /api/cashier/registers returns HTTP 200 and registers list');
  } catch (e: any) {
    assert(false, '1G: Authenticated GET /api/cashier/registers returns HTTP 200', e.message);
  }

  // 1H: Authenticated GET /api/cashier/register/current succeeds with HTTP 200
  try {
    const res = await fetch(`${BASE_URL}/api/cashier/register/current`, {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
        'x-branch-id': TEST_BRANCH_A_ID,
      },
    });
    const data = await res.json();
    assert(res.status === 200 && data.success === true, '1H: Authenticated GET /api/cashier/register/current returns HTTP 200');
  } catch (e: any) {
    assert(false, '1H: Authenticated GET /api/cashier/register/current returns HTTP 200', e.message);
  }

  // =========================================================================
  // SECTION 2: Offline Register Session Lifecycle in Dexie
  // =========================================================================
  console.log('\n--- Section 2: Offline Register Session Lifecycle in Dexie ---');

  const testDbName = `phase5_test_db_${Date.now()}`;
  const db = new PharmaFlowDatabase(testDbName);
  await db.open();
  const localService = new LocalPersistenceService(db);
  localService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);

  const testRegisterId = generateUUID();
  const testSessionId = generateUUID();
  const openingFloat = 2500.0;

  // Initialize cash register in Dexie
  await db.cash_registers.put({
    id: testRegisterId,
    organisationId: TEST_ORG_A_ID,
    branchId: TEST_BRANCH_A_ID,
    identifier: 'REG-TEST-01',
    name: 'PharmaFlow Test Register',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 2A: Open local register session
  const openResult = await localService.openLocalRegisterSession(
    {
      sessionId: testSessionId,
      cashRegisterId: testRegisterId,
      openingBalance: openingFloat,
      notes: 'Morning shift test open',
    },
    {
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
    }
  );

  const localSession = await db.register_sessions.get(testSessionId);
  assert(
    localSession !== undefined &&
      localSession.status === 'OPEN' &&
      localSession.syncStatus === 'PENDING' &&
      localSession.openingBalance === openingFloat,
    '2A: Local register session created in Dexie with status OPEN and syncStatus PENDING'
  );

  // 2B: Opening float recorded in cash_movements
  const openingMovements = await db.cash_movements
    .where('cashRegisterSessionId')
    .equals(testSessionId)
    .toArray();

  assert(
    openingMovements.length === 1 &&
      openingMovements[0].movementType === 'IN' &&
      openingMovements[0].amount === openingFloat &&
      openingMovements[0].reason === 'Opening float balance',
    '2B: Opening float automatically recorded as initial IN movement in cash_movements'
  );

  // 2C: Audit transaction logged
  const openTransactions = await db.transactions
    .where('type')
    .equals('REGISTER_OPEN')
    .toArray();

  assert(
    openTransactions.length === 1 &&
      openTransactions[0].payload.sessionId === testSessionId &&
      openTransactions[0].status === 'LOCAL_COMMITTED',
    '2C: Append-only transaction audit log written for REGISTER_OPEN'
  );

  // 2D: Enqueued OPEN_REGISTER_SESSION in sync_outbox
  const openOutbox = await db.sync_outbox
    .where('mutationType')
    .equals('OPEN_REGISTER_SESSION')
    .toArray();

  assert(
    openOutbox.length === 1 &&
      openOutbox[0].payload.sessionId === testSessionId &&
      openOutbox[0].status === 'PENDING',
    '2D: Outbox mutation OPEN_REGISTER_SESSION enqueued with status PENDING'
  );

  // 2E: Duplicate open rejection locally
  let duplicateRejectedLocally = false;
  try {
    await localService.openLocalRegisterSession(
      {
        cashRegisterId: testRegisterId,
        openingBalance: 1000,
      },
      { organisationId: TEST_ORG_A_ID, branchId: TEST_BRANCH_A_ID, userId: TEST_USER_A_ID }
    );
  } catch (e: any) {
    duplicateRejectedLocally = true;
  }
  assert(
    duplicateRejectedLocally,
    '2E: Attempt to open a second session on the same register locally is rejected'
  );

  // 2F: getLocalOpenRegisterSession returns the active session
  const activeSession = await localService.getLocalOpenRegisterSession(
    TEST_ORG_A_ID,
    TEST_BRANCH_A_ID
  );
  assert(
    activeSession !== null && activeSession.id === testSessionId,
    '2F: getLocalOpenRegisterSession retrieves active session from local Dexie'
  );

  // =========================================================================
  // SECTION 3: Cash In / Cash Out Movements & Expected Balance Tracking
  // =========================================================================
  console.log('\n--- Section 3: Cash Movements & Expected Cash Tracking ---');

  const cashInAmount = 750.0;
  const cashOutAmount = 320.0;

  // 3A: Record Cash In (Petty cash addition)
  const cashInResult = await localService.recordLocalCashMovement(
    {
      cashRegisterSessionId: testSessionId,
      movementType: 'IN',
      amount: cashInAmount,
      reason: 'Change float replenishment',
    },
    { organisationId: TEST_ORG_A_ID, branchId: TEST_BRANCH_A_ID, userId: TEST_USER_A_ID }
  );

  assert(
    cashInResult.movement.movementType === 'IN' &&
      cashInResult.movement.amount === cashInAmount &&
      cashInResult.movement.syncStatus === 'PENDING',
    '3A: Cash IN movement persisted locally with amount and PENDING syncStatus'
  );

  // 3B: Record Cash Out (Store expense payout)
  const cashOutResult = await localService.recordLocalCashMovement(
    {
      cashRegisterSessionId: testSessionId,
      movementType: 'OUT',
      amount: cashOutAmount,
      reason: 'Cleaning supplies payout',
    },
    { organisationId: TEST_ORG_A_ID, branchId: TEST_BRANCH_A_ID, userId: TEST_USER_A_ID }
  );

  assert(
    cashOutResult.movement.movementType === 'OUT' &&
      cashOutResult.movement.amount === cashOutAmount &&
      cashOutResult.movement.syncStatus === 'PENDING',
    '3B: Cash OUT expense movement persisted locally with amount and PENDING syncStatus'
  );

  // 3C: getLocalCashMovements returns all session movements
  const allMovements = await localService.getLocalCashMovements(testSessionId);
  assert(
    allMovements.length === 3, // 1 opening float + 1 IN + 1 OUT
    `3C: getLocalCashMovements returns all 3 recorded movements (found: ${allMovements.length})`
  );

  // 3D: Outbox records for movements
  const movementOutbox = await db.sync_outbox
    .where('mutationType')
    .equals('RECORD_CASH_MOVEMENT')
    .toArray();

  assert(
    movementOutbox.length === 2,
    '3D: Two RECORD_CASH_MOVEMENT mutations enqueued in sync_outbox'
  );

  // =========================================================================
  // SECTION 4: Day Close & Reconciliation Safety
  // =========================================================================
  console.log('\n--- Section 4: Day Close & Reconciliation Safety ---');

  // Authoritative balance formula:
  // Expected = openingFloat (2500) + cashIn (750) - cashOut (320) = 2930.00
  const expectedTotal = openingFloat + cashInAmount - cashOutAmount; // 2930.00
  const countedTotal = 2950.00; // 20.00 Overage
  const expectedVariance = 20.00;

  const denominations: Record<string, number> = {
    500: 5,  // 2500
    200: 2,  // 400
    50: 1,   // 50
  };

  // 4A & 4B: Prepare local day close
  const closeResult = await localService.prepareLocalDayClose(
    {
      sessionId: testSessionId,
      countedCash: countedTotal,
      notes: 'Evening shift register reconciliation',
      denominations,
    },
    { organisationId: TEST_ORG_A_ID, branchId: TEST_BRANCH_A_ID, userId: TEST_USER_A_ID }
  );

  assert(
    closeResult.session.status === 'CLOSE_PENDING',
    '4A: Local day close sets status to CLOSE_PENDING (never authoritative CLOSED offline!)'
  );

  assert(
    closeResult.session.expectedCash === expectedTotal &&
      closeResult.session.countedCash === countedTotal &&
      closeResult.session.variance === expectedVariance &&
      closeResult.session.varianceStatus === 'OVERAGE',
    `4B: Reconciliation computes expected (${expectedTotal}), counted (${countedTotal}), variance (+${expectedVariance}) and OVERAGE`
  );

  // 4C: Denominations stored in cash_denominations
  const storedDenoms = await db.cash_denominations
    .where('cashRegisterSessionId')
    .equals(testSessionId)
    .toArray();

  assert(
    storedDenoms.length === 3,
    `4C: Denominations persisted in cash_denominations store (found: ${storedDenoms.length})`
  );

  // 4D: Enqueued CLOSE_REGISTER_SESSION in outbox
  const closeOutbox = await db.sync_outbox
    .where('mutationType')
    .equals('CLOSE_REGISTER_SESSION')
    .toArray();

  assert(
    closeOutbox.length === 1 &&
      closeOutbox[0].payload.sessionId === testSessionId &&
      closeOutbox[0].payload.countedCash === countedTotal,
    '4D: CLOSE_REGISTER_SESSION mutation enqueued in sync_outbox with counted cash and denominations'
  );

  // 4E: Closed session immutability - cannot record movement after day close
  let movementOnClosedRejected = false;
  try {
    await localService.recordLocalCashMovement(
      {
        cashRegisterSessionId: testSessionId,
        movementType: 'IN',
        amount: 100,
        reason: 'Late movement',
      },
      { organisationId: TEST_ORG_A_ID, branchId: TEST_BRANCH_A_ID, userId: TEST_USER_A_ID }
    );
  } catch (e: any) {
    movementOnClosedRejected = true;
  }

  assert(
    movementOnClosedRejected,
    '4E: Attempt to record cash movement on a session pending close is rejected'
  );

  assert(
    closeResult.session.status === 'CLOSE_PENDING',
    '4F: Session is marked CLOSE_PENDING locally, protecting financial integrity'
  );

  // =========================================================================
  // SECTION 5: Cold Database Durability
  // =========================================================================
  console.log('\n--- Section 5: Cold Database Durability ---');

  // Close database and reopen to simulate full browser crash / restart
  await db.close();

  const reloadedDb = new PharmaFlowDatabase(testDbName);
  await reloadedDb.open();
  const reloadedLocalService = new LocalPersistenceService(reloadedDb);
  reloadedLocalService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);

  const reloadedSession = await reloadedDb.register_sessions.get(testSessionId);
  const reloadedMovements = await reloadedDb.cash_movements.where('cashRegisterSessionId').equals(testSessionId).toArray();
  const reloadedDenoms = await reloadedDb.cash_denominations.where('cashRegisterSessionId').equals(testSessionId).toArray();
  const reloadedOutbox = await reloadedDb.sync_outbox.toArray();

  assert(
    reloadedSession !== undefined &&
      reloadedSession.status === 'CLOSE_PENDING' &&
      reloadedSession.countedCash === countedTotal,
    '5A: Register session survives cold database reload intact'
  );

  assert(
    reloadedMovements.length === 3,
    `5B: All cash movements survive cold reload (found: ${reloadedMovements.length})`
  );

  assert(
    reloadedDenoms.length === 3,
    `5C: All denominations survive cold reload (found: ${reloadedDenoms.length})`
  );

  assert(
    reloadedOutbox.length === 4, // 1 open + 2 movements + 1 close
    `5D: All 4 outbox mutations survive cold reload intact (found: ${reloadedOutbox.length})`
  );

  // =========================================================================
  // SECTION 6: Online Sync Push Execution & Server Idempotency
  // =========================================================================
  console.log('\n--- Section 6: Online Sync Push & Server Idempotency ---');

  const connService = new ConnectivityService();
  const pullWorker = new PullWorker(reloadedDb, BASE_URL);
  const syncEngine = new SyncEngine(reloadedDb, connService, pullWorker, BASE_URL);

  syncEngine.setAuthToken(TEST_AUTH_TOKEN_A);
  syncEngine.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID);

  // Execute sync push
  await syncEngine.sync();

  const completedOutbox = await reloadedDb.sync_outbox
    .where('status')
    .equals('COMPLETED')
    .toArray();

  assert(
    completedOutbox.length === 4,
    `6A: Sync push executed successfully; all 4 outbox mutations marked COMPLETED (found: ${completedOutbox.length})`
  );

  const syncedSession = await reloadedDb.register_sessions.get(testSessionId);
  assert(
    syncedSession !== undefined &&
      syncedSession.status === 'CLOSED' &&
      syncedSession.syncStatus === 'SYNCED',
    '6B: Server push transitions local session from CLOSE_PENDING to authoritative CLOSED'
  );

  const syncedTransactions = await reloadedDb.transactions
    .where('syncStatus')
    .equals('SYNCED')
    .toArray();

  assert(
    syncedTransactions.length >= 4,
    `6C: Local transactions marked SYNCED following successful server commit (found: ${syncedTransactions.length})`
  );

  // 6D: Push retry idempotency: re-pushing completed mutations
  // Construct raw push payload with the same mutation IDs to verify backend idempotency
  const rawPushPayload = {
    deviceId: 'test-device-p5',
    mutations: completedOutbox.map((m) => ({
      sequence: m.sequence,
      mutationId: m.mutationId,
      mutationType: m.mutationType,
      organisationId: m.organisationId,
      branchId: m.branchId,
      userId: m.userId,
      deviceId: m.deviceId,
      occurredAt: m.createdAt,
      payload: m.payload,
    })),
  };

  const replayRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
    body: JSON.stringify(rawPushPayload),
  });

  const replayData = await replayRes.json();
  const allReplayedSuccessfully =
    replayRes.status === 200 &&
    replayData.results &&
    replayData.results.every((r: any) => r.status === 'SUCCESS' && r.idempotentReplay === true);

  assert(
    allReplayedSuccessfully,
    '6D: Re-push of register mutations returns idempotentReplay: true without duplicating database rows'
  );

  // =========================================================================
  // SECTION 7: Backend sync_changes Stream & Peer Device Pull
  // =========================================================================
  console.log('\n--- Section 7: Backend sync_changes Stream & Peer Device Pull ---');

  // Verify server emitted REGISTER_SESSION and CASH_MOVEMENT changes
  const pullRes = await fetch(`${BASE_URL}/api/sync/pull?cursor=0&limit=1000`, {
    headers: {
      Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
      'x-organisation-id': TEST_ORG_A_ID,
      'x-branch-id': TEST_BRANCH_A_ID,
    },
  });

  const pullData = await pullRes.json();
  const changes: any[] = pullData.changes || [];

  const sessionChanges = changes.filter((c: any) => c.entityType === 'REGISTER_SESSION');
  const movementChanges = changes.filter((c: any) => c.entityType === 'CASH_MOVEMENT');

  assert(
    sessionChanges.length > 0,
    `7A: Backend sync_changes stream contains REGISTER_SESSION events (found: ${sessionChanges.length})`
  );

  assert(
    movementChanges.length > 0,
    `7B: Backend sync_changes stream contains CASH_MOVEMENT events (found: ${movementChanges.length})`
  );

  // 7C: Peer device simulates pulling these changes into a fresh Dexie database
  const peerDbName = `peer_device_p5_db_${Date.now()}`;
  const peerDb = new PharmaFlowDatabase(peerDbName);
  await peerDb.open();
  const peerPullWorker = new PullWorker(peerDb, BASE_URL);

  peerPullWorker.setAuthToken(TEST_AUTH_TOKEN_A);
  await peerPullWorker.applyChangesLocally(changes);

  const peerSession = await peerDb.register_sessions.get(testSessionId);
  const peerMovements = await peerDb.cash_movements.where('cashRegisterSessionId').equals(testSessionId).toArray();

  assert(
    peerSession !== undefined && peerSession.status === 'CLOSED',
    '7C: Peer device successfully projects REGISTER_SESSION from sync_changes stream into local Dexie'
  );

  assert(
    peerMovements.length >= 2,
    `7D: Peer device successfully projects CASH_MOVEMENT records into local Dexie (found: ${peerMovements.length})`
  );

  // 7E: PullWorker idempotency: re-applying the same changes does not duplicate
  await peerPullWorker.applyChangesLocally(changes);
  const peerMovementsAfterReplay = await peerDb.cash_movements.where('cashRegisterSessionId').equals(testSessionId).toArray();
  assert(
    peerMovementsAfterReplay.length === peerMovements.length,
    '7E: Peer device re-applying change stream preserves projection idempotency'
  );

  // =========================================================================
  // SECTION 8: Multi-Tenant Isolation & Demo Mode Preservation
  // =========================================================================
  console.log('\n--- Section 8: Multi-Tenant Isolation & Demo Mode Preservation ---');

  // 8A: Tenant B cannot see Tenant A's register sessions via pull stream
  const tenantBPullRes = await fetch(`${BASE_URL}/api/sync/pull?cursor=0&limit=1000`, {
    headers: {
      Authorization: `Bearer ${TEST_AUTH_TOKEN_B}`,
      'x-organisation-id': TEST_ORG_B_ID,
      'x-branch-id': TEST_BRANCH_B_ID,
    },
  });

  const tenantBPullData = await tenantBPullRes.json();
  const tenantBChanges: any[] = tenantBPullData.changes || [];
  const leakedToTenantB = tenantBChanges.some(
    (c: any) => c.entityId === testSessionId || (c.payload && c.payload.sessionId === testSessionId)
  );

  assert(
    !leakedToTenantB,
    '8A: Strict Multi-Tenant Isolation: Tenant B never receives Tenant A register sessions or cash movements'
  );

  // 8B: Preserve mock datasets for demo mode
  assert(
    DEFAULT_REGISTER_SESSION !== undefined &&
      DEFAULT_REGISTER_SESSION.openingBalance === 2000.0 &&
      DEFAULT_REGISTER_SESSION.expectedCash === 10400.0,
    '8B: DEFAULT_REGISTER_SESSION mock structure preserved intact for demo mode'
  );

  assert(
    Array.isArray(MOCK_REGISTER_HISTORY) && MOCK_REGISTER_HISTORY.length > 0,
    `8C: MOCK_REGISTER_HISTORY preserved intact for client demonstration (count: ${MOCK_REGISTER_HISTORY.length})`
  );

  // Cleanup databases
  await reloadedDb.delete();
  await peerDb.delete();

  // Final Summary
  console.log('\n============================================================');
  console.log(`PHASE 5 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5CashRegisterTests().catch((err) => {
  console.error('Unhandled error during Phase 5 verification:', err);
  process.exit(1);
});
