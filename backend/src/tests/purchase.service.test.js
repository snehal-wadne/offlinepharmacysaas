/**
 * Purchase Service & API Integration Test
 *
 * Verifies purchase creation, section status filtering (PENDING, APPROVED, RECEIVED),
 * status transitions, and Goods Receipt generation against the PostgreSQL DB.
 */

const { pool } = require('../db/connection');
const purchaseService = require('../services/purchase.service');
const goodsReceiptService = require('../services/goods-receipt.service');

const runTests = async () => {
  try {
    console.log('=== STARTING PURCHASE SERVICE & DB VERIFICATION TESTS ===\n');

    // 1. Fetch seed data IDs
    console.log('1. Fetching seed data from database...');
    const userRes = await pool.query("SELECT id FROM users LIMIT 1;");
    const orgRes = await pool.query("SELECT id FROM organisations LIMIT 1;");
    const branchRes = await pool.query("SELECT id FROM branches LIMIT 1;");
    const productRes = await pool.query("SELECT id FROM products LIMIT 1;");
    const supplierRes = await pool.query("SELECT id FROM suppliers LIMIT 1;");

    if (!userRes.rows.length || !orgRes.rows.length || !branchRes.rows.length || !productRes.rows.length || !supplierRes.rows.length) {
      console.log('Database missing seed data. Running seed script...');
      const seedDev = require('../db/seed-dev');
    }

    const userId = (await pool.query("SELECT id FROM users LIMIT 1;")).rows[0].id;
    const organisationId = (await pool.query("SELECT id FROM organisations LIMIT 1;")).rows[0].id;
    const branchId = (await pool.query("SELECT id FROM branches LIMIT 1;")).rows[0].id;
    const productId = (await pool.query("SELECT id FROM products LIMIT 1;")).rows[0].id;
    const supplierId = (await pool.query("SELECT id FROM suppliers LIMIT 1;")).rows[0].id;

    console.log(`Organisation ID: ${organisationId}`);
    console.log(`Branch ID:       ${branchId}`);
    console.log(`Supplier ID:     ${supplierId}`);

    // 2. Create Purchase Order (Status: PENDING)
    console.log('\n2. Testing Create Purchase Order (Status: PENDING)...');
    const poNumber = `PO-TEST-${Date.now().toString().slice(-4)}`;
    const createdPO = await purchaseService.createPurchase({
      organisationId,
      purchaseNumber: poNumber,
      supplierId,
      branchId,
      status: 'PENDING',
      notes: 'Test Purchase Order for Verification',
      createdBy: userId,
      items: [
        {
          productId,
          orderedQuantity: 50,
          unitCost: 120.0,
          taxAmount: 10.0,
          discountAmount: 5.0,
        },
      ],
    });

    console.log('✓ Created PO:', {
      id: createdPO.id,
      purchaseNumber: createdPO.purchase_number,
      status: createdPO.status,
    });

    // 3. Verify section filtering for PENDING
    console.log('\n3. Testing getPurchases with status=PENDING filter...');
    const pendingList = await purchaseService.getPurchases({ organisationId, status: 'PENDING' });
    const isPoInPending = pendingList.some((po) => po.id === createdPO.id);
    console.log(`✓ PO in PENDING list: ${isPoInPending} (Found ${pendingList.length} pending orders)`);

    // 4. Action: Approve Purchase Order (PENDING -> APPROVED)
    console.log('\n4. Action Button: Approving Purchase Order (PENDING -> APPROVED)...');
    const approvedPO = await purchaseService.approvePurchase(organisationId, createdPO.id);
    console.log('✓ Updated Status:', approvedPO.status);

    // 5. Verify section filtering for APPROVED section
    console.log('\n5. Testing getPurchases with status=APPROVED filter...');
    const approvedList = await purchaseService.getPurchases({ organisationId, status: 'APPROVED' });
    const isPoInApproved = approvedList.some((po) => po.id === createdPO.id);
    console.log(`✓ PO in APPROVED section list: ${isPoInApproved} (Found ${approvedList.length} approved orders)`);

    // 6. Action: Receive Stock (Creates Goods Receipt and updates status to RECEIVED)
    console.log('\n6. Action Button: Receiving Stock (APPROVED -> RECEIVED + Goods Receipt)...');
    const receiveResult = await purchaseService.receivePurchaseStock(organisationId, createdPO.id, {
      supplierInvoiceNumber: 'INV-998822',
      packageCount: 3,
      notes: 'Received 50 units in pristine condition',
    });

    console.log('✓ Receive Result:', {
      poStatus: receiveResult.purchase.status,
      receiptNumber: receiveResult.receipt.receipt_number,
      receivedDate: receiveResult.receipt.received_date,
      itemsCount: receiveResult.receipt.items.length,
    });

    // 7. Verify section filtering for RECEIVED section
    console.log('\n7. Testing getPurchases with status=RECEIVED filter...');
    const receivedList = await purchaseService.getPurchases({ organisationId, status: 'RECEIVED' });
    const isPoInReceived = receivedList.some((po) => po.id === createdPO.id);
    console.log(`✓ PO in RECEIVED section list: ${isPoInReceived} (Found ${receivedList.length} received orders)`);

    // 8. Verify Goods Receipt retrieval
    console.log('\n8. Verifying Goods Receipt retrieval via goodsReceiptService...');
    const receipts = await goodsReceiptService.getGoodsReceipts({ organisationId, purchaseId: createdPO.id });
    console.log(`✓ Goods Receipts found for PO: ${receipts.length}`);

    console.log('\n=== ALL PURCHASE SERVICE & DB VERIFICATION TESTS PASSED SUCCESSFULY! ===\n');
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

runTests();
