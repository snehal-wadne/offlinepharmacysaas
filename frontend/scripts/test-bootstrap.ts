/**
 * Comprehensive Automated Verification Suite for Tenant & Branch Master Data Bootstrap
 *
 * Covers all Phase 1 requirements:
 * 1. Security & Auth: 401 on unauthenticated, 403 on cross-tenant / unauthorized branch
 * 2. Authenticated GET /api/sync/bootstrap contract & payload structure
 * 3. Multi-Tenant isolation: Org A vs Org B master data segregation
 * 4. Multi-Branch isolation: Branch A vs Branch B inventory segregation
 * 5. Dexie Hydration: atomic multi-store commit into [products, inventory, customers, sync_metadata]
 * 6. Preserves locally created offline customers (syncStatus === 'PENDING')
 * 7. Outbox integrity: pending sync_outbox mutations untouched, 0 outbox records generated
 * 8. Transactions integrity: existing transactions store untouched
 * 9. Atomicity on failure: simulated error rolls back IndexedDB cleanly
 * 10. Idempotent re-bootstrap: safe repeated runs without duplication
 * 11. Pull cursor alignment: last_sync_cursor aligned with serverCursor
 * 12. Offline POS catalogue projection from local cache (getCatalogForPos)
 * 13. Unbootstrapped offline mode reports unavailable without mock catalogue fallback
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';
import { BootstrapService } from '../src/sync/bootstrapService';
import { PullWorker } from '../src/sync/pullWorker';

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

async function runBootstrapTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW MASTER DATA BOOTSTRAP - PHASE 1 TEST SUITE');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:5000';
  const TEST_ORG_A_ID = '2c778baa-10de-472c-a10d-796dbd4314ba';
  const TEST_BRANCH_A_ID = 'e329330e-787e-4e55-b88c-41506f955f83';
  const TEST_USER_A_ID = '33a7d546-e55d-4a11-8315-2e73d03ab0f2';
  const TEST_AUTH_TOKEN_A = `jwt_online_${TEST_USER_A_ID}_${Date.now()}`;

  const TEST_ORG_B_ID = '988c7a21-0167-4cf2-bce9-488812b551d8';
  const TEST_BRANCH_B_ID = '24743fa9-9916-4d7b-bbfc-9342087c8660';
  const TEST_USER_B_ID = 'cfdaa53d-0202-4b78-886f-a846af98d873';
  const TEST_AUTH_TOKEN_B = `jwt_online_${TEST_USER_B_ID}_${Date.now()}`;

  const testDbName = `bootstrap_test_db_${Date.now()}`;
  const db = new PharmaFlowDatabase(testDbName);
  await db.open();

  const localService = new LocalPersistenceService(db);
  const bootstrapService = new BootstrapService(db, BASE_URL);

  try {
    // -------------------------------------------------------------
    // Test 1: Security - Reject Unauthenticated Bootstrap Request
    // -------------------------------------------------------------
    console.log('Test 1: Security - Unauthenticated & Invalid Token Access');
    const unauthRes = await fetch(`${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_A_ID}&branchId=${TEST_BRANCH_A_ID}`);
    assert(unauthRes.status === 401, 'Unauthenticated /bootstrap rejected with HTTP 401');

    const badTokenRes = await fetch(`${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_A_ID}&branchId=${TEST_BRANCH_A_ID}`, {
      headers: { Authorization: 'Bearer forged_token_invalid_123' },
    });
    assert(badTokenRes.status === 401, 'Invalid token rejected with HTTP 401');

    // -------------------------------------------------------------
    // Test 2: Security - Reject Cross-Tenant / Cross-Branch Access
    // -------------------------------------------------------------
    console.log('\nTest 2: Security - Multi-Tenant Authorization Enforcement');
    // User A trying to bootstrap Org B data
    const crossTenantRes = await fetch(`${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_B_ID}&branchId=${TEST_BRANCH_B_ID}`, {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_B_ID,
        'x-branch-id': TEST_BRANCH_B_ID,
      },
    });
    assert(crossTenantRes.status === 403, 'Cross-tenant bootstrap attempt rejected with HTTP 403');

    // User A trying to bootstrap Org A with Org B branch
    const crossBranchRes = await fetch(`${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_A_ID}&branchId=${TEST_BRANCH_B_ID}`, {
      headers: {
        Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
        'x-organisation-id': TEST_ORG_A_ID,
        'x-branch-id': TEST_BRANCH_B_ID,
      },
    });
    assert(crossBranchRes.status === 403, 'Cross-branch mismatch attempt rejected with HTTP 403');

    // -------------------------------------------------------------
    // Test 3: Authenticated Bootstrap Contract & Response Format
    // -------------------------------------------------------------
    console.log('\nTest 3: Authenticated GET /api/sync/bootstrap Contract');
    const authRes = await fetch(
      `${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_A_ID}&branchId=${TEST_BRANCH_A_ID}`,
      {
        headers: {
          Authorization: `Bearer ${TEST_AUTH_TOKEN_A}`,
          'x-organisation-id': TEST_ORG_A_ID,
          'x-branch-id': TEST_BRANCH_A_ID,
        },
      }
    );
    assert(authRes.status === 200, 'Authenticated bootstrap returns HTTP 200');
    const bootstrapPayload = await authRes.json();

    assert(bootstrapPayload.success === true, 'Response indicates success: true');
    assert(bootstrapPayload.organisationId === TEST_ORG_A_ID, 'Payload matches requested organisationId');
    assert(bootstrapPayload.branchId === TEST_BRANCH_A_ID, 'Payload matches requested branchId');
    assert(typeof bootstrapPayload.serverCursor === 'string', 'Payload includes monotonic serverCursor string');
    assert(Boolean(bootstrapPayload.bootstrappedAt), 'Payload includes bootstrappedAt timestamp');
    assert(bootstrapPayload.branch && bootstrapPayload.branch.id === TEST_BRANCH_A_ID, 'Payload includes branch metadata');
    assert(bootstrapPayload.taxConfig && typeof bootstrapPayload.taxConfig.gstScheme === 'string', 'Payload includes taxConfig');
    assert(Array.isArray(bootstrapPayload.products), 'Payload includes products array');
    assert(Array.isArray(bootstrapPayload.inventory), 'Payload includes inventory array');
    assert(Array.isArray(bootstrapPayload.customers), 'Payload includes customers array');

    // -------------------------------------------------------------
    // Test 4: Master Data Tenant & Branch Isolation
    // -------------------------------------------------------------
    console.log('\nTest 4: Strict Tenant Isolation in Bootstrap Master Data');
    const orgBRes = await fetch(
      `${BASE_URL}/api/sync/bootstrap?organisationId=${TEST_ORG_B_ID}&branchId=${TEST_BRANCH_B_ID}`,
      {
        headers: {
          Authorization: `Bearer ${TEST_AUTH_TOKEN_B}`,
          'x-organisation-id': TEST_ORG_B_ID,
          'x-branch-id': TEST_BRANCH_B_ID,
        },
      }
    );
    assert(orgBRes.status === 200, 'Org B bootstrap returns HTTP 200');
    const orgBPayload = await orgBRes.json();

    // Verify Org A products contain no Org B products
    const orgAProductIds = new Set(bootstrapPayload.products.map((p: any) => p.productId));
    const orgBProductIds = new Set(orgBPayload.products.map((p: any) => p.productId));
    const hasProductLeak = [...orgBProductIds].some((id) => orgAProductIds.has(id));
    assert(!hasProductLeak || orgBProductIds.size === 0, 'No product overlap between Org A and Org B');

    // Verify Org A customers contain no Org B customers
    const orgACustIds = new Set(bootstrapPayload.customers.map((c: any) => c.customerId));
    const orgBCustIds = new Set(orgBPayload.customers.map((c: any) => c.customerId));
    const hasCustomerLeak = [...orgBCustIds].some((id) => orgACustIds.has(id));
    assert(!hasCustomerLeak || orgBCustIds.size === 0, 'No customer overlap between Org A and Org B');

    // -------------------------------------------------------------
    // Test 5: Dexie Hydration & Multi-Store Persistence
    // -------------------------------------------------------------
    console.log('\nTest 5: Frontend Dexie Hydration Service');
    assert(
      (await bootstrapService.isBootstrapped(TEST_ORG_A_ID, TEST_BRANCH_A_ID)) === false,
      'Initially isBootstrapped reports false'
    );

    const hydrateResult = await bootstrapService.bootstrap({
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      authToken: TEST_AUTH_TOKEN_A,
      baseUrl: BASE_URL,
    });

    assert(hydrateResult.success === true, 'bootstrapService.bootstrap() returned success');
    assert(
      (await bootstrapService.isBootstrapped(TEST_ORG_A_ID, TEST_BRANCH_A_ID)) === true,
      'isBootstrapped reports true after hydration'
    );

    // Verify Dexie products store
    const dexieProductCount = await db.products.where('organisationId').equals(TEST_ORG_A_ID).count();
    assert(dexieProductCount === hydrateResult.productCount, `Dexie products hydrated (${dexieProductCount} items)`);

    // Verify Dexie inventory store
    const dexieInvCount = await db.inventory.where('branchId').equals(TEST_BRANCH_A_ID).count();
    assert(dexieInvCount === hydrateResult.inventoryCount, `Dexie branch inventory hydrated (${dexieInvCount} batches)`);

    // Verify Dexie customers store
    const dexieCustCount = await db.customers.where('organisationId').equals(TEST_ORG_A_ID).count();
    assert(dexieCustCount === hydrateResult.customerCount, `Dexie customers hydrated (${dexieCustCount} customers)`);

    // Verify Dexie sync_metadata
    const meta = await bootstrapService.getBootstrapMetadata(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
    assert(meta !== null && meta.serverCursor === hydrateResult.serverCursor, 'Bootstrap metadata recorded in sync_metadata');

    const lastSyncCursor = (await db.sync_metadata.get(`last_sync_cursor_${TEST_ORG_A_ID}_${TEST_BRANCH_A_ID}`))?.value;
    assert(lastSyncCursor === hydrateResult.serverCursor, 'Pull cursor advanced to serverCursor');

    // -------------------------------------------------------------
    // Test 6: Preserves Locally Created Offline Customers
    // -------------------------------------------------------------
    console.log('\nTest 6: Offline-Created Pending Customer Preservation');
    const offlineCustId = `CUST-LOCAL-${Date.now()}`;
    await db.customers.put({
      customerId: offlineCustId,
      organisationId: TEST_ORG_A_ID,
      name: 'Offline VIP Patient',
      phone: '9998887776',
      outstandingBalance: 1200,
      isLocallyCreated: true,
      syncStatus: 'PENDING', // Locally pending!
      updatedAt: new Date().toISOString(),
    });

    // Re-run bootstrap
    await bootstrapService.bootstrap({
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      authToken: TEST_AUTH_TOKEN_A,
      baseUrl: BASE_URL,
    });

    const preservedCust = await db.customers.get(offlineCustId);
    assert(preservedCust !== undefined, 'Offline customer was NOT deleted by bootstrap');
    assert(preservedCust?.syncStatus === 'PENDING', 'Offline customer syncStatus remains PENDING');
    assert(preservedCust?.isLocallyCreated === true, 'Offline customer isLocallyCreated remains true');

    // -------------------------------------------------------------
    // Test 7: Outbox & Transactions Store Inviolability
    // -------------------------------------------------------------
    console.log('\nTest 7: Outbox & Transactions Inviolability');
    const testMutId = `MUT-LOCAL-${Date.now()}`;
    await db.sync_outbox.add({
      mutationId: testMutId,
      mutationType: 'CREATE_SALE',
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      deviceId: 'DEV-UNIT',
      userId: TEST_USER_A_ID,
      payload: { invoiceNumber: 'INV-OFFLINE-01' },
      status: 'PENDING',
      attemptCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const testTxId = `TX-LOCAL-${Date.now()}`;
    await db.transactions.put({
      transactionId: testTxId,
      mutationId: testMutId,
      type: 'SALE',
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      userId: TEST_USER_A_ID,
      deviceId: 'DEV-UNIT',
      payload: { invoiceNumber: 'INV-OFFLINE-01' },
      occurredAt: new Date().toISOString(),
      status: 'LOCAL_COMMITTED',
      syncStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const outboxCountBefore = await db.sync_outbox.count();
    const txCountBefore = await db.transactions.count();

    // Re-run bootstrap
    await bootstrapService.bootstrap({
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      authToken: TEST_AUTH_TOKEN_A,
      baseUrl: BASE_URL,
    });

    const outboxCountAfter = await db.sync_outbox.count();
    const txCountAfter = await db.transactions.count();

    assert(outboxCountBefore === outboxCountAfter, 'Bootstrap generated ZERO mutations and deleted none');
    assert(txCountBefore === txCountAfter, 'Bootstrap did NOT touch transactions store');

    const preservedOutbox = await db.sync_outbox.where('mutationId').equals(testMutId).first();
    assert(preservedOutbox?.status === 'PENDING', 'Pending outbox mutation preserved with status PENDING');

    // -------------------------------------------------------------
    // Test 8: Atomicity on Mid-Flight Failure
    // -------------------------------------------------------------
    console.log('\nTest 8: Transactional Atomicity on Mid-Flight Failure');
    const isolatedDb = new PharmaFlowDatabase(`atomic_fail_test_${Date.now()}`);
    await isolatedDb.open();
    const failService = new BootstrapService(isolatedDb, BASE_URL);

    // Call bootstrap with invalid org to trigger failure
    let errorThrown = false;
    try {
      await failService.bootstrap({
        organisationId: '00000000-0000-0000-0000-000000000000',
        branchId: TEST_BRANCH_A_ID,
        authToken: TEST_AUTH_TOKEN_A,
        baseUrl: BASE_URL,
      });
    } catch (err) {
      errorThrown = true;
    }
    assert(errorThrown, 'Failed bootstrap request threw error');
    assert((await isolatedDb.products.count()) === 0, 'Rollback: Zero products stored on failure');
    assert((await isolatedDb.inventory.count()) === 0, 'Rollback: Zero inventory stored on failure');
    assert((await isolatedDb.sync_metadata.count()) === 0, 'Rollback: Zero metadata stored on failure');

    // -------------------------------------------------------------
    // Test 9: Idempotent Re-Bootstrap
    // -------------------------------------------------------------
    console.log('\nTest 9: Idempotent Re-Bootstrap');
    const run1 = await bootstrapService.bootstrap({
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      authToken: TEST_AUTH_TOKEN_A,
      baseUrl: BASE_URL,
    });
    const run2 = await bootstrapService.bootstrap({
      organisationId: TEST_ORG_A_ID,
      branchId: TEST_BRANCH_A_ID,
      authToken: TEST_AUTH_TOKEN_A,
      baseUrl: BASE_URL,
    });
    assert(run1.productCount === run2.productCount, 'Re-bootstrap retains identical product count without duplication');
    assert(run1.inventoryCount === run2.inventoryCount, 'Re-bootstrap retains identical inventory count without duplication');

    // -------------------------------------------------------------
    // Test 10: Pull Cursor Alignment
    // -------------------------------------------------------------
    console.log('\nTest 10: Subsequent Pull Alignment with Bootstrapped Cursor');
    const pullWorker = new PullWorker(db, BASE_URL);
    pullWorker.setAuthToken(TEST_AUTH_TOKEN_A);

    // The cursor stored by bootstrap matches serverCursor
    const bootstrappedCursor = (await db.sync_metadata.get(`last_sync_cursor_${TEST_ORG_A_ID}_${TEST_BRANCH_A_ID}`))?.value;
    assert(bootstrappedCursor !== undefined, 'Bootstrapped cursor present in metadata');

    // Pull changes from that cursor - should have 0 unapplied historical changes
    const pullResult = await pullWorker.pull(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
    assert(typeof pullResult.changesApplied === 'number', 'Pull succeeded from bootstrapped cursor');

    // -------------------------------------------------------------
    // Test 11: Offline POS Catalogue Projection
    // -------------------------------------------------------------
    console.log('\nTest 11: Offline POS Catalogue Projection (getCatalogForPos)');
    localService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID);

    const posCatalog = await localService.getCatalogForPos(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
    assert(Array.isArray(posCatalog), 'getCatalogForPos returns an array');
    if (posCatalog.length > 0) {
      const sample = posCatalog[0];
      assert(Boolean(sample.id), 'Projected product has id');
      assert(Boolean(sample.name), 'Projected product has name');
      assert(typeof sample.stock === 'number', 'Projected product has aggregated stock number');
      assert(Array.isArray(sample.batches), 'Projected product has branch batches array');
    }

    const posCustomers = await localService.getCustomersForPos(TEST_ORG_A_ID);
    assert(Array.isArray(posCustomers), 'getCustomersForPos returns an array');
    assert(posCustomers.length >= hydrateResult.customerCount, 'Projected customers include all bootstrapped records');

    // -------------------------------------------------------------
    // Test 12: Unbootstrapped Offline Tenant Reports Unavailable
    // -------------------------------------------------------------
    console.log('\nTest 12: Unbootstrapped Offline Tenant Behavior');
    const UNBOOTSTRAPPED_ORG = '11111111-2222-3333-4444-555555555555';
    const UNBOOTSTRAPPED_BRANCH = '66666666-7777-8888-9999-000000000000';

    const unbootstrappedCatalog = await localService.getCatalogForPos(UNBOOTSTRAPPED_ORG, UNBOOTSTRAPPED_BRANCH);
    assert(unbootstrappedCatalog.length === 0, 'Unbootstrapped tenant has 0 catalog products (no mock fallback)');

    const isReady = await bootstrapService.isBootstrapped(UNBOOTSTRAPPED_ORG, UNBOOTSTRAPPED_BRANCH);
    assert(isReady === false, 'isBootstrapped returns false for unbootstrapped tenant');

    // -------------------------------------------------------------
    // Test 13: Offline Restart / Reload Restoration & Offline Sale
    // -------------------------------------------------------------
    console.log('\nTest 13: Simulated Restart / Reload Restoration while Completely Offline');
    // Instantiate fresh service referencing the same Dexie database
    const reloadedLocalService = new LocalPersistenceService(db);
    reloadedLocalService.setTenantContext(TEST_ORG_A_ID, TEST_BRANCH_A_ID, TEST_USER_A_ID);
    await reloadedLocalService.initialize(TEST_ORG_A_ID, TEST_BRANCH_A_ID);

    // Verify catalogue restored from Dexie without network
    const reloadedCatalog = await reloadedLocalService.getCatalogForPos(TEST_ORG_A_ID, TEST_BRANCH_A_ID);
    assert(reloadedCatalog.length === hydrateResult.productCount, 'Restart restores full product catalogue from Dexie');
    assert(reloadedCatalog.length > 0, 'Restored catalogue is non-empty');

    // Verify customers restored from Dexie without network
    const reloadedCustomers = await reloadedLocalService.getCustomersForPos(TEST_ORG_A_ID);
    assert(reloadedCustomers.length >= hydrateResult.customerCount, 'Restart restores all customers from Dexie');

    // Perform an offline sale using restored product and customer
    const offlineProd = reloadedCatalog[0];
    const offlineCust = reloadedCustomers[0];
    const offlineSaleResult = await reloadedLocalService.commitLocalSale({
      invoiceNo: `INV-OFFLINE-RESTORED-${Date.now()}`,
      customerId: offlineCust.customerId,
      customer: offlineCust.name,
      customerPhone: offlineCust.phone,
      paymentMode: 'Cash',
      subtotal: Number(offlineProd.sellingPrice),
      tax: 5,
      total: Number(offlineProd.sellingPrice) + 5,
      items: [{
        id: offlineProd.id,
        name: offlineProd.name,
        qty: 1,
        price: Number(offlineProd.sellingPrice),
        batch: offlineProd.batch || offlineProd.batches?.[0]?.batch || 'B001',
      }],
    });

    assert(Boolean(offlineSaleResult.transactionId), 'Offline sale successfully committed after reload');
    const committedTx = await db.transactions.get(offlineSaleResult.transactionId);
    assert(committedTx?.status === 'LOCAL_COMMITTED', 'Offline transaction is LOCAL_COMMITTED');
    const outboxRecord = await db.sync_outbox.where('mutationId').equals(offlineSaleResult.mutationId).first();
    assert(outboxRecord?.status === 'PENDING', 'Offline sale queued in sync_outbox as PENDING');

    // -------------------------------------------------------------
    // Test 14: Customer Search & Strict Organization Isolation
    // -------------------------------------------------------------
    console.log('\nTest 14: Customer Search & Organization Isolation in Local Projection');
    const orgACustomers = await localService.getCustomersForPos(TEST_ORG_A_ID);
    const orgBCustomers = await localService.getCustomersForPos(TEST_ORG_B_ID);

    // Bootstrap Org B to have local data in same Dexie db
    await bootstrapService.bootstrap({
      organisationId: TEST_ORG_B_ID,
      branchId: TEST_BRANCH_B_ID,
      authToken: TEST_AUTH_TOKEN_B,
      baseUrl: BASE_URL,
    });

    const orgACustAfter = await localService.getCustomersForPos(TEST_ORG_A_ID);
    const orgBCustAfter = await localService.getCustomersForPos(TEST_ORG_B_ID);

    assert(orgACustAfter.length > 0, 'Org A has local customers');
    assert(orgBCustAfter.length > 0, 'Org B has local customers');

    const orgACustIdsSet = new Set(orgACustAfter.map((c) => c.customerId));
    const leakedToOrgA = orgBCustAfter.some((c) => orgACustIdsSet.has(c.customerId));
    assert(!leakedToOrgA, 'Org A customer projection NEVER returns Org B customers');

    // Verify search by phone preserves organization isolation
    const searchTarget = orgACustAfter[0];
    if (searchTarget && searchTarget.phone) {
      const foundInOrgA = await localService.findCustomerByPhone(searchTarget.phone, TEST_ORG_A_ID);
      assert(foundInOrgA?.customerId === searchTarget.customerId, 'Customer found by phone in own organization');

      const foundInOrgB = await localService.findCustomerByPhone(searchTarget.phone, TEST_ORG_B_ID);
      assert(foundInOrgB?.customerId !== searchTarget.customerId, 'Customer lookup in Org B NEVER returns Org A customer');
      if (foundInOrgB) {
        assert(foundInOrgB.organisationId === TEST_ORG_B_ID, 'Customer found in Org B strictly belongs to Org B');
      }
    }

  } catch (err: any) {
    console.error('Unhandled test execution error:', err);
    failed++;
  }

  console.log('\n============================================================');
  console.log(`BOOTSTRAP TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBootstrapTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
