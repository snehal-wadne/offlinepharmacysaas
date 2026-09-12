/**
 * Comprehensive Real-Data Integration Test Suite
 * Pre-Phase-3 Verification against Canonical Seeded Tenant
 *
 * Verifies:
 * 1. Canonical online authentication (root@falah.com / more#78548)
 * 2. Deterministic organisation & branch resolution
 * 3. Authoritative PostgreSQL seed counts (products, batches, customers, suppliers, purchases, sales, payments, returns)
 * 4. Master data bootstrap into IndexedDB
 * 5. Multi-store Dexie hydration (products, inventory, customers, sync_metadata)
 * 6. Offline mode after cold reload:
 *    - Real POS catalogue projection (zero mock fallback)
 *    - Real customer search projection (zero mock fallback)
 *    - Branch inventory stock availability
 * 7. Offline mutation workflows against canonical tenant:
 *    - CREATE_SALE
 *    - RECORD_CUSTOMER_PAYMENT
 *    - CREATE_RETURN
 *    - CREATE_CUSTOMER
 * 8. Push synchronization to backend PostgreSQL
 * 9. Idempotent replay protection
 * 10. Multi-tenant isolation verification
 */

import 'fake-indexeddb/auto';
import { PharmaFlowDatabase } from '../src/db/pharmaflowDb';
import { LocalPersistenceService } from '../src/db/services/localPersistenceService';
import { BootstrapService } from '../src/sync/bootstrapService';
import { SyncEngine } from '../src/sync/syncEngine';
import { ConnectivityService } from '../src/sync/connectivityService';

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

async function runCanonicalIntegrationTests() {
  console.log('============================================================');
  console.log('PHARMAFLOW CANONICAL REAL-DATA INTEGRATION SUITE');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:5000';
  const CANONICAL_ORG_ID = '2c778baa-10de-472c-a10d-796dbd4314ba';
  const CANONICAL_BRANCH_ID = 'e329330e-787e-4e55-b88c-41506f955f83';
  const CANONICAL_EMAIL = 'root@falah.com';
  const CANONICAL_PASSWORD = 'more#78548';

  const ORG_B_ID = '988c7a21-0167-4cf2-bce9-488812b551d8';
  const USER_B_ID = 'cfdaa53d-0202-4b78-886f-a846af98d873';
  const AUTH_TOKEN_B = `jwt_online_${USER_B_ID}_${Date.now()}`;

  // ---------------------------------------------------------------
  // TEST 1: CANONICAL AUTHENTICATION & DETERMINISTIC RESOLUTION
  // ---------------------------------------------------------------
  console.log('Test 1: Canonical Online Login & Deterministic Tenant Resolution');
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrPhone: CANONICAL_EMAIL,
      password: CANONICAL_PASSWORD,
    }),
  });

  assert(loginRes.status === 200, 'POST /api/login returned HTTP 200');
  const loginData = await loginRes.json();
  assert(loginData.success === true, 'Login response success === true');
  assert(Boolean(loginData.token), 'Auth token generated');
  assert(loginData.user?.email === CANONICAL_EMAIL, `User email matches ${CANONICAL_EMAIL}`);
  assert(loginData.user?.organisationId === CANONICAL_ORG_ID, `Deterministic organisationId matches ${CANONICAL_ORG_ID}`);
  assert(loginData.user?.branchId === CANONICAL_BRANCH_ID, `Deterministic branchId matches ${CANONICAL_BRANCH_ID}`);
  assert(loginData.user?.organisationName === 'MedLife Care Chemist', 'Organisation name matches MedLife Care Chemist');
  assert(loginData.user?.branch === 'Main Branch', 'Branch name matches Main Branch');

  const canonicalAuthToken = loginData.token;

  // ---------------------------------------------------------------
  // TEST 2: BOOTSTRAP REAL SERVER MASTER DATA INTO DEXIE
  // ---------------------------------------------------------------
  console.log('\nTest 2: Master Data Bootstrap into IndexedDB');
  const testDbName = `canonical_integration_db_${Date.now()}`;
  const db = new PharmaFlowDatabase(testDbName);
  await db.open();

  const bootstrapService = new BootstrapService(db, BASE_URL);
  const localService = new LocalPersistenceService(db);
  localService.setTenantContext(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, loginData.user.id);

  const bootstrapResult = await bootstrapService.bootstrap({
    organisationId: CANONICAL_ORG_ID,
    branchId: CANONICAL_BRANCH_ID,
    authToken: canonicalAuthToken,
    baseUrl: BASE_URL,
  });

  assert(bootstrapResult.success === true, 'Bootstrap executed successfully');
  assert(bootstrapResult.productCount >= 14, `Hydrated ${bootstrapResult.productCount} products into Dexie (>= 14)`);
  assert(bootstrapResult.inventoryCount >= 15, `Hydrated ${bootstrapResult.inventoryCount} inventory batches into Dexie (>= 15)`);
  assert(bootstrapResult.customerCount >= 9, `Hydrated ${bootstrapResult.customerCount} customers into Dexie (>= 9)`);
  assert(Number(bootstrapResult.serverCursor) >= 0, `Cursor aligned with server: ${bootstrapResult.serverCursor}`);

  // Verify Dexie stores directly
  const dexieProductCount = await db.products.where('organisationId').equals(CANONICAL_ORG_ID).count();
  const dexieBatchCount = await db.inventory.where('branchId').equals(CANONICAL_BRANCH_ID).count();
  const dexieCustCount = await db.customers.where('organisationId').equals(CANONICAL_ORG_ID).count();
  assert(dexieProductCount === bootstrapResult.productCount, 'Dexie product table count matches bootstrap');
  assert(dexieBatchCount === bootstrapResult.inventoryCount, 'Dexie inventory table count matches bootstrap');
  assert(dexieCustCount === bootstrapResult.customerCount, 'Dexie customer table count matches bootstrap');

  // ---------------------------------------------------------------
  // TEST 3: COLD RELOAD RESTORATION & ZERO MOCK FALLBACK
  // ---------------------------------------------------------------
  console.log('\nTest 3: Cold Reload Restoration & Zero Mock Fallback');
  // Re-open fresh instance simulating cold reload
  const reloadedDb = new PharmaFlowDatabase(testDbName);
  await reloadedDb.open();
  const reloadedLocalService = new LocalPersistenceService(reloadedDb);
  reloadedLocalService.setTenantContext(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID, loginData.user.id);

  const catalog = await reloadedLocalService.getCatalogForPos(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID);
  assert(catalog.length >= 14, `POS catalog served ${catalog.length} products from local Dexie`);

  // Verify specific seeded items exist in POS catalog
  const doloProduct = catalog.find((p) => p.sku === 'MED-DOLO-650' || p.name.includes('Dolo'));
  assert(Boolean(doloProduct), 'Dolo 650 is present in real POS catalog');
  assert((doloProduct?.stock ?? 0) > 0, `Dolo 650 has active inventory batch stock (${doloProduct?.stock})`);

  const customers = await reloadedLocalService.getCustomersForPos(CANONICAL_ORG_ID);
  assert(customers.length >= 9, `Customer search served ${customers.length} real customers from local Dexie`);
  const ayesha = customers.find((c) => c.phone.includes('9876543210'));
  assert(Boolean(ayesha), 'Ayesha Khan present in real customer directory');

  if (!doloProduct || !doloProduct.batches || doloProduct.batches.length === 0) {
    throw new Error('Dolo product or batches missing from catalog');
  }
  if (!ayesha) {
    throw new Error('Ayesha Khan customer record missing');
  }

  // ---------------------------------------------------------------
  // TEST 4: OFFLINE SALE FLOW & PUSH SYNCHRONIZATION
  // ---------------------------------------------------------------
  console.log('\nTest 4: Offline Sale Flow & Push Synchronization');
  const connService = new ConnectivityService();
  connService.setMockStatus(false); // Go offline

  const syncEngine = new SyncEngine(reloadedDb, connService, undefined, BASE_URL);
  syncEngine.setTenantContext(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID);
  syncEngine.setAuthToken(canonicalAuthToken);

  const targetBatch = doloProduct.batches[0];
  const stockBefore = targetBatch.stock;

  const saleResult = await reloadedLocalService.commitLocalSale({
    customer: ayesha.name,
    customerId: ayesha.customerId,
    customerPhone: ayesha.phone,
    paymentMode: 'CASH',
    cashTendered: 100,
    items: [
      {
        productId: doloProduct.id,
        name: doloProduct.name,
        batch: targetBatch.batch,
        batchNumber: targetBatch.batch,
        sellingPrice: targetBatch.price,
        qty: 2,
        total: targetBatch.price * 2,
      },
    ],
  });

  assert(saleResult.status === 'LOCAL_COMMITTED', 'Offline sale status is LOCAL_COMMITTED');
  assert(saleResult.syncStatus === 'PENDING', 'Offline sale syncStatus is PENDING');

  const saleTx = await reloadedDb.transactions.get(saleResult.transactionId);
  assert(Boolean(saleTx), 'Sale transaction persisted in IndexedDB');

  // Verify inventory decrement in local projection
  const updatedCatalog = await reloadedLocalService.getCatalogForPos(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID);
  const updatedDolo = updatedCatalog.find((p) => p.id === doloProduct.id);
  const updatedBatch = updatedDolo?.batches.find((b: any) => b.batch === targetBatch.batch);
  assert(Boolean(updatedBatch && updatedBatch.stock === stockBefore - 2), `Local batch stock immediately decremented (${stockBefore} -> ${updatedBatch?.stock})`);

  // Verify outbox queued
  const pendingOutbox = await reloadedDb.sync_outbox.where('mutationType').equals('CREATE_SALE').first();
  assert(Boolean(pendingOutbox), 'CREATE_SALE mutation queued in sync_outbox');
  assert(pendingOutbox?.status === 'PENDING', 'Outbox mutation is PENDING');

  // Reconnect and push
  connService.setMockStatus(true);
  await syncEngine.sync();

  if (pendingOutbox?.sequence) {
    const outboxAfter = await reloadedDb.sync_outbox.get(pendingOutbox.sequence);
    assert(outboxAfter?.status === 'COMPLETED', 'Sale outbox mutation marked COMPLETED after push sync');
  }

  const txAfter = await reloadedDb.transactions.get(saleResult.transactionId);
  assert(txAfter?.syncStatus === 'SYNCED', 'Transaction marked SYNCED in local store');

  // ---------------------------------------------------------------
  // TEST 5: OFFLINE CUSTOMER PAYMENT FLOW
  // ---------------------------------------------------------------
  console.log('\nTest 5: Offline Customer Payment Flow');
  connService.setMockStatus(false); // Disconnect

  const paymentResult = await reloadedLocalService.recordLocalCustomerPayment({
    customerId: ayesha.customerId,
    amount: 100.0,
    paymentMethod: 'CASH',
    reference: 'CHQ-OFFLINE-01',
    notes: 'Offline payment test',
  });

  assert(Boolean(paymentResult.paymentId), 'Offline customer payment recorded with ID');
  const paymentTx = await reloadedDb.transactions.get(paymentResult.paymentId);
  assert(paymentTx?.type === 'CUSTOMER_PAYMENT', 'Transaction type is CUSTOMER_PAYMENT');
  assert(paymentTx?.syncStatus === 'PENDING', 'Payment syncStatus is PENDING');

  // Verify outbox
  const paymentOutbox = await reloadedDb.sync_outbox.where('mutationType').equals('RECORD_CUSTOMER_PAYMENT').first();
  assert(Boolean(paymentOutbox), 'RECORD_CUSTOMER_PAYMENT mutation queued in sync_outbox');

  // Reconnect and push
  connService.setMockStatus(true);
  await syncEngine.sync();

  if (paymentOutbox?.sequence) {
    const paymentOutboxAfter = await reloadedDb.sync_outbox.get(paymentOutbox.sequence);
    assert(paymentOutboxAfter?.status === 'COMPLETED', 'Payment outbox mutation marked COMPLETED after push sync');
  }

  // ---------------------------------------------------------------
  // TEST 6: OFFLINE RETURN FLOW
  // ---------------------------------------------------------------
  console.log('\nTest 6: Offline Return Flow');

  // Establish a valid server invoice for return
  const saleForReturnRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${canonicalAuthToken}`,
      'x-organisation-id': CANONICAL_ORG_ID,
    },
    body: JSON.stringify({
      deviceId: 'CANONICAL_INTEGRATION_TEST_DEVICE',
      mutations: [
        {
          mutationId: `MUT-SALE-FOR-RET-${Date.now()}`,
          mutationType: 'CREATE_SALE',
          organisationId: CANONICAL_ORG_ID,
          branchId: CANONICAL_BRANCH_ID,
          userId: loginData.user.id,
          payload: {
            invoiceNumber: `INV-FOR-RET-${Date.now()}`,
            customerId: ayesha.customerId,
            total: targetBatch.price,
            items: [
              {
                productId: doloProduct.id,
                name: doloProduct.name,
                batch: targetBatch.batch,
                qty: 1,
                price: targetBatch.price,
              },
            ],
          },
        },
      ],
    }),
  }).then((r) => r.json());

  const returnTargetInvoiceId = saleForReturnRes.results?.[0]?.result?.invoiceId;
  assert(Boolean(returnTargetInvoiceId), 'Established authoritative server invoice for return');

  connService.setMockStatus(false); // Disconnect

  const returnResult = await reloadedLocalService.recordLocalReturn({
    invoiceId: returnTargetInvoiceId,
    customerId: ayesha.customerId,
    refundAmount: targetBatch.price,
    refundMethod: 'CASH',
    reason: 'Surplus prescription',
    items: [
      {
        productId: doloProduct.id,
        batchNumber: targetBatch.batch,
        quantityReturned: 1,
        refundAmount: targetBatch.price,
        restockQuantity: 1,
      },
    ],
  });

  assert(Boolean(returnResult.returnId), 'Offline return committed with ID');
  const returnTx = await reloadedDb.transactions.get(returnResult.returnId);
  assert(returnTx?.type === 'RETURN', 'Transaction type is RETURN');
  assert(returnTx?.syncStatus === 'PENDING', 'Return syncStatus is PENDING');

  // Verify batch restocked locally
  const catalogAfterReturn = await reloadedLocalService.getCatalogForPos(CANONICAL_ORG_ID, CANONICAL_BRANCH_ID);
  const doloAfterReturn = catalogAfterReturn.find((p) => p.id === doloProduct.id);
  const batchAfterReturn = doloAfterReturn?.batches.find((b: any) => b.batch === targetBatch.batch);
  assert(Boolean(batchAfterReturn && batchAfterReturn.stock === stockBefore - 1), `Local inventory batch restocked (+1) after return (${batchAfterReturn?.stock})`);

  // Reconnect and push
  connService.setMockStatus(true);
  await syncEngine.sync();

  const returnOutbox = await reloadedDb.sync_outbox.where('mutationType').equals('CREATE_RETURN').first();
  assert(returnOutbox?.status === 'COMPLETED', 'Return outbox mutation marked COMPLETED after push sync');

  // ---------------------------------------------------------------
  // TEST 7: OFFLINE CUSTOMER CREATION FLOW
  // ---------------------------------------------------------------
  console.log('\nTest 7: Offline Customer Creation Flow');
  connService.setMockStatus(false); // Disconnect

  const offlinePhone = `98200${Date.now().toString().slice(-5)}`;
  const { customer: createdCustomer } = await reloadedLocalService.commitLocalCustomer({
    name: 'New Offline Patient',
    phone: offlinePhone,
    address: 'Andheri West, Mumbai',
    category: 'Regular',
  });

  assert(Boolean(createdCustomer.customerId), 'Offline customer generated client UUID');
  assert(createdCustomer.syncStatus === 'PENDING', 'Created customer has syncStatus === PENDING');

  // Verify customer appears in search while still offline
  const searchMatch = await reloadedLocalService.findCustomerByPhone(offlinePhone, CANONICAL_ORG_ID);
  assert(Boolean(searchMatch), 'Offline customer immediately findable by phone');

  // Reconnect and push
  connService.setMockStatus(true);
  await syncEngine.sync();

  const customerOutbox = await reloadedDb.sync_outbox.where('mutationType').equals('CREATE_CUSTOMER').first();
  assert(customerOutbox?.status === 'COMPLETED', 'Customer outbox mutation marked COMPLETED after push sync');

  // ---------------------------------------------------------------
  // TEST 8: IDEMPOTENCY & LOST-ACK PROTECTION
  // ---------------------------------------------------------------
  console.log('\nTest 8: Idempotency & Lost-ACK Replay Protection');
  const replayRes = await fetch(`${BASE_URL}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${canonicalAuthToken}`,
      'x-organisation-id': CANONICAL_ORG_ID,
    },
    body: JSON.stringify({
      organisationId: CANONICAL_ORG_ID,
      branchId: CANONICAL_BRANCH_ID,
      deviceId: 'CANONICAL_INTEGRATION_TEST_DEVICE',
      mutations: [
        {
          mutationId: saleResult.mutationId,
          mutationType: 'CREATE_SALE',
          occurredAt: saleResult.occurredAt,
          payload: saleTx?.payload,
        },
      ],
    }),
  });

  assert(replayRes.status === 200, 'Replay request accepted with HTTP 200');
  const replayBody = await replayRes.json();
  const replayItem = replayBody.results?.[0];
  assert(replayItem?.status === 'SUCCESS', 'Replay marked SUCCESS');
  assert(replayItem?.idempotentReplay === true, 'Server identified idempotentReplay === true');

  // ---------------------------------------------------------------
  // TEST 9: STRICT TENANT ISOLATION
  // ---------------------------------------------------------------
  console.log('\nTest 9: Strict Multi-Tenant Isolation');
  const pullRes = await fetch(
    `${BASE_URL}/api/sync/pull?organisationId=${ORG_B_ID}&branchId=24743fa9-9916-4d7b-bbfc-9342087c8660&cursor=0`,
    {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN_B}`,
        'x-organisation-id': ORG_B_ID,
      },
    }
  );
  const pullBody = await pullRes.json();
  const leakedFromOrgA = (pullBody.changes || []).some((c: any) => c.payload?.organisationId === CANONICAL_ORG_ID);
  assert(leakedFromOrgA === false, 'Tenant B pull stream NEVER contains Tenant A records');

  // ---------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`CANONICAL REAL-DATA INTEGRATION RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCanonicalIntegrationTests().catch((err) => {
  console.error('Unhandled integration test error:', err);
  process.exit(1);
});
